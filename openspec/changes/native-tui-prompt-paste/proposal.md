# Proposal: native-tui-prompt-paste

## Intent

Make the Zed workspace assistant inject a user task into a newly launched agent TUI **as a native human paste** (Ctrl+V semantics + Enter), after the TUI is ready — never by embedding the prompt in the launch command or shell wrappers.

## Why now

- Grok has no usable CLI `--prompt` path; reserved `bootstrap_input` is produced but never consumed.
- OpenCode/Kimi can take CLI prompts, but product intent rejects that for “tell the agent to do X” from Zed chat.
- Human paste already has correct multiline/TUI handling (`formatTerminalPastePayload`); assistant inject does not reuse it for bootstrap.

## Scope (slice 1)

### In scope

1. Clean interactive launch for agent programs opened via Zed tools (`open_terminal` / `launch_agent_session` / intent merge).
2. Carry `bootstrap_input` from tool results through `dispatchZedOpenTerminal` into the panel open path.
3. Client coordinator: wait for existing readiness signals + timeout (~15s default).
4. On ready: paste via `formatTerminalPastePayload` + `sendTerminalPasteInput`, then auto-Enter as a separate write.
5. Idempotency (one paste per bootstrap reservation) and timeout failure observability.
6. Unit tests (TDD) for coordinator, dispatch forwarding, and tool clean-launch + bootstrap_input contract.
7. Priority agents: **Grok, OpenCode, Kimi**. Codex/Hermes: clean interactive launch + same paste path if open succeeds; document limitations if interactive mode is weak.

### Out of scope

- Swarm launch wrapper / tmux `send-keys` / `DEVHUB_BOOTSTRAP` changes.
- Fixing `execute_in_terminal` multiline paste on already-running sessions (slice 2).
- Full refactor of `devhub:zed-terminal-input` re-dispatch.
- Server-side delayed PTY injection as primary path.

## User-visible behavior

| User says                                          | Expected                                                                                                                        |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| “Open Grok and tell it to refactor auth”           | New panel → Grok TUI starts clean → when ready, prompt appears as if pasted → Enter submits                                     |
| “Open OpenCode in Chase and ask it to write tests” | Same pattern with OpenCode interactive launch (no `--prompt` in launch string)                                                  |
| TUI never becomes ready within timeout             | No silent success; paste not applied (or not double-applied); failure is observable (log/debug + tool-facing note if available) |

## Functional requirements

- **FR-1** Agent TUI opens from Zed must use interactive launch (no task text in `command_sent`).
- **FR-2** When a task/prompt is present, tools MUST surface it as `bootstrap_input` (ensure trailing newline policy is normalized by coordinator).
- **FR-3** UI dispatch MUST forward `bootstrap_input` on `devhub:zed-open-terminal`.
- **FR-4** Coordinator MUST wait for program-appropriate readiness (Grok / OpenCode footer / Kimi / generic TUI active) or timeout.
- **FR-5** Paste MUST use the same formatting path as human clipboard paste (bracketed paste when multiline/TUI).
- **FR-6** Enter MUST be a separate input write after paste.
- **FR-7** Bootstrap paste MUST be at-most-once per panel reservation.
- **FR-8** Tests cover ready path, timeout path, multiline bracketed markers, and dispatch/tool contracts.

## Non-functional

- Prefer pure coordinator module for testability.
- Stay under review budget when possible (~400 lines); split if forecast exceeds.
- English technical artifacts; no persona slang in code/UI strings.

## Success metrics

- Manual: “open grok and tell it X” pastes after ready without CLI prompt flags in the visible launch line.
- Automated: new unit tests green; existing open_terminal / dispatch / paste helper tests still green.

## Risks

See exploration.md — readiness false negatives, Enter byte sequence, double paste on remount.

## Dependencies

- Existing readiness detection in `useTerminalV2Session`.
- Existing paste helpers in `TerminalTTY.helpers.js`.
- Existing open-terminal event pipeline.

## Next

Specs → design → tasks → apply → verify → archive.
