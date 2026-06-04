# Spec: native-command-executor-assistant

**Change**: `native-command-executor-assistant`  
**Type**: New capability — user-directed single-shot command executor  
**Strict TDD**: active  
**Feature flag**: `NEXT_PUBLIC_COMMANDBAR_ENABLED`

---

## Purpose

Provide a fast, in-app **CommandBar** surface for single-shot, user-directed commands that execute ONE concrete action visibly using DevHub's existing native surfaces. This is explicitly NOT an autonomous agent: no planning loop, no multi-step orchestration, no Director General mission overhead.

**What must be true after this change**:
- User types one instruction in CommandBar → system resolves it to exactly ONE action → action executes visibly via native surface (terminal, browser) → status reflects reality (queued → running → done/failed).
- Named terminal buffers can be read back as structured text context.
- Intent routing is deterministic, unit-testable, and has a clean seam for future LLM tool-calling without rewriting the action layer.
- Read-back results flow through a typed structure suitable for future voice/TTS consumption (no audio shipped here).
- UI quality meets the existing design system standards: Radix UI + Tailwind 4 + `cmdk`, purposeful motion (`framer-motion`), full state coverage, keyboard-first accessibility.

---

## Out of Scope (Non-Goals)

- Autonomous or multi-step missions (explicit rejection)
- Voice/TTS audio playback (architecture must not block it; no audio shipped)
- Speech-to-text input (text only)
- Rewriting terminal or browser engines (reuse existing native surfaces)
- Director General mission overhead for single-shot intents
- Persistent command history, macros, or saved workflows

---

## Requirements

### Requirement: CMD-1 — CommandBar Input Surface

A single-input in-app command surface MUST exist, allowing the user to enter one natural-language instruction. The surface MUST show the resolved intent and live action status (queued → running → done/failed).

#### Scenario: User opens CommandBar

- GIVEN the feature flag `NEXT_PUBLIC_COMMANDBAR_ENABLED=true`
- WHEN the user triggers the CommandBar shortcut (e.g., `Cmd+K` / `Ctrl+K`)
- THEN the CommandBar input surface appears with focus in the input field
- AND the input is empty and ready to accept text

#### Scenario: User enters instruction and sees resolved intent

- GIVEN the CommandBar is open
- WHEN the user types an instruction (e.g., "run npm test")
- THEN the system resolves the intent to an action type (e.g., `terminal-run`)
- AND displays the resolved intent to the user before execution (e.g., "Run command: npm test")

#### Scenario: Single-shot guarantee — multi-step rejected

- GIVEN the user enters an instruction containing multiple discrete actions (e.g., "run npm test and then open the browser")
- WHEN the intent parser evaluates the input
- THEN the system rejects the request with an error message: "CommandBar executes one action at a time. Try one command."
- AND no action is executed

#### Scenario: Status transitions visible

- GIVEN an action has been dispatched
- WHEN the action moves through lifecycle phases
- THEN the CommandBar displays status updates:
  - `queued`: "Queued…"
  - `running`: "Running…"
  - `done`: "Done" (with success indicator)
  - `failed`: "Failed: [error message]" (with error indicator)

#### Scenario: CommandBar closes after done/failed

- GIVEN an action reaches `done` or `failed` status
- WHEN 2 seconds elapse (configurable timeout)
- THEN the CommandBar auto-dismisses
- OR user presses ESC to close immediately

---

### Requirement: CMD-2 — CommandBar UI Quality

The CommandBar MUST use the existing design system (Radix UI + Tailwind 4 + `cmdk` for command-palette pattern). It MUST provide consistent spacing, typography, theming (light/dark), purposeful motion, full state coverage, and keyboard-first accessibility.

#### Scenario: Design system consistency

- GIVEN the CommandBar is rendered
- WHEN inspected against the design system tokens
- THEN spacing, typography, and color tokens match the existing system
- AND light/dark theme variants render correctly

#### Scenario: Entrance and exit animations

- GIVEN the CommandBar opens or closes
- WHEN the transition executes
- THEN entrance uses a fade-in + scale animation (`framer-motion`)
- AND exit uses a fade-out + scale animation
- AND animations target 60fps
- AND animations complete in ≤300ms

#### Scenario: Status transition animations

- GIVEN the action status changes (queued → running → done/failed)
- WHEN the status updates in the UI
- THEN the status indicator transitions smoothly (color + icon change)
- AND the transition respects `prefers-reduced-motion` (crossfade only, no scale/slide)

