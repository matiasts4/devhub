# Tasks: native-command-executor-assistant

**Change**: `native-command-executor-assistant`  
**Project**: DevHub  
**Strict TDD**: active  
**Feature flag**: `NEXT_PUBLIC_COMMANDBAR_ENABLED`  
**Test runners**: `pnpm exec jest --runInBand` (unit/component), `playwright test` (e2e)

---

## Review Workload Forecast

### Slice 1: CommandBar UI + Terminal-Run Intent + Action
**Estimated changed lines**: ~380 lines  
- CommandBar UI components: ~120 lines (CommandBar.jsx, CommandBarStatus.jsx, useCommandBar.js, index.js)
- Intent router infrastructure: ~80 lines (IntentRouter.js types, ruleIntentRouter.js with terminal-run pattern)
- Action dispatcher + terminalRun: ~70 lines (dispatchAction.js, terminalRun.js)
- Surface controller: ~80 lines (pizarraSurfaceController.js terminal methods, terminalBufferRead.js stub)
- Feature flag + types: ~30 lines (featureFlag.js, types.js)
- **400-line budget risk**: LOW ✅ (within budget)
- **Chained PRs recommended**: No (single reviewable unit)

### Slice 2: Browser Intent + Actions
**Estimated changed lines**: ~140 lines  
- Browser intent patterns in ruleIntentRouter.js: ~40 lines (browser-navigate, browser-search)
- Browser actions: ~60 lines (browserNavigate.js, browserSearch.js)
- Surface controller browser methods: ~40 lines (spawnBrowser, focusBrowser, URL normalization)
- **400-line budget risk**: LOW ✅ (well under budget)
- **Chained PRs recommended**: No (small, focused addition)

### Slice 3: Terminal Buffer Read + TTS Seam
**Estimated changed lines**: ~180 lines  
- Terminal buffer read implementation: ~70 lines (terminalBufferRead.js ANSI strip + truncate + shape)
- Terminal-read action: ~50 lines (terminalRead.js with fallback logic)
- Read-back UI in CommandBarStatus: ~40 lines (structured text display with truncation)
- Terminal-read intent pattern: ~20 lines (ruleIntentRouter.js extension)
- **400-line budget risk**: LOW ✅ (within budget)
- **Chained PRs recommended**: No (includes time-boxed spike, but low risk per design ADR-3)

### Total Estimated Impact
- **Total changed lines**: ~700 lines across 3 slices
- **Decision needed before apply**: No — all slices fit review budget; no exception required
- **Recommended delivery**: Sequential PRs (dependency order: Slice 1 → Slice 2 → Slice 3)

---

## Slice 1: CommandBar UI + Terminal-Run Intent + Action

**Goal**: Ship the CommandBar surface with terminal-run capability end-to-end. Feature flag gated. Full visual polish, motion, accessibility.

### Pre-implementation: Visual Design Skills Loading
- [x] **Load visual design skills** — Read `/home/matias/.config/opencode/skills/animate/SKILL.md` and `/home/matias/.agents/skills/high-end-visual-design/SKILL.md` before implementing CommandBar visuals. Apply their guidance to motion design, state transitions, typography, spacing, and anti-generic aesthetics. (Sequential: do first)

### Foundation: Types + Feature Flag
- [x] **Define shared types** — Create `src/lib/commandBar/types.js` with JSDoc typedefs for `ResolvedIntent`, `ActionStatus`, `TerminalReadResult`. (Sequential: do first)
- [x] **Feature flag utility** — Create `src/lib/commandBar/featureFlag.js`: export `isCommandBarEnabled()` that reads `process.env.NEXT_PUBLIC_COMMANDBAR_ENABLED === 'true'`. Unit test: enabled vs disabled vs unset. (Sequential: do first)

### Intent Routing: Tests → Implementation
- [x] **[TEST FIRST] Intent router interface tests** — Create `src/lib/commandBar/intent/__tests__/IntentRouter.test.js`: test the JSDoc typedef contract exists, `resolveIntent` signature. (Sequential: after types)
- [x] **[TEST FIRST] Terminal-run intent tests** — In `src/lib/commandBar/intent/__tests__/ruleIntentRouter.test.js`: failing tests for:
  - "run npm test" → `terminal-run` with `slots: { command: "npm test" }`
  - "exec git status" → `terminal-run` with `slots: { command: "git status" }`
  - "$ pnpm dev" → `terminal-run` with `slots: { command: "pnpm dev" }`
  - "run npm build in build-output" → `terminal-run` with `slots: { command: "npm build", terminalName: "build-output" }`
  - Empty input → `unknown`
  - Multi-step guard: "run npm test and then open github.com" → `unknown` with `reason: 'multi-step'`
  - Disambiguation: "open terminal workspace" → `terminal-run`, NOT browser-navigate (testable safeguard for R-2)
