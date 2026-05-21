# Terminal Renderer Fallback Specification

## Purpose

Define readiness-gated fallback so renderer changes never strand a panel away from a working `xterm` session.

## Requirements

### Requirement: Readiness-Gated Effective Renderer

The system MUST resolve an effective renderer separately from the requested renderer. If an experimental renderer is not proven ready at render or restore time, the effective renderer MUST fall back to `xterm` while preserving the requested preference.

#### Scenario: Unready experimental renderer falls back deterministically

- GIVEN a panel requests an experimental renderer
- WHEN readiness is missing, false, or incomplete for that renderer
- THEN the panel renders with `xterm` as the effective renderer
- AND the requested experimental preference remains available for later reevaluation

#### Scenario: Ready renderer does not fall back

- GIVEN a panel requests an experimental renderer
- WHEN readiness is positively confirmed for that renderer
- THEN the panel uses that renderer instead of `xterm`

### Requirement: Visible Recovery to xterm

When the effective renderer differs from the requested renderer, the system MUST show visible recovery guidance in the affected panel or workspace and MUST provide an explicit action to switch the requested mode back to `xterm`.

#### Scenario: Fallback exposes recovery action

- GIVEN a panel requested an experimental renderer and is currently running on fallback `xterm`
- WHEN the panel is visible after resolution or restore
- THEN the UI shows that fallback occurred
- AND the user can switch the requested renderer back to `xterm` without leaving the panel

### Requirement: No-Blank-Panel Guardrails

The system MUST NOT leave a terminal panel blank during renderer selection, restore, reopen, or fallback handling. If the requested renderer cannot be used, a working `xterm` viewport or deterministic terminal status state MUST remain visible.

#### Scenario: Restore with invalid experimental renderer still shows usable terminal surface

- GIVEN a saved panel restores with an unready experimental renderer request
- WHEN the terminal panel reopens after app reload or session recovery
- THEN the panel shows the `xterm` terminal surface or a deterministic recoverable status overlay
- AND the user is not left with an empty renderer region

#### Scenario: Renderer change does not strand active panel content

- GIVEN a visible terminal panel with a running session
- WHEN the requested renderer changes to an unready experimental mode
- THEN fallback keeps the panel usable in place
- AND the panel does not require a separate window or TERM-03/04 renderer handoff