#### Scenario: Reduced motion support

- GIVEN the user has `prefers-reduced-motion: reduce` set
- WHEN the CommandBar opens, closes, or updates status
- THEN all scale and slide animations are replaced with simple opacity transitions
- AND the UI remains functional and accessible

#### Scenario: Loading state

- GIVEN an action is in `queued` or `running` status
- WHEN the CommandBar displays the status
- THEN a spinner or progress indicator is visible
- AND the input field is disabled to prevent concurrent submissions

#### Scenario: Error state

- GIVEN an action fails with an error message
- WHEN the CommandBar displays the `failed` status
- THEN the error message is shown in readable text
- AND the status indicator uses the error color from the design system
- AND the user can retry by typing a new command

#### Scenario: Empty state (no action yet)

- GIVEN the CommandBar is open and no instruction has been entered
- WHEN the user sees the surface
- THEN placeholder text is visible (e.g., "Type a command…")
- AND the input is in a neutral state (not error, not success)

---

### Requirement: CMD-3 — Keyboard Accessibility

The CommandBar MUST be keyboard-first: open/close shortcut, focus trap, ESC to dismiss, and visible focus indicators.

#### Scenario: Open CommandBar with keyboard shortcut

- GIVEN the user is anywhere in the DevHub UI
- WHEN the user presses `Cmd+K` (macOS) or `Ctrl+K` (Linux/Windows)
- THEN the CommandBar opens and focus moves to the input field

#### Scenario: Focus trap while open

- GIVEN the CommandBar is open
- WHEN the user presses `Tab` or `Shift+Tab`
- THEN focus cycles only within the CommandBar (input field, action buttons if any)
- AND focus cannot escape to the underlying UI

#### Scenario: Close with ESC

- GIVEN the CommandBar is open
- WHEN the user presses `ESC`
- THEN the CommandBar closes immediately
- AND focus returns to the previously focused element

#### Scenario: Visible focus indicator

- GIVEN the CommandBar input field has focus
- WHEN the user inspects the UI
- THEN a clear focus ring or border is visible
- AND the focus indicator meets WCAG AA contrast requirements

#### Scenario: ARIA roles for screen readers

- GIVEN the CommandBar is rendered
- WHEN inspected with a screen reader
- THEN the input field has `role="combobox"` and `aria-expanded` state
- AND the status display has an ARIA live region (`aria-live="polite"`)
- AND each action result is announced to screen readers

---

### Requirement: INTENT-1 — Deterministic Intent Router

The intent router MUST use a rule-based mechanism (regex/keyword matching + slot extraction) to classify user input into exactly ONE action. The router MUST be unit-testable and deterministic.

#### Scenario: Terminal-run intent recognized

- GIVEN the user enters "run npm test"
- WHEN the intent router parses the input
- THEN the resolved intent is `terminal-run`
- AND the extracted slot is `{ command: "npm test" }`

#### Scenario: Browser-navigate intent recognized

- GIVEN the user enters "open github.com"
- WHEN the intent router parses the input
- THEN the resolved intent is `browser-navigate`
- AND the extracted slot is `{ url: "github.com" }`

#### Scenario: Browser-search intent recognized

- GIVEN the user enters "search for typescript docs"
- WHEN the intent router parses the input
- THEN the resolved intent is `browser-search`
- AND the extracted slot is `{ query: "typescript docs" }`

#### Scenario: Terminal-read intent recognized

- GIVEN the user enters "read terminal build-output"
- WHEN the intent router parses the input
- THEN the resolved intent is `terminal-read`
- AND the extracted slot is `{ terminalName: "build-output" }`

#### Scenario: Unrecognized intent

- GIVEN the user enters an instruction with no matching intent pattern (e.g., "frobulate the widgets")
- WHEN the intent router parses the input
- THEN the router returns `intent: "unknown"`
- AND an error message is shown: "I don't understand that command. Try: 'run [command]', 'open [url]', or 'read terminal [name]'."

#### Scenario: Intent router is unit-testable

- GIVEN a test suite for the intent router module
- WHEN the test suite runs
- THEN each intent type (terminal-run, browser-navigate, browser-search, terminal-read) has ≥3 test cases covering typical inputs
- AND edge cases (empty input, malformed input, ambiguous input) are tested
- AND all tests pass

---

### Requirement: INTENT-2 — IntentRouter Seam for LLM Routing

An `IntentRouter` interface MUST exist so an LLM tool-calling implementation can replace the rule-based router WITHOUT changing the action layer.

