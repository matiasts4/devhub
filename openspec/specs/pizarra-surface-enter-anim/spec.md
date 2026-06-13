# pizarra-surface-enter-anim Specification

## Purpose

Define the visual contract for the enter animation that runs when a new terminal or browser surface is spawned on the pizarra live-surface layer. The animation SHALL be subtle, opacity-only, and fully respect the user's `prefers-reduced-motion` preference. The animation is owned by the `surfaceMotion.js` token module and applied by every surface renderer.

---

## Requirements

### Requirement: Surface Enter Keyframes

The system SHALL provide two CSS keyframe animations exported from `@/lib/pizarra/surfaceMotion`:

| Token                        | Effect                                     | Duration | Easing                           | Use when                                                                                   |
| ---------------------------- | ------------------------------------------ | -------- | -------------------------------- | ------------------------------------------------------------------------------------------ |
| `SURFACE_ENTER_ANIMATION`    | opacity 0→1, translateY 18→0, scale 0.92→1 | 340ms    | `cubic-bezier(0.22, 1, 0.36, 1)` | Inline chrome that does NOT host native IPC-positioned overlays                            |
| `SURFACE_ENTER_OPACITY_ONLY` | opacity 0→1 only                           | 340ms    | `cubic-bezier(0.22, 1, 0.36, 1)` | Surfaces that host native VTE / WebKitGTK overlays (CanvasTerminal, PizarraBrowserSurface) |

#### Scenario: Keyframes are injected once

- GIVEN the module is loaded
- WHEN `ensureSurfaceMotionKeyframes()` is called
- THEN exactly one `<style id="pizarra-surface-motion-keyframes">` element SHALL exist in `document.head`
- AND it SHALL contain `@keyframes pizarraSurfaceEnter` AND `@keyframes pizarraSurfaceEnterOpacity`
- AND subsequent calls to `ensureSurfaceMotionKeyframes()` SHALL be no-ops (idempotent)

#### Scenario: Tokens are string-form CSS animation values

- GIVEN `surfaceMotion.js` is loaded
- WHEN `SURFACE_ENTER_OPACITY_ONLY` is read
- THEN it SHALL be a string of the form `pizarraSurfaceEnterOpacity 340ms cubic-bezier(0.22, 1, 0.36, 1) both`
- AND it SHALL be directly assignable to an element's `style.animation` property

---

### Requirement: All Live Surfaces Apply the Enter Animation

Every terminal and browser surface that mounts inside `PizarraLiveSurfaceLayer` SHALL apply `SURFACE_ENTER_OPACITY_ONLY` to its inner frame at mount. The positioned outer wrapper (the one sized to the projected canvas rect) SHALL NOT receive an `animation` property.

#### Scenario: New terminal mount triggers enter animation

- GIVEN a user drops a new terminal onto the pizarra
- WHEN the `LiveSurfaceItem` for that terminal commits
- THEN the inner frame (the element hosting the chrome shadow/border, not the positioned wrapper) SHALL have `style.animation` set to `SURFACE_ENTER_OPACITY_ONLY`
- AND the animation SHALL run exactly once per mount (`both` fill mode prevents a flash of the un-faded state)

#### Scenario: New browser mount triggers enter animation

- GIVEN a user drops a new browser surface onto the pizarra
- WHEN the `LiveSurfaceItem` for that browser commits
- THEN its inner frame SHALL have `style.animation` set to `SURFACE_ENTER_OPACITY_ONLY`
- AND the position wrapper SHALL NOT animate

#### Scenario: Positioned wrapper never animates

- GIVEN any mounted live surface
- WHEN the outermost positioned div (the one with `position: absolute`, `left`, `top`, `width`, `height`) is inspected
- THEN its `style.animation` SHALL be `''` or undefined
- AND no CSS `transform` SHALL be applied to it

---

### Requirement: Reduced Motion Override

When `prefers-reduced-motion: reduce` is active, the surface enter animation SHALL collapse to an instant or near-instant fade. The total visual time SHALL be `≤ 50ms`. The chrome SHALL be visible and interactive after that window.

#### Scenario: Reduced motion collapses enter to short fade

- GIVEN the OS reports `prefers-reduced-motion: reduce`
- WHEN a new live surface mounts
- THEN the `surfaceMotion.js` `@media (prefers-reduced-motion: reduce)` block SHALL be in effect
- AND the enter animation SHALL resolve within `≤ 50ms`
- AND the chrome SHALL NOT slide or scale

#### Scenario: Full motion default

- GIVEN the OS does NOT report reduced motion
- WHEN a new live surface mounts
- THEN the full `SURFACE_ENTER_OPACITY_ONLY` animation SHALL run (opacity 0 → 1 over 340ms with `cubic-bezier(0.22, 1, 0.36, 1)`)

#### Scenario: Animation respects the in-document keyframe override

- GIVEN `ensureSurfaceMotionKeyframes()` has injected the reduced-motion `@media` block
- WHEN the browser evaluates the animation
- THEN it SHALL use the reduced-motion keyframes (opacity only, instant)
- AND it SHALL NOT use the translate/scale keyframes

---

## Acceptance Summary

| Requirement                                 | Covered | Scenario Count |
| ------------------------------------------- | ------- | -------------- |
| Surface Enter Keyframes                     | Yes     | 2              |
| All Live Surfaces Apply the Enter Animation | Yes     | 3              |
| Reduced Motion Override                     | Yes     | 3              |

**Total**: 3 requirements, 8 scenarios.
