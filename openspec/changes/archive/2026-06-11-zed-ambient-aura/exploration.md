# Exploration: zed-ambient-aura

> Phase: explore · Status: ok · Date: 2026-06-11
> Companion to `pizarra-motion-polish/exploration.md`. The two changes share the MotionProvider / MotionConfig plumbing and a reduced-motion story.

## 1. Current State — what is already in place

### 1.1 The overlay component

`src/components/asistente/ZedAmbientOverlay.jsx` (323 LOC) is the consumer. Key shape:

- Default export; props `{ sessionKey, getTerminalPanelCount }`.
- Internally calls `useZedOverlay()` for `{ isOpen, close, toggle }`, `useZedChat({ sessionKey, getTerminalPanelCount })` for chat state, and `useReducedMotion()` from framer-motion (line 66) for the OS preference.
- `phase` is computed via `resolveZedAmbientPhase(isLoading, isOpen, statusLine)` (line 121). The phase enum is `'idle' | 'open' | 'executing' | 'responding'`.
- `ZedAuraFrame` (line 34) is a framer-motion `motion.div` with `data-testid="zed-ambient-aura"`, `className="pointer-events-none fixed inset-0 z-[248]"`, `initial/animate/exit={{ opacity: intensity }}` where `intensity = phase === 'executing' ? 0.5 : phase === 'responding' ? 0.34 : 0.24` (line 35).
- The aura background is a fixed 3-radial-gradient overlay using `var(--accent-primary)`. The internal child div has a class `zed-aura-pulse` when `phase === 'executing' && !reducedMotion`.

### 1.2 Tool-type data flow (gap)

The aura intensity ONLY varies by phase. There is no per-tool-type tint.

The data path that COULD carry tool type:

| Layer | File | What it knows |
|---|---|---|
| `useZedChat` | `src/lib/asistente/useZedChat.js:102-112` | `data.tool_results` array on the assistant message (each entry `{ tool: 'open_terminal' \| 'open_url' \| 'execute_in_terminal' \| 'close_terminal' \| 'list_terminals', result: ... }`). |
| `useZedChat.lastAssistantMessage` | `useZedChat.js:55-57` | Finds the most recent assistant message; DOES NOT surface `tool_results` to the consumer. |
| `buildZedAmbientStatus` | `src/lib/asistente/buildZedAmbientStatus.js:48-78` | Switches on `entry.tool` and produces a human-readable string ("Listo. Abrí localhost:3100 en pizarra.", "Listo. Abrí OpenCode.", "Listo. Comando enviado.", "Listo. Terminal cerrada."). The tool name is the discriminator. |
| `ZedAmbientOverlay` | `useEffect` line 133-146 | Reads `lastAssistantMessage`, calls `buildZedAmbientStatus(message)`, displays the result string. The tool type is collapsed to text BEFORE reaching the overlay. |
| Aura intensity | `ZedAuraFrame` line 35 | Three-way: executing/responding/open. NO tool-type signal. |

The data is there (lastAssistantMessage.tool_results[0].tool) but the overlay never sees it — the upstream `buildZedAmbientStatus` reduces it to a string. **The aura cannot currently tint by tool type** because the producer chain strips it.

### 1.3 Event API

`src/lib/asistente/zedOverlayEvents.js` (37 LOC) exports:
- 3 event names (`ZED_OVERLAY_TOGGLE_EVENT`, `ZED_OVERLAY_OPEN_EVENT`, `ZED_OVERLAY_CLOSE_EVENT`) and 3 dispatch helpers.
- `resolveZedAmbientPhase(isLoading, isOpen, statusLine)` — pure function used by the overlay.
- `shouldShowZedAura(phase)` — `phase !== 'idle'`.

The event API is about open/close toggling. It does NOT carry tool type either. No producer/consumer in `src/` dispatches tool-type metadata.

### 1.4 CSS keyframes (already present)

`src/app/globals.css:1568-1600` has the aura keyframes already:

```css
@keyframes zed-aura-breathe {
  0%, 100% { opacity: 0.72; filter: blur(0); }
  50%      { opacity: 1;    filter: blur(0.5px); }
}
.zed-aura-pulse { animation: zed-aura-breathe 3s ease-in-out infinite; }

@keyframes zed-dot-pulse { /* loading dots */ }
@keyframes zed-status-in { /* status line reveal */ }
@keyframes zed-pill-exit { /* pill exit */ }
```

