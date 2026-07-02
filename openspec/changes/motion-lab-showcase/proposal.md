# Proposal: Motion Lab Showcase Page

## Intent

DevHub has three parallel motion systems and scattered inline transitions. Before unifying them we need a visual decision tool where the team can compare candidate animations side-by-side and approve or reject each feel. This page creates that sandbox without touching terminal or pizarra code.

## Scope

### In Scope

- New route `/project/:projectId/motion-lab` in `src/App.js`.
- New page view `src/views/MotionLab.jsx`.
- New `src/components/ui/motion/motionPresets.js` with iOS-style spring presets.
- 11 isolated demo cards, each with title, usage note, live preview, config readout, replay, and like/dislike controls.
- Reduced-motion simulation toggle on the page.

### Out of Scope

- Refactoring existing motion files (`motion-tokens.js`, `MotionProvider.jsx`, helpers).
- Terminal or pizarra motion fixes.
- Propagating chosen presets to the rest of the app.

## Capabilities

### New Capabilities

- `motion-lab-showcase`: Interactive route, 11 motion demos, spring preset module, and reduced-motion simulation.

### Modified Capabilities

- None

## Approach

Add one project-scoped route following the existing `WorkspaceLayout` convention. Build self-contained demo components that import only the new `motionPresets.js` and Framer Motion. Presets export both a Framer Motion transition object and a human-readable config string for the UI. Each demo uses only `transform`/`opacity`; no layout-property animation. Reduced motion collapses motion to instant or ≤50 ms opacity-only.

## Affected Areas

| Area                                        | Impact   | Description                                    |
| ------------------------------------------- | -------- | ---------------------------------------------- |
| `src/App.js`                                | Modified | Add `/project/:projectId/motion-lab` route.    |
| `src/views/MotionLab.jsx`                   | New      | Showcase page shell and reduced-motion toggle. |
| `src/components/ui/motion/motionPresets.js` | New      | Shared spring preset definitions.              |
| `src/components/motion-lab/*`               | New      | 11 isolated demo cards.                        |

## Risks

| Risk                                 | Likelihood | Mitigation                                           |
| ------------------------------------ | ---------- | ---------------------------------------------------- |
| Route convention mismatch            | Low        | Mirror existing `WorkspaceLayout` child routes.      |
| Framer Motion v12 API drift          | Low        | Use stable `transition`/`AnimatePresence` APIs only. |
| Reduced-motion toggle missed in demo | Med        | Wrap each demo in a shared motion context/provider.  |

## Rollback Plan

Remove the added route from `src/App.js` and delete `src/views/MotionLab.jsx`, `src/components/ui/motion/motionPresets.js`, and `src/components/motion-lab/`. No other files are touched, so rollback is a single revert.

## Dependencies

- Framer Motion ^12.38 (already installed).

## Success Criteria

- [ ] `/project/:projectId/motion-lab` renders without errors.
- [ ] All 11 demos can be triggered and replayed.
- [ ] Each demo displays its spring config readout.
- [ ] Reduced-motion toggle disables or shortens motion across every demo.
- [ ] No files under `src/components/terminal/`, `src/lib/pizarra/`, or existing motion helpers are modified.
