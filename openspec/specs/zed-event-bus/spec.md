# Spec: zed-event-bus

> **Capability status**: NEW. The `zed-event-bus` is a thin window-level
> CustomEvent namespace that the Zed chat assistant and its consumers
> (TerminalWorkspacesManager, WorkspaceBrowserPane, future consumers) use
> to coordinate cross-component actions. The existing
> `devhub:zed-open-terminal` event is re-documented here under the new
> namespace contract; `devhub:zed-open-url` is added in this change.

## Purpose

Define the contract for `devhub:zed-*` CustomEvents dispatched on the
`window` object: their namespace, payload shape, validator/resolver helper
exports, and SSR-safety guarantees. The intent is to keep every
CustomEvent surface in the Zed chat flow (currently dispatch and consume
of `open_terminal` and `open_url`) routed through a small set of named
helpers so dispatch and validation are testable in isolation.

## Requirements

### ZEB-001: `devhub:zed-*` CustomEvent Namespace

The system MUST use a single `window`-level CustomEvent namespace for
Zed chat cross-component coordination. Every event name MUST start with
the prefix `devhub:zed-`. No Zed chat cross-component event MAY be
dispatched under any other prefix.

#### Scenario: All Zed cross-component events share the namespace

- **WHEN** any component in the Zed chat flow needs to broadcast a
  cross-component action
- **THEN** it MUST dispatch a `CustomEvent` whose `type` starts with
  `devhub:zed-`

### ZEB-002: `devhub:zed-open-terminal` Payload

The `devhub:zed-open-terminal` event MUST carry a `detail` object with the
following fields:

| Field          | Type    | Required | Notes                                                                                                           |
| -------------- | ------- | -------- | --------------------------------------------------------------------------------------------------------------- |
| `session_id`   | string  | YES      | Uniquely identifies the PTY session.                                                                            |
| `port`         | number  | NO       | Backend port for the PTY WebSocket.                                                                             |
| `wsPath`       | string  | NO       | WebSocket path on the backend.                                                                                  |
| `command_sent` | string  | NO       | The full command string that was launched.                                                                      |
| `program`      | string  | NO       | Shell program (e.g. `zsh`).                                                                                     |
| `cwd`          | string  | NO       | Working directory for the PTY.                                                                                  |
| `focus`        | boolean | NO       | Opt-in flag (default `false`); when `true`, the listener MUST perform focus + pizarra de-maximize side effects. |

#### Scenario: Valid event payload is accepted

- **WHEN** a `devhub:zed-open-terminal` event is dispatched with
  `detail = { session_id: 'term-X', port: 4321, wsPath: '/ws', command_sent: 'ls', program: 'zsh', cwd: '/tmp', focus: true }`
- **THEN** the validator MUST return `true`
- **AND** the consumer MUST receive the full `detail` object

#### Scenario: Event missing `session_id` is rejected

- **WHEN** a `devhub:zed-open-terminal` event is dispatched with
  `detail = { port: 4321 }` (no `session_id`)
- **THEN** the validator MUST return `false`
- **AND** the consumer MUST ignore the event (no panel created)

### ZEB-003: `devhub:zed-open-url` Payload

The `devhub:zed-open-url` event MUST carry a `detail` object with the
following fields:

| Field   | Type    | Required | Notes                                                                                      |
| ------- | ------- | -------- | ------------------------------------------------------------------------------------------ |
| `url`   | string  | YES      | The URL to navigate to. MUST pass `isSafeHttpUrl`.                                         |
| `label` | string  | NO       | Identifies the target browser pane (used for idempotence).                                 |
| `focus` | boolean | NO       | Opt-in flag (default `false`); when `true`, the listener MUST perform pizarra de-maximize. |

#### Scenario: Valid URL event is accepted

- **WHEN** a `devhub:zed-open-url` event is dispatched with
  `detail = { url: 'https://github.com', label: 'repo', focus: true }`
- **THEN** the validator MUST return `true`
- **AND** the consumer MUST navigate the in-app browser pane to the URL

#### Scenario: Unsafe URL is rejected

- **WHEN** a `devhub:zed-open-url` event is dispatched with
  `detail = { url: 'file:///etc/passwd' }`
- **THEN** the validator MUST return `false`
- **AND** the consumer MUST ignore the event

### ZEB-004: Helper Module Exports

The system MUST provide the following helper modules in
`src/components/`:

1. `zedOpenTerminalEvent.js` exporting:
   - `isValidZedOpenTerminalEvent(detail)` — boolean validator.
   - `resolveZedOpenTerminalPanelId(detail, fallback)` — returns the
     target panel id (`session_id` when present, else `fallback`).
   - `dispatchZedOpenTerminal(detail)` — constructs and dispatches the
     `CustomEvent` on `window` (SSR-safe; no-op when `window` is
     undefined).
2. `zedOpenUrlEvent.js` exporting:
   - `isValidZedOpenUrlEvent(detail)` — boolean validator.
   - `resolveZedOpenUrlBrowserShape(state, detail)` — returns the
     matching browser shape (if any) for the event's `label`.
   - `dispatchZedOpenUrl({ url, label, focus })` — constructs and
     dispatches the `CustomEvent` on `window` (SSR-safe).

#### Scenario: ChatPanel dispatches via the helper

