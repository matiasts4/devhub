# Design: zed-ambient-aura

## Technical Approach

End-to-end tool-type dispatch into the Zed ambient overlay, paired with a
lowered per-phase intensity budget and a CSS-layer reduced-motion gate. The
overlay gains a discrete `toolType` signal (`'terminal' | 'browser' | 'file'
| null`) carried from `useZedChat` through a new CustomEvent to a new
`extractToolType()` pure helper, applied to the aura's gradient via three
CSS variables scoped to a new `.zed-aura-root` class. Hard opacity caps live
in a new `zedAuraBudget.js` module; reduced-motion is enforced twice
(JS `useReducedMotion()` + CSS `@media` block) so a future regression in
one path cannot defeat the other. Mounts the existing `MotionProvider` in
`App.js` to make `useReducedMotion()` a tree-level value. Total surface:
**5 files modified, 1 file created, 1 test file created** — well under
the 400-LOC review budget.

## Architecture Decisions

### Decision 1: Tool-type data path

| Option | Tradeoff | Decision |
|---|---|---|
| A. `useZedChat` exports `lastToolType`; overlay reads it via prop subscription to a new `ZED_AURA_TOOL_TYPE_EVENT` | CustomEvent crosses module boundaries without prop drilling; SSR-safe; consistent with existing `zedOverlayEvents` pattern | **Chosen** |
| B. Pass `toolType` as prop from a parent that already knows it | Requires the parent to be the chat consumer; couples overlay mount to chat state | Rejected |
| C. Read `lastAssistantMessage.tool_results` directly inside the overlay | Duplicates the `lastAssistantMessage` selector logic; risks drift with `useZedChat` | Rejected |

**Choice**: option A. The new `ZED_AURA_TOOL_TYPE_EVENT` follows the
existing `ZED_OVERLAY_*_EVENT` SSR-safe pattern. The overlay subscribes
on mount, clears on unmount; `useZedChat` dispatches once per `messages`
change when the resolved type actually changes (avoids re-render churn).

### Decision 2: New `lastToolType` selector in `useZedChat`

The existing `lastAssistantMessage` filter (line 55-57) requires
`typeof m.content === 'string'`, so messages with ONLY `tool_results`
are invisible to the aura. Add a parallel selector that scans the same
array for `tool_results[0].tool`, returning the **mapped category**
(`'terminal' | 'browser' | 'file' | null`) — not the raw tool name. The
mapping is colocated with the existing tool switch in
`buildZedAmbientStatus.js` to keep the tool taxonomy in one place.

### Decision 3: `extractToolType` as a pure function on `buildZedAmbientStatus`

`buildZedAmbientStatus.js` already owns the `tool → summary` switch. Add
`export function extractToolType(message)` next to it so the dispatch
table is one source of truth, returns the **mapped category** (not the
raw tool name), and is unit-testable in isolation. When the message has
both `content` and `tool_results`, `tool_results[0]` wins — matching the
existing `buildZedAmbientStatus` priority. Unknown tools map to `'file'`
per the spec's ZAA-002 catch-all row.

### Decision 4: Intensity budget module

Create `src/lib/asistente/zedAuraBudget.js` exporting `AURA_INTENSITY` —
a frozen map of `phase → maxOpacity`. The overlay imports it and clamps
its computed opacity. The constants:

| Phase | Max opacity |
|---|---|
| `idle` | 0.10 |
| `open` | 0.18 |
| `responding` | 0.30 |
| `executing` | 0.35 |

Existing framer-motion transition (line 45 of `ZedAmbientOverlay.jsx`)
keeps its `duration: reducedMotion ? 0.01 : 0.5` — the change only
touches the `intensity` value. Reduced-motion path stays as-is
(`duration: 0.01`).

### Decision 5: CSS variable scoping and palette

The brief suggests `--color-accent-cyan` etc. as variable names; the
existing CSS palette has no such names (see `themes.js` — accents are
stored as hex strings via `applyAccentToDocument`). The change introduces
the three new variables inside a new `.zed-aura-root` class scope
(**.zed-aura-root** is added as a wrapper class on the inner gradient
layer; the variables do NOT leak to `:root`):

```css
.zed-aura-root {
  --accent-terminal: #4ad3c0;  /* teal, matches cyan-leaning accents in THEME_OPTIONS */
  --accent-browser:  #9b6bff;  /* violet, matches Dracula/Catppuccin accents */
  --accent-file:     #f0b54a;  /* amber, matches Brutalist Stage accent */
}
```

These are the same three hues referenced in the orchestrator brief
(`--color-accent-cyan/violet/amber`) translated to literal hex values
from the existing theme palette. No new color tokens are introduced
into `themes.js`. The CSS rules are also written to fall back to
`var(--accent-primary)` so the aura remains coherent if a future theme
swap removes a literal value.

### Decision 6: `data-tool` attribute for CSS targeting

