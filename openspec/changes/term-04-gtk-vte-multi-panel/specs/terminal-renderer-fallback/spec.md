# Terminal Renderer Fallback Specification

## Purpose

Keep TERM-04 native failures local, deterministic, and recoverable.

## Requirements

### Requirement: Native Failure Falls Back Per Panel

The system MUST preserve deterministic fallback to `xterm` per panel. Native open, attach, runtime, or recovery failure in one panel MUST switch only that panel's effective renderer to `xterm` and MUST NOT blank, hide, or close healthy sibling native panels.

#### Scenario: One native panel fails while sibling stays healthy

- GIVEN two visible panels are rendering GTK/VTE
- WHEN one panel loses native availability at runtime
- THEN that panel recovers in place to usable `xterm`
- AND the sibling panel remains rendered on GTK/VTE

### Requirement: Recovery and Reappearance Preserve Session Semantics

The system MUST preserve the requested renderer for recoverable native failures unless the user explicitly switches to `xterm`. Showing a previously hidden panel again MUST retry its last valid renderer contract without treating hide/unmount as explicit close.

#### Scenario: Re-show retries after hidden native panel returns

- GIVEN a panel requested `vte-experimental` and was hidden by a workspace/view switch
- WHEN that layout becomes visible again
- THEN the panel reappears using its last effective renderer or deterministic per-panel fallback
- AND no sibling panel is restarted solely because this panel reappears

#### Scenario: User commits permanent recovery to xterm

- GIVEN a panel is running on fallback `xterm` after native failure
- WHEN the user chooses the recovery action to stay on `xterm`
- THEN the requested renderer becomes `xterm`
