# Terminal Native VTE Spike Specification

## Purpose

Define the Linux-only GTK VTE same-window spike and the evidence needed to judge whether in-panel native rendering is viable.

## Requirements

### Requirement: Same-Window In-Panel Native Evidence

When `vte-experimental` is effective, the system MUST render GTK VTE inside the active terminal panel bounds in the existing DevHub window. It MUST provide evidence that the native surface is in-panel and MUST NOT open a separate native terminal window.

#### Scenario: Same-window evidence is observable on successful open

- GIVEN the active panel resolves effectively to `vte-experimental`
- WHEN the native terminal opens
- THEN GTK VTE is visible inside that panel region in the current window
- AND same-window evidence can distinguish it from an external window launch

### Requirement: Active Panel Lifecycle Boundary

The system MUST scope native GTK VTE lifecycle to one active panel only. Open, focus, resize, panel switch, and close MUST target that active panel lifecycle and MUST NOT imply multi-panel native concurrency.

#### Scenario: Open, focus, and resize stay bound to the active panel

- GIVEN one active panel is using effective `vte-experimental`
- WHEN the panel receives focus or its bounds change
- THEN input focus and resize apply to that active panel's native surface

#### Scenario: Close or panel switch ends the active native lifecycle cleanly

- GIVEN one active panel is using effective `vte-experimental`
- WHEN the panel closes or another panel becomes active
- THEN the native lifecycle is disposed, detached, or deactivated without orphaned native UI

### Requirement: TERM-03 Exclusions Remain Explicit

The system MUST treat TERM-03 as a spike only. It MUST NOT ship multi-panel native generalization, Ghostty, external windows, or TERM-04 rollout behavior as part of this capability.

#### Scenario: Second native panel is out of scope

- GIVEN another terminal panel exists while one active panel is using GTK VTE
- WHEN TERM-03 behavior is evaluated
- THEN the spike SHALL NOT claim multi-panel native support