#### Scenario: IntentRouter interface contract

- GIVEN the `IntentRouter` interface is defined
- WHEN inspected
- THEN it has a method `resolveIntent(input: string): ResolvedIntent`
- AND `ResolvedIntent` has shape:
  ```typescript
  {
    intent: "terminal-run" | "browser-navigate" | "browser-search" | "terminal-read" | "unknown",
    slots: Record<string, string>,
    confidence?: number
  }
  ```

#### Scenario: Rule-based router implements IntentRouter

- GIVEN the rule-based router is the default implementation
- WHEN the router is instantiated
- THEN it implements the `IntentRouter` interface
- AND can be swapped with an LLM-based router without changing the action dispatch layer

#### Scenario: LLM router seam is testable

- GIVEN a mock LLM-based router implementing `IntentRouter`
- WHEN the mock router is injected in place of the rule-based router
- THEN actions dispatch correctly using the mock's resolved intents
- AND the action layer requires no changes

---

### Requirement: ACTION-1 — Open Terminal + Run Command

Given a `terminal-run` intent with a `command` slot, the system MUST spawn or focus a native terminal surface and execute the command string VISIBLY.

#### Scenario: Terminal opens and command runs

- GIVEN a resolved intent `{ intent: "terminal-run", slots: { command: "npm test" } }`
- WHEN the action dispatcher executes the action
- THEN a native terminal surface opens or focuses
- AND the command "npm test" executes in that terminal
- AND the terminal surface is visible on the Pizarra overlay

#### Scenario: Named terminal reused

- GIVEN a resolved intent `{ intent: "terminal-run", slots: { command: "git status", terminalName: "git-workspace" } }`
- AND a terminal named "git-workspace" already exists
- WHEN the action executes
- THEN the existing "git-workspace" terminal is focused
- AND "git status" runs in that terminal
- AND no new terminal is spawned

#### Scenario: New terminal spawned if name not found

- GIVEN a resolved intent with `terminalName: "build-output"`
- AND no terminal named "build-output" exists
- WHEN the action executes
- THEN a new terminal named "build-output" is spawned
- AND the command runs in the new terminal

#### Scenario: Action status reflects terminal lifecycle

- GIVEN a `terminal-run` action is dispatched
- WHEN the terminal surface spawns
- THEN the action status transitions: `queued` → `running` (terminal opened) → `done` (command sent)
- AND if the terminal spawn fails, status is `failed` with an error message

#### Scenario: Empty command string rejected

- GIVEN a resolved intent with `slots: { command: "" }`
- WHEN the action validator checks the intent
- THEN the action is rejected with status `failed` and message "Command cannot be empty"

---

### Requirement: ACTION-2 — Open Browser + Navigate/Search

Given a `browser-navigate` or `browser-search` intent, the system MUST open or focus the native browser surface and navigate to a URL or run a search query VISIBLY.

#### Scenario: Browser navigates to URL

- GIVEN a resolved intent `{ intent: "browser-navigate", slots: { url: "https://github.com" } }`
- WHEN the action executes
- THEN the native browser surface opens or focuses
- AND navigates to "https://github.com"
- AND the browser surface is visible on the Pizarra overlay

#### Scenario: Browser searches for query

- GIVEN a resolved intent `{ intent: "browser-search", slots: { query: "react hooks" } }`
- WHEN the action executes
- THEN the native browser surface opens or focuses
- AND performs a search for "react hooks" (using default search engine, e.g., DuckDuckGo)
- AND the browser surface is visible

#### Scenario: URL auto-completion (http/https)

- GIVEN a resolved intent with `slots: { url: "github.com" }` (no protocol)
- WHEN the action executes
- THEN the URL is auto-completed to "https://github.com"
- AND the browser navigates correctly

#### Scenario: Action status reflects browser lifecycle

- GIVEN a `browser-navigate` action is dispatched
- WHEN the browser surface spawns
- THEN the action status transitions: `queued` → `running` (browser opened) → `done` (navigation initiated)
- AND if the browser spawn fails, status is `failed` with an error message

#### Scenario: Empty URL/query rejected

- GIVEN a resolved intent with `slots: { url: "" }` or `slots: { query: "" }`
- WHEN the action validator checks the intent
- THEN the action is rejected with status `failed` and message "URL/query cannot be empty"

---

### Requirement: ACTION-3 — Read Terminal Buffer (Text)

