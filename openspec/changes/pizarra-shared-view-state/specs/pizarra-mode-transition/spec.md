# Pizarra Mode Transition Specification

## Purpose

Define the choreographed animation that plays when the user toggles between workspace mode and pizarra mode via the right-dock `maximizedView` state. The transition SHALL be fluid (cross-fade + slide + scale) and SHALL run for 220-340ms total. Terminal and browser surfaces SHALL NOT unmount during the transition; only the React chrome animates around them. The user SHALL be able to interrupt the transition by toggling back quickly.

---

## Requirements

### Requirement: useModeTransition Hook

The system SHALL provide a `useModeTransition(maximizedView)` hook that orchestrates the workspace-to-pizarra (and pizarra-to-workspace) transition. The hook SHALL return `{ phase: 'idle' | 'leaving' | 'entering', progress: 0..1 }`.

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

---

### Requirement: Native VTE and Browser Surfaces Stay Mounted

During the transition, terminal XTerm instances and browser iframe/webview elements SHALL remain mounted and SHALL NOT reload. Only the React chrome (headers, tab strips, dock entries) animates.

#### Scenario: XTerm scrollback preserved through transition

- GIVEN a terminal has 5000 lines of scrollback and a cursor at row 200
- WHEN the user toggles mode
- THEN through the leaving + entering phases, the XTerm DOM node SHALL remain attached
- AND the XTerm buffer SHALL NOT be reset or re-rendered
- AND the cursor position SHALL be unchanged after the transition

#### Scenario: Active browser tab does not reload

- GIVEN a browser surface has 3 tabs with `t2` active at `https://app.example.com/dashboard`
- WHEN the user toggles mode
- THEN the iframe / webview for `t2` SHALL NOT navigate
- AND `t2.url` SHALL remain `https://app.example.com/dashboard`
- AND the tab strip chrome MAY cross-fade; the underlying webview SHALL NOT

---

### Requirement: Animation Library Selection

The transition SHALL be implemented with exactly one of: GSAP (if already present as a dependency) or framer-motion. The choice SHALL be made once and documented in `surfaceMotion.js` as a `MOTION_DRIVER` export.

#### Scenario: Single driver is exported

- GIVEN `surfaceMotion.js` is the source of motion tokens
- WHEN a developer reads the file
- THEN it SHALL export a single `MOTION_DRIVER` constant (`'gsap' | 'framer-motion'`)
- AND `useModeTransition` SHALL use that driver exclusively
- AND no other motion library SHALL be used by the transition

#### Scenario: Driver selection respects existing dependency

- GIVEN `package.json` lists `gsap` as a dependency but not `framer-motion`
- WHEN the transition is implemented
- THEN `MOTION_DRIVER` SHALL be set to `'gsap'`
- AND the implementation SHALL use `gsap.timeline()` (or `gsap.to()`) to drive the animation
- AND no `framer-motion` import SHALL appear in the transition code

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

#### Scenario: Debounce window for rapid toggles

- GIVEN the user toggles `maximizedView` three times in 100ms
- WHEN the debounce window is 200ms
- THEN only the LAST `maximizedView` value SHALL be applied to the React tree
- AND the visible transition SHALL be a single coherent animation, not a stuttering sequence

---

### Requirement: Reduced Motion Respect

The system SHALL respect the user's `prefers-reduced-motion` setting. When reduced motion is enabled, the transition SHALL collapse to a near-instant cross-fade (<= 50ms total) with no slide or scale, while still preserving the no-unmount contract for surfaces.

#### Scenario: Reduced motion collapses duration

- GIVEN the OS reports `prefers-reduced-motion: reduce`
- WHEN the user toggles mode
- THEN the transition SHALL complete in <= 50ms
- AND the chrome SHALL cross-fade only (no translate, no scale, no rotation)
- AND terminal and browser surfaces SHALL STILL remain mounted and intact

#### Scenario: Full motion default

- GIVEN the OS does NOT report reduced motion (or the user has disabled the setting in DevHub)
- WHEN the user toggles mode
- THEN the full choreography SHALL run (fade + slide + scale)
- AND the durations SHALL match the `DUR.base` + `DUR.enter` sum

---

## Acceptance Summary

| Requirement                                  | Covered | Scenario Count |
| -------------------------------------------- | ------- | -------------- |
| useModeTransition Hook                       | Yes     | 3              |
| Transition Choreography                      | Yes     | 2              |
| Native VTE and Browser Surfaces Stay Mounted | Yes     | 2              |
| Animation Library Selection                  | Yes     | 2              |
| Interruption by Rapid Toggle                 | Yes     | 3              |
| Reduced Motion Respect                       | Yes     | 2              |