- [x] **Intent router interface** — Create `src/lib/commandBar/intent/IntentRouter.js`: JSDoc `@typedef` for `IntentRouter` interface with `resolveIntent(input: string): ResolvedIntent`. Export typedef only, no implementation. (Sequential: after test)
- [x] **Rule-based intent router** — Create `src/lib/commandBar/intent/ruleIntentRouter.js`:
  - Export `createRuleIntentRouter()` factory returning an object implementing `IntentRouter`
  - Implement ordered first-match-wins rules: (1) multi-step guard (reject conjunctions), (2) terminal-run patterns per design §2.2
  - Slot extraction: `command` (required), optional `terminalName` via regex groups
  - Make all tests pass. (Sequential: after failing tests)

### Action Dispatcher + Terminal Action: Tests → Implementation
- [x] **[TEST FIRST] Dispatcher validation tests** — Create `src/lib/commandBar/actions/__tests__/dispatchAction.test.js` with fake `SurfaceController`:
  - Empty command slot → yields `failed` status
  - Valid terminal-run intent → yields `queued → running → done` sequence
  - Surface spawn error → yields `failed` with error message
- [x] **[TEST FIRST] Terminal-run action tests** — Create `src/lib/commandBar/actions/__tests__/terminalRun.test.js` with fake controller:
  - New terminal (no name) → spawns with `initialCommand`
  - Named terminal exists → focuses + sends command via `/input`
  - Named terminal missing → spawns with `label` + `initialCommand`
  - ACTION-1 scenarios from spec
- [x] **Action dispatcher** — Create `src/lib/commandBar/actions/dispatchAction.js`:
  - Export `dispatchAction(intent: ResolvedIntent, controller: SurfaceController): AsyncGenerator<ActionStatus>`
  - Validate slots (reject empty command/url/query)
  - Yield `queued` → call action function → yield `running` → yield `done` or `failed`
  - Router-agnostic: receives only `ResolvedIntent`, never raw string (INTENT-2 seam). (Sequential: after dispatcher tests)
- [x] **Terminal-run action** — Create `src/lib/commandBar/actions/terminalRun.js`:
  - Accept `(intent, controller: SurfaceController)`
  - If `terminalName` in slots + shape exists → `controller.focusTerminal(id)` + `PUT /api/terminal/session/[id]/input` with `command + '\r'`
  - Else spawn via `controller.spawnTerminal({ label: terminalName, initialCommand: command })`
  - Return surface id on success
  - Make all tests pass. (Sequential: after action tests)

### Surface Controller: Tests → Implementation
- [x] **[TEST FIRST] Surface controller tests** — Create `src/lib/commandBar/surface/__tests__/pizarraSurfaceController.test.js`:
  - Mock `addElement`, `updateElement`, `setActiveTerminalId`, fetch for `/capture` and `/input`
  - Test `spawnTerminal` calls `addElement` with correct shape props
  - Test `focusTerminal` calls `setActiveTerminalId`
  - Test `findTerminalByLabel` searches shapes by `label` property
  - Test `focusedTerminal` returns active terminal
- [x] **Surface controller interface** — In `src/lib/commandBar/types.js`, add JSDoc `@typedef SurfaceController` with methods: `spawnTerminal`, `focusTerminal`, `findTerminalByLabel`, `focusedTerminal`, `listTerminals`, `spawnBrowser`, `focusBrowser`, `captureTerminal`. (Sequential: after types)
- [x] **Pizarra surface controller** — Create `src/lib/commandBar/surface/pizarraSurfaceController.js`:
  - Export `createPizarraSurfaceController({ addElement, updateElement, setActiveTerminalId, shapes, activeTerminalId })`
  - Implement terminal methods: `spawnTerminal` delegates to `addElement` with `type: 'terminal'`, `label`, `initialCommand`; reuse existing viewport-aware placement from `handleAddElement` (design §4.3)
  - `focusTerminal(id)` calls `setActiveTerminalId(id)`
  - `findTerminalByLabel(label)` searches `shapes` for `shape.type === 'terminal' && shape.label === label`, returns `{ id, label }` or null
  - `focusedTerminal()` returns active terminal's `{ id, label }` or null
  - `captureTerminal(id)` calls `GET /api/terminal/session/${id}/capture`, returns `{ output }` (stub for now, full impl in Slice 3)
  - Browser methods: stub for Slice 2 (return Promise.reject for now)
  - Make all tests pass. (Sequential: after controller tests)