`.zed-aura-pulse` is referenced in `ZedAmbientOverlay.jsx:49`. **No `prefers-reduced-motion` override for `.zed-aura-pulse`** — the existing `useReducedMotion()` check (line 36) only stops applying the class, but if a future change forgets the JS check, the CSS animation would still run. This is the safe-fallback gap.

### 1.5 Accent variables

`ZedAuraFrame` reads `var(--accent-primary)` (line 52, 53, 54). There is no `--accent-terminal`, `--accent-browser`, `--accent-file` in the file. The design system has `applyAccentToDocument` from `src/lib/theme/themes.js` (referenced in `App.js:31-33`); only one accent is stored at a time. **To tint by tool type, we need either (a) CSS variables for each tool type, or (b) inline `style={{ background: ... }}` overrides per phase × tool.**

### 1.6 MotionProvider

`src/app/providers.js` is a 4-line no-op. `src/App.js` does NOT mount `MotionProvider` or `MotionConfig`. The `useReducedMotion()` hook in `ZedAmbientOverlay.jsx:66` works because framer-motion falls back to manual `matchMedia` detection when no config is mounted, but the tree-level reduced-motion story is incomplete. The `ZedAmbientOverlay.test.jsx` (in `src/components/asistente/__tests__/`) stubs `matchMedia` directly.

### 1.7 Consumers of "tool type"

Grep for `tool_results` in the codebase:

- `src/lib/asistente/useZedChat.js:102, 110, 182, 188` — producer
- `src/lib/asistente/buildZedAmbientStatus.js:102-103` — consumer (collapses to string)
- `src/components/TerminalWorkspacesManager.jsx:5425` — comment only ("producer filters to session_id-only")

No other consumer. Tool type is internal to `buildZedAmbientStatus`.

Grep for the tool enum (`'open_url'`, `'open_terminal'`, etc):

- `src/lib/asistente/buildZedAmbientStatus.js:62-77` — switch statement
- `src/lib/asistente/useZedChat.js:182` — `r.tool === 'open_terminal'` (only this one)

The string is the discriminator. A new tool type arrives in `data.tool_results` and the switch in `buildZedAmbientStatus` must be extended.

### 1.8 Test coverage

| Test | Status |
|---|---|
| `src/components/asistente/__tests__/ZedAmbientOverlay.test.jsx` | Exists. Mocks `useZedChat` and `useZedOverlay`. |
| `src/lib/asistente/__tests__/buildZedHistory.test.js` | Exists. |
| `src/lib/asistente/__tests__/zedOpenTerminalFocus.test.js` | Exists. |

No dedicated test for `zedOverlayEvents` or `buildZedAmbientStatus` at the function level (other than indirect via the overlay). The aura's intensity is not pinned by a unit test (the current value 0.5/0.34/0.24 is only asserted by visual review).

---

## 2. Gap analysis vs FR-P09 / NFR-P05

`03-agent-pizarra-motion.md`:
- **FR-P09**: "Aura Zed **sutil**: gradiente ligero por fase; **acento discreto por tool type**"
- **NFR-P05**: "Aura no bloquea clicks en terminal (z-index < modales, `pointer-events:none` en overlay)"

### FR-P09.a Sutil (intensity)

- `intensity` is 0.5/0.34/0.24 — already subtle. The spec in `03-agent-pizarra-motion.md` proposes `executing ≤ 0.35, open ≤ 0.18`. Current: `executing = 0.5` (over budget), `responding = 0.34` (borderline), `open = 0.24` (over budget). **GAP**: intensity values exceed the "≤ 0.35" guideline for executing. The 03-prompt spec says "≤ 0.35 executing" but current is 0.5. **Confirmed drift.**
- NFR-P05 (z-index + pointer-events): `z-[248]`, `pointer-events-none` — both correct. ✅

### FR-P09.b Acento por tool type

- **MISSING** — aura is single-accent (`var(--accent-primary)`), no tool-type dispatch. The signal exists upstream (`lastAssistantMessage.tool_results[0].tool`) but is collapsed to text before reaching the overlay.

---

## 3. Affected Areas (this change)