- **WHEN** `ChatPanel` resolves an `open_terminal` tool result
- **THEN** it MUST call `dispatchZedOpenTerminal(detail)`
- **AND** MUST NOT call `window.dispatchEvent(new CustomEvent(...))`
  directly

#### Scenario: `browserTool.execute` dispatches via the helper

- **WHEN** the `open_url` tool executes with a valid URL
- **THEN** it MUST call `dispatchZedOpenUrl({ url, label, focus })`
- **AND** MUST NOT call `window.dispatchEvent(new CustomEvent(...))`
  directly

### ZEB-005: All Dispatch Goes Through Helpers

No source file in the project (outside the helper modules themselves)
MAY dispatch a `devhub:zed-*` CustomEvent via inline
`window.dispatchEvent(new CustomEvent(...))`. All dispatch MUST go
through the named helpers in `zedOpenTerminalEvent.js` or
`zedOpenUrlEvent.js`. This rule is enforced via a code review / lint
check and via a unit test that scans the source tree for forbidden
patterns.

#### Scenario: No inline dispatch outside helpers

- **WHEN** a unit test scans `src/components/`, `src/lib/`, and
  `src/app/` for the pattern
  `window.dispatchEvent(new CustomEvent('devhub:zed-`
- **THEN** the only matches MUST be inside `zedOpenTerminalEvent.js` or
  `zedOpenUrlEvent.js`

### ZEB-006: SSR Safety

The `dispatchZedOpenTerminal` and `dispatchZedOpenUrl` helpers MUST be
SSR-safe. When `typeof window === 'undefined'`, the helpers MUST return
without dispatching (no throw, no warning). The validators
(`isValidZedOpenTerminalEvent`, `isValidZedOpenUrlEvent`) MUST be pure
functions that do not access `window` and therefore work in any runtime.

#### Scenario: Dispatch is a no-op when `window` is undefined

- **WHEN** `dispatchZedOpenTerminal(detail)` is called in a Node.js
  context where `window` is undefined
- **THEN** the function MUST return without throwing
- **AND** no `ReferenceError` MUST be raised

## Non-Goals

- A general-purpose event bus (this spec covers only the Zed namespace).
- Cross-window event routing via `BroadcastChannel` (events are local to
  the current `window`).
- Persistent event log / replay.
- A formal schema-registry tool — validators are plain functions.

## Test mapping

| Scenario               | Test file                                                                   | Test name                                                                                                       |
| ---------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Re-fire guard          | `src/components/asistente/__tests__/ChatPanel.test.jsx`                     | `devhub:zed-open-terminal fires once per session_id across two messages`                                        |
| Listener focus chain   | `src/components/asistente/__tests__/zedOpenTerminalFocus.test.js` (new)     | `applyZedOpenTerminalFocus calls activate + clears focused + demaximizes when focus=true and pizarra is active` |
| Listener focus default | `src/components/asistente/__tests__/zedOpenTerminalFocus.test.js` (new)     | `applyZedOpenTerminalFocus is a no-op for focus side-effects when detail.focus is absent`                       |
| New empty terminal     | `src/components/asistente/__tests__/zedOpenTerminalFocus.test.js` (new)     | `applyZedOpenTerminalFocus always returns a fresh panel id`                                                     |
| Full history sent      | `src/components/asistente/__tests__/ChatPanel.test.jsx`                     | `handleSend sends previous assistant turn + tool_results in 2nd-turn body`                                      |
| Stable snapshot        | `src/components/asistente/__tests__/buildZedHistory.test.js`                | `integration: 2-turn input includes prior assistant + tool_results`                                             |
| System prompt clause   | `src/lib/asistente/__tests__/zedSystemPrompt.test.js` (extend)              | `prompt includes prior-turn user-visible context clause`                                                        |
| safeHistory 20-cap     | `src/app/api/assistant/chat/__tests__/route.history.test.js` (extend)       | `safeHistory preserves last 20 messages and excludes tool_results`                                              |
| Listener registered    | `src/components/workspace/__tests__/WorkspaceBrowserPane.test.jsx` (extend) | `addEventListener('devhub:zed-open-url') is called on mount`                                                    |
| Idempotence            | `src/components/workspace/__tests__/WorkspaceBrowserPane.test.jsx` (extend) | `repeated identical (url, label) is a no-op for state`                                                          |
| Spawn vs update        | `src/components/workspace/__tests__/WorkspaceBrowserPane.test.jsx` (extend) | `updateElement is called when label matches, spawnBrowser otherwise`                                            |
| Pizarra opt-in         | `src/components/workspace/__tests__/WorkspaceBrowserPane.test.jsx` (extend) | `pizarra is not demaximized when detail.focus is absent`                                                        |
| Validators             | `src/components/__tests__/zedOpenUrlEvent.test.js` (new)                    | `isValidZedOpenUrlEvent accepts / rejects per spec ZEB-003`                                                     |
| Dispatch helpers       | `src/components/__tests__/zedOpenUrlEvent.test.js` (new)                    | `dispatchZedOpenUrl is a no-op when window is undefined`                                                        |
| No inline dispatch     | `scripts/spec/zed-event-bus-namespace.test.mjs` (new)                       | `source tree has no inline devhub:zed- dispatch outside helpers`                                                |