- [x] **Wire controller to PizarraPane** — Modify `src/components/pizarra/PizarraPane.jsx` (`PizarraInner` component):
  - Import `createPizarraSurfaceController`
  - Create controller via `useMemo` with stable `addElement`/`updateElement`/`setActiveTerminalId`/`shapes`/`activeTerminalId` deps
  - Pass controller to CommandBar via context or prop (choose context for cleaner prop drilling avoidance)
  - Extend `handleAddElement` to accept optional `label`, `initialCommand`, `url` props on shape creation (design ADR-6). (Sequential: after controller impl)

### CommandBar UI: Tests → Implementation
- [x] **[TEST FIRST] CommandBar state tests** — Create `src/components/CommandBar/__tests__/CommandBar.test.jsx` (React Testing Library):
  - Renders null when feature flag disabled
  - Renders dialog when open, hidden when closed
  - Input has focus on open
  - Resolved-intent chip displays for valid input (mock router)
  - Status transitions: queued (spinner, input disabled) → running → done (success icon, auto-dismiss timer) → failed (error msg, input re-enabled)
  - Empty state: placeholder text, no chip
  - Unknown intent: hint message from spec
  - Multi-step rejection: exact spec message
- [x] **[TEST FIRST] Keyboard shortcut tests** — In `src/components/CommandBar/__tests__/useCommandBar.test.js`:
  - Cmd+K (mac) / Ctrl+K (linux/windows) opens CommandBar when flag enabled
  - Shortcut NOT registered when flag disabled
  - ESC closes and restores focus
  - **Collision audit**: test that existing `ChatCommandPalette` Ctrl+K listener does NOT conflict (design R-7) — if collision detected, choose distinct chord (e.g., Cmd+Shift+K or Cmd+J) and document. Update shortcut in code + tests + UI hints.
- [x] **[TEST FIRST] Accessibility tests** — In CommandBar.test.jsx:
  - Input has `role="combobox"` and `aria-expanded`
  - Status row has `aria-live="polite"`
  - Focus trap: Tab cycles within dialog only
  - Visible focus ring meets WCAG AA contrast (token-based, assert class presence)
- [x] **[TEST FIRST] Reduced motion tests** — In CommandBar.test.jsx:
  - Mock `prefers-reduced-motion: reduce`
  - Assert animations use opacity-only variants (no scale/y transforms in DOM)
- [x] **CommandBar shell** — Create `src/components/CommandBar/CommandBar.jsx`:
  - Use `CommandDialog`, `CommandInput` from `@/components/ui/command.jsx` (Radix + cmdk)
  - Wrap with `AnimatePresence` + `motion.div` for entrance/exit animations per design §5.2 (scale + opacity + y, spring easing, ≤300ms)
  - Local `useReducer` state: `{ open, input, resolved, status, result }` (design §6)
  - Integrate `createRuleIntentRouter()`: call `resolveIntent(input)` on input change, store in `resolved`
  - On submit: call `dispatchAction(resolved, controller)`, consume async generator, update `status` on each yield
  - Render resolved-intent preview chip below input: icon per intent (`TerminalSquare`, `Globe`, `Search`, `FileText` from lucide-react) + intent label (e.g., "Run · npm test")
  - Auto-dismiss timer: 2s after `done`/`failed`, clear on unmount/ESC (design CMD-1)
  - All states: empty (placeholder), typing (chip), queued/running (spinner, disabled input), done (success icon), failed (error msg), unknown (hint)
  - Token-only styling: `bg-popover`, `text-popover-foreground`, `text-muted-foreground`, `border`, ring tokens (design §5.1)
  - `prefers-reduced-motion` hook: select variants (opacity-only if reduced)
  - Make all component tests pass. (Sequential: after failing tests)
- [ ] **CommandBar status component** — Create `src/components/CommandBar/CommandBarStatus.jsx`:
  - Accept `status: ActionStatus`, `result?: TerminalReadResult`
  - Render status icon + text per phase: queued (spinner), running (spinner), done (check), failed (error icon + message)
  - Framer-motion crossfade on status change: key by `status.phase`, animate opacity + small scale pop on `done` (design §5.2)
  - Stub read-back display for `result` (will be implemented in Slice 3 when `TerminalReadResult` is populated)