Given a `terminal-read` intent with a `terminalName` slot, the system MUST read the current buffer content of the named terminal and return it as structured text (string + terminal name + timestamp).

#### Scenario: Named terminal buffer read

- GIVEN a resolved intent `{ intent: "terminal-read", slots: { terminalName: "build-output" } }`
- AND a terminal named "build-output" exists with non-empty buffer content
- WHEN the action executes
- THEN the system reads the terminal's current buffer as plain text
- AND returns a result object:
  ```typescript
  {
    text: string,           // buffer content
    terminalName: string,   // "build-output"
    timestamp: string       // ISO 8601 timestamp of read
  }
  ```
- AND the result is displayed in the CommandBar (truncated if >500 chars)

#### Scenario: Terminal not found — fallback to focused

- GIVEN a resolved intent with `terminalName: "nonexistent"`
- AND no terminal with that name exists
- WHEN the action executes
- THEN the system falls back to the currently focused terminal
- AND the result includes the actual terminal name used (e.g., "build-output")
- AND a label is shown: "Terminal 'nonexistent' not found. Showing focused terminal: 'build-output'."

#### Scenario: No terminal exists

- GIVEN a `terminal-read` intent
- AND no terminals are open
- WHEN the action executes
- THEN the action fails with status `failed` and message "No terminals are open"

#### Scenario: Empty terminal buffer

- GIVEN a named terminal exists but has no content (empty buffer)
- WHEN the buffer is read
- THEN the result object is returned with `text: ""`
- AND a label is shown: "Terminal buffer is empty."

#### Scenario: Terminal buffer read is non-destructive

- GIVEN a terminal with buffer content
- WHEN the buffer is read
- THEN the terminal's state is unchanged
- AND the buffer content remains visible in the terminal surface
- AND the terminal's scroll position is unchanged

---

### Requirement: API-1 — Terminal Buffer Read Enabling API

A new API MUST exist to read a named terminal's current buffer content as plain text. This API is consumed by the `terminal-read` action and is reusable by future features (e.g., voice/TTS).

#### Scenario: Terminal buffer read API contract

- GIVEN the terminal buffer read API is implemented
- WHEN invoked with a terminal identifier (name or ID)
- THEN it returns:
  ```typescript
  {
    text: string,           // buffer content as plain text (ANSI stripped)
    terminalName: string,   // resolved terminal name
    timestamp: string,      // ISO 8601 timestamp
    error?: string          // error message if read fails
  }
  ```

#### Scenario: Buffer read via Tauri command

- GIVEN the terminal surface is implemented with a PTY backend
- WHEN the buffer read API is invoked
- THEN it calls a Tauri command (e.g., `read_terminal_buffer`) with the terminal ID
- AND the Tauri backend reads the PTY buffer and returns plain text

#### Scenario: ANSI codes stripped

- GIVEN a terminal buffer contains ANSI escape codes (color, cursor positioning, etc.)
- WHEN the buffer is read via the API
- THEN all ANSI codes are stripped from the returned text
- AND only plain text content is returned

#### Scenario: Buffer length limit

- GIVEN a terminal buffer is very large (e.g., 100,000 lines)
- WHEN the buffer is read
- THEN the API returns the most recent N lines (configurable, default 1000)
- AND a flag indicates if the buffer was truncated: `truncated: boolean`

---

### Requirement: TTS-1 — Voice/TTS Seam (No Audio Shipped)

The read-back result MUST flow through a typed structure suitable for future TTS consumption. NO audio playback is implemented in this change; the architecture must NOT block future TTS integration.

#### Scenario: Read-back result is TTS-ready

- GIVEN a `terminal-read` action completes
- WHEN the result is returned
- THEN the result object has a `text` field (string) suitable for direct TTS consumption
- AND the result is logged or displayed in a way that a future TTS consumer can hook into

#### Scenario: TTS consumer seam is defined

- GIVEN the action dispatcher completes a `terminal-read` action
- WHEN a TTS consumer hook is registered (future)
- THEN the consumer receives the `text` field from the read-back result
- AND no changes to the action layer are required to enable TTS

#### Scenario: No audio playback in this change

- GIVEN any action completes (terminal-run, browser-navigate, terminal-read)
- WHEN the result is processed
- THEN NO audio is played
- AND no TTS library or audio playback code is included in this change

---

### Requirement: VIS-1 — Live Visibility via Pizarra Overlay

Every action MUST map to a visible native surface via the Pizarra overlay. The CommandBar status MUST reflect the actual state of the spawned surface.

