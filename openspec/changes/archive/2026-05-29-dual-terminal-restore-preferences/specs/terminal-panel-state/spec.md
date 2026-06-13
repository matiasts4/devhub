# Delta Specifications for terminal-panel-state

## ADDED Requirements

### Requirement: TPS-1 — Suspended Connection State

The `TerminalTTY` component MUST support a `connectionState` value of `'suspended'`. When this state is active, the component MUST render a placeholder overlay instead of attempting a WebSocket connection. The suspended state is entered when a session's `restorePolicy === 'manual'` and the session was not auto-resumed.

#### Scenario: TPS-S1 — Suspended state renders placeholder overlay

- GIVEN a session with `restorePolicy: 'manual'` that was not auto-resumed
- WHEN `TerminalTTY` renders with `connectionState === 'suspended'`
- THEN a placeholder overlay is displayed
- AND the overlay shows the session title
- AND the overlay shows a non-functional "Continuar" button stub (logs for PR #1; no dispatch fires)

#### Scenario: TPS-S2 — Suspended state does not attempt WebSocket connection

- GIVEN `TerminalTTY` has `connectionState === 'suspended'`
- WHEN `TerminalTTY` renders
- THEN no WebSocket connection is initiated
- AND no `xterm` terminal instance is created

### Requirement: TPS-2 — Layout Preservation for Suspended Panels

The panel position and workspace layout for a suspended session MUST be preserved exactly as persisted in the project-scoped localStorage key `terminalStateStorageKey`. A suspended session's panel remains in its original workspace and panel slot without requiring any restore action.

#### Scenario: TPS-S3 — Suspended panel retains exact workspace position

- GIVEN a panel `P` in workspace `W` at position `0` with width `300px` is suspended
- WHEN the app restarts and the panel is evaluated
- AND `restorePolicy: 'manual'` applies
- THEN the panel `P` appears in workspace `W` at position `0` with width `300px`
- AND no terminal connection is established
- AND the panel shows the suspended placeholder

### Requirement: TPS-3 — Manual Revive Mode Activation (Stub for PR #1)

PR #1 MUST include a `connectionState === 'suspended'` branch in `TerminalTTY` that renders the placeholder overlay. The "Continuar" button stub logs `"Manual resume stub — PR #2 will wire full dispatch"` and does not change `connectionState`. The full revive dispatch is deferred to PR #2.

#### Scenario: TPS-S4 — Button stub logs and does not change state

- GIVEN `TerminalTTY` is in `suspended` state
- WHEN the user clicks the "Continuar" button
- THEN a log message `"Manual resume stub — PR #2 will wire full dispatch"` is emitted
- AND `connectionState` remains `'suspended'`

### Requirement: TPS-4 — Terminal Settings Modal Surface Contract (PR #2 stub)

PR #2 will introduce a `TerminalSettingsModal` accessible from the terminal top bar. PR #1 MUST define the modal trigger as a gear icon in the terminal top bar area though the modal itself is not implemented in PR #1. The placeholder trigger MUST exist and log when clicked.

#### Scenario: TPS-S5 — Gear icon exists in top bar for PR #2 wiring

- GIVEN the terminal top bar renders
- THEN a gear icon trigger is present
- AND clicking it logs `"TerminalSettingsModal trigger — PR #2"` without opening a modal
