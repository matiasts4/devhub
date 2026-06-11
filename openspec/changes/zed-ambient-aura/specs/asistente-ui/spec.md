# Delta for asistente-ui — Zed Aura Tint Contract

> **Note**: This delta extends the `asistente-ui` capability with the aura
> visual contract that lives in
> `openspec/changes/zed-ambient-aura/specs/zed-ambient-aura/spec.md`.
> The new full capability spec for the aura is the source of truth for
> intensity budgets, per-tool accent dispatch, and reduced-motion
> behavior; this delta records the same requirements in the
> `asistente-ui` capability so consumers of the existing
> `asistente-ui` surface (ChatPanel, ZedAmbientOverlay) see the
> contract in their own spec tree.
>
> The previous `asistente-ui` baseline (see
> `openspec/specs/asistente-ui/spec.md`) documents event-bus behavior
> (re-fire guard, focus chain, pizarra de-maximization). It does not
> document the ambient aura — that contract is new in this change.
>
> Documented as `## ADDED Requirements` to mirror the convention
> established in the prior `asistente-ui` delta (no promoted
> baseline).

## ADDED Requirements

### ASST-UI-AURA-001: Ambient Aura Intensity Budget

The `ZedAmbientOverlay` component SHALL keep the aura's computed
`opacity` at or below these values per phase:

- `idle`: `0.10`
- `open`: `0.18`
- `responding`: `0.30`
- `executing`: `0.35`

The intensity lookup SHALL be a single source of truth (a constant
map colocated with `resolveZedAmbientPhase`) so the phase-to-opacity
mapping is unit-testable in isolation from the rendering path.

#### Scenario: idle phase is below the budget

- **WHEN** the Zed pill is closed and no turn is in flight
- **THEN** the overlay element's computed `opacity` is `≤ 0.10`

#### Scenario: executing terminal tool saturates the budget

- **WHEN** the most recent assistant turn is in flight and the last
  `tool_results[0].tool` is `open_terminal`, `execute_in_terminal`, or
  `close_terminal`
- **THEN** the overlay element's computed `opacity` is `≤ 0.35`
- **AND** the accent CSS variable resolves to `var(--accent-terminal)`

### ASST-UI-AURA-002: Per-Tool-Type Accent Dispatch

The `ZedAmbientOverlay` SHALL select an accent CSS variable from
`useZedChat`'s `lastToolType` and apply it to the aura's root
element. The dispatch table is:

| `tool_results[0].tool` | Accent variable     | Pulse class                  |
| ---------------------- | ------------------- | ---------------------------- |
| terminal tools         | `--accent-terminal` | `.zed-aura-pulse-terminal`   |
| `open_url`             | `--accent-browser`  | `.zed-aura-pulse-browser`    |
| any other recognized   | `--accent-file`     | `.zed-aura-pulse-file`       |
| unknown / no tool      | phase gradient only | (no per-tool class)          |

The dispatch is driven by the new
`ZED_AURA_TOOL_TYPE_EVENT` (`devhub:zed-aura-tool-type`) CustomEvent
dispatched from `useZedChat` and consumed by `ZedAmbientOverlay`.

#### Scenario: terminal tool sets the terminal accent

- **WHEN** `useZedChat.lastToolType` resolves to `'terminal'`
- **THEN** the aura root element applies `--accent-terminal`
- **AND** the `.zed-aura-pulse-terminal` class is present on the
  inner gradient layer

#### Scenario: browser tool sets the browser accent

- **WHEN** `useZedChat.lastToolType` resolves to `'browser'`
- **THEN** the aura root element applies `--accent-browser`
- **AND** the `.zed-aura-pulse-browser` class is present

#### Scenario: no tool falls back to phase gradient

- **WHEN** `useZedChat.lastToolType` resolves to `null`
- **THEN** no per-tool accent or class is applied
- **AND** the aura uses the phase-only gradient
  (`var(--accent-primary)`)

### ASST-UI-AURA-003: Reduced-Motion CSS Gate

The aura's CSS layer SHALL be the authoritative reduced-motion gate.
The system SHALL:

1. Wrap per-tool pulse declarations in
   `@media (prefers-reduced-motion: no-preference)`.
2. Add `@media (prefers-reduced-motion: reduce)` that disables
   `animation` on every `.zed-aura-pulse*` class (including the
   legacy `.zed-aura-pulse`).
3. Keep the JS-level `useReducedMotion()` guard in
   `ZedAmbientOverlay` as defense in depth (the class is not
   applied when reduced motion is active).

#### Scenario: reduced motion freezes the pulse

- **WHEN** the user agent reports `prefers-reduced-motion: reduce`
- **THEN** no `.zed-aura-pulse*` class produces a running animation
- **AND** the user sees a static tint at the current intensity

#### Scenario: no-preference runs the per-tool pulse

- **WHEN** the user agent reports `prefers-reduced-motion: no-preference`
- **THEN** the per-tool pulse class animates the aura with its
  4s ease-in-out keyframe

### ASST-UI-AURA-004: Non-Blocking Aura Overlay

The aura's root element SHALL:

1. Have `pointer-events: none` so clicks pass through to the
   terminal surface.
2. Have a `z-index` strictly less than any modal/portal in the app
   (current value: `248`, below the pill at `260` and below shadcn
   dialogs at `1000+`).
3. Contain no focusable children.

#### Scenario: terminal click is not intercepted by the aura

- **WHEN** the user clicks the terminal surface while the aura is
  visible at `executing` phase
- **THEN** the click event reaches the terminal element
- **AND** the aura does not consume `pointerdown` or `mousedown`

#### Scenario: modal renders above the aura

- **WHEN** a shadcn dialog (`z-index ≥ 1000`) is open
- **THEN** the dialog renders above the aura
- **AND** the aura does not appear in the dialog's tab order

## MODIFIED Requirements

(none — the prior `asistente-ui` baseline does not include aura
visual contract, so there is nothing to modify. The new full
capability spec at
`openspec/changes/zed-ambient-aura/specs/zed-ambient-aura/spec.md`
is the source of truth.)

## REMOVED Requirements

(none)

## RENAMED Requirements

(none)
