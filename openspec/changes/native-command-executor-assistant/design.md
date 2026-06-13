# Design: native-command-executor-assistant (CommandBar)

**Change**: `native-command-executor-assistant`
**Phase**: SDD design (the HOW, architectural level)
**Artifact store**: `openspec` (file-based; Engram not reachable in this environment)
**Strict TDD**: active
**Reads**: `proposal.md`, `spec.md` (both in this folder)

---

## 0. Codebase grounding (read before trusting the spec's file paths)

The spec's `## Affected Components` table proposes a `src/features/**` layout
(`src/features/intent-routing/`, `src/features/actions/`, `src/features/terminal/`,
`src/features/browser/`, `src/features/pizarra/`). **That convention does not exist
in this repo.** Verified: a `src/features/**` search returns zero files. DevHub
uses `src/lib/**` for logic and `src/components/**` for UI. This design overrides
the spec's invented paths with the real convention. Tasks must follow the layout
in §1.4, not the spec table.

The most important discovery: **the terminal-buffer-read "hard dependency" is
already 80% built.** It is NOT a missing Tauri command and NOT an xterm serialize
addon problem. See §3.

### 0.1 What already exists (cited)

| Capability | Where it lives today | Evidence |
|---|---|---|
| Read a terminal's accumulated output buffer | `GET /api/terminal/session/[id]/capture` → `getSessionOutput(id)` | [route.js](src/app/api/terminal/session/[id]/capture/route.js#L11-L16), [ttyServer.js](src/lib/terminal/ttyServer.js#L480-L488) |
| Send keystrokes / run a command in a live PTY | `PUT /api/terminal/session/[id]/input` → `pushSessionInput(id, data)` | [input/route.js](src/app/api/terminal/session/[id]/input/route.js#L6-L29), [ttyServer.js](src/lib/terminal/ttyServer.js#L494-L505) |
| Open a terminal + run a command at spawn | terminal shape `initialCommand` prop → `TerminalTTY` sends it after connect | [TerminalTTY.jsx](src/components/TerminalTTY.jsx#L1648-L1657), [PizarraLiveSurfaceLayer.jsx](src/components/pizarra/PizarraLiveSurfaceLayer.jsx#L197-L209) |
| A tool-calling layer that already wraps the above (HTTP) | `src/lib/asistente/tools/terminal.js` (`open_terminal`, `review_terminal_output`, `execute_in_terminal`) + `browser.js` (`open_url`) + `registry.js` + `parseToolCalls.js` | [terminal.js](src/lib/asistente/tools/terminal.js#L27-L142), [browser.js](src/lib/asistente/tools/browser.js#L5-L29) |
| Visible native surfaces on the canvas (terminal + browser) | Pizarra shapes `terminal`/`browser` rendered by `PizarraLiveSurfaceLayer` over the canvas | [shapeModel.js](src/lib/pizarra/shapeModel.js#L34-L120), [PizarraLiveSurfaceLayer.jsx](src/components/pizarra/PizarraLiveSurfaceLayer.jsx#L30-L82) |
| Viewport-aware auto-placement (center + cascade + slot-occupancy step) | `handleAddElement` in `PizarraInner` | [PizarraPane.jsx](src/components/pizarra/PizarraPane.jsx#L269-L327) |
| Browser navigation by data, not chrome | browser shape `url` prop → `PizarraBrowserSurface` navigates iframe/native; updating `shape.url` re-navigates | [PizarraBrowserSurface.jsx](src/components/pizarra/PizarraBrowserSurface.jsx#L37-L67), [#L100-L122](src/components/pizarra/PizarraBrowserSurface.jsx#L100-L122) |
| cmdk command-palette primitives (Radix Dialog based) | `src/components/ui/command.jsx` (`CommandDialog`, `CommandInput`, …) used by `ChatCommandPalette` | [command.jsx](src/components/ui/command.jsx#L1-L46), [ChatCommandPalette.jsx](src/components/chat/ChatCommandPalette.jsx#L1-L11) |
| Feature-flag convention | `process.env.NEXT_PUBLIC_*` string compare, e.g. grid texture flag | [PizarraCanvas.jsx](src/components/pizarra/PizarraCanvas.jsx#L31) |
| framer-motion + `AnimatePresence` in active use | TerminalTabsManager, Sidebar, WorkspaceSidebar, SmartSuggestionsPanel | [TerminalTabsManager.jsx](src/components/TerminalTabsManager.jsx#L2) |

### 0.2 Critical identity fact (drives name→session resolution)

In Pizarra, a terminal **shape `id` IS the PTY session id**. `registerTerminal`
stores `map(terminalId, terminalId)` — the shape id and the capture/​input API's
`session_id` are the same string. See
[PizarraPane.jsx](src/components/pizarra/PizarraPane.jsx#L155-L165) and the
`/api/terminal/session/[id]/*` routes keyed by that same id. The shape's
human-facing **name** is `shape.label` (defaults to `'Terminal'`,
[shapeModel.js](src/lib/pizarra/shapeModel.js#L104-L110)).

Consequence: "read terminal `build-output`" means *find the shape whose `label`
=== `"build-output"`, take its `id`, call the capture API with that id*. No new
Rust, no xterm serialize addon. This collapses the spec's API-1 risk.

### 0.3 Gaps the buffer-read API still has (the real work for Slice 3)

`getSessionOutput` returns `session.history` **raw**, including ANSI escape codes,
with no truncation and no name resolution. So API-1's genuinely new work is a thin
wrapper: ANSI strip + last-N-lines truncation + `{ text, terminalName, timestamp,
truncated, error }` shaping. That is a pure JS module over the existing route — not
a PTY/Tauri spike. (One open question remains: whether `session.history` is capped
upstream; see §9 R-3.)

### 0.4 Why we do NOT reuse `src/lib/asistente/tools/browser.js` for the browser action

The asistente `open_url` tool shells out to `xdg-open` (system browser), which is
the *opposite* of the spec's VIS-1 requirement ("visible on the Pizarra overlay").
The CommandBar browser action MUST spawn/focus a **Pizarra browser shape**, not the
OS browser. We reuse the *terminal* capture/input routes (they are surface-agnostic)
but NOT the browser tool.

---

## 1. Architecture & layering

### 1.1 Layer diagram

```
┌──────────────────────────────────────────────────────────────────┐
│ UI:  <CommandBar/>  (src/components/CommandBar/)                    │
│      cmdk dialog · framer-motion · status display · a11y           │
└───────────────┬──────────────────────────────────────────────────┘
                │ submit(rawText)
                ▼
┌──────────────────────────────────────────────────────────────────┐
│ Router:  IntentRouter (interface)                                  │
│          RuleIntentRouter (default impl)   ── seam ──▶ LlmIntentRouter (future) │
│          resolveIntent(input) → ResolvedIntent                     │
└───────────────┬──────────────────────────────────────────────────┘
                │ ResolvedIntent { intent, slots, confidence? }
                ▼
┌──────────────────────────────────────────────────────────────────┐
│ Dispatcher:  dispatchAction(intent, deps) → AsyncGenerator<Status> │
│              router-agnostic; validates slots; emits lifecycle     │
└───────────────┬──────────────────────────────────────────────────┘
                │ calls action functions with injected SurfaceController
                ▼
┌──────────────────────────────────────────────────────────────────┐
│ Actions:  terminalRun · browserNavigate · browserSearch · terminalRead │
│           (src/lib/commandBar/actions/)                            │
└───────────────┬──────────────────────────────────────────────────┘
                │ SurfaceController port (dependency-inverted)
                ▼
┌──────────────────────────────────────────────────────────────────┐
│ Existing controllers (NOT rewritten):                              │
│   • PizarraSurfaceController  → addElement/updateElement/focus     │
│   • terminal HTTP routes      → /capture, /input                   │
└──────────────────────────────────────────────────────────────────┘
```

### 1.2 The seams that matter

1. **Router seam (INTENT-2)**: `IntentRouter` is an interface with one method,
   `resolveIntent(input: string): ResolvedIntent`. `RuleIntentRouter` is the
   shipped impl. A future `LlmIntentRouter` (delegating to the existing
   `src/lib/asistente` tool-calling registry) drops in with zero changes below
   the router. The dispatcher receives a `ResolvedIntent`, never the raw string —
   that is what keeps the action layer router-agnostic.

2. **SurfaceController port (Dependency Inversion)**: actions never import Pizarra
   or `fetch` directly. They receive a `SurfaceController` object:

   ```ts
   interface SurfaceController {
     spawnTerminal(opts: { label?: string; initialCommand?: string }): Promise<{ id: string; label: string }>;
     focusTerminal(id: string): void;
     findTerminalByLabel(label: string): { id: string; label: string } | null;
     focusedTerminal(): { id: string; label: string } | null;
     listTerminals(): Array<{ id: string; label: string }>;
     spawnBrowser(opts: { url: string; label?: string }): Promise<{ id: string }>;
     focusBrowser(id: string): void;
     captureTerminal(id: string): Promise<string>; // raw history string
   }
   ```

   This is the testability boundary: unit tests inject a fake controller; the real
   `PizarraSurfaceController` wires to `addElement`/`updateElement`/`setActiveTerminalId`
   and the `/api/terminal/session/[id]/capture` route. Actions stay pure
   orchestration with no I/O knowledge.

3. **TTS seam (TTS-1)**: `terminalRead` returns a typed `TerminalReadResult`
   (`{ text, terminalName, timestamp, truncated }`). The dispatcher emits a
   terminal-read result event the CommandBar renders today; a future voice phase
   subscribes to the *same* object. No audio code, no library here.

### 1.3 Status as a stream

`dispatchAction` is an async generator yielding `ActionStatus` values
(`queued → running → done | failed`). The CommandBar consumes the stream and maps
each yield to a visual state. This models the spec's lifecycle (CMD-1) without a
global store and without coupling the action to React.

```ts
type ActionStatus =
  | { phase: 'queued' }
  | { phase: 'running'; surfaceId?: string }
  | { phase: 'done'; result?: TerminalReadResult }
  | { phase: 'failed'; error: string };
```

### 1.4 Module / file layout (the real one — overrides the spec table)

```
src/components/CommandBar/
  CommandBar.jsx              # cmdk dialog shell, motion, a11y, status render
  CommandBarStatus.jsx        # queued/running/done/failed + read-back display
  useCommandBar.js            # open/close + Cmd/Ctrl+K shortcut + flag gate
  index.js
src/lib/commandBar/
  intent/
    IntentRouter.js           # JSDoc typedefs: IntentRouter, ResolvedIntent
    ruleIntentRouter.js       # regex/keyword + slot extraction (default impl)
  actions/
    dispatchAction.js         # async-generator dispatcher + slot validation
    terminalRun.js
    browserNavigate.js
    browserSearch.js
    terminalRead.js
  surface/
    pizarraSurfaceController.js   # real SurfaceController over Pizarra + routes
    terminalBufferRead.js         # ANSI strip + truncate + typed shaping (API-1)
  featureFlag.js              # NEXT_PUBLIC_COMMANDBAR_ENABLED read
  types.js                    # shared JSDoc typedefs (ResolvedIntent, etc.)
```

> Language note: the repo is JS-with-JSDoc (`.jsx`/`.js`), not TS. Interfaces are
> expressed as JSDoc `@typedef`. The TS snippets in this doc and in `spec.md` are
> for clarity; implementation uses JSDoc typedefs to match the codebase.

Pizarra integration point: `PizarraPane`/`PizarraInner` already owns
`addElement`, `updateElement`, `setActiveTerminalId`, and the viewport-aware
placement. The `PizarraSurfaceController` is constructed there and handed to the
CommandBar so spawns reuse the existing `handleAddElement` placement math (§4.3),
not a parallel implementation.

---

## 2. Intent router (INTENT-1 / INTENT-2)

### 2.1 Contract

```ts
type ResolvedIntent = {
  intent: 'terminal-run' | 'browser-navigate' | 'browser-search' | 'terminal-read' | 'unknown';
  slots: Record<string, string>;
  confidence?: number;
};
interface IntentRouter { resolveIntent(input: string): ResolvedIntent; }
```

### 2.2 Rule strategy (deterministic, ordered, first-match-wins)

Matching order is significant — earlier patterns win to keep behavior predictable:

1. **Multi-step guard (runs first)**: if the input contains a discrete-action
   conjunction (` and then `, `; then `, ` and open `, ` and run `…) across two
   recognized verbs, short-circuit to a dedicated rejection (CMD-1 single-shot).
   This is returned as `intent: 'unknown'` carrying a `reason: 'multi-step'` slot
   so the UI shows the exact spec message rather than the generic one.
2. `terminal-read`: `/^(read|show|what does)\s+.*\bterminal\b\s+(?<name>\S+)/i`
   and `/\bterminal\b\s+(?<name>\S+)\s+(show|output|buffer)/i` → slot `terminalName`.
3. `browser-search`: `/^(search|google|look up|find)\s+(for\s+)?(?<query>.+)/i`
   → slot `query`.
4. `browser-navigate`: `/^(open|go to|navigate to|visit|browse)\s+(?<url>\S+)/i`
   **gated** by a URL-likeness test (contains a dot/TLD or a scheme) so
   "open terminal" never routes to the browser. Slot `url`.
5. `terminal-run`: `/^(run|exec|execute|\$)\s+(?<command>.+)/i`, plus a fallback
   where a leading verb is absent but the text looks like a shell command. Slot
   `command` (+ optional `terminalName` via ` in (terminal )?<name>`).
6. else `intent: 'unknown'`.

Disambiguation rule (testable, prevents misroute): "open terminal …" must resolve
to `terminal-run`/terminal context, never `browser-navigate`. The browser rule's
URL-likeness gate enforces this.

### 2.3 LLM seam

`LlmIntentRouter` (future) implements the same interface and may call the existing
`src/lib/asistente` registry/`parseToolCalls`. Because the dispatcher only sees
`ResolvedIntent`, swapping routers requires no action-layer change — INTENT-2's
three scenarios are satisfied by construction and proven with a mock router in
unit tests.

---

## 3. Terminal buffer read API (API-1) — concrete plan

**Chosen layer: the existing PTY capture route, wrapped by a JS shaper.** Not
xterm serialize addon, not a new Tauri command.

### 3.1 Why this layer (ADR — see §8 ADR-3)

- xterm serialize addon would only see the *visible/scrollback xterm buffer* of the
  *mounted* surface and is unavailable for native-VTE mode; it also couples reads
  to the React render tree. The PTY `session.history` is renderer-independent and
  already exposed.
- A new Tauri command would duplicate `getSessionOutput`, which already returns the
  authoritative accumulated output and is reachable in both web-dev and packaged
  runtimes via the Next API route.

### 3.2 Data flow

```
terminalRead(intent)                       (src/lib/commandBar/actions/terminalRead.js)
  → controller.findTerminalByLabel(name)   resolve name → shape.id (== session_id)
     ↳ fallback: controller.focusedTerminal()         (ACTION-3 fallback)
     ↳ none open → fail "No terminals are open"
  → controller.captureTerminal(id)         GET /api/terminal/session/{id}/capture → { output }
  → shapeBufferText(output, { maxLines: 1000 })       (terminalBufferRead.js)
       strip ANSI · take last N lines · set truncated
  → return TerminalReadResult { text, terminalName, timestamp, truncated }
```

### 3.3 Returned shape (TTS-ready, API-1 + ACTION-3 + TTS-1)

```ts
type TerminalReadResult = {
  text: string;          // ANSI-stripped plain text
  terminalName: string;  // resolved label actually used
  timestamp: string;     // new Date().toISOString()
  truncated: boolean;    // true if last-N-lines cap applied
  error?: string;        // present only on failure
};
```

ANSI stripping: a small local regex stripper in `terminalBufferRead.js`
(`/\x1B\[[0-9;?]*[ -/]*[@-~]/g` plus OSC/`\x1B]…\x07`), unit-tested against color,
cursor, and OSC sequences. Empty buffer → `text: ''` with the empty-state label
handled in the UI (ACTION-3 empty-buffer scenario). No third-party dep needed; if
one is preferred, `strip-ansi` is acceptable but adds a dep — default to local.

### 3.4 Spike recommendation

**Low-risk, time-boxed spike (Slice 3 only):** confirm `session.history` is not
truncated upstream below the desired window and that it accumulates for the native-
VTE path the same as xterm. If history is capped short, escalate to a PTY-side ring
buffer in `ttyServer.js`. This is the only residual uncertainty; everything else is
wiring. (See §9 R-3.)

---

## 4. Visibility model (VIS-1)

### 4.1 Action → surface mapping

| Action | Surface produced | Mechanism |
|---|---|---|
| `terminal-run` | Pizarra `terminal` shape (focused) running the command | spawn with `initialCommand` if new; else `focusTerminal` + `PUT /input` `cmd\r` |
| `browser-navigate` / `browser-search` | Pizarra `browser` shape (focused) at the URL | spawn `browser` shape with `url`; else `updateElement(id,{url})` to re-navigate |
| `terminal-read` | No new surface; reads existing focused/named surface, leaves it untouched (ACTION-3 non-destructive) | capture route only |

### 4.2 New vs reuse semantics (ACTION-1 / ACTION-2)

- `terminalName` present & shape with matching `label` exists → **focus + run via
  `/input`** (no new surface). Running command = `pushSessionInput(id, command + '\r')`.
- `terminalName` present & not found → **spawn** a terminal shape with
  `label = terminalName` and `initialCommand = command`.
- No `terminalName` → spawn a new terminal shape with `initialCommand`.
- Browser: a single reusable browser shape is preferred — if one exists, re-navigate
  via `updateElement`; else spawn. (Focus policy is a small product choice; default:
  reuse the most-recently-focused browser shape.)

### 4.3 Placement (reuse, do not reinvent)

The controller's `spawnTerminal`/`spawnBrowser` delegate to the **existing**
`handleAddElement` placement pipeline in `PizarraInner`
([PizarraPane.jsx](src/components/pizarra/PizarraPane.jsx#L269-L327)): viewport-aware
center, `CASCADE_OFFSET`, left/right split zones, and slot-occupancy stepping that
already prevents exact overlap. We extend `handleAddElement` to accept extra shape
props (`label`, `initialCommand`, `url`) instead of forking placement logic. This
directly satisfies VIS-1 "auto-placement avoids overlap" and the proposal's
Pizarra-bounds risk without new geometry code.

### 4.4 Status truthfulness

`running` is yielded only after the controller confirms the surface was added/focused
(returns an id); `done` only after the command was sent / navigation initiated /
buffer returned. A spawn/route failure yields `failed` with the error text. The
CommandBar never shows `done` for an action whose surface never appeared.

---

## 5. Visual & motion design (first-class)

The user explicitly wants this to look clearly better and feel polished. Treat
motion and state coverage as acceptance-grade, not decoration.

### 5.1 Composition (design-system native, anti-generic)

- Build on `CommandDialog`/`CommandInput` from
  [command.jsx](src/components/ui/command.jsx) (Radix Dialog + cmdk) — same
  primitives `ChatCommandPalette` already uses, so theming/focus-trap/portal come
  for free and stay consistent.
- **Single-input executor, not a list palette**: unlike `ChatCommandPalette`'s
  fuzzy list, the CommandBar leads with the input and a *resolved-intent preview
  chip* (e.g. `Run · npm test`, `Open · github.com`) rendered beneath the input as
  the user types (CMD-1 "displays the resolved intent before execution"). The chip
  uses an icon per intent (lucide `TerminalSquare`, `Globe`, `Search`, `FileText`)
  to read as intentional rather than a generic search box.
- Tokens only — `bg-popover`, `text-popover-foreground`, `text-muted-foreground`,
  `border`, ring tokens; light/dark inherited from the existing theme. No hard-coded
  hex. Generous padding, a single accent for the active intent, monospace only for
  the echoed command/buffer text (consistent with the repo's deliberate `font-mono`
  scoping — do not spread `font-mono` elsewhere).

### 5.2 framer-motion plan (concrete)

Use `motion` + `AnimatePresence` (already standard in the repo). Animate
**transform + opacity only** — never width/height/top/left — to hold the 60fps
budget.

| Element | Enter | Exit | Easing / spring | Duration |
|---|---|---|---|---|
| Dialog container | `opacity 0→1`, `scale 0.96→1`, `y 8→0` | reverse | spring `{ stiffness: 420, damping: 32, mass: 0.9 }` | ≈180–240ms (≤300ms cap, CMD-2) |
| Backdrop | `opacity 0→1` | `opacity→0` | tween `easeOut` | 150ms |
| Intent preview chip | `opacity 0→1`, `y 4→0` | `opacity→0` | tween `easeOut` | 120ms |
| Status indicator swap (queued→running→done/failed) | crossfade icon+color, tiny `scale 0.9→1` pop on `done` | — | tween `easeInOut` | 140ms |
| Read-back text panel | `opacity 0→1`, `height auto` via `layout` only when reduced-motion is OFF | — | spring soft | ≈200ms |

Implementation notes:
- `AnimatePresence` wraps the dialog so exit animations run before unmount.
- Status transitions key the `motion` node by `phase` so React swaps trigger the
  crossfade.
- `will-change: transform, opacity` is implicit via framer; avoid `layout`
  animations on the dialog container (only the read-back panel may use `layout`,
  and only with motion enabled) to prevent layout-thrash.

### 5.3 `prefers-reduced-motion` (CMD-2)

A `useReducedMotion()` hook (framer-motion provides one; the repo has none yet —
introduce it here) gates variants:
- reduced ⇒ all `scale`/`y`/`layout` collapse to **opacity-only** crossfades,
  durations clamped to ≤120ms.
- The component reads it once and selects a `variants` object; no per-frame
  branching.

### 5.4 Full state coverage (CMD-2)

| State | Visual |
|---|---|
| empty (no input) | placeholder "Type a command…", neutral ring, no chip |
| typing | live resolved-intent chip or muted "no match yet" hint |
| queued / running | spinner in the status row, **input disabled**, chip shows resolved action |
| done | success check (accent-positive), echoes action; read-back panel for `terminal-read` (truncate >500 chars per ACTION-3) |
| failed | error icon + message in token error color; input re-enabled for retry |
| unknown intent | inline hint with the exact spec guidance string |

### 5.5 Keyboard & ARIA (CMD-3)

- Open/close: `Cmd+K` (mac) / `Ctrl+K` (others) via `useCommandBar` global listener,
  registered **only when the flag is on**. `ESC` closes and restores focus to the
  previously focused element (Radix Dialog handles focus return; we capture the
  opener).
- Focus trap: inherited from Radix `DialogContent`; verified by test.
- ARIA: input `role="combobox"` + `aria-expanded`; status row is an
  `aria-live="polite"` region so each phase and the read-back result are announced;
  visible focus ring meeting WCAG AA contrast (token-based).

---

## 6. State management (respect react-best-practices)

- **No global store.** CommandBar owns local state via a small `useReducer`
  (`{ open, input, resolved, status, result }`). The action stream drives `status`.
- **Heavy-canvas isolation**: the CommandBar renders as a sibling portal (Radix
  Dialog portals to `document.body`), NOT inside the Pizarra/Konva subtree, so its
  re-renders never touch the canvas element trees. The only canvas interaction is
  imperative calls through `PizarraSurfaceController` (which dispatch a single
  `addElement`/`updateElement` per action — the same path manual spawns already
  use). No new subscription causes canvas-wide re-render.
- The `SurfaceController` is memoized in `PizarraInner` (`useMemo`/`useCallback`
  over the already-stable `addElement`/`updateElement` callbacks) so its identity
  is stable and does not re-trigger CommandBar effects.
- Per-action status lives in the stream consumer, not lifted up; the CommandBar
  auto-dismiss timer (2s, CMD-1) is a local effect cleared on unmount/ESC.

---

## 7. Testing strategy (Strict TDD active)

Test runner: `pnpm exec jest --runInBand` (unit/component), `playwright test` (e2e).
Per repo guidance, prefer focused Jest suites; targeted lint via `pnpm run lint` is
unreliable when scoped — rely on suites for the slice.

### 7.1 Unit (pure, no DOM)
- `ruleIntentRouter` — ≥3 cases per intent (terminal-run, browser-navigate,
  browser-search, terminal-read) + edge cases (empty, malformed, ambiguous,
  multi-step rejection, "open terminal" disambiguation). INTENT-1/2.
- `terminalBufferRead.shapeBufferText` — ANSI strip (color/cursor/OSC), last-N
  truncation + `truncated` flag, empty buffer. API-1.
- `dispatchAction` with a **fake SurfaceController** — slot validation (empty
  command/url/query rejected), lifecycle yields, terminal reuse vs spawn,
  browser reuse vs spawn, read fallback to focused, "no terminals open". ACTION-1/2/3.
- Mock `LlmIntentRouter` swapped into dispatcher → action layer unchanged. INTENT-2.

### 7.2 Component (jsdom + RTL)
- `CommandBar` states: empty/typing/queued/running/done/failed/unknown, input
  disabled while running, retry after failure, resolved-intent chip, read-back
  truncation, auto-dismiss timer. CMD-1/2.
- a11y: `Cmd/Ctrl+K` opens & focuses, `ESC` closes & restores focus, focus trap,
  `role="combobox"`/`aria-live` present, reduced-motion path uses opacity-only
  variants. CMD-3, CMD-2.
- Feature flag: enabled registers shortcut/renders; disabled registers nothing and
  renders null. FEAT-1.

### 7.3 Integration (jsdom, real router + dispatcher + fake controller)
- Full CommandBar lifecycle: open → type → preview → submit → status stream →
  auto-dismiss, for terminal-run, browser-navigate, terminal-read.

### 7.4 e2e (Playwright, desktop/web runtime)
- Per slice: open CommandBar → enter instruction → assert a visible Pizarra surface
  appears (terminal spawns + command echoes; browser navigates) and status reaches
  `done`. Read-back: assert structured text shown. VIS-1 end-to-end. Note: e2e runs
  against the running app; native-VTE surface visibility may need the web/iframe
  fallback path in CI (document as a known e2e environment constraint).

### 7.5 Mapping to slices (proposal phasing)
- **Slice 1**: router(terminal-run) + dispatch + terminalRun + CommandBar shell +
  flag → unit+component+e2e.
- **Slice 2**: browser-navigate/search rules + actions → unit+e2e.
- **Slice 3**: terminalBufferRead + terminal-read action + read-back UI + TTS seam →
  unit (+ spike) + e2e. Each slice ≤ ~400 lines (review budget).

---

## 8. ADRs

**ADR-1 — Thin CommandBar over reusing Director General.** *Decision:* new thin
surface (proposal Option B). *Why:* DG carries planning/supervision/durable-feed
overhead that contradicts the single-shot, low-latency intent. *Rejected:* reusing
DG missions — too heavy, wrong mental model; the router seam can later delegate
genuine multi-step needs to DG without the CommandBar becoming an agent loop.

**ADR-2 — `SurfaceController` port (Dependency Inversion) instead of actions calling
Pizarra/`fetch` directly.** *Why:* keeps actions pure and unit-testable with a fake;
isolates the heavy canvas from CommandBar renders; lets browser/terminal mechanics
evolve without touching action logic. *Rejected:* direct imports — untestable,
couples action layer to React/canvas and to HTTP.

**ADR-3 — Buffer read via existing PTY `capture` route + JS shaper.** *Why:*
`getSessionOutput` already returns authoritative, renderer-independent accumulated
output reachable in dev and packaged runtimes; only ANSI-strip/truncate/shape is
missing. *Rejected:* xterm serialize addon (only sees mounted xterm buffer, absent
in native-VTE, couples to render tree); new Tauri command (duplicates existing
capability, more surface area). Collapses the spec's API-1 "High" risk to "Low".

**ADR-4 — Override the spec's `src/features/**` paths with `src/lib/**` +
`src/components/**`.** *Why:* `src/features/` does not exist in DevHub; matching the
real convention avoids an orphan tree. *Rejected:* following the spec table verbatim.

**ADR-5 — Status as an async generator stream, no global store.** *Why:* models the
lifecycle cleanly, keeps state local, avoids canvas-wide re-renders. *Rejected:*
Redux/Zustand slice — unjustified for one ephemeral surface.

**ADR-6 — Reuse `handleAddElement` placement, extended for extra props.** *Why:* its
viewport-aware center + cascade + slot-stepping already solves VIS-1 overlap and the
Pizarra-bounds risk. *Rejected:* a parallel placement algorithm — duplicate geometry,
drift risk.

---

## 9. Risks, spikes, open questions

| # | Risk / question | Likelihood | Mitigation |
|---|---|---|---|
| R-1 | `session.history` truncated upstream below useful window, or not populated for native-VTE the same as xterm | Medium | **Slice-3 spike** in `ttyServer.js`; if capped, add a PTY ring buffer. Only residual uncertainty. |
| R-2 | Intent misroute on free-form input ("open terminal" → browser) | Medium | Ordered first-match rules + URL-likeness gate + resolved-intent preview chip before execution; unit-tested disambiguation. |
| R-3 | ANSI stripping misses exotic OSC/DCS sequences | Low | Local stripper unit-tested across color/cursor/OSC; fall back to `strip-ansi` dep if a real gap appears. |
| R-4 | Pizarra placement off-canvas at extreme zoom / many surfaces | Low–Med | Reuse `handleAddElement` (viewport-aware, slot-stepped); add a clamp-to-visible test at fractional zoom. |
| R-5 | e2e cannot assert native-VTE pixels in CI | Med | Assert React surface state + iframe/web fallback path; document native visibility as desktop-runtime manual smoke. |
| R-6 | Browser reuse-vs-spawn policy ambiguity | Low | Default: reuse most-recently-focused browser shape; re-navigate via `updateElement`. Product-tunable, not architectural. |
| R-7 | `Cmd/Ctrl+K` collides with an existing shortcut (ChatCommandPalette already uses a command palette) | Med | Audit existing global key handlers during Slice 1; if `ChatCommandPalette` owns `Cmd+K`, scope CommandBar to a distinct chord or context and document. |

**Spikes:** exactly one, time-boxed, Slice 3 — PTY history sufficiency/parity (R-1).
No spike needed for run/navigate (paths already proven).

---

## 10. Constraints honored

- **No engine rewrites**: builds on `TerminalTTY`/PTY routes and
  `PizarraBrowserSurface`; no terminal/browser engine changes.
- **Non-goals respected**: no autonomous loop (single-shot, multi-step rejected at
  the router), no voice/TTS audio (typed seam only), no Director General overhead.
- **Feature flag**: `NEXT_PUBLIC_COMMANDBAR_ENABLED` read in `featureFlag.js`
  (string compare, repo convention). Off ⇒ no shortcut registered, CommandBar
  renders null, zero impact on existing terminal/browser/Pizarra flows. FEAT-1.

---

## 11. Handoff to `sdd-tasks`

Build order (each an independent, ≤~400-line PR):
1. **Slice 1** — `featureFlag.js`, `types.js`, `IntentRouter`/`ruleIntentRouter`
   (terminal-run only), `dispatchAction` + `terminalRun`, `pizarraSurfaceController`
   (terminal spawn/focus/run), CommandBar shell + status + shortcut + a11y + motion.
2. **Slice 2** — browser rules + `browserNavigate`/`browserSearch` + controller
   browser spawn/navigate.
3. **Slice 3** — `terminalBufferRead` (ANSI/truncate/shape) + `terminalRead` action
   + read-back UI + TTS seam + PTY-history spike.

TDD: write the failing unit test first for every router rule, action, and the buffer
shaper before implementation.
