# Spec: zed-ambient-aura

> **Capability status**: NEW. The Zed assistant's ambient overlay visual
> contract — per-phase intensity budget, per-tool-type accent, reduced-motion
> safety net, and the end-to-end data path that carries the tool-type signal
> from `useZedChat` to `ZedAmbientOverlay`. Promoted from the change folder
> by `sdd-archive` once the implementation is verified.

## Purpose

Define the visual contract for the ambient aura rendered by
`ZedAmbientOverlay` while the Zed assistant is active. The aura SHALL be
subtle, distinguishable by tool type, and accessible under
`prefers-reduced-motion`. The data path SHALL propagate a discrete
`toolType` signal end-to-end so the overlay can tint the gradient without
re-parsing human-readable status text.

## Requirements

### ZAA-001: Aura Intensity Budget

The aura's computed `opacity` SHALL be at or below these values for each
phase:

| Phase        | Max opacity |
| ------------ | ----------- |
| `idle`       | 0.10        |
| `open`       | 0.18        |
| `responding` | 0.30        |
| `executing`  | 0.35        |

The intensity lookup SHALL be a single source of truth (e.g. an
`AURA_INTENSITY` map colocated with `resolveZedAmbientPhase`) so the
phase-to-opacity mapping is unit-testable.

#### Scenario: idle phase is barely visible

- **WHEN** no tool has been triggered and the Zed pill is closed
- **THEN** the overlay element's computed `opacity` is `≤ 0.10`

#### Scenario: open phase is soft

- **WHEN** the user has opened the Zed pill and no turn is in flight
- **THEN** the overlay element's computed `opacity` is `≤ 0.18`

#### Scenario: executing terminal tool is at the ceiling

- **WHEN** the last assistant turn is in flight and the most recent
  `tool_results` entry has `tool === 'open_terminal'`,
  `tool === 'execute_in_terminal'`, or `tool === 'close_terminal'`
- **THEN** the overlay's computed `opacity` is `≤ 0.35`
- **AND** the accent CSS variable resolves to `var(--accent-terminal)`

### ZAA-002: Tool-Type Accent Dispatch

The system SHALL select an accent CSS variable from this table based on the
last assistant turn's first `tool_results[0].tool` value:

| `tool_results[0].tool`                        | Accent variable         |
| --------------------------------------------- | ----------------------- |
| `open_terminal`, `execute_in_terminal`, `close_terminal` | `--accent-terminal`     |
| `open_url`                                    | `--accent-browser`      |
| any other recognized tool                     | `--accent-file`         |
| no `tool_results` / unknown tool / `null`     | phase-only gradient     |

When the message has both `content` and `tool_results`, `tool_results[0]`
SHALL win (matching the existing `buildZedAmbientStatus` priority).

#### Scenario: terminal tool tints the aura

- **WHEN** the most recent assistant message has
  `tool_results: [{ tool: 'open_terminal' }]`
- **THEN** the aura wrapper's root element applies `--accent-terminal`
  as the gradient source
- **AND** the `.zed-aura-pulse-terminal` class is applied

#### Scenario: browser tool tints the aura

- **WHEN** the most recent assistant message has
  `tool_results: [{ tool: 'open_url' }]`
- **THEN** the aura wrapper's root element applies `--accent-browser`
- **AND** the `.zed-aura-pulse-browser` class is applied

#### Scenario: no tool falls back to phase gradient

- **WHEN** the most recent assistant message has no `tool_results`
  field, or `tool_results[0].tool` is unrecognized
- **THEN** no per-tool pulse class is applied
- **AND** the aura uses the phase-only gradient (`--accent-primary`)

### ZAA-003: Reduced-Motion CSS Gate

The CSS layer SHALL be the authoritative reduced-motion gate for every
aura animation class. The system SHALL:

1. Wrap the per-tool pulse declarations in
   `@media (prefers-reduced-motion: no-preference)` so the animation
   is only active when the user has not opted out.
2. Add `@media (prefers-reduced-motion: reduce)` that sets
   `animation: none` on every `.zed-aura-pulse*` class
   (including the legacy `.zed-aura-pulse`).
3. Preserve the JS-level `useReducedMotion()` guard in
   `ZedAmbientOverlay` so the class is not even applied when reduced
   motion is active (defense in depth).

#### Scenario: reduced motion disables the pulse

- **WHEN** the user agent reports `prefers-reduced-motion: reduce`
- **THEN** no `.zed-aura-pulse*` rule resolves to an active animation
- **AND** the aura shows only the static tint

#### Scenario: no-preference runs the pulse

- **WHEN** the user agent reports `prefers-reduced-motion: no-preference`
- **THEN** the per-tool pulse class (e.g. `.zed-aura-pulse-terminal`)
  animates the aura with its 4s keyframe

#### Scenario: CSS gate works even when JS guard is bypassed

- **WHEN** the JS guard is removed (e.g. a future regression) but the
  CSS layer is intact
- **THEN** the user still sees a static tint under reduced motion
  (the CSS media query overrides the class)

### ZAA-004: Non-Blocking Overlay

The aura's root element SHALL:

1. Have `pointer-events: none` so clicks pass through to the terminal.
2. Have a `z-index` strictly less than any modal/portal in the app
   (current value: `248`, below the pill at `260` and below shadcn
   dialogs at `1000+`).
