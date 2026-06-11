# Spec Delta: asistente-ui

> **Note**: No `openspec/specs/asistente-ui/spec.md` baseline exists. The previous
> zed-hardening change defined the greenfield `asistente-ui` capability at
> `openspec/changes/zed-hardening/specs/asistente-ui/spec.md` and was never
> promoted. This delta therefore documents the new behavior as `## ADDED
Requirements` against the de-facto baseline, not as `## MODIFIED Requirements`.

## MODIFIED Requirements

(none)

## ADDED Requirements

### ASST-UI-001: Re-Fire Guard for `devhub:zed-open-terminal` Dispatch

The `ChatPanel` `useEffect` that scans the `messages` array for an
`open_terminal` tool result MUST re-dispatch the `devhub:zed-open-terminal`
CustomEvent at most once per `session_id`. The component MUST track every
`session_id` that has already been dispatched (via a `useRef` of dispatched
ids, or an equivalent single-source-of-truth guard). On every re-render that
re-finds the same `session_id`, the effect MUST return without dispatching.

#### Scenario: Two messages produce one dispatch

- **WHEN** the user sends message A and receives an assistant turn with
  `tool_results: [{ tool: 'open_terminal', result: { session_id: 'term-1' } }]`
- **AND** the user sends a second message B (causing `messages` to change)
- **THEN** the effect MUST dispatch `devhub:zed-open-terminal` with
  `session_id: 'term-1'` exactly once
- **AND** the listener MUST receive exactly one event for `'term-1'`

#### Scenario: A new `open_terminal` result does dispatch

- **WHEN** the user sends a message that yields an assistant turn with
  `tool_results: [{ tool: 'open_terminal', result: { session_id: 'term-2' } }]`
- **AND** no prior dispatch recorded `'term-2'`
- **THEN** the effect MUST dispatch `devhub:zed-open-terminal` with
  `session_id: 'term-2'`
- **AND** the effect MUST record `'term-2'` in the dispatched set

### ASST-UI-002: Listener Focus Chain (opt-in)

When the listener `handleZedOpenTerminal` in `TerminalWorkspacesManager.jsx`
receives a `devhub:zed-open-terminal` event with `detail.focus === true`, the
listener MUST make the new terminal visible by:

1. Calling `activateWorkspacePanel(targetWsId, newPanelId)` so the new panel
   becomes the active panel in the active workspace.
2. Clearing or updating `focusedPanelByWorkspace[targetWsId]` to the new
   panel id (so a previous "focused" panel does not hide the new one).
3. If the right-dock maximized view is currently `'pizarra'`, de-maximizing
   pizarra via `updateRightDockState({ maximized: false, maximizedView: 'browser' })`.

#### Scenario: Focused listener reveals the new panel

- **WHEN** a `devhub:zed-open-terminal` event arrives with
  `detail.focus === true`
- **AND** `handleSplit` returns a new panel id
- **THEN** `activateWorkspacePanel` MUST be called with that new panel id
- **AND** `setFocusedPanelByWorkspace` MUST be updated to the new panel id
- **AND** if `maximizedView === 'pizarra'`, the right dock MUST be de-maximized

#### Scenario: Listener does not steal focus when focus flag is absent

- **WHEN** a `devhub:zed-open-terminal` event arrives with
  `detail.focus` undefined, `false`, or any non-`true` value
- **THEN** `activateWorkspacePanel` MUST still be called (open/attach)
- **AND** `setFocusedPanelByWorkspace` MUST NOT be cleared for that workspace
- **AND** the right-dock maximized state MUST remain unchanged

### ASST-UI-003: Pizarra De-Maximization is Opt-In

The system MUST NOT de-maximize pizarra as a side effect of a
`devhub:zed-open-terminal` event unless the event's `detail.focus === true`.
The default MUST be `false` so that users who are deliberately in pizarra
are not surprised by an automatic exit to the workspace.

#### Scenario: Default dispatch leaves pizarra maximized

- **WHEN** the dispatch site calls the dispatch helper without a `focus`
  field
- **THEN** the resulting event has `detail.focus` undefined
- **AND** the listener MUST NOT change `rightDockState.maximized`
- **AND** the listener MUST NOT change `rightDockState.maximizedView`

### ASST-UI-004: New Empty Terminal per Open

Each `devhub:zed-open-terminal` event MUST result in a NEW empty terminal
panel. The listener MUST NOT reuse a panel that already has content. The
PTY session is created fresh (the `session_id` is unique per call) and the
panel id MUST be the model's `session_id` so the new panel is distinguishable
from existing ones.

#### Scenario: Repeated dispatches with different `session_id`s create separate panels

- **WHEN** the listener receives a first event with `session_id: 'term-1'`
- **AND** a second event with `session_id: 'term-2'`
- **THEN** two distinct panel ids exist in the workspace
- **AND** neither panel reuses the other panel's content

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

## REMOVED Requirements

(none)
