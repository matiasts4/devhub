# Exploration: native-tui-prompt-paste

## Problem statement

When the user tells the Zed workspace assistant to open an agent TUI (Grok, OpenCode, Kimi, etc.) and give it a task, the system should:

1. Open a visible workspace terminal panel.
2. Launch the agent TUI **clean** (no `--prompt` / `-p` / bash stdin injection in the launch command).
3. Wait until the TUI is ready (existing readiness signals + timeout).
4. Paste the prompt **like a human Ctrl+V** (same payload path as clipboard paste, including bracketed paste for multiline).
5. Send **Enter** as a separate keystroke (auto-submit).

Today this does not work end-to-end. Partial machinery exists (`bootstrap_input`, readiness refs, human paste helpers) but is not wired together.

## Product intent (locked)

| Decision            | Choice                                                             |
| ------------------- | ------------------------------------------------------------------ |
| Scope               | Slice 1: launch + native paste bootstrap only                      |
| Readiness           | Existing client signals + ~15s timeout; fail if never ready        |
| Submit              | Auto Enter after paste                                             |
| Non-goals (slice 1) | Fixing `execute_in_terminal` multiline on already-running sessions |

## Current behavior (evidence)

### Tool producers (server / model tools)

| Producer               | Path                                       | Behavior                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `open_terminal`        | `src/lib/asistente/tools/terminal.js`      | Builds agent launch cmd via `buildAgentLaunchCommand(..., { interactiveBootstrapPrompt: true, disableTmuxWrap: true })` when `program` is set. Optionally returns `bootstrap_input` (prompt + `\n`) if `params.bootstrap_input` is provided. Does **not** open a PTY server-side; returns UI intent (`opened`, `terminalId`, `displayName`, `command_sent`). |
| `launch_agent_session` | `src/lib/asistente/tools/agentLauncher.js` | Grok: always interactive TUI (`interactiveBootstrapPrompt: true`); reserves `bootstrap_input` when prompt present. Other agents: still embed prompt via CLI flags (`--prompt`, `-p`, etc.) unless interactive flag is used.                                                                                                                                  |
| Intent merge           | `src/lib/asistente/zedIntentRouter.js`     | Merges empty `open_terminal` + `launch_agent_session` into one `open_terminal({ program })`; for Grok only, attaches `bootstrap_input`.                                                                                                                                                                                                                      |

### Launch command builder

`src/lib/agentLaunchCommand.shared.js` — `buildAgentLaunchCommand`:

- `interactiveBootstrapPrompt: true` → OpenCode/Kimi launch **without** prompt flags; Grok is always just the executable.
- `interactiveBootstrapPrompt: false` (default) → OpenCode uses `--prompt`, Kimi uses `-p`, Hermes uses `chat -q`.

Zed’s `open_terminal` already uses interactive bootstrap for agent programs. Swarm/health paths still use wrapper bootstrap (`DEVHUB_BOOTSTRAP` / tmux send-keys) — **out of scope** for this change (swarm is a separate launcher).

### How tool results reach the UI

1. `useZedChat` / streaming path collects tool results.
2. `dispatchZedActions` / `dispatchZedOpenTerminalFromToolResults` → `dispatchZedOpenTerminal({ command, cwd, terminalId, focus, ... })` (`src/components/zedOpenTerminalEvent.js`).
3. `TerminalWorkspacesManager` listens for `devhub:zed-open-terminal` → `handleSplit` / panel open with `initialCommand = command`.
4. Panel’s `TerminalTTY` connects WS; on server `ready` + viewport fit, sends `initialCommand` as keystrokes (launch only).

**Gap:** `bootstrap_input` is never passed in the open-terminal event detail and never read by any component under `src/components/` (grep: zero consumers).

### Human Ctrl+V paste path (desired injection semantics)

1. `useTerminalClipboard.js` reads clipboard.
2. `formatTerminalPastePayload(text, lifecycleRefs, initialCommand)` in `TerminalTTY.helpers.js`:
   - Normalizes CRLF → LF.
   - For multiline / agent TUI sessions: wraps with bracketed paste `\x1b[200~...\x1b[201~`.
3. `sendTerminalPasteInput({ socket, transport, text })` → WS `{ type: 'input', data }` or raw.
4. Server `ttyServer` WS handler: `filterTerminalInputForSession` → `session.pty.write`.

Comment on `sendTerminalPasteInput`: “Send clipboard text to the PTY as raw input (avoids xterm bracketed-paste breaking TUIs)” — bracketed paste is applied **before** send via `formatTerminalPastePayload`, not inside `sendTerminalPasteInput`.

