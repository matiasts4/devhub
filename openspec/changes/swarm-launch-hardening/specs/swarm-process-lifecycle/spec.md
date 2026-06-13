# Delta: swarm-process-lifecycle — TUI readiness gate, watchdog respawn budget, renderer demotion lifecycle

## ADDED Requirements

### REQ-LH-1: Event-Driven TUI Readiness Gate

**Priority**: P0 | **Status**: delta

The launch path MUST replace any `pgrep`-based wait on TUI readiness with an event-driven `TUI_READY` signal emitted by `buildTuiWaitForBlock`. A 10s grace window covers the case where the signal never fires, after which the launch aborts with a diagnostic naming the missing event. Links to `pane-crash-recovery` R-CRASH-4.

#### Scenario: LH-S1 — TUI_READY event unblocks launch

- **GIVEN** a fresh 5-role launch is in progress
- **WHEN** `buildTuiWaitForBlock` emits `TUI_READY` at 1.4s
- **THEN** the launch orchestrator's spawn gate resolves
- **AND** the 10s safety timer is cleared
- **AND** no `pgrep` call is issued during the wait

#### Scenario: LH-S2 — Missing TUI_READY aborts at 10s

- **GIVEN** the TUI hangs and never emits `TUI_READY`
- **WHEN** the 10s safety timer fires
- **THEN** the launch aborts with a diagnostic naming the missing `TUI_READY` event
- **AND** no zombie PTYs are left behind
- **AND** the launch state is marked `failed`

### REQ-LH-2: Per-launchId Watchdog Respawn Budget

**Priority**: P0 | **Status**: delta

The sidecar watchdog MUST maintain a per-`(launchId, role)` respawn budget of 1 for PTYs that exit unexpectedly within the launch window (default 60s after `READY`). After the budget is exhausted, the watchdog MUST surface a recoverable error banner. Links to `pane-crash-recovery` R-CRASH-3.

#### Scenario: LH-S3 — One-shot respawn succeeds

- **GIVEN** a devops PTY exits 5s after `READY`
- **WHEN** the watchdog observes the exit
- **THEN** a single respawn is scheduled within 1s
- **AND** the budget for `(launchId, devops)` decrements to 0

#### Scenario: LH-S4 — Second death surfaces banner

- **GIVEN** the respawned devops PTY also exits
- **WHEN** the watchdog observes the second exit
- **THEN** no respawn is scheduled
- **AND** the affected pane renders a recoverable error banner
- **AND** the launch state records `watchdog_exhausted: true` for that role

#### Scenario: LH-S5 — Budget is scoped to launchId

- **GIVEN** two concurrent launchIds
- **WHEN** a PTY in launch A's devops pane exits
- **THEN** only launch A's `(launchId, devops)` budget is consumed
- **AND** launch B's devops budget remains at 1

### REQ-LH-3: Renderer Demotion Lifecycle Hooks

**Priority**: P1 | **Status**: delta

The launch orchestrator MUST register demotion hooks with `terminalRendererCapabilities` so that a `webgl → canvas2d → dom` demotion propagates to all 5 panes in a single state transition. Demotion MUST be a state diff (no remount) and MUST be observable in launch telemetry. Links to `terminal-renderer-capability` R-CAP-3.

#### Scenario: LH-S6 — Demotion is a state transition, not a remount

- **GIVEN** all 5 panels are mounted with `webgl`
- **WHEN** the GPU context is lost on any panel
- **THEN** the capability module demotes ALL 5 panels to `canvas2d`
- **AND** panel scrollback and state are preserved
- **AND** the launch telemetry records a `renderer_demoted` event per panel

#### Scenario: LH-S7 — Demotion is observable in evidence

- **GIVEN** a demotion occurred during the launch
- **WHEN** the evidence tarball is produced
- **THEN** the launch JSON contains a `renderer_demotions` array with `from`, `to`, and `panelId` per event
