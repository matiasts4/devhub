# Design: native-tui-prompt-paste

## Overview

Wire the dead `bootstrap_input` contract through the Zed open-terminal UI path and introduce a small **client-side coordinator** that, after TUI readiness, pastes like the human clipboard path and sends Enter.

```
Tool result (bootstrap_input + clean command_sent)
        │
        ▼
dispatchZedOpenTerminalFromToolResults
        │
        ▼
devhub:zed-open-terminal { command, terminalId, program, bootstrap_input, ... }
        │
        ▼
Panel open (initialCommand = clean launch)
        │
        ▼
nativeTuiBootstrapPaste coordinator
   wait ready? ──timeout──► log failure, stop
        │ ready
        ▼
formatTerminalPastePayload → sendTerminalPasteInput
        │
        ▼
sendTerminalPasteInput(Enter)  // separate write
```

## Components

### 1. Tool layer (producers)

**Files:** `src/lib/asistente/tools/terminal.js`, `agentLauncher.js`, `zedIntentRouter.js`

Changes:

- For agent programs, always build launch with `interactiveBootstrapPrompt: true` on the Zed bootstrap path.
- Accept task text as `bootstrap_input` and/or from `launch_agent_session.prompt` / intent merge.
- Normalize: if prompt present and program is agent → set `bootstrap_input` (ensure string; coordinator trims; trailing `\n` from tools is OK — strip before format, Enter is separate).
- **Do not** put task text into `command_sent`.

OpenCode today: `open_terminal` with only `program` does not take a prompt param. Extend parameters:

- `bootstrap_input` (already partially present) **or**
- `prompt` alias that maps to `bootstrap_input` for agent programs (preferred for model ergonomics).

`launch_agent_session`: for all agent programs on this path, use interactive launch + `bootstrap_input` from `prompt` (not only Grok).

`zedIntentRouter`: for all programs (not only Grok), when merging launch with prompt, set `bootstrap_input`.

### 2. Dispatch layer

**File:** `src/lib/asistente/dispatchZedActions.js`

- Read `parsed.bootstrap_input` if non-empty string.
- Pass through to `dispatchZedOpenTerminal({ ..., bootstrap_input })`.
- Include `bootstrap_input` in dedup key so distinct tasks are not collapsed incorrectly (or key by terminalId + bootstrap hash).

### 3. Open event contract

**File:** `src/components/zedOpenTerminalEvent.js` (typedef / JSDoc only if needed)

Detail fields (additive):

| Field                  | Type      | Meaning                   |
| ---------------------- | --------- | ------------------------- |
| `bootstrap_input`      | `string?` | Text to paste after ready |
| `bootstrap_timeout_ms` | `number?` | Default 15000             |

### 4. Workspace open handler

**File:** `src/components/terminal/hooks/useZedWorkspaceEvents.js` (or TerminalWorkspacesManager split handler)

- When handling `devhub:zed-open-terminal`, pass `bootstrap_input` / timeout into panel create props or a pending-bootstrap registry keyed by `panelId` / `terminalId`.

**Pending registry** (recommended pure module):

`src/lib/asistente/nativeTuiBootstrapRegistry.js` (or `src/components/terminal/nativeTuiBootstrapRegistry.js`)

```
reserve(panelId, { text, program, timeoutMs, initialCommand })
consume(panelId) -> pending | null
markDone(panelId)
isDone(panelId)
```

Avoids prop-drilling through large manager; TerminalTTY / lifecycle hook reads reserve on mount.

### 5. Coordinator (core)

**New file:** `src/lib/asistente/nativeTuiBootstrapPaste.js` (pure, highly tested)

```js
export const DEFAULT_BOOTSTRAP_TIMEOUT_MS = 15_000;
export const BOOTSTRAP_ENTER = '\r'; // PTY Enter; confirm in tests

export function isBootstrapReady({ program, signals }) { /* ... */ }

export function buildBootstrapPastePayload(text, formatFn, ctx) { /* strip trailing newlines from reserved text; formatFn for bracketed */ }

export async function runNativeTuiBootstrapPaste({
  getSignals, // () => { grokReady, kimiReady, tuiActive, opencodeFooterReady }
  program,
  text,
  timeoutMs,
  formatPayload, // (text) => string
  sendInput,     // (data) => boolean | Promise
  sleep,
  now,
  isCancelled,
  onTimeout,
  onSuccess,
})
```