### Assistant inject path today (raw, not native paste)

1. `execute_in_terminal` → `PUT /api/terminal/session/{id}/input` with `{ data }`.
2. Cascade: `pushSessionInput` (tty) → `trySidecarInput` (sidecar HTTP) → 404 `{ action: 'send_input' }`.
3. Client fallback: `dispatchZedTerminalInputFromToolResults` → `devhub:zed-terminal-input` → `useTerminalSearchAndZedInput` → `sendTerminalPasteInput` with **unformatted** `detail.input` (no `formatTerminalPastePayload`).

### Readiness signals (already implemented)

| Signal                 | Where set                                            | Detects                                           |
| ---------------------- | ---------------------------------------------------- | ------------------------------------------------- |
| `grokTuiReadyRef`      | `useTerminalV2Session.js` `handleTuiReadyFromOutput` | `detectGrokSessionFromOutput`                     |
| OpenCode footer ready  | same                                                 | `detectOpenCodeTuiReady` → `notifyOpencodeReady`  |
| `kimiReadyNotifiedRef` | same                                                 | `detectKimiTuiReady` / `notifyAgentReady('kimi')` |
| `tuiSessionActiveRef`  | same + launch heuristics                             | TUI session active                                |
| Server `agentTuiState` | WS `agent-state` payload → semantic store            | idle/running/etc. for panel chrome                |

These refs gate mouse/wheel behavior today; **nothing waits on them before injecting a reserved prompt**.

### Re-dispatch note

`useZedWorkspaceEvents` listens to `devhub:zed-terminal-input` and re-dispatches the same event name with normalized ids. Combined with `useTerminalSearchAndZedInput` consumers this is fragile (potential re-entrancy). Slice 1 should prefer a **dedicated bootstrap event** or a single producer path rather than relying on the 404 fallback chain.

## Gaps / dead code

1. **`bootstrap_input` dead feature** — produced by tools/router; never consumed by UI.
2. **No readiness-gated paste coordinator** after panel open.
3. **Assistant multiline inject is raw** — missing bracketed paste (slice 2 for live sessions; slice 1 must use format path for bootstrap).
4. **Agent parity incomplete in tools** — Grok gets `bootstrap_input` in router merge; OpenCode/Kimi interactive open may still rely on CLI prompt when using `launch_agent_session` without interactive flag.
5. **No timeout / failure surface** when TUI never becomes ready.

## Options compared

| Option                                                          | Description                                                                                                                                                                                                       | Pros                                                                                         | Cons                                                                                       |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **A. Client-side bootstrap coordinator (recommended)**          | Open event carries `bootstrap_input` + panel id. Panel/lifecycle waits for readiness signals (or timeout), then `formatTerminalPastePayload` + `sendTerminalPasteInput` + Enter (`\r` or `\n` as separate write). | Matches human paste; reuses helpers; works for Grok (no CLI prompt); keeps launch cmd clean. | Needs client wiring; readiness false-negatives need timeout.                               |
| B. Server-side delayed `pushSessionInput` after agent-ready API | Server polls readiness then writes PTY.                                                                                                                                                                           | Centralized.                                                                                 | Wrong layer for xterm lifecycle refs; harder bracketed-paste policy; sidecar vs tty split. |
| C. Keep CLI `--prompt` / bash inject                            | Status quo for OpenCode/Hermes.                                                                                                                                                                                   | Simple for some CLIs.                                                                        | Violates product intent; Grok impossible; not “native paste”.                              |
| D. tmux send-keys (swarm style)                                 | Wrapper injects later.                                                                                                                                                                                            | Proven in swarm.                                                                             | Not human Ctrl+V path; not workspace panel model; out of product intent.                   |

## Recommended approach (slice 1)

1. **Contract extension** for `devhub:zed-open-terminal` detail:
   - `bootstrap_input?: string` (prompt text; may include trailing newline from tools — coordinator should normalize)
   - `bootstrap_timeout_ms?: number` default ~15000
   - Keep `command` as clean launch only.

2. **Producers**:
   - `open_terminal` / `launch_agent_session` / intent router: always put user task text into `bootstrap_input` for agent TUI opens when a prompt is present; **never** embed that prompt into `command_sent` for agent programs (force `interactiveBootstrapPrompt: true` for all AGENT_PROGRAMS on this path).
   - `dispatchZedOpenTerminalFromToolResults` forwards `bootstrap_input` (and terminalId/displayName).