3. Not register any focusable children.

#### Scenario: terminal click is not intercepted

- **WHEN** the user clicks the terminal surface while the aura is
  visible
- **THEN** the click event reaches the terminal element
- **AND** the aura does not consume `pointerdown` or `mousedown`

#### Scenario: aura is below modals in the stacking order

- **WHEN** a shadcn dialog (`z-index ≥ 1000`) is open over the aura
- **THEN** the dialog renders above the aura
- **AND** the aura is not focusable from the dialog's tab order

### ZAA-005: Tool-Type Data Path

The `toolType` signal SHALL propagate through the following chain, in
order, with no intermediate lossy collapse to a human-readable string:

```
useZedChat (lastToolType selector)
  └─► zedOverlayEvents.dispatchZedAuraToolType(toolType)
        └─► ZedAmbientOverlay subscribes on mount, clears on unmount
              └─► buildZedAmbientStatus.extractToolType(message) (pure)
                    └─► ZedAuraFrame receives toolType prop
                          └─► root applies CSS var + class
```

- `useZedChat` SHALL expose a derived `lastToolType` that finds the
  most recent assistant message with `tool_results` and returns
  `tool_results[0].tool` (or `null` if none).
- `zedOverlayEvents.js` SHALL export `ZED_AURA_TOOL_TYPE_EVENT` (a new
  `devhub:zed-aura-tool-type` CustomEvent) and a `dispatchZedAuraToolType`
  helper following the existing SSR-safe pattern.
- `buildZedAmbientStatus.js` SHALL export a pure
  `extractToolType(message)` that returns `'terminal' | 'browser' |
  'file' | null` from the message, independent of the human-readable
  status string.

#### Scenario: terminal tool propagates from chat to overlay

- **WHEN** `useZedChat` produces a new message with
  `tool_results: [{ tool: 'open_terminal' }]`
- **THEN** `lastToolType` resolves to `'terminal'`
- **AND** `dispatchZedAuraToolType('terminal')` is called
- **AND** `extractToolType(message)` returns `'terminal'`
- **AND** `ZedAuraFrame` renders with the terminal accent

#### Scenario: extractToolType handles content-only messages

- **WHEN** `extractToolType` is called with a message that has
  `content` but no `tool_results`
- **THEN** it returns `null`

#### Scenario: extractToolType handles tool-only messages

- **WHEN** `extractToolType` is called with a message that has
  `tool_results` but `content` is empty
- **THEN** it returns the mapped category for `tool_results[0].tool`

#### Scenario: extractToolType prefers tool_results over content

- **WHEN** `extractToolType` is called with a message that has both
  `content` and `tool_results`
- **THEN** it returns the category for `tool_results[0].tool` (the
  `content` field is ignored)

#### Scenario: extractToolType handles unknown tools

- **WHEN** `extractToolType` is called with a message whose
  `tool_results[0].tool` is not in the recognized map
- **THEN** it returns `'file'` (the catch-all bucket) or `null` per
  the agreed mapping in ZAA-002

### ZAA-006: SSR Safety

`dispatchZedAuraToolType` SHALL be SSR-safe. When
`typeof window === 'undefined'`, the helper SHALL return without
dispatching (no throw, no warning). The event listener subscription
in `ZedAmbientOverlay` SHALL be set up inside a `useEffect` and
torn down on unmount.

#### Scenario: dispatch is a no-op on the server

- **WHEN** `dispatchZedAuraToolType('terminal')` is called in a
  Node.js context where `window` is undefined
- **THEN** the function returns without throwing
- **AND** no `ReferenceError` is raised

## Non-Goals

- Aura trigger during the `idle` phase (the aura SHALL remain hidden
  unless the phase is `open`, `responding`, or `executing`).
- Per-tool animation timing curves (all per-tool pulses SHALL share
  the 4s ease-in-out baseline defined in `globals.css`).
- Theming of the new CSS variables — the values SHALL come from the
  existing palette in `src/lib/theme/themes.js`; no new color tokens.
- The `zed-aura-breathe` keyframe (existing) — it is preserved
  unchanged and continues to drive the legacy `.zed-aura-pulse` class.
- Refactor of the existing `useZedChat` state machine — the change
  SHALL add the `lastToolType` selector additively.

## Test mapping

| Scenario                                  | Test file                                                                       |
| ----------------------------------------- | ------------------------------------------------------------------------------- |
| ZAA-001 intensity by phase                | `src/components/asistente/__tests__/ZedAmbientOverlay.test.jsx` (extend)        |
| ZAA-002 tool-type accent dispatch         | `src/components/asistente/__tests__/ZedAmbientOverlay.test.jsx` (extend)        |
| ZAA-003 reduced-motion CSS gate           | `src/components/asistente/__tests__/ZedAmbientOverlay.test.jsx` (extend)        |
| ZAA-004 pointer-events preserved          | `src/components/asistente/__tests__/ZedAmbientOverlay.test.jsx` (extend)        |
| ZAA-005 `extractToolType` unit scenarios  | `src/lib/asistente/__tests__/buildZedAmbientStatus.test.js` (extend)            |
| ZAA-006 SSR safety                        | `src/lib/asistente/__tests__/zedOverlayEvents.test.js` (new)                    |
