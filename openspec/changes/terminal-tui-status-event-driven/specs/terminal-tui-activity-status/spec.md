# Spec: terminal-tui-activity-status

> New capability. No existing spec at `openspec/specs/terminal-tui-activity-status/`.
> `terminal-panel-state` (suspended-connection state) is unchanged by this change.

## ADDED Requirements

### Requirement: TTAS-1 — PTY Output Activity Detection

The activity tracker in `TerminalTTY.jsx` MUST expose a two-state model (`running` | `idle`) driven solely by PTY→client `data` frames on the already-open WebSocket. A substantial `data` frame MUST promote the status to `running`. User input (client→PTY `write` direction) MUST NOT count as activity. The detection MUST be agent-agnostic — no per-agent regex or DB lookup.

#### Scenario: TTAS-S1 — Substantial PTY data frame promotes to running

- GIVEN the activity tracker is mounted on the open PTY WebSocket with status `idle`
- WHEN a `data` frame of ≥50 bytes arrives from the PTY (PTY→client direction)
- THEN the status becomes `running`
- AND the transition fires within one event loop turn of frame receipt

#### Scenario: TTAS-S2 — User write direction does not count as activity

- GIVEN the activity tracker has status `idle` and the user is typing in the TUI prompt
- WHEN the client sends a `write` frame (client→PTY direction) of any size
- THEN the status remains `idle`
- AND no `running` transition is emitted for `write` frames

#### Scenario: TTAS-S3 — Noise filter rejects small and ANSI-cursor chunks

- GIVEN the activity tracker has status `idle`
- WHEN a `data` frame arrives that is either `<50 bytes` OR consists solely of ANSI cursor-control / whitespace sequences (`\x1b[?25h`, `\x1b[?25l`, bare `\r`, bare `\n`)
- THEN the status remains `idle`
- AND the chunk is not counted as substantial output

#### Scenario: TTAS-S4 — Agent-agnostic across OpenCode, Kimi, Grok, Claude, Codex

- GIVEN the same tracker is wired for any of OpenCode, Kimi, Grok, Claude, or Codex
- WHEN any of those agents emits a substantial `data` frame
- THEN the status becomes `running`
- AND no agent-specific code path, regex, or DB row is consulted to make the decision

### Requirement: TTAS-2 — Idle Debounce

The tracker MUST demote status from `running` to `idle` after a configurable debounce window of no substantial PTY output. The default window MUST be 1500–2500 ms. Substantial output during the window MUST reset the timer; noise-filtered chunks MUST NOT reset it.

#### Scenario: TTAS-S5 — Debounce demotes to idle after no substantial output

- GIVEN the tracker status is `running`
- WHEN no substantial `data` frame arrives for the debounce window (default ~2000 ms)
- THEN the status becomes `idle`
- AND a single falling-edge transition is emitted

#### Scenario: TTAS-S6 — Substantial output during debounce resets the timer

- GIVEN the tracker status is `running` with a pending debounce timer
- WHEN a substantial `data` frame arrives before the timer expires
- THEN the status remains `running`
- AND the debounce timer is restarted rather than allowed to fire

### Requirement: TTAS-3 — Bootstrap on WebSocket Connect

On WebSocket `open`, the tracker MUST initialize status from the first `ready`/`snapshot` frame if one carries an activity hint; otherwise it MUST default to `idle`. The tracker MUST NOT block on bootstrap — a missing snapshot leaves status `idle`.

#### Scenario: TTAS-S7 — Snapshot with activity hint seeds running

- GIVEN the WebSocket has just opened
- WHEN the first `ready`/`snapshot` frame carries an activity hint indicating recent PTY output
- THEN the tracker status is seeded as `running`
- AND the debounce timer starts from that seed

#### Scenario: TTAS-S8 — Missing snapshot defaults to idle

- GIVEN the WebSocket has just opened
- WHEN no `ready`/`snapshot` frame arrives (or it carries no activity hint)
- THEN the tracker status defaults to `idle`
- AND no `running` transition is emitted until a substantial `data` frame arrives

### Requirement: TTAS-4 — Live Signal Propagation to PanelStatusBadge

`usePanelAgentStatus.js` MUST consume the event-driven WS signal as the primary source and expose `running`/`idle` to `PanelStatusBadge.jsx` via the existing `PANEL_STATUS` map. The badge MUST reflect state transitions from the live signal; no polling-driven recompute is required while the WS is delivering frames.

#### Scenario: TTAS-S9 — Badge renders RUNNING on live running signal

- GIVEN `PanelStatusBadge` is mounted and the live WS signal is `running`
- WHEN the badge renders
- THEN it displays the existing `PANEL_STATUS.RUNNING` label/visual
- AND the displayed state is sourced from the event-driven signal, not HTTP poll

#### Scenario: TTAS-S10 — Badge renders IDLE on live idle signal

- GIVEN `PanelStatusBadge` is mounted and the live WS signal transitions to `idle`
- WHEN the debounce fires and the badge re-renders
- THEN it displays the existing `PANEL_STATUS.IDLE` label/visual
- AND the transition occurs within ~2 s of the last substantial PTY output

### Requirement: TTAS-5 — HTTP Poll Liveness Fallback

HTTP poll MUST be retained as a fallback: if the WS delivers no substantial frame for an extended silent period (default >10 s), the tracker/coordinator MAY fall back to an HTTP liveness probe to confirm the panel is still reachable. The fallback MUST NOT override a live `running` signal from the WS.

#### Scenario: TTAS-S11 — WS silence triggers HTTP liveness fallback

- GIVEN the WS has delivered no substantial `data` frame for >10 s
- WHEN the silent period elapses
- THEN an HTTP liveness probe is issued
- AND the probe result can update status if no live WS signal is present

#### Scenario: TTAS-S12 — Live WS signal overrides idle poll result

- GIVEN the WS is delivering substantial frames (status `running`)
- WHEN an HTTP liveness probe returns `idle`
- THEN the live WS signal wins
- AND the status remains `running`