- [ ] **CommandBar hook** — Create `src/components/CommandBar/useCommandBar.js`:
  - Export `useCommandBar()` hook: `{ open, onOpenChange }`
  - Global `keydown` listener: Cmd+K (mac) / Ctrl+K (others) → `onOpenChange(true)`
  - **IMPORTANT**: Audit for collision with `ChatCommandPalette` (design R-7). If `ChatCommandPalette` already owns Ctrl+K in the same context, choose a distinct chord (e.g., Cmd+Shift+K, Cmd+J, or Cmd+Semicolon). Document the chosen shortcut in this file's JSDoc and update UI hints (e.g., tooltip text).
  - Feature flag gate: register listener ONLY if `isCommandBarEnabled()` returns true (FEAT-1)
  - Focus restoration: store `document.activeElement` on open, restore on close
- [ ] **CommandBar index** — Create `src/components/CommandBar/index.js`: export `CommandBar`, `useCommandBar`. (Parallel with above)

### Integration: Wire CommandBar to App
- [ ] **Integrate CommandBar in PizarraPane** — Modify `src/components/pizarra/PizarraPane.jsx`:
  - Import `CommandBar`, `useCommandBar`
  - Call `useCommandBar()` at top level (registers shortcut)
  - Render `<CommandBar open={open} onOpenChange={onOpenChange} controller={controller} />` as a sibling to Pizarra content (Radix Dialog portals to `document.body`, so no canvas re-render impact per design §6)
  - Pass `controller` from step above
  - Conditional render: only if `isCommandBarEnabled()` (FEAT-1). (Sequential: after CommandBar component)

### E2E Tests
- [ ] **[E2E] CommandBar terminal-run flow** — Create `e2e/commandBar.spec.ts`:
  - Set `NEXT_PUBLIC_COMMANDBAR_ENABLED=true` in test env
  - Open app → press Cmd+K → assert CommandBar visible
  - Type "run npm test" → assert intent chip shows "Run · npm test"
  - Submit → assert terminal surface appears on Pizarra with "npm test" command visible
  - Assert status transitions to `done` (or `running` if test run is long)
  - Verify terminal surface is visible and not off-canvas (VIS-1)
- [ ] **[E2E] Feature flag disabled** — In commandBar.spec.ts:
  - Set `NEXT_PUBLIC_COMMANDBAR_ENABLED=false` or unset
  - Open app → press Cmd+K → assert CommandBar does NOT open
  - Verify existing terminal/Pizarra features work unchanged (FEAT-1)

### Lint + Final Review
- [ ] **Run lint gate** — `pnpm run lint` — ensure no lint errors in new files. Fix any violations. (Sequential: after all impl)
- [ ] **Slice 1 review checkpoint** — All unit tests pass, component tests pass, e2e tests pass, lint clean. CommandBar opens, terminal-run intent works end-to-end, surface visible. Ready for PR.

---

## Slice 2: Browser Intent + Actions

**Goal**: Add browser-navigate and browser-search intents and actions. Reuse surface controller + CommandBar UI from Slice 1.

### Intent Routing: Tests → Implementation
- [x] **[TEST FIRST] Browser-navigate intent tests** — Extend `src/lib/commandBar/intent/__tests__/ruleIntentRouter.test.js`:
  - "open github.com" → `browser-navigate` with `slots: { url: "github.com" }`
  - "go to https://example.com" → `browser-navigate` with `slots: { url: "https://example.com" }`
  - "navigate to localhost:3000" → `browser-navigate` with `slots: { url: "localhost:3000" }`
  - "visit docs.rs" → `browser-navigate` with `slots: { url: "docs.rs" }`
  - Disambiguation: "open terminal" → `terminal-run`, NOT browser-navigate (URL-likeness gate, design §2.2)
- [x] **[TEST FIRST] Browser-search intent tests** — In ruleIntentRouter.test.js:
  - "search for typescript docs" → `browser-search` with `slots: { query: "typescript docs" }`
  - "google react hooks" → `browser-search` with `slots: { query: "react hooks" }`
  - "look up rust ownership" → `browser-search` with `slots: { query: "rust ownership" }`
  - "find devhub github" → `browser-search` with `slots: { query: "devhub github" }`
