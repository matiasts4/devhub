# Delta: terminal-tui-herdr-detection

> New capability (full spec in change folder until archive).

## Purpose

Semantic agent-TUI state on PTY servers and clients, aligned with herdr evidence rules.

## Requirements

### Requirement: TTHD-1 — Unified semantic detection

Sidecar and in-process ttyServer MUST use the same pipeline: filtered output accumulation, bottom-viewport slice for evaluation, `detectAgentState` with OSC title and progress when present, and `AgentStateMachine.publish()` for published `agentTuiState`. When a manifest exists for `session.agentType`, legacy per-chunk regex MUST NOT be the primary path.

#### Scenario: TTHD-S1 — Sidecar and ttyServer parity

- GIVEN the same sequence of filtered PTY chunks and OSC fields for a `kimi` session
- WHEN sidecar and ttyServer process the session
- THEN both expose identical `agentTuiState` and `agentTuiStateAt` after each publish

#### Scenario: TTHD-S2 — Kimi approval panel blocked

- GIVEN a screen buffer matching herdr rule `current_approval_panel`
- WHEN detection runs after buffer accumulation
- THEN published state is `blocked`

### Requirement: TTHD-2 — Bottom viewport input

Detection MUST evaluate manifests against a bottom-viewport text slice derived from the session buffer (configurable row count, default aligned with herdr ~24 rows), not unbounded scrollback alone.

#### Scenario: TTHD-S3 — Scrolled history does not dominate

- GIVEN old scrollback containing the word "working" and a live idle prompt in the bottom viewport
- WHEN detection runs
- THEN state reflects bottom-viewport evidence (idle), not scrollback alone

### Requirement: TTHD-3 — State transition notifications

PTY WebSocket JSON transport MUST send an `agent-state` (or equivalent typed) message when `AgentStateMachine` publishes a change. Raw `output` frames MUST NOT be the only carrier of semantic state.

#### Scenario: TTHD-S4 — Client receives transition

- GIVEN a connected TerminalTTY client
- WHEN published state changes from `running` to `blocked`
- THEN the client receives a distinct message carrying the new `agentTuiState`

### Requirement: TTHD-4 — Manifest maintenance

Supported agents (kimi, claude, codex, opencode, grok) MUST stay within one minor version of bundled herdr manifests for rule IDs; `scripts/compare-herdr-manifests.mjs` MUST report missing rule IDs in CI or documented manual check before release.

#### Scenario: TTHD-S5 — Grok manifest parity

- GIVEN herdr `grok.toml` at `.research/herdr`
- WHEN the compare script runs
- THEN DevHub `grok.js` includes all rule IDs present in herdr for that version
