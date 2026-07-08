# Delta: terminal-tui-activity-status

> Modifies behavior defined in change `terminal-tui-status-event-driven` (not yet in `openspec/specs/`). At archive, merge with that change or promote to main specs.

## MODIFIED Requirements

### Requirement: TTAS-1 — PTY output activity detection

The activity tracker in `TerminalTTY.jsx` MUST expose `running` | `idle` driven by substantial PTY→client output frames. User input MUST NOT promote `running`. The tracker MUST act as a **fallback** when semantic `agentTuiState` is `unknown` or older than the configured semantic TTL, and ONLY on panels classified as agent/TUI (`isAgentPanel` in `derivePanelStatus`); plain shell output (e.g. `ls`) MUST NOT change the panel badge.

(Previously: byte activity was co-primary with polled semantic state without explicit stale/unknown gating.)

#### Scenario: TTAS-S1 — Substantial PTY data promotes to running (fallback path)

- GIVEN an agent/TUI panel (initial command or `agentType` identifies the agent)
- AND semantic state is unknown or stale
- AND the activity tracker is `idle`
- WHEN a substantial PTY→client data frame arrives
- THEN status becomes `running`

#### Scenario: TTAS-S7 — Shell commands do not promote running

- GIVEN a plain shell panel (no agent TUI initial command, no `agentType`)
- WHEN substantial PTY output arrives (e.g. `ls` listing)
- AND `liveActivity` is `running`
- THEN `derivePanelStatus` returns `unknown` (badge hidden)

#### Scenario: TTAS-S6 — Semantic idle suppresses spinner running

- GIVEN fresh semantic `agentTuiState` is `idle` with visible idle evidence
- WHEN the byte tracker would promote `running` due to ANSI spinner output
- THEN `derivePanelStatus` returns `idle`
