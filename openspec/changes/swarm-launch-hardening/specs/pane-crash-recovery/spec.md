# Pane Crash Recovery Specification

## Purpose

Bound the impact of post-launch PTY crashes (notably architect/devops dying 5–30s after launch) and remove the dominant crash trigger — the 45s `pgrep` TUI wait. Defines a watchdog with a one-shot respawn budget per launch id, an event-driven TUI readiness gate, and a per-WS PTY spawn serialization that keeps the event loop responsive under bursty load.

## Requirements

### Requirement: R-CRASH-1 — WebGL Capability Gating with Graceful Demotion

Before mounting any of the 5 xterm panels, the launch path MUST query renderer capabilities via `src/lib/terminal/terminalRendererCapabilities.js` and demote on the `lost` event along the chain `webgl → canvas2d → dom` as a single state transition (no remount). Links to `terminal-renderer-capability` R-CAP-3 / R-CAP-4.

#### Scenario: GPU context lost, all 5 panels demote without crash

- **GIVEN** all 5 panels are mounted with `webgl` as the requested renderer
- **WHEN** the GPU fires a `webglcontextlost` event on any panel
- **THEN** ALL 5 panels transition to the next demotion target (`canvas2d`)
- **AND** no panel crashes or shows a blank surface
- **AND** the demotion is a state diff, not a remount (panel state and scrollback are preserved)

### Requirement: R-CRASH-2 — Per-WS PTY Spawn Serialization

The ttyServer `wss.on('connection')` handler MUST queue per-connection PTY spawns with `setImmediate` so the event loop yields between spawns. This keeps the loop responsive under bursty connection load.

#### Scenario: 5 simultaneous WS connections do not block the event loop

- **GIVEN** 5 clients open a WS connection at the same instant
- **WHEN** the sidecar handles the 5 upgrade requests
- **THEN** each PTY spawn is deferred to a `setImmediate` callback
- **AND** no event-loop block exceeds 50ms
- **AND** all 5 PTYs are spawned within 2s of the burst

### Requirement: R-CRASH-3 — Watchdog with One-Shot Respawn Budget

The sidecar MUST run a watchdog that observes PTY exits. When a pane's PTY exits unexpectedly within the launch window (default: 60s after `READY`), the watchdog MUST auto-respawn the PTY exactly once per `launchId`. After the respawn budget is exhausted, the watchdog MUST surface a recoverable error banner in the affected pane.

#### Scenario: Pane dies 5s after launch, auto-respawns once

- **GIVEN** devops PTY exits 5s after `READY`
- **WHEN** the watchdog observes the exit
- **THEN** a respawn is scheduled within 1s
- **AND** `(launchId, devops)` budget decrements to 0
- **AND** the pane reattaches to the new PTY's stdio

#### Scenario: Second death surfaces error banner

- **GIVEN** the respawned devops PTY also exits
- **WHEN** the watchdog observes the second exit
- **THEN** no respawn is scheduled
- **AND** the pane renders a recoverable error banner
- **AND** launch state records `watchdog_exhausted: true` for `devops`

#### Scenario: Respawn budget is per launchId, not global

- **GIVEN** two concurrent launchIds, each with a devops pane
- **WHEN** devops dies on launch A
- **THEN** only launch A's budget is consumed
- **AND** launch B's devops budget remains at 1

### Requirement: R-CRASH-4 — Event-Driven TUI Readiness Gate

The 45s `pgrep` wait MUST be replaced with an event-driven `TUI_READY` signal emitted by `buildTuiWaitForBlock`. The launch MUST unblock on `TUI_READY` arrival; a 10s grace window covers the case where the signal never fires, after which the launch aborts with a diagnostic.

#### Scenario: TUI emits TUI_READY within 10s

- **GIVEN** the TUI is initializing on a new launch
- **WHEN** `buildTuiWaitForBlock` emits `TUI_READY` at 1.4s
- **THEN** the spawn gate resolves
- **AND** the 10s safety timer is cleared

#### Scenario: TUI never READYs, gate aborts at 10s

- **GIVEN** the TUI hangs and never emits `TUI_READY`
- **WHEN** the 10s safety timer fires
- **THEN** the launch aborts with a diagnostic naming the missing event
- **AND** launch state is marked `failed`

#### Scenario: Re-fix of T-019.1

- **GIVEN** T-019.1 caused `buildTuiWaitForBlock` to wait on `pgrep` for 45s
- **WHEN** this change is applied
- **THEN** `buildTuiWaitForBlock` no longer shells out to `pgrep`## Out of Scope

- Renderer demotion chain mechanics (see `terminal-renderer-capability` for the transversal contract).
- Agent-process restart beyond a single PTY respawn (the wrapper-level restart loop is owned by `swarm-process-lifecycle` REQ-PL-12).
- Crash recovery for the director pane (director crash is a launch failure, not a recoverable state).
- The 48-file `WIP: pre-sdd-batch 2026-06-08` files; this change adds the watchdog and replaces the `pgrep` wait.
