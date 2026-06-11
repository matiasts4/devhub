# pizarra-mode-transition Specification

## Purpose

Define the choreographed transition between the workspace chrome and the pizarra (canvas) chrome. The transition is owned by `useModeTransition(maximizedView)` and rendered through `ModeTransitionShell`. There SHALL be exactly one `ModeTransitionShell` in the tree per workspace↔pizarra toggle, owned by the pizarra pane.

---

## Requirements

### Requirement: useModeTransition Hook

The system SHALL provide a `useModeTransition(maximizedView)` hook that orchestrates the workspace-to-pizarra (and pizarra-to-workspace) transition. The hook SHALL return `{ phase: 'idle' | 'leaving' | 'entering', progress: 0..1 }`. The hook SHALL be the ONLY production path for the workspace↔pizarra transition; the orphaned `usePizarraModeTransition` approach SHALL NOT be used in any production module.

(Previously: did not explicitly name the active hook, allowing both `useModeTransition` and `usePizarraModeTransition` to coexist as redundant paths.)

#### Scenario: Hook reports idle at steady state

- GIVEN `maximizedView === 'workspace'` and no transition is in progress
- WHEN `useModeTransition(maximizedView)` is read
- THEN it SHALL return `{ phase: 'idle', progress: 0 }`

#### Scenario: Hook transitions to leaving on change

- GIVEN `maximizedView === 'workspace'` and phase is `idle`
- WHEN the user toggles to `maximizedView === 'pizarra'`
- THEN the hook SHALL transition phase to `leaving` for the OLD mode's chrome
- AND `progress` SHALL animate from `0` to `1` over the `leaving` duration (110ms)
- AND on completion, the React tree SHALL flip to the new mode
- AND the hook SHALL transition phase to `entering` for the NEW mode's chrome
- AND `progress` SHALL animate from `0` to `1` over the `entering` duration (220ms)

#### Scenario: Hook returns to idle after transition

- GIVEN a `pizarra` entry transition has reached `progress: 1`
- WHEN the next animation frame fires
- THEN the hook SHALL return `{ phase: 'idle', progress: 0 }`

#### Scenario: usePizarraModeTransition is not imported in production

- GIVEN the source tree under `src/`
- WHEN a recursive grep for `usePizarraModeTransition` runs
- THEN it SHALL return zero matches outside of test files and deprecation markers

---

### Requirement: Transition Choreography

The transition SHALL be a choreographed combination of fade, scale, and slight rotation. Easings and durations SHALL come from `surfaceMotion.js` tokens (`EASE_OUT`, `DUR.enter`, `DUR.base`). The total transition time SHALL be at least 250ms (leaving + entering combined) and SHALL NOT exceed 500ms.

| Phase       | Duration | Easing     | Effect                                                             |
| ----------- | -------- | ---------- | ------------------------------------------------------------------ |
| `leaving`   | 110ms    | `EASE_OUT` | Old mode chrome fades to 0, slides 16px, scales to 0.96            |
| (tree flip) | 0ms      | n/a        | React tree swap; no animation                                      |
| `entering`  | 220ms    | `EASE_OUT` | New mode chrome fades in from 0, slides -16px → 0, scales 0.96 → 1 |

#### Scenario: Choreography uses motion tokens

- GIVEN `surfaceMotion.js` exports `EASE_OUT`, `DUR.enter = 220`, `DUR.base = 110`
- WHEN a transition runs
- THEN the `leaving` phase SHALL use `DUR.base` and `EASE_OUT`
- AND the `entering` phase SHALL use `DUR.enter` and `EASE_OUT`
- AND no transition timing value SHALL be hard-coded in the hook

#### Scenario: Total transition time falls in 250-500ms

- GIVEN a normal workspace→pizarra toggle
- WHEN the transition completes (phase returns to `idle`)
- THEN the elapsed time SHALL be `110ms + 220ms = 330ms`
- AND this SHALL be within the 250-500ms total range

#### Scenario: Debounce is intentionally zero

- GIVEN the user toggles `maximizedView` three times in 100ms
- WHEN the debounce window is `0ms` (the default)
- THEN the visible transition SHALL be a single coherent animation, not a stuttering sequence
- AND the phase machine (leaving → entering) SHALL provide the visual rhythm without an additional dead zone
- AND a code comment SHALL document the conscious 0ms choice, referencing this requirement

---

### Requirement: Interruption by Rapid Toggle

If the user toggles `maximizedView` again while a transition is in progress, the in-flight transition SHALL be cancelled and a new transition SHALL start from the current visual state.

#### Scenario: Toggle back during leaving

- GIVEN a `workspace → pizarra` transition is in the `leaving` phase at `progress: 0.5`
- WHEN the user toggles back to `maximizedView === 'workspace'`
- THEN the in-flight `leaving` timeline SHALL be cancelled
- AND a new `entering` transition SHALL start for the `workspace` chrome
- AND the visual state SHALL NOT jump to `progress: 0` (no hard cut)

#### Scenario: Toggle back during entering

- GIVEN a `workspace → pizarra` transition is in the `entering` phase at `progress: 0.3`
- WHEN the user toggles back to `maximizedView === 'workspace'`
- THEN the in-flight `entering` timeline SHALL be cancelled
- AND a new `leaving` transition SHALL start for the `pizarra` chrome
- AND the tree flip SHALL be reversed

---

### Requirement: Single ModeTransitionShell Owner

There SHALL be exactly one `ModeTransitionShell` rendered per workspace↔pizarra toggle. The single owner SHALL be the component that mounts the pizarra pane (`PizarraPane`). `WorkspaceRightDock` SHALL NOT wrap its children in a `ModeTransitionShell`.

#### Scenario: One shell per toggle

- GIVEN the pizarra tab is active and `isPizarraSharedViewEnabled() === true`
- WHEN the right-dock tree is rendered
- THEN `document.querySelectorAll('[data-testid="mode-transition-shell"]').length` SHALL equal `1`
- AND the lone shell SHALL be located inside the `PizarraPane` mount

#### Scenario: Dock without outer shell

- GIVEN `WorkspaceRightDock` renders for any maximized view
- WHEN the dock body is committed to the DOM
- THEN the outermost `data-testid="mode-transition-shell"` SHALL NOT be a direct child of `WorkspaceRightDock`'s own root

#### Scenario: AnimatePresence is not nested

- GIVEN the rendered tree under the pizarra pane
- WHEN a `framer-motion` `AnimatePresence` is opened by the shell
- THEN no other `AnimatePresence` keyed on `maximizedView` SHALL be rendered as an ancestor of the shell's own `AnimatePresence`

---

## Acceptance Summary

| Requirement                      | Covered | Scenario Count |
| -------------------------------- | ------- | -------------- |
| useModeTransition Hook           | Yes     | 4              |
| Transition Choreography          | Yes     | 3              |
| Interruption by Rapid Toggle     | Yes     | 2              |
| Single ModeTransitionShell Owner | Yes     | 3              |

**Total**: 4 requirements, 12 scenarios.