The overlay's root element sets `data-tool="terminal|browser|file|null"`
(via `data-tool={toolType || 'null'}`) so CSS can target each variant
without class explosion. Per-tool keyframes are wrapped in
`@media (prefers-reduced-motion: no-preference)`; a sibling `@media
(prefers-reduced-motion: reduce)` rule sets `animation: none` on every
`.zed-aura-pulse*` class — including the legacy `.zed-aura-pulse` so the
fallback is also safe. Defense in depth: even if the JS guard
`!reducedMotion && phase === 'executing'` is bypassed, the CSS media
query still suppresses the animation.

### Decision 7: Non-blocking overlay

| Property | Value | Reason |
|---|---|---|
| `pointer-events` | `none` (already in place, line 41) | Clicks pass through to terminal |
| `z-index` | `248` (already in place) | Below Zed pill (260), shadcn dialogs (1000+), Sonner (9999) |
| focusable children | none | Already true — gradient is decorative only |

No change to NFR-P05 invariants; the change preserves them and pins
them in test.

### Decision 8: Single `MotionProvider` mount

`src/components/ui/motion/MotionProvider.jsx` already exists and wraps
`<MotionConfig reducedMotion="user" transition={TRANSITION.base}>`. The
change mounts it once at the top of `App.js`'s render (around the
`<HashRouter>`). Companion change `pizarra-motion-polish` is also
expected to add this — if its PR lands first, this change's `App.js`
diff becomes a no-op. Both touch the same lines non-conflictingly.

## Data Flow

```
useZedChat (lastToolType derived state)
    │ resolve from messages[].tool_results[0].tool
    ▼
dispatchZedAuraToolType(toolType)        ← SSR-safe CustomEvent dispatcher
    │ CustomEvent('devhub:zed-aura-tool-type', { detail: { toolType } })
    ▼
ZedAmbientOverlay subscribes on mount     ← useEffect addEventListener
    │
    ├─► useZedChat.lastToolType → setLocalToolType
    │       │
    │       └─► buildZedAmbientStatus.extractToolType(message)
    │              pure function, returns 'terminal'|'browser'|'file'|null
    │
    └─► ZedAuraFrame receives toolType prop
            │
            ├─► AURA_INTENSITY[phase] clamp → animate.opacity
            ├─► data-tool={toolType || 'null'} on root
            ├─► className="...zed-aura-root zed-aura-pulse-{toolType} ..."
            └─► background reads var(--accent-{terminal|browser|file}, var(--accent-primary))
```

## File Changes

| File | Action | Description |
|---|---|---|
| `src/lib/asistente/zedAuraBudget.js` | Create | `AURA_INTENSITY` frozen map (4 phases) + clamp helper |
| `src/lib/asistente/zedOverlayEvents.js` | Modify | Add `ZED_AURA_TOOL_TYPE_EVENT` constant + `dispatchZedAuraToolType` helper (SSR-safe) |
| `src/lib/asistente/buildZedAmbientStatus.js` | Modify | Export new pure `extractToolType(message)` colocated with the existing tool switch |
| `src/lib/asistente/useZedChat.js` | Modify | Add `lastToolType` derived value (separate from `lastAssistantMessage`); add effect that dispatches `ZED_AURA_TOOL_TYPE_EVENT` only when the type changes |
| `src/components/asistente/ZedAmbientOverlay.jsx` | Modify | (a) Import `AURA_INTENSITY`, `extractToolType`, `ZED_AURA_TOOL_TYPE_EVENT`. (b) Subscribe to event in useEffect. (c) `ZedAuraFrame` reads `toolType` + `AURA_INTENSITY[phase]`. (d) Apply `data-tool`, `zed-aura-root` class, per-tool pulse class, scoped CSS vars via `style={{ '--accent-terminal': ..., '--accent-browser': ..., '--accent-file': ... }}` |
| `src/app/globals.css` | Modify | New `/* zed-aura-*: ... */` block (~30 lines): `--accent-terminal/browser/file` on `.zed-aura-root`, 3 new keyframes, two `@media` blocks (no-preference runs pulse, reduce disables it) |
| `src/App.js` | Modify | Import + mount `<MotionProvider>` once around the existing `<HashRouter>` |
| `src/lib/asistente/__tests__/buildZedAmbientStatus.test.js` | Extend | 5 new scenarios for `extractToolType` (null input, tool-only, content-only, both-present, unknown tool) |
| `src/lib/asistente/__tests__/zedOverlayEvents.test.js` | Extend | SSR safety test: `dispatchZedAuraToolType('terminal')` in `typeof window === 'undefined'` returns without throw |
| `src/lib/asistente/__tests__/zedAuraBudget.test.js` | Create | 4 scenarios: each phase returns the documented max opacity; `clampZedAuraIntensity` clamps to budget |
| `src/components/asistente/__tests__/ZedAmbientOverlay.test.jsx` | Extend | New scenarios: (a) per-tool `data-tool` attribute set on aura root; (b) `zed-aura-pulse-{terminal\|browser\|file}` class applied; (c) intensity matches `AURA_INTENSITY[phase]`; (d) reduced-motion strips the per-tool class |

## Interfaces / Contracts

