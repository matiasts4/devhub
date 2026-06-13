# Pane Prompt Buffer Specification

## Purpose

Stop director system-prompt bytes from leaking into downstream panes (architect/implementer/reviewer/devops) and stop the symmetric reverse path from leaking pure-noise bytes into the PTY. Defines a per-pane ring buffer between xterm `onData` and the sidecar PTY writer, an extended noise filter for DECRQM/DECRPM reports, and a chunked tmux `paste-buffer` injection for the director's system prompt.

## Requirements

### Requirement: R-BUF-1 — DECRQM/DECRPM Noise Rejection

`SHELL_TERMINAL_RESPONSE_RE` in `src/lib/terminal/terminalNoiseFilter.js` MUST be extended to match DECRQM (`CSI ? Pd$ p`) and DECRPM (`CSI ? Pd$ p`) reports. Matching output MUST be stripped from the stream before it reaches the xterm buffer.

#### Scenario: DECRPM report is stripped, not leaked

- **GIVEN** a director pane emits `ESC[?35;60;4$y` (a DECRPM reply)
- **WHEN** the noise filter scans the chunk
- **THEN** the substring is removed
- **AND** the chunk returned to the buffer does not contain `[[35;60;4M` or its escape-form
- **AND** an empty chunk produces a `null` no-op (not a zero-length write)

### Requirement: R-BUF-2 — Symmetric Input Filter Drops Pure Noise

The input-side filter (between xterm `term.onData` and the sidecar PTY writer) MUST drop pure-noise bytes such as `CSI > Pp c` (DA2 reply) and `CSI ? Pd$ y` so they never reach the PTY. The filter is belt-and-suspenders: even if the noise leaks from another pane, the input path is the second guardrail.

#### Scenario: DA2 reply is dropped before PTY write

- **GIVEN** a pane's `term.onData` receives `ESC[>1;2;0c`
- **WHEN** the input filter evaluates the chunk
- **THEN** the chunk is classified as pure noise
- **AND** the output chunk passed to the sidecar PTY writer is `null`
- **AND** no `pty.write()` call is issued for that chunk

#### Scenario: Real user keystroke is not dropped

- **GIVEN** a pane's `term.onData` receives the literal sequence `hello\n`
- **WHEN** the input filter evaluates it
- **THEN** the chunk is forwarded to the PTY writer unchanged

### Requirement: R-BUF-3 — Chunked Director Prompt Injection

Director system-prompt injection MUST use chunked tmux `paste-buffer` writes with `\r\n` separators and 16ms pacing between chunks, instead of one `tmux load-buffer -S 5242880` followed by `paste-buffer -d`. Chunk size MUST be ≤ 2KB.

#### Scenario: 24KB director prompt injects across 12 chunks

- **GIVEN** the director prompt payload is 24KB
- **WHEN** `injectDirectorPrompt()` runs
- **THEN** 12 chunks of ≤ 2KB each are written via `load-buffer` + `paste-buffer -d`
- **AND** the pacing between consecutive `paste-buffer` calls is 16ms (±2ms tolerance)
- **AND** the tmux paste-buffer overflow limit is never approached

#### Scenario: Pacing is honored under load

- **GIVEN** the sidecar is processing other WS traffic concurrently
- **WHEN** the director prompt injection runs
- **THEN** chunk inter-arrival time stays within 14–18ms
- **AND** no chunk is dropped or merged

### Requirement: R-BUF-4 — Bounded Per-Pane Scrollback

xterm scrollback MUST be bounded per-pane via the `scrollback` constructor option. No code path in `swarmControl` or `TerminalWorkspacesManager` may write to a global unbounded buffer that all 5 panes share. Each pane owns its own `Terminal` instance with an independent `scrollback` cap.

#### Scenario: 5 panes × 5000-line scrollback, no QuotaExceededError

- **GIVEN** 5 panes mount with `scrollback: 5000`
- **WHEN** each pane receives 6000 lines of output
- **THEN** each pane evicts lines beyond 5000
- **AND** no `QuotaExceededError` is thrown
- **AND** memory growth stays linear in pane count, not in line count

## Out of Scope

- xterm renderer choice (handled in `terminal-renderer-capability`).
- Long-lived agent transcript persistence (separate concern from in-memory scrollback).
- Cross-pane clipboard operations.
- The 48-file `WIP: pre-sdd-batch 2026-06-08` files; this change extends the noise filter only on the changed regex.