| File | Action | Reason |
|---|---|---|
| `src/components/asistente/ZedAmbientOverlay.jsx` | Modify | (a) Lower intensity values to spec (0.5→0.35, 0.34→0.30, 0.24→0.18). (b) Accept `toolType` prop or read from a context/store. (c) Pass `toolType` to `ZedAuraFrame`. (d) Update `ZedAuraFrame` to apply per-tool tint via CSS vars OR inline style. |
| `src/lib/asistente/buildZedAmbientStatus.js` | Modify | (a) Export a parallel pure function `extractToolType(message)` so the overlay can read the tool without re-parsing the switch. (b) Keep `buildZedAmbientStatus` as-is (text). |
| `src/lib/asistente/zedOverlayEvents.js` | Modify | (a) Add `ZED_AURA_TOOL_TYPE_EVENT = 'devhub:zed-aura-tool-type'` and a dispatcher so non-overlay producers (e.g. `useZedChat`) can publish the current tool type. (b) OR — simpler — pass `toolType` as a prop to the overlay from the parent that already knows it. |
| `src/app/globals.css` | Modify (block only) | Add `--accent-terminal`, `--accent-browser`, `--accent-file` (read from existing palette; no new colors). Add `@media (prefers-reduced-motion: reduce) { .zed-aura-pulse { animation: none; } }`. Total: ~15 lines. |
| `src/components/ui/system/motion-tokens.js` | No touch | Out of scope per the 03-agent-pizarra-motion.md. The aura respects `useReducedMotion()` from framer-motion instead. |
| `src/app/providers.js` + `src/App.js` | Modify | Mount `<MotionConfig reducedMotion="user">` so the tree-level reduced-motion story is consistent. Tiny change. |
| `src/components/asistente/__tests__/ZedAmbientOverlay.test.jsx` | Modify | Add scenarios: (a) tool type `'terminal'` produces a non-default tint. (b) tool type `'browser'` produces a different tint. (c) reduced motion removes `.zed-aura-pulse` class. (d) intensity values match the new spec. |

### 3.1 Considered alternatives (not chosen)

- **Wire tool type via window CustomEvent from `useZedChat`**: rejected — too much state, race with React lifecycle. The component-prop path is cleaner.
- **Read from a global Zustand store**: rejected — overkill for a single value per session.
- **Inline the buildZedAmbientStatus in the overlay**: rejected — keeps it testable and re-usable.

---

## 4. Subtle findings

### 4.1 Aura `pointer-events-none` is global

`ZedAuraFrame` (line 41): `className="pointer-events-none fixed inset-0 z-[248]"`. This means the aura cannot be focused or clicked. The reduced-motion story is purely visual. ✅

### 4.2 The pill does not respect reduced motion the same way