#### Scenario: Terminal action spawns visible surface

- GIVEN a `terminal-run` action executes
- WHEN the terminal surface spawns
- THEN the surface is visible on the Pizarra overlay
- AND the surface is not hidden, minimized, or off-canvas

#### Scenario: Browser action spawns visible surface

- GIVEN a `browser-navigate` action executes
- WHEN the browser surface spawns
- THEN the surface is visible on the Pizarra overlay
- AND the surface is not hidden or off-canvas

#### Scenario: Auto-placement avoids overlap

- GIVEN multiple CommandBar actions spawn surfaces
- WHEN the surfaces are placed on the Pizarra overlay
- THEN the auto-placement algorithm positions them to minimize overlap
- AND each surface is fully visible within the viewport bounds

#### Scenario: CommandBar does not block native surfaces

- GIVEN a CommandBar action spawns a native surface
- WHEN the surface appears
- THEN the CommandBar UI does not obscure the spawned surface
- AND the user can interact with the surface immediately

---

### Requirement: FEAT-1 — Feature Flag Gate

The entire CommandBar feature MUST be gated behind a feature flag: `NEXT_PUBLIC_COMMANDBAR_ENABLED`. When disabled, no CommandBar UI or actions are available.

#### Scenario: Feature flag enabled

- GIVEN `NEXT_PUBLIC_COMMANDBAR_ENABLED=true` in the environment
- WHEN the app loads
- THEN the CommandBar shortcut (`Cmd+K` / `Ctrl+K`) is registered
- AND the CommandBar UI is available

#### Scenario: Feature flag disabled

- GIVEN `NEXT_PUBLIC_COMMANDBAR_ENABLED=false` or the flag is unset
- WHEN the app loads
- THEN the CommandBar shortcut is NOT registered
- AND no CommandBar UI is rendered
- AND no CommandBar actions are dispatched

#### Scenario: Existing features unaffected when disabled

- GIVEN the feature flag is disabled
- WHEN the user interacts with existing terminal, browser, or Pizarra features
- THEN all existing features work identically to pre-CommandBar behavior
- AND no CommandBar code is executed

---

## Acceptance Criteria Summary

### Functional
- [ ] User types one instruction in CommandBar → one action resolves → executes visibly → status reflects lifecycle.
- [ ] Terminal-run action: opens/focuses terminal, runs command visibly.
- [ ] Browser-navigate action: opens browser, navigates to URL visibly.
- [ ] Browser-search action: opens browser, runs search query visibly.
- [ ] Terminal-read action: reads named terminal buffer, returns structured text (string + name + timestamp).
- [ ] Intent router is deterministic, unit-tested, and has an `IntentRouter` interface for future LLM routing.
- [ ] Multi-step instructions are rejected (single-shot guarantee).
- [ ] Feature flag `NEXT_PUBLIC_COMMANDBAR_ENABLED` controls availability; disabled = no impact on existing features.

### Non-Functional (Visual & UX Quality)
- [ ] CommandBar uses design system (Radix UI + Tailwind 4 + `cmdk`): consistent spacing, typography, theming.
- [ ] Purposeful animations (`framer-motion`): entrance/exit, status transitions, 60fps target, respects `prefers-reduced-motion`.
- [ ] Full state coverage: loading (queued/running), success (done), error (failed), empty (no input yet).
- [ ] Keyboard-first: open/close shortcut, focus trap, ESC to dismiss, visible focus indicators.
- [ ] Accessibility: ARIA roles, screen reader support, WCAG AA contrast.
- [ ] Live visibility: each action spawns a visible native surface; auto-placement avoids overlap; CommandBar does not block surfaces.

### TTS Seam (No Audio)
- [ ] Read-back result is a typed object (`{ text, terminalName, timestamp }`) suitable for future TTS consumption.
- [ ] No audio playback is implemented in this change.

### Testing (Strict TDD)
- [ ] Intent router: ≥3 test cases per intent type, edge cases covered.
- [ ] Actions: unit tests for terminal-run, browser-navigate, browser-search, terminal-read.
- [ ] Terminal buffer read API: unit tests for read, fallback, empty buffer, ANSI stripping.
- [ ] E2E tests: user opens CommandBar → enters instruction → sees action execute → surface is visible.
- [ ] Feature flag: tests verify behavior when enabled/disabled.
- [ ] All tests pass: `pnpm exec jest --runInBand` (unit), `playwright test` (e2e), `pnpm run lint` (linting).

