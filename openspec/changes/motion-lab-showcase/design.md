# Design: Motion Lab Showcase Page

## Technical Approach

Add a project-scoped route `/project/:projectId/motion-lab` inside `src/App.js`, nested under the existing `WorkspaceLayout`. The route renders a `MotionLab` page shell that exposes a reduced-motion simulation toggle and renders 11 isolated demo cards. Each demo imports spring presets from `src/components/ui/motion/motionPresets.js` and uses only `transform`/`opacity` animations. The showcase is self-contained: no terminal, pizarra, or existing motion helper files are modified.

> **Note on current state**: stubs for `MotionLab.jsx`, `motionPresets.js`, `DemoCard.jsx`, and `demos.jsx` already exist, and `App.js` currently exposes a top-level `/motion-lab` route. This design treats those stubs as the implementation baseline and documents the deltas needed to meet the spec.

## Architecture Decisions

| Decision                       | Options                                                                                                                | Trade-offs                                                                                                                 | Choice                                                                                                |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Route placement                | A. Project-scoped `/project/:projectId/motion-lab` under `WorkspaceLayout`<br>B. Keep existing top-level `/motion-lab` | A matches proposal/spec and reuses page chrome/sidebar context; B exists in current `App.js` but is out of scope per spec. | **A** — add child route under `/project/:projectId`, remove the top-level placeholder.                |
| Preset export shape            | A. Nested `{ spring: { intent: { transition, display } } }`<br>B. Flat `spring` + separate `springDisplay` object      | A matches spec contract and keeps transition/display co-located; B is what the current stub uses.                          | **A** — refactor `motionPresets.js` to the nested shape and update consumers.                         |
| Reduced-motion enforcement     | A. Rely on framer-motion `MotionConfig`<br>B. Add per-demo `useDemoTransition` helper                                  | A is automatic but timing is opaque; B guarantees ≤50 ms opacity-only across every demo.                                   | **B** — wrap demos with a small helper that returns a reduced fallback when reduced motion is active. |
| Resize/tab indicator animation | A. Use framer-motion `layout` prop on width/left<br>B. Animate `scaleX`/`x` transforms only                            | A animates layout properties and can thrash; B stays GPU-composited.                                                       | **B** — refactor resize-settle and tab-indicator demos to use transforms.                             |
| Demo vote tracking             | A. Local `useState` in `MotionLab`<br>B. Persistent backend storage                                                    | A is sufficient for a decision sandbox; B is out of scope.                                                                 | **A** — keep likes/dislikes in page state.                                                            |

## Data Flow

```
App.js route ──► WorkspaceLayout ──► Outlet ──► MotionLab
                                            │
                                            ├─► ReducedMotionToggle ──► MotionConfig / context
                                            │
                                            ├─► DemoCard (replayKey, vote state)
                                            │       │
                                            │       ▼
                                            │   Demo component (uses useDemoTransition)
                                            │
                                            ▼
                              motionPresets.js (spring presets)
```

- `MotionLab` owns `reducedMotionSim` and a `votes` map.
- `MotionConfig` receives `reducedMotion={reducedMotionSim ? 'always' : 'user'}`.
- `useDemoTransition(intent)` returns the preset transition or a 50 ms opacity-only fallback when reduced motion is active.
- `DemoCard` increments `replayKey` on replay; demos use the key to force re-mount or re-animate.

## File Changes