- [x] **Browser intent patterns** — Modify `src/lib/commandBar/intent/ruleIntentRouter.js`:
  - Add browser-search rule: `/^(search|google|look up|find)\s+(for\s+)?(?<query>.+)/i` → `browser-search` with `slots: { query }`
  - Add browser-navigate rule: `/^(open|go to|navigate to|visit|browse)\s+(?<url>\S+)/i` with URL-likeness gate (contains `.` or scheme) → `browser-navigate` with `slots: { url }`
  - Order: multi-step guard (first), terminal-read, browser-search, browser-navigate (with gate), terminal-run, else unknown (design §2.2)
  - Make all new tests pass. (Sequential: after failing tests)

### Browser Actions: Tests → Implementation
- [x] **[TEST FIRST] Browser-navigate action tests** — Create `src/lib/commandBar/actions/__tests__/browserNavigate.test.js` with fake controller:
  - URL with protocol → spawns browser with exact URL
  - URL without protocol (e.g., "github.com") → normalizes to "https://github.com"
  - Empty URL slot → fails with "URL cannot be empty"
  - Browser exists → focuses + updates `shape.url` (re-navigate)
  - Browser spawn error → returns error
  - ACTION-2 scenarios from spec
- [x] **[TEST FIRST] Browser-search action tests** — Create `src/lib/commandBar/actions/__tests__/browserSearch.test.js`:
  - Query → constructs search URL (e.g., DuckDuckGo: `https://duckduckgo.com/?q=<query>`)
  - Empty query slot → fails with "Query cannot be empty"
  - Browser exists → focuses + navigates to search URL
  - ACTION-2 scenarios
- [x] **Browser-navigate action** — Create `src/lib/commandBar/actions/browserNavigate.js`:
  - Accept `(intent, controller: SurfaceController)`
  - Normalize URL: if no `http://` or `https://` prefix, prepend `https://` (design ACTION-2 auto-completion)
  - Check for existing browser shape via controller (most-recently-focused, design R-6)
  - If exists: `controller.focusBrowser(id)` + `updateElement(id, { url: normalizedUrl })` (re-navigate)
  - Else: `controller.spawnBrowser({ url: normalizedUrl })`
  - Return browser id on success
  - Make tests pass. (Sequential: after failing tests)
- [x] **Browser-search action** — Create `src/lib/commandBar/actions/browserSearch.js`:
  - Accept `(intent, controller)`
  - Construct search URL: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`
  - Delegate to `browserNavigate` with constructed URL (reuse navigation logic)
  - Make tests pass. (Sequential: after navigate action)

### Surface Controller: Browser Methods
- [x] **[TEST FIRST] Browser controller tests** — Extend `src/lib/commandBar/surface/__tests__/pizarraSurfaceController.test.js`:
  - `spawnBrowser({ url })` calls `addElement` with `type: 'browser'`, `url`
  - `focusBrowser(id)` calls appropriate focus method (design §4.2)
  - Browser reuse: find most-recently-focused browser shape
- [x] **Browser controller methods** — Modify `src/lib/commandBar/surface/pizarraSurfaceController.js`:
  - Implement `spawnBrowser({ url, label })`: delegate to `addElement({ type: 'browser', url, label, ...placement })`
  - Implement `focusBrowser(id)`: call appropriate focus method (if Pizarra has browser focus, implement; else stub as no-op for now and document)
  - Browser reuse: add `findBrowser()` helper to return most-recently-focused browser shape (design R-6)
  - Make tests pass. (Sequential: after browser tests)

### Action Dispatcher: Wire Browser Actions
- [x] **Wire browser actions to dispatcher** — Modify `src/lib/commandBar/actions/dispatchAction.js`:
  - Import `browserNavigate`, `browserSearch`
  - Route `browser-navigate` intent → `browserNavigate(intent, controller)`
  - Route `browser-search` intent → `browserSearch(intent, controller)`
  - Validate browser slots: reject empty `url` or `query`
  - Emit lifecycle: `queued → running → done` or `failed`
  - Existing dispatcher tests should cover new intents (extend if needed). (Sequential: after actions)

### E2E Tests
- [ ] **[E2E] Browser-navigate flow** — Extend `e2e/commandBar.spec.ts`:
  - Open CommandBar → type "open github.com" → assert intent chip "Navigate · github.com"
  - Submit → assert browser surface appears on Pizarra
  - Assert browser iframe/native navigates to `https://github.com` (check `shape.url` or visible content)
  - Verify surface is visible and not off-canvas (VIS-1)
- [ ] **[E2E] Browser-search flow** — In commandBar.spec.ts:
  - Open CommandBar → type "search for typescript docs" → assert chip "Search · typescript docs"
  - Submit → assert browser navigates to DuckDuckGo search results
  - Verify visible surface