---

## Phasing Recommendation

Per proposal, split into 3 PRs to keep each under ~400 lines:

1. **PR 1: CommandBar + Terminal-Run** — CommandBar UI, intent router (terminal-run only), terminal action, live visibility. Smallest vertical slice, ships value.
2. **PR 2: Browser Navigate/Search** — Add browser intents to router, browser actions (navigate + search).
3. **PR 3: Terminal Buffer Read** — Terminal buffer read API (Tauri/PTY layer), terminal-read intent, read action, TTS-ready result structure.

---

## Affected Components

| Component | Change Type | Description |
|-----------|-------------|-------------|
| `src/components/CommandBar/` | **New** | CommandBar UI, input, status display, animations |
| `src/features/intent-routing/` | **New** | `IntentRouter` interface, rule-based implementation, slot extraction |
| `src/features/actions/` | **New** | Action dispatcher, terminal-run, browser-navigate, browser-search, terminal-read actions |
| Native terminal control (`src/features/terminal/`) | **Modified** | Add programmatic "open + run in named terminal" entry point |
| Native browser control (`src/features/browser/`) | **Modified** | Add programmatic "open + navigate/search" entry point |
| Terminal buffer read (Tauri `src-tauri/`) | **New** | PTY buffer read command, ANSI stripping, buffer truncation |
| Pizarra overlay (`src/features/pizarra/`) | **Modified** | Auto-placement for CommandBar-spawned surfaces |

---

## Test Plan

### Unit Tests
- **Intent router**: 20+ test cases covering all intent types (terminal-run, browser-navigate, browser-search, terminal-read, unknown), edge cases (empty, malformed, ambiguous input), slot extraction accuracy.
- **Action validation**: each action type has tests for valid input, invalid input (empty command/URL/query), missing terminal.
- **Terminal buffer read API**: read success, terminal not found fallback, empty buffer, ANSI stripping, buffer truncation, non-destructive read.

### Integration Tests
- **CommandBar lifecycle**: open → enter instruction → intent resolves → action dispatches → status updates → auto-dismiss.
- **Terminal action**: CommandBar opens terminal → command runs → surface visible → status reflects lifecycle.
- **Browser action**: CommandBar opens browser → navigates/searches → surface visible → status reflects lifecycle.
- **Terminal read action**: CommandBar reads buffer → structured text returned → displayed in UI.

### E2E Tests (Playwright)
- **User flow: terminal-run**: user presses `Cmd+K` → types "run npm test" → terminal opens and runs command visibly → CommandBar shows "Done" → auto-dismisses.
- **User flow: browser-navigate**: user opens CommandBar → types "open github.com" → browser navigates visibly → CommandBar shows "Done".
- **User flow: terminal-read**: user opens CommandBar → types "read terminal build" → buffer content displayed → CommandBar shows result.
- **Feature flag disabled**: user presses `Cmd+K` → nothing happens → CommandBar not available.

### Accessibility Tests
- **Keyboard navigation**: tab order, focus trap, ESC to close, visible focus indicators.
- **Screen reader**: ARIA roles, live regions, announcements for status changes.
- **Reduced motion**: animations respect `prefers-reduced-motion`.

---

## Rollback Plan

1. **Feature flag**: set `NEXT_PUBLIC_COMMANDBAR_ENABLED=false` → CommandBar unavailable, zero impact on existing features.
2. **Remove UI**: delete `src/components/CommandBar/`, intent routing module, action dispatcher.
3. **Keep enabling APIs**: terminal/browser entry points added are additive and harmless if unused; terminal buffer read API is read-only and non-destructive.
4. **Verification**: run full test suite with flag off → all existing tests pass.

---

## Risks

| Risk | Mitigation |
|------|------------|
| Terminal buffer read API not implemented (hard dependency) | Treat as a required enabling task in PR 3; spike PTY/native read path early to de-risk. |
| Intent parser accuracy (rule-based may misclassify) | Show resolved intent before execution for user confirmation; keep LLM router as opt-in seam. |
| Auto-placement conflicts (surfaces overlap or off-canvas) | Reuse existing Pizarra placement logic; clamp to viewport; test with multiple surfaces. |
| Named terminal resolution ambiguity | Require explicit name slot; fall back to focused/last-used terminal with visible label. |
| Scope creep toward agent loop | Hard non-goal: one intent → one action. Multi-step requests rejected or explicitly handed to Director General. |