3. **Consumer coordinator** (new pure module + hook, e.g. `nativeTuiBootstrapPaste.js` + wire in panel lifecycle / TerminalTTY):
   - On panel mount / open with pending bootstrap:
     - Wait until readiness predicate true for program (grok / opencode footer / kimi / generic `tuiSessionActive`), polling refs or listening to the same detection path.
     - On ready: build payload via `formatTerminalPastePayload` using lifecycle refs + `initialCommand`.
     - `sendTerminalPasteInput` once.
     - Then send Enter as separate `sendTerminalPasteInput` / input write (`\r` preferred for PTY submit — confirm against existing terminal conventions in tests).
   - On timeout: emit observable failure (tool-facing note / client event / log) without partial half-paste when possible.
   - Idempotent: one paste per reserved bootstrap (ref flag).

4. **Tests (TDD, `strict_tdd` culture)**:
   - Pure coordinator unit tests: ready → paste+enter; timeout → no paste; already-pasted → no double paste; multiline → bracketed markers present.
   - Dispatch tests: tool result with `bootstrap_input` appears in open-terminal event detail.
   - Tool tests: agent open returns clean command without prompt flags + non-empty `bootstrap_input`.

5. **Out of scope**: swarm wrapper bootstrap, `execute_in_terminal` live multiline fix, re-dispatch refactor of zed-terminal-input (optional small hardening if touched).

## Risks

| Risk                                               | Mitigation                                                                                                                     |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Readiness detector false negative                  | Timeout + clear error; allow optional longer timeout; log which signal was awaited                                             |
| Readiness true too early (TUI not accepting input) | Prefer footer/output detectors already used for wheel passthrough; small settle delay (e.g. 50–150ms) after ready before paste |
| Bracketed paste unsupported by a TUI               | Human path already uses it for multiline agent TUIs; match that behavior                                                       |
| Enter key wrong (`\n` vs `\r`)                     | Align with how xterm sends Enter on this platform; cover in unit tests with spy on socket.send                                 |
| Double paste if remount                            | Persist “bootstrap done” on panel id in a small module-level or panel store map                                                |
| Review size                                        | Keep coordinator pure + thin wiring; forecast vs 400-line budget                                                               |

## Open questions (non-blocking for design)

1. Exact Enter byte sequence for submit on Windows vs Linux panels — resolve in design via existing terminal input tests / xterm behavior.
2. Whether Codex/Hermes interactive mode without CLI prompt is fully usable for native paste (Hermes today defaults to `chat -q`); slice 1 may prioritize Grok + OpenCode + Kimi first and document Hermes/Codex as follow-up if interactive mode is weak.

## Key files inventory

| File                                                            | Role                                               |
| --------------------------------------------------------------- | -------------------------------------------------- |
| `src/lib/asistente/tools/terminal.js`                           | open_terminal / execute_in_terminal                |
| `src/lib/asistente/tools/agentLauncher.js`                      | launch_agent_session + bootstrap_input for Grok    |
| `src/lib/asistente/zedIntentRouter.js`                          | intent merge + grok bootstrap_input                |
| `src/lib/agentLaunchCommand.shared.js`                          | interactive vs --prompt launch strings             |
| `src/lib/asistente/dispatchZedActions.js`                       | tool result → UI events                            |
| `src/components/zedOpenTerminalEvent.js`                        | open terminal CustomEvent                          |
| `src/components/zedTerminalInputEvent.js`                       | input CustomEvent (404 fallback)                   |
| `src/components/terminal/hooks/useZedWorkspaceEvents.js`        | open/close/input listeners                         |
| `src/components/terminal/hooks/useTerminalSearchAndZedInput.js` | per-panel zed input → WS                           |
| `src/components/terminal/hooks/useTerminalClipboard.js`         | human paste                                        |
| `src/components/terminal/hooks/useTerminalV2Session.js`         | readiness detection                                |
| `src/components/terminal/TerminalTTY.helpers.js`                | formatTerminalPastePayload, sendTerminalPasteInput |
| `src/components/TerminalTTY.jsx`                                | lifecycle refs wiring                              |
| `src/lib/terminal/ttyServer.js`                                 | pushSessionInput + WS input write                  |
| `src/lib/terminal/sidecarSessionApi.js`                         | sidecar input/capture                              |
| `src/app/api/terminal/session/[id]/input/route.js`              | HTTP input cascade                                 |

## Recommendation summary

Implement a **client-side native bootstrap paste coordinator** that consumes `bootstrap_input` from the existing open-terminal tool/UI event pipeline, gates on **existing TUI readiness signals** with timeout, pastes via **`formatTerminalPastePayload` + `sendTerminalPasteInput`**, then auto-sends Enter. Force clean interactive launch commands for agent programs on this path. Do not invent a new injection transport.