### Lint + Final Review
- [x] **Run lint gate** — `pnpm run lint` for Slice 2 files. (Sequential: after all impl)
- [x] **Slice 2 review checkpoint** — All tests pass, browser intents work end-to-end, browser surfaces spawn and navigate visibly. Ready for PR.

---

## Slice 3: Terminal Buffer Read + TTS Seam

**Goal**: Implement terminal-read intent, buffer read API with ANSI strip + truncation, read-back UI with TTS-ready structure. Include time-boxed spike for history truncation (design R-1).

### Spike: PTY History Sufficiency (Time-boxed)
- [x] **[SPIKE] Verify `session.history` sufficiency** — Time-boxed investigation (max 2 hours):
  - Inspect `src/lib/terminal/ttyServer.js`: confirm `session.history` accumulates output and is returned by `getSessionOutput(id)`
  - Test native-VTE and xterm paths: spawn terminal, run command with >1000 lines output, call `/api/terminal/session/[id]/capture`, verify history is populated
  - If history is capped upstream below 1000 lines OR empty for native-VTE → escalate and add PTY-side ring buffer in `ttyServer.js` (design R-1 mitigation)
  - Else (history sufficient) → proceed with wrapper (design §3). Document finding in this task. (Sequential: do first in Slice 3)

### Terminal Buffer Read API: Tests → Implementation
- [x] **[TEST FIRST] Buffer read shaper tests** — Create `src/lib/commandBar/surface/__tests__/terminalBufferRead.test.js`:
  - ANSI color codes stripped: `\x1B[31mred\x1B[0m` → `"red"`
  - ANSI cursor codes stripped: `\x1B[2J\x1B[Hclear` → `"clear"`
  - OSC sequences stripped: `\x1B]0;title\x07text` → `"text"`
  - Empty buffer → `{ text: "", truncated: false }`
  - Large buffer (2000 lines) with `maxLines: 1000` → returns last 1000 lines, `truncated: true`
  - Buffer exactly `maxLines` → `truncated: false`
  - API-1 scenarios from spec
- [x] **Buffer read shaper** — Create `src/lib/commandBar/surface/terminalBufferRead.js`:
  - Export `shapeBufferText(rawOutput: string, opts: { maxLines: number }): { text: string; truncated: boolean }`
  - ANSI stripping: regex `/\x1B\[[0-9;?]*[ -/]*[@-~]/g` + OSC `/\x1B\].*?\x07/g` (design §3.3)
  - Truncation: split by `\n`, take last `maxLines` lines, set `truncated` if original length exceeded limit
  - Make tests pass. (Sequential: after spike and tests)

### Terminal-Read Action: Tests → Implementation
- [x] **[TEST FIRST] Terminal-read action tests** — Create `src/lib/commandBar/actions/__tests__/terminalRead.test.js` with fake controller:
  - Named terminal exists with content → returns `TerminalReadResult { text, terminalName, timestamp, truncated: false }`
  - Terminal not found → falls back to focused terminal, returns result with actual terminal name + label "Terminal 'X' not found. Showing focused: 'Y'." (ACTION-3 fallback)
  - No terminals open → fails with "No terminals are open"
  - Empty buffer → returns `{ text: "", terminalName, timestamp, truncated: false }` + label "Terminal buffer is empty"
  - Non-destructive: reading does not change terminal state (mock assertions)
  - ACTION-3 scenarios from spec
- [x] **Terminal-read action** — Create `src/lib/commandBar/actions/terminalRead.js`:
  - Accept `(intent, controller: SurfaceController)`
  - Extract `terminalName` from `intent.slots`
  - If `terminalName` present: `controller.findTerminalByLabel(terminalName)` → if found, use that id
  - Fallback: `controller.focusedTerminal()` → if none, fail with "No terminals are open"
  - Call `controller.captureTerminal(id)` → get `{ output }` (raw)
  - Call `shapeBufferText(output, { maxLines: 1000 })` → `{ text, truncated }`
  - Return `TerminalReadResult { text, terminalName: resolvedLabel, timestamp: new Date().toISOString(), truncated }`
  - Make tests pass. (Sequential: after shaper and tests)

### Surface Controller: Terminal Capture Implementation
- [x] **[TEST FIRST] Capture terminal tests** — Extend `src/lib/commandBar/surface/__tests__/pizarraSurfaceController.test.js`:
  - `captureTerminal(id)` calls `GET /api/terminal/session/${id}/capture` → returns `{ output }` (mock fetch)
  - Handle 404 / error → return error in result
