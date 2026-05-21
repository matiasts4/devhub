# Terminal Renderer Fallback Specification

## Purpose

Keep GTK VTE experimental rendering safe by preserving TERM-02 fallback semantics and a usable `xterm` surface.

## Requirements

### Requirement: Linux Native Readiness Gates Effective Renderer

The system MUST resolve effective renderer separately from requested renderer. `vte-experimental` SHALL become effective only when Linux platform support, Tauri/native availability, and GTK VTE readiness are all positively confirmed for the active panel. Otherwise, effective renderer MUST be `xterm` while preserving the requested renderer.

#### Scenario: Ready Linux native path uses GTK VTE

- GIVEN the active panel requests `vte-experimental`
- WHEN Linux, Tauri/native availability, and GTK VTE readiness are all confirmed
- THEN effective renderer becomes `vte-experimental`

#### Scenario: Unsupported or unavailable native path falls back to xterm

- GIVEN the active panel requests `vte-experimental`
- WHEN platform, native host, or readiness evidence is missing, false, or unsupported
- THEN effective renderer becomes `xterm`
- AND the requested renderer remains `vte-experimental`

### Requirement: Fallback Remains Usable and Recoverable

The system MUST NOT leave the active panel blank during native failure, reopen, or runtime loss. When GTK VTE is unavailable, the panel MUST keep a usable `xterm` surface or deterministic recoverable status, and MUST expose an explicit switch back to `xterm`.

#### Scenario: Runtime native failure recovers in place

- GIVEN the active panel was using GTK VTE effectively
- WHEN the native path becomes unavailable or unstable at runtime
- THEN the same panel recovers to usable `xterm` in place
- AND no external window is required

#### Scenario: Visible recovery action resets the request

- GIVEN the panel is running on fallback `xterm`
- WHEN the user chooses the recovery action
- THEN the requested renderer becomes `xterm`