Algorithm:

1. If `!text?.trim()` → return `{ status: 'skipped' }`.
2. Poll `isBootstrapReady` every ~50–100ms until true or timeout.
3. Optional settle delay 50–100ms after ready.
4. `payload = formatPayload(normalizedText)` (use real `formatTerminalPastePayload` at wire site).
5. `sendInput(payload)`; if false → `{ status: 'send_failed' }`.
6. `sendInput(BOOTSTRAP_ENTER)`.
7. Return `{ status: 'pasted' }`.

**Readiness mapping:**

| program         | ready when                                                                  |
| --------------- | --------------------------------------------------------------------------- |
| `grok`          | `grokReady === true`                                                        |
| `kimi`          | `kimiReady === true`                                                        |
| `opencode`      | `opencodeFooterReady === true` OR `tuiActive === true`                      |
| other / unknown | `tuiActive === true` OR (grokReady \|\| kimiReady \|\| opencodeFooterReady) |

Signals come from the same refs already updated in `useTerminalV2Session.handleTuiReadyFromOutput`. Wiring exposes a thin getter from TerminalTTY lifecycle without rewriting detection.

### 6. Wire site

**Preferred:** `useTerminalV2Session` or a small hook `useNativeTuiBootstrapPaste` called from TerminalTTY with:

- `id`, `initialCommand`, `program` (from panel meta or parse initialCommand)
- refs: grok/kimi/tui/footer
- `wsRef` / `transportRef`
- on mount: `const pending = consume(id) || props.bootstrap`; if pending, start `runNativeTuiBootstrapPaste`

Also accept bootstrap from open event stored in registry by workspace handler when panel id is known.

### 7. Enter sequence

Use `'\r'` (CR) as PTY Enter, matching typical terminal submit. If existing codebase sends `'\n'` for shell commands via initialCommand path, check `sendInitialCommand` / paste tests and align. Document choice in tests.

### 8. Observability

- `zedClientDebug` / `zedLog` events: `bootstrap_paste_start`, `bootstrap_paste_ready`, `bootstrap_paste_done`, `bootstrap_paste_timeout`.
- No user-facing modal required for slice 1.

## Testing strategy (TDD)

| Area             | File                                                          | Cases                                                                                                                   |
| ---------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Coordinator pure | `src/lib/asistente/__tests__/nativeTuiBootstrapPaste.test.js` | ready→paste+enter; timeout→no send; empty skip; at-most-once via caller markDone; multiline markers when formatFn wraps |
| Dispatch         | `dispatchZedActions.test.js`                                  | forwards bootstrap_input                                                                                                |
| Tools            | `terminal.list.test.js` / `agentLauncherTools.test.js`        | clean command + bootstrap_input for grok/opencode                                                                       |
| Registry         | small unit test                                               | reserve/consume/done                                                                                                    |

Run with project Jest for these paths.

## Alternatives rejected

- Server delayed write: no access to client readiness refs / human format helpers cleanly.
- tmux send-keys: not native Ctrl+V path.
- CLI `--prompt`: violates product intent.

## Migration / compatibility

Additive fields only. Old clients ignore `bootstrap_input`. Panels without bootstrap behave as today.

## Implementation order

1. Pure coordinator + tests (RED/GREEN).
2. Registry + tests.
3. Dispatch forward + tests.
4. Tool/router bootstrap_input for all agents + tests.
5. Wire open handler + TerminalTTY hook.
6. Manual smoke on Grok/OpenCode if environment allows.

## Review workload forecast (preliminary)

Estimated ~250–350 LOC production + ~200–300 LOC tests. May approach 400-line budget if wiring is heavy — prefer pure modules to keep PR reviewable; single PR likely OK under 400 if tests are focused.