- [x] **Capture terminal method** — Modify `src/lib/commandBar/surface/pizarraSurfaceController.js`:
  - Implement `captureTerminal(id)`:
    - `const res = await fetch(\`/api/terminal/session/\${id}/capture\`)`
    - If `!res.ok` → return `{ error: \`Failed to read terminal: \${res.statusText}\` }`
    - `const data = await res.json()` → return `{ output: data.output }`
  - Make tests pass. (Sequential: after tests)

### Intent Routing: Terminal-Read Pattern
- [x] **[TEST FIRST] Terminal-read intent tests** — Extend `src/lib/commandBar/intent/__tests__/ruleIntentRouter.test.js`:
  - "read terminal build-output" → `terminal-read` with `slots: { terminalName: "build-output" }`
  - "show terminal git-workspace" → `terminal-read` with `slots: { terminalName: "git-workspace" }`
  - "what does terminal test-runner show" → `terminal-read` with `slots: { terminalName: "test-runner" }`
  - "terminal logs output" → `terminal-read` with `slots: { terminalName: "logs" }`
  - INTENT-1 terminal-read scenarios from spec
- [x] **Terminal-read intent pattern** — Modify `src/lib/commandBar/intent/ruleIntentRouter.js`:
  - Add terminal-read rule: `/^(read|show|what does)\s+.*\bterminal\b\s+(?<terminalName>\S+)/i` and `/\bterminal\b\s+(?<terminalName>\S+)\s+(show|output|buffer)/i` → `terminal-read` with `slots: { terminalName }`
  - Order: place after multi-step guard but before browser rules (design §2.2)
  - Make tests pass. (Sequential: after failing tests)

### Action Dispatcher: Wire Terminal-Read
- [x] **Wire terminal-read action** — Modify `src/lib/commandBar/actions/dispatchAction.js`:
  - Import `terminalRead`
  - Route `terminal-read` intent → `terminalRead(intent, controller)`
  - Yield lifecycle: `queued → running → done` with `result: TerminalReadResult` in `done` status
  - Existing dispatcher tests should cover (extend if needed). (Sequential: after action)

### Read-Back UI: CommandBarStatus Extension
- [x] **[TEST FIRST] Read-back display tests** — Extend `src/components/CommandBar/__tests__/CommandBarStatus.test.jsx`:
  - `done` status with `result: TerminalReadResult` → displays structured text
  - Text >500 chars → truncates with "…" indicator (ACTION-3 UI truncation)
  - Shows terminal name, timestamp (human-readable)
  - `truncated: true` in result → shows "(truncated to last 1000 lines)" label
  - Empty buffer (`text: ""`) → shows "Terminal buffer is empty" label
  - TTS seam: assert `result.text` is available in DOM (for future voice consumption, design TTS-1)
- [x] **Read-back display UI** — Modify `src/components/CommandBar/CommandBarStatus.jsx`:
  - When `status.phase === 'done'` and `status.result` (TerminalReadResult) exists:
    - Render a read-back panel with `motion.div` (fade-in, `layout` animation for height expansion if motion enabled, design §5.2)
    - Display `result.terminalName` (e.g., "Terminal: build-output")
    - Display `result.timestamp` (formatted via `new Date(timestamp).toLocaleString()`)
    - Display `result.text` in monospace font (`font-mono`), truncate at 500 chars for UI display with "…" indicator if longer (design ACTION-3)
    - If `result.truncated === true`, show label "(truncated to last 1000 lines)"
    - If `result.text === ""`, show "Terminal buffer is empty" label
    - Ensure `result.text` is in a semantic element (e.g., `<pre>` or `<code>`) so it's accessible to future TTS consumers (TTS-1 seam)
  - Make tests pass. (Sequential: after failing tests)

### E2E Tests
- [ ] **[E2E] Terminal-read flow** — Extend `e2e/commandBar.spec.ts`:
  - Setup: spawn a terminal named "test-output", run a command that produces output (e.g., "echo hello world")
  - Open CommandBar → type "read terminal test-output" → assert chip "Read · test-output"
  - Submit → assert read-back panel appears with structured text containing "hello world"
  - Assert terminal name, timestamp visible
  - Verify terminal surface state unchanged (VIS-1, ACTION-3 non-destructive)
- [ ] **[E2E] Terminal-read fallback to focused** — In commandBar.spec.ts:
  - Spawn terminal "focused-term", make it active
  - CommandBar → "read terminal nonexistent" → assert fallback message → read-back shows "focused-term" content