| File                                             | Action | Description                                                                                                                                      |
| ------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/App.js`                                     | Modify | Remove top-level `/motion-lab` route; add `<Route path="motion-lab" element={<MotionLab />} />` inside `/project/:projectId`.                    |
| `src/views/MotionLab.jsx`                        | Modify | Remove full-viewport styles so it renders inside `WorkspaceLayout`; add reduced-motion toggle, preset readout, and 11 demo cards.                |
| `src/components/ui/motion/motionPresets.js`      | Modify | Export nested shape `{ spring: { toggle, drag, sheet, open, settle, nav } }` where each entry is `{ transition, display }`.                      |
| `src/components/motion-lab/DemoCard.jsx`         | Modify | Add like/dislike controls and pass `isReduced` to the demo render prop.                                                                          |
| `src/components/motion-lab/demos.jsx`            | Modify | Update imports to nested preset shape; refactor resize-settle and tab-indicator to avoid layout-property animation; consume `useDemoTransition`. |
| `src/components/motion-lab/useDemoTransition.js` | Create | Hook that reads reduced-motion state and returns the correct transition.                                                                         |

## Interfaces / Contracts

```javascript
// motionPresets.js
export const spring = {
  toggle: {
    transition: { type: 'spring', stiffness: 500, damping: 30, mass: 0.8 },
    display: 'stiffness:500 damping:30 mass:0.8',
  },
  drag: {
    transition: { type: 'spring', stiffness: 350, damping: 28, mass: 0.6 },
    display: 'stiffness:350 damping:28 mass:0.6',
  },
  sheet: {
    transition: { type: 'spring', stiffness: 280, damping: 26, mass: 1.0 },
    display: 'stiffness:280 damping:26 mass:1.0',
  },
  open: {
    transition: { type: 'spring', stiffness: 320, damping: 26, mass: 0.9 },
    display: 'stiffness:320 damping:26 mass:0.9',
  },
  settle: {
    transition: { type: 'spring', stiffness: 180, damping: 22, mass: 1.0 },
    display: 'stiffness:180 damping:22 mass:1.0',
  },
  nav: {
    transition: { type: 'spring', stiffness: 260, damping: 28, mass: 0.9 },
    display: 'stiffness:260 damping:28 mass:0.9',
  },
};

// useDemoTransition.js
const REDUCED = { duration: 0.05, ease: 'linear' };
export function useDemoTransition(intent) {
  const isReduced = useReducedMotion() || useMotionLabReducedMotion();
  return isReduced ? REDUCED : spring[intent].transition;
}
```

## Per-Demo Design

| #   | Component             | Primitives                                          | Trigger / Replay                    | Preset               | Reduced Fallback   |
| --- | --------------------- | --------------------------------------------------- | ----------------------------------- | -------------------- | ------------------ |
| 1   | `DemoViewToView`      | `AnimatePresence`, `motion.div`, `custom` direction | prev/next buttons; replay re-mounts | `nav`                | opacity-only 50 ms |
| 2/3 | `DemoWindowOpenClose` | `AnimatePresence`, `motion.div`                     | open/close buttons; replay toggles  | `open`               | opacity-only 50 ms |
| 4   | `DemoResizeSettle`    | `motion.div` `scaleX`                               | toggle width button                 | `settle`             | opacity-only 50 ms |
| 5   | `DemoWorkspaceChange` | `AnimatePresence`, `motion.div`                     | prev/next buttons; replay re-mounts | `nav`                | opacity-only 50 ms |
| 6   | `DemoModalSheet`      | `AnimatePresence`, two `motion.div`s                | sheet/modal open/close              | `sheet` + `open`     | opacity-only 50 ms |
| 7   | `DemoTabIndicator`    | `motion.div` `x`/`scaleX`                           | tab click                           | `toggle`             | opacity-only 50 ms |
| 8   | `DemoStaggerList`     | `motion.div` variants                               | replay re-mounts parent             | `toggle` + stagger   | opacity-only 50 ms |
| 9   | `DemoSideCollapse`    | `motion.div` `x` + opacity                          | toggle button                       | `toggle`             | opacity-only 50 ms |
| 10  | `DemoDragSettle`      | `motion.div` drag, `useMotionValue`, `animate`      | drag release                        | `drag`               | snap instantly     |
| 11  | `DemoCrossfade`       | `AnimatePresence` `mode="wait"`                     | swap button; replay re-mounts       | opacity tween 200 ms | opacity-only 50 ms |

## Testing Strategy

| Layer       | What to Test                                                                                            | Approach                                    |
| ----------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Unit        | `motionPresets.js` export shape; `useDemoTransition` returns reduced transition when active             | Jest with `@testing-library/react-hooks`    |
| Integration | Route renders inside `WorkspaceLayout`; each demo replays without error                                 | React Testing Library render of `MotionLab` |
| E2E         | Navigate to `/project/:projectId/motion-lab`, toggle reduced motion, verify 60 fps and no layout thrash | Playwright + DevTools performance markers   |

## Migration / Rollout

No data migration. The change is additive except for removing the placeholder top-level `/motion-lab` route. Rollback: revert `src/App.js` and delete `src/views/MotionLab.jsx`, `src/components/ui/motion/motionPresets.js`, and `src/components/motion-lab/`.

## Open Questions

- [ ] Should the existing top-level `/motion-lab` route redirect to the project-scoped route, or be removed entirely?
- [ ] Should demo votes be persisted (localStorage) or remain transient for this iteration?
- [ ] Does `WorkspaceLayout` require `MotionLab` to consume `Outlet` context (e.g., `project`) for header labels?
