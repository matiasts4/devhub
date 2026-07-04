# Delta for terminal-engine-v2

## ADDED Requirements

### Requirement: Runtime per-panel feature flag

The system SHALL support a runtime per-panel boolean flag named `terminal-engine-v2` that decides whether a panel uses the v2 or legacy v1 terminal lifecycle.

#### Scenario: New panel defaults to legacy

- GIVEN a new panel is created
- WHEN `terminal-engine-v2` is not specified
- THEN the panel MUST default to `false`
- AND MUST use the legacy v1 path

#### Scenario: Flag toggled for one panel

- GIVEN workspace A has panel p1 with `terminal-engine-v2=false` and panel p2 with `terminal-engine-v2=true`
- WHEN both panels mount
- THEN p1 MUST use v1 lifecycle
- AND p2 MUST use v2 lifecycle
- AND they MUST coexist in the same workspace

### Requirement: Panel-level migration

The system SHALL allow toggling `terminal-engine-v2` per panel, persisting the choice, and reinitializing the panel with the new engine on next mount.

#### Scenario: User migrates a panel

- GIVEN a v1 panel is open
- WHEN the user enables `terminal-engine-v2` for that panel
- THEN the system MUST persist the new flag value
- AND on remount MUST use the v2 lifecycle

#### Scenario: Rollback a panel

- GIVEN a v2 panel is open
- WHEN the user disables `terminal-engine-v2`
- THEN the system MUST persist the flag as `false`
- AND MUST fall back to the legacy v1 lifecycle on next mount

### Requirement: Coexistence contract

v1 and v2 panels SHALL coexist without sharing state or interfering with each other’s PTY lifecycle.

#### Scenario: v1 panel is hidden

- GIVEN a v1 panel is hidden
- WHEN the legacy grace timer or survivor recovery runs
- THEN it MUST NOT affect v2 panels
- AND v2 panels MUST continue using their own ring buffer and graveyard

#### Scenario: v2 panel is closed

- GIVEN a v2 panel is closed and its surface moves to the graveyard
- WHEN a v1 panel in the same workspace is closed
- THEN the legacy v1 close path MUST run independently
- AND MUST NOT evict the v2 graveyard surface

## REMOVED Requirements

### Requirement: Global survivor recovery orchestration

(Reason: v2 replaces recover-with-burst with persistent PTY + rehydration; v1 keeps its own minimal path until fully deprecated.)
(Migration: Remove `dispatchTerminalSurvivorRecover` listeners in `src/components/TerminalTTY.jsx` and `src/components/TerminalWorkspacesManager.jsx` for the v2 path; keep them only behind the v1 branch.)