```js
// src/lib/asistente/zedAuraBudget.js
export const AURA_INTENSITY = Object.freeze({
  idle: 0.10,
  open: 0.18,
  responding: 0.30,
  executing: 0.35,
});

export function clampZedAuraIntensity(phase) {
  return AURA_INTENSITY[phase] ?? AURA_INTENSITY.idle;
}
```

```js
// src/lib/asistente/zedOverlayEvents.js (additions)
export const ZED_AURA_TOOL_TYPE_EVENT = 'devhub:zed-aura-tool-type';

export function dispatchZedAuraToolType(toolType) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(ZED_AURA_TOOL_TYPE_EVENT, { detail: { toolType } })
  );
}
```

```js
// src/lib/asistente/buildZedAmbientStatus.js (additions)
/** @typedef {'terminal' | 'browser' | 'file' | null} ZedAmbientToolType */

const TOOL_TYPE_MAP = {
  open_terminal: 'terminal',
  execute_in_terminal: 'terminal',
  close_terminal: 'terminal',
  open_url: 'browser',
  list_terminals: 'file',
};

export function extractToolType(message) {
  if (!message || typeof message !== 'object') return null;
  const results = Array.isArray(message.tool_results) ? message.tool_results : [];
  if (results.length === 0) return null;
  const tool = results[0]?.tool;
  if (typeof tool !== 'string') return null;
  return TOOL_TYPE_MAP[tool] ?? 'file';
}
```

```css
/* src/app/globals.css — new block, scoped to .zed-aura-root */
.zed-aura-root {
  --accent-terminal: #4ad3c0;
  --accent-browser: #9b6bff;
  --accent-file: #f0b54a;
}

@keyframes zed-aura-pulse-terminal { /* identical curve to zed-aura-breathe */ }
@keyframes zed-aura-pulse-browser  { /* identical curve */ }
@keyframes zed-aura-pulse-file     { /* identical curve */ }

@media (prefers-reduced-motion: no-preference) {
  .zed-aura-pulse-terminal { animation: zed-aura-pulse-terminal 4s ease-in-out infinite; }
  .zed-aura-pulse-browser  { animation: zed-aura-pulse-browser  4s ease-in-out infinite; }
  .zed-aura-pulse-file     { animation: zed-aura-pulse-file     4s ease-in-out infinite; }
}

@media (prefers-reduced-motion: reduce) {
  .zed-aura-pulse-terminal,
  .zed-aura-pulse-browser,
  .zed-aura-pulse-file,
  .zed-aura-pulse { animation: none; }
}
```

## Testing Strategy

| Layer | What | How |
|---|---|---|
| Unit | `AURA_INTENSITY` map + `clampZedAuraIntensity` | New `zedAuraBudget.test.js` — 4 phase values + 1 unknown-phase fallback |
| Unit | `extractToolType` 5 paths | Extend `buildZedAmbientStatus.test.js` — null input, tool-only, content-only, both-present (tool wins), unknown tool (→ `'file'`) |
| Unit | `dispatchZedAuraToolType` SSR safety | Extend `zedOverlayEvents.test.js` — call without `window` defined, expect no throw |
| Component | Tool-type dispatch to overlay | Extend `ZedAmbientOverlay.test.jsx` — assert `data-tool="terminal"` on aura root + per-tool pulse class; assert `data-tool="null"` when no tool; assert `AURA_INTENSITY[phase]` reached framer-motion via mock |
| Component | Reduced-motion strip | Extend overlay test — when `useReducedMotion()` returns `true`, no `.zed-aura-pulse-*` class is present even with a tool type |
| E2E | (optional) manual smoke | Not added in this PR; flagged as `manual` per the brief |

## Migration / Rollout

No migration required. The overlay is rendered on every page that mounts
`ZedAmbientOverlay`; lowering intensity is a visual change without a
schema migration. The new `MotionProvider` mount in `App.js` is a
single import + JSX wrap; if `pizarra-motion-polish` lands first this
diff collapses to no-op.

## Open Questions

- **Resolved inline**: the brief lists "unknown tool mapping: `'file'`
  (catch-all) vs `null` (fall back to phase gradient)" as a design
  pick. The spec's ZAA-002 table pins `'file'` (catch-all); the design
  follows. This is the single source of truth — no ambiguity in the
  impl.
- **Acknowledged**: companion `pizarra-motion-polish` may also touch
  `App.js` (MotionConfig) and `globals.css` (prefers-reduced-motion
  rules). Both edits are non-conflicting (different file regions); the
  PR that lands second merges the diff cleanly.

## Cross-dependency

- Reads from `pizarra-motion-polish` `MotionProvider` (already exists in
  `src/components/ui/motion/MotionProvider.jsx`) — no new provider
  needed; just mount it.
- Shares `prefers-reduced-motion` media-query pattern with
  `pizarra-motion-polish` in `globals.css` — non-conflicting blocks
  appended to the existing `zed-aura-*` region (lines 1568-1636).
- No read/write to `src/lib/asistente/tools/**` (Agente 2 owns).