### Lint + Final Review
- [x] **Run lint gate** — `pnpm run lint` for Slice 3 files. (Sequential: after all impl)
- [x] **Slice 3 review checkpoint** — All tests pass, terminal-read works end-to-end, read-back displays structured text (TTS-ready), spike documented. Ready for PR.

---

## Cross-Slice Integration Tests (Run After All Slices)

- [ ] **[INTEGRATION] Full CommandBar lifecycle with all intents** — In `e2e/commandBar.full.spec.ts`:
  - Open CommandBar → test each intent sequentially (terminal-run, browser-navigate, browser-search, terminal-read)
  - Verify auto-dismiss timer works for `done`/`failed`
  - Verify multi-step rejection works ("run npm test and open github.com" → error message)
  - Verify unknown intent handling ("frobulate the widgets" → hint message)
- [ ] **[INTEGRATION] Multi-surface spawn and placement** — In commandBar.full.spec.ts:
  - CommandBar spawns 3 terminals + 2 browsers sequentially
  - Verify all surfaces are visible, placed without overlap (VIS-1 auto-placement)
  - Verify viewport-aware center + cascade works (design §4.3)
- [ ] **[INTEGRATION] Feature flag gating** — In commandBar.full.spec.ts:
  - Toggle `NEXT_PUBLIC_COMMANDBAR_ENABLED` on/off between test runs
  - Verify CommandBar presence/absence + existing features unaffected when disabled (FEAT-1)

---

## Final Acceptance Gate (Run Before Archive)

- [ ] **All unit tests pass** — `pnpm exec jest --runInBand` — zero failures
- [ ] **All component tests pass** — Jest + RTL tests for CommandBar components
- [ ] **All e2e tests pass** — `playwright test` — zero failures, visual assertions for spawned surfaces
- [ ] **Lint clean** — `pnpm run lint` — zero errors, zero warnings for new code
- [ ] **Manual smoke test** — Open DevHub, enable feature flag, run through all intents (terminal-run, browser-navigate/search, terminal-read), verify visual quality (animations smooth, no jank, states clear, accessible focus, reduced-motion works)
- [ ] **Keyboard shortcut collision resolved** — If Cmd/Ctrl+K collided with `ChatCommandPalette`, verify distinct chord chosen and documented (design R-7)
- [ ] **Visual design quality** — Animations hit 60fps (transform/opacity only), motion respects `prefers-reduced-motion`, resolved-intent chip looks intentional (icons + labels), status transitions smooth, no generic AI aesthetics (skills loaded and applied)
- [ ] **Accessibility verified** — Screen reader announces status changes, focus trap works, WCAG AA contrast met, keyboard navigation works

---

## Notes

### Dependency Order
- **Slice 1** must complete before Slice 2 (browser actions depend on dispatcher + controller foundation)
- **Slice 2** must complete before Slice 3 (terminal-read shares controller methods)
- Within each slice: tests before implementation (STRICT TDD)
- Visual skills loaded FIRST in Slice 1 (inform all UI design decisions)

### Parallel Execution Opportunities (Within Each Slice)
- Feature flag + types can be done in parallel
- Test files can be written in parallel once interfaces are defined
- E2E tests can be written in parallel with implementation (run after impl)

### Risk Mitigations in Tasks
- **R-1 (PTY history truncation)**: Time-boxed spike at start of Slice 3 (max 2 hours, escalate if insufficient)
- **R-2 (Intent misroute)**: Explicit disambiguation tests + URL-likeness gate
- **R-7 (Keyboard shortcut collision)**: Audit task in Slice 1, resolve before integration

### Test Coverage Targets
- Intent router: ≥3 cases per intent + edge cases (empty, malformed, multi-step, disambiguation)
- Actions: unit tests with fake controller + integration tests with real controller
- UI: component states (empty, typing, queued, running, done, failed, unknown) + a11y + reduced-motion
- E2E: visible surface verification for every action + feature flag on/off

### Visual Quality Checklist (Per Loaded Skills)
- [ ] Warm, intentional color palette (not generic blue/gray)
- [ ] Generous spacing (not cramped)
- [ ] Purposeful micro-animations (entrance, exit, status transitions)
- [ ] Clear visual hierarchy (resolved-intent chip distinct, status clear)
- [ ] Monospace ONLY for echoed commands/buffer text (not UI labels)
- [ ] Icons meaningful (lucide-react TerminalSquare, Globe, Search, FileText)
- [ ] 60fps transform/opacity budget (no width/height/top/left animations)

---

**End of tasks.md**