The pill (line 197-318) uses `prefersReducedMotion` (framer-motion's hook) for its own initial/animate/exit. The aura uses a manual `reducedMotion && phase === 'executing' ? '' : 'zed-aura-pulse'` check. Two different code paths for the same OS preference. Consolidating on `useReducedMotion()` is the cleanest fix.

### 4.3 The aura's z-index 248 is high but below modals

Sonner `<Toaster>` uses default `z-index: 9999` (per `App.js:360-368` — `position="bottom-right"`, `richColors`). Zed pill is `z-[260]`, aura is `z-[248]`. Modals in this codebase use the shadcn `Dialog` primitive, which mounts at `z-[1000]+`. So 248 is safe for "above content, below modals". ✅

### 4.4 `resolveZedAmbientPhase` is a pure function

`zedOverlayEvents.js:28-33`. Testable in isolation. Add unit tests when modifying its signature.

### 4.5 `lastAssistantMessage` only finds content strings

`useZedChat.js:55-57`:

```js
const lastAssistantMessage = [...messages]
  .reverse()
  .find((m) => m.role === 'assistant' && typeof m.content === 'string');
```

When the assistant message has ONLY `tool_results` (no content), this returns `undefined`. The `useEffect` on line 133-146 then skips the `buildZedAmbientStatus` call. **The aura's `responding` phase IS triggered via `statusLine` (a separate state), but the tool type lookup would have to read from `messages` directly, not `lastAssistantMessage`.** Recommend: change `lastAssistantMessage` to also surface `tool_results`, OR add a parallel `lastAssistantToolType` selector.

---

## 5. Test gaps

| What | Why |
|---|---|
| `resolveZedAmbientPhase` unit test | The function is a pure 4-line if/else but a future edit could regress the priority order. Add tests for all 8 input combinations. |
| `shouldShowZedAura` unit test | 1-line `phase !== 'idle'` but worth pinning. |
| Aura intensity by phase | The current 0.5/0.34/0.24 is not pinned. After lowering, assert the new values. |
| Aura tint by tool type | New behavior — needs at least 3 scenarios (terminal/browser/file/folder). |
| Reduced motion → `.zed-aura-pulse` absent | Critical for accessibility. Test the className, not just the framer-motion path. |
| Pointer-events-none preserved | NFR-P05 pin. One-line assert. |

---

## 6. Recommendation

**Conservative in-place enhancement** (no new files; ~120 LOC impl + ~120 LOC tests = ~240 total):

1. Lower aura intensity (executing 0.5→0.35, responding 0.34→0.30, open 0.24→0.18) in `ZedAuraFrame`.
2. Add `extractToolType(message)` to `buildZedAmbientStatus.js` (or new `zedToolType.js`) — pure function.
3. Add a `lastToolType` derived state in `ZedAmbientOverlay` (mirroring `lastAssistantMessage` but with a wider selector that includes messages with `tool_results` only).
4. Pass `toolType` to `ZedAuraFrame`. Apply inline tint via `style={{ '--accent-terminal': '...', '--accent-browser': '...', '--accent-file': '...' }}` when present, defaulting to `--accent-primary`.
5. Add `@media (prefers-reduced-motion: reduce) { .zed-aura-pulse { animation: none; } }` in globals.css.
6. Mount `<MotionConfig reducedMotion="user">` in `App.js` or `providers.js`. (Single line, no new dep.)
7. Update `ZedAmbientOverlay.test.jsx` with new scenarios.

**Estimated LOC**: 100 impl + 150 tests = ~250. Comfortably within budget.

---

## 7. Risks and unknowns

| # | Risk | Likelihood | Mitigation |
|---|---|---|---|
| 1 | `lastToolType` selector must match the priority order of `resolveZedAmbientPhase` — if the order is wrong, the aura tints by a stale tool type. | Medium | Pin the priority order in a unit test: `executing > responding > open > idle`. |
| 2 | The aura's CSS vars (`--accent-terminal`, etc.) are scoped to the aura wrapper, not the document. If the user changes the document accent via `applyAccentToDocument`, the per-tool tints may not update. | Low | The aura uses `var(--accent-primary)` only as a fallback when no tool type is present. Per-tool tints are inline style values, not CSS variables on `:root`. |
| 3 | Mounting `MotionConfig` in `App.js` could regress every framer-motion `useReducedMotion()` consumer that previously saw a different value (e.g. via test stubs). | Low | `MotionConfig reducedMotion="user"` is the default and only enables tree-level opt-out. Components that already call `useReducedMotion()` get the same value as before. |
| 4 | Lowering intensity to 0.35 might make the aura too subtle to read on a 4K monitor in a bright room. | Low | The intensities are visual — a single manual review pass is sufficient. Adjust if feedback is negative. |
| 5 | Adding CSS vars `--accent-terminal` etc. could conflict with future shadcn variables. | Low | The vars are scoped to the aura wrapper (inline style), not `:root`. |
| 6 | The `extractToolType` function needs to handle messages that have BOTH content AND tool_results (currently `buildZedAmbientStatus` picks the first tool). | Medium | Pin in unit test: when both present, tool_results wins (matches existing behavior). |
| 7 | The aura is rendered ONLY when `showAura` is true (`phase !== 'idle'`). If we add a tool-type color but no phase change, the aura may stay idle even when a tool fires. | Low | Tool execution is the `executing` phase — already triggers aura. The change is only the visual tint. |

---

## 8. Cross-dependency with `pizarra-motion-polish`

Both changes share:
- `MotionConfig` mount in `App.js` (NFR-P06 for motion; reduced-motion for zed-aura-pulse).
- `prefers-reduced-motion` story in `globals.css`.

**Recommend running the two changes in parallel**, with the `MotionConfig` change being a no-op merge (both PRs touch the same lines but with non-conflicting edits — one adds the import, the other adds the aura-pulse media query). If parallel PRs cause merge friction, the zed-ambient-aura PR can land first (it's smaller) and the motion PR can rebase.

---

## 9. Ready for Proposal

**Yes.** Scope is contained, ~250 LOC, addresses FR-P09 (subtle + tool-type tint) and NFR-P05 (pointer-events/z-index already correct). Out-of-scope items: zed tools code (Agente 2 owns), refactor of `useZedChat` (no need for this change).
