# Tasks: Motion Lab Showcase Page

## Review Workload Forecast

| Field                   | Value                                                                |
| ----------------------- | -------------------------------------------------------------------- |
| Estimated changed lines | 650–850                                                              |
| 400-line budget risk    | High                                                                 |
| Chained PRs recommended | Yes                                                                  |
| Suggested split         | Single PR with `size:exception`; user preflight authorized 800 lines |
| Delivery strategy       | single-pr-default                                                    |
| Chain strategy          | size-exception                                                       |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

### Suggested Work Units

| Unit | Goal                                          | Likely commit                                              |
| ---- | --------------------------------------------- | ---------------------------------------------------------- |
| 1    | Preset module + reduced-motion helper + tests | `feat(motion-lab): spring presets and reduced-motion hook` |
| 2    | Demo cards + 11 demos                         | `feat(motion-lab): demo cards and isolated motion demos`   |
| 3    | Page shell + route wiring + verification      | `feat(motion-lab): project-scoped route and page shell`    |

## Phase 1: Foundation & Presets

- [x] 1.1 RED: Write failing tests asserting `motionPresets.js` exports `{ spring: { intent: { transition, display } } }` for all six intents.
- [x] 1.2 GREEN: Refactor `src/components/ui/motion/motionPresets.js` to nested shape; remove flat `springDisplay`/`springIntent` exports.
- [x] 1.3 RED: Write failing tests for `useDemoTransition` returning a 50 ms opacity-only fallback when reduced motion is active.
- [x] 1.4 GREEN: Create `src/components/motion-lab/useDemoTransition.js` hook reading `MotionConfig` and `useReducedMotion`.
- [x] 1.5 Create `src/components/motion-lab/ReducedMotionToggle.jsx` component that updates the shared reduced-motion simulation state.

## Phase 2: Demo Components

- [x] 2.1 Refactor `src/components/motion-lab/DemoCard.jsx` to add like/dislike controls and pass `isReduced` to the `render` prop.
- [x] 2.2 Refactor `src/components/motion-lab/demos.jsx`: import nested presets, consume `useDemoTransition`, split into `DemoWindowOpen` and `DemoWindowClose`, rename `DemoViewToView` → `DemoViewTransition` and `DemoResizeSettle` → `DemoAutoFitSettle`, refactor resize to `scaleX` and tab indicator to `x`/`scaleX`.

## Phase 3: Page Shell & Route

- [x] 3.1 Refactor `src/views/MotionLab.jsx` to render inside `WorkspaceLayout` (drop full-viewport styles), integrate `ReducedMotionToggle`, manage per-demo `votes` state, and render all 11 demo cards.
- [x] 3.2 Modify `src/App.js`: remove top-level `/motion-lab` route; add `<Route path="motion-lab" element={<MotionLab />} />` inside `/project/:projectId`.

## Phase 4: Verification

- [x] 4.1 Run `npm test`, `npm run build`, and ESLint on changed files; fix failures.
- [x] 4.2 Navigate to `/project/:projectId/motion-lab`, verify all 11 demos render, replay re-runs animations, and reduced-motion toggle collapses motion to instant or ≤50 ms opacity-only.

## Phase 5: Amplified Motion Mode

- [x] 5.1 RED: Write failing tests asserting `motionPresets.js` exports an `amplified` preset set with the same six intents and `{ transition, display }` shape.
- [x] 5.2 GREEN: Add `amplified` presets to `src/components/ui/motion/motionPresets.js` with looser damping and higher mass.
- [x] 5.3 RED: Write failing tests for `useDemoTransition` returning `amplified[intent]` in amplified mode and the ≤50ms fallback in reduced mode.
- [x] 5.4 GREEN: Evolve `ReducedMotionContext` into `MotionModeContext` (`'reduced' | 'normal' | 'amplified'`) and update `useDemoTransition` to read the mode.
- [x] 5.5 RED: Write failing tests for a 3-way `MotionModeToggle` segmented control.
- [x] 5.6 GREEN: Replace `ReducedMotionToggle` with `MotionModeToggle.jsx` and integrate it at the top of `MotionLab.jsx`.
- [x] 5.7 GREEN: Add `useDemoTransform(base, amplified)` helper and plumb amplified transform displacement into the demos that use hardcoded scale/translate values.
- [x] 5.8 GREEN: Update `demos.jsx` registry config readout to be mode-aware and `MotionLab.jsx` preset readout to show spring or amplified presets.
- [x] 5.9 Run `npm test` for motion-lab suites, ESLint on changed files, and `npx next build`; fix failures.
