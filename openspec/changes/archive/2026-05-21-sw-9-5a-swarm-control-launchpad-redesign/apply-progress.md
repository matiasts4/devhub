# Apply Progress: SW-9.5A Swarm Control Launchpad Redesign

## Implementation Progress

**Change**: sw-9-5a-swarm-control-launchpad-redesign  
**Mode**: Strict TDD

### Completed Tasks

- [x] 1.1 RED — Selector tests for active/idle primary surface, CTA disable reasons, and launch catalog recommendation order.
- [x] 1.2 GREEN — Implemented `selectSwarmControlPrimarySurface()` and `selectSwarmLaunchCatalog()` with snapshot-derived stats and local V1 catalog metadata.
- [x] 1.3 REFACTOR — Extracted mode/catalog helper functions inside `src/lib/operations/swarmControl.js`.
- [x] 2.1 RED — Added view tests for active swarm tower ordering and CTA priority.
- [x] 2.2 GREEN — Added `SwarmPrimarySurface.jsx` and `ActiveSwarmTowerPanel.jsx`.
- [x] 2.3 REFACTOR — Tightened active hero copy/stats hierarchy with reusable surface card primitives.
- [x] 3.1 RED — Added idle launchpad tests for template-first hierarchy and bounded type prep copy.
- [x] 3.2 GREEN — Added `LaunchpadTemplatesPanel.jsx`.
- [x] 3.3 GREEN — Added `SwarmTypeCatalogPanel.jsx`.
- [x] 3.4 REFACTOR — Added shared `SwarmSurfaceCard.jsx` primitives across new launchpad surfaces.
- [x] 4.1 RED — Added layout/order tests for primary-first composition and secondary panel placement.
- [x] 4.2 GREEN — Recomposed `SwarmControl.jsx` around the new primary surface without changing mutation seams.
- [x] 4.3 REFACTOR — Reordered secondary panels to queue/approvals -> mission/evidence -> agents/workspaces/runs -> diagnostics.
- [x] 5.1 Verification — Targeted Jest tests green.
- [x] 5.2 Verification — Playwright smoke updated with bounded active-tower assertions and green.

### Files Changed

| File                                                                          | Action   | What Was Done                                                                            |
| ----------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------- |
| `src/lib/operations/swarmControl.js`                                          | Modified | Added primary surface + launch catalog selectors and helper functions.                   |
| `src/lib/operations/__tests__/swarmControl.test.js`                           | Modified | Added selector TDD coverage for active/idle hero and catalog contracts.                  |
| `src/views/SwarmControl.jsx`                                                  | Modified | Rebuilt page composition around hero/launchpad-first hierarchy.                          |
| `src/views/__tests__/SwarmControl.test.jsx`                                   | Modified | Added UI ordering tests for active tower, idle launchpad, and secondary panel placement. |
| `src/components/control-room/SwarmPrimarySurface.jsx`                         | Created  | Switches active vs idle top-of-page primary surface.                                     |
| `src/components/control-room/ActiveSwarmTowerPanel.jsx`                       | Created  | Renders active swarm hero/tower summary.                                                 |
| `src/components/control-room/LaunchpadTemplatesPanel.jsx`                     | Created  | Renders template-first idle launchpad cards.                                             |
| `src/components/control-room/SwarmTypeCatalogPanel.jsx`                       | Created  | Renders bounded swarm type prep cards.                                                   |
| `src/components/control-room/SwarmSurfaceCard.jsx`                            | Created  | Shared visual primitives for new surfaces.                                               |
| `tests/e2e/04_swarm_control.spec.ts`                                          | Modified | Added bounded hero assertions and locator disambiguation for strict mode.                |
| `openspec/changes/sw-9-5a-swarm-control-launchpad-redesign/tasks.md`          | Modified | Marked all change tasks complete.                                                        |
| `openspec/changes/sw-9-5a-swarm-control-launchpad-redesign/apply-progress.md` | Created  | Persisted hybrid apply-progress artifact for verify/traceability.                        |

### TDD Cycle Evidence

| Task    | Test File                                                                         | Layer             | Safety Net | RED                | GREEN     | TRIANGULATE                           | REFACTOR                         |
| ------- | --------------------------------------------------------------------------------- | ----------------- | ---------- | ------------------ | --------- | ------------------------------------- | -------------------------------- |
| 1.1-1.3 | `src/lib/operations/__tests__/swarmControl.test.js`                               | Unit              | ✅ 23/23   | ✅ Written         | ✅ Passed | ✅ 5 new cases                        | ✅ Helpers extracted             |
| 2.1-2.3 | `src/views/__tests__/SwarmControl.test.jsx`                                       | Integration       | ✅ 32/32   | ✅ Written         | ✅ Passed | ✅ active ordering + CTA cases        | ✅ visual primitives tightened   |
| 3.1-3.4 | `src/views/__tests__/SwarmControl.test.jsx`                                       | Integration       | ✅ 32/32   | ✅ Written         | ✅ Passed | ✅ idle ordering + bounded prep cases | ✅ shared surface card primitive |
| 4.1-4.3 | `src/views/__tests__/SwarmControl.test.jsx`                                       | Integration       | ✅ 32/32   | ✅ Written         | ✅ Passed | ✅ active/idle ordering variants      | ✅ section ordering cleaned      |
| 5.1-5.2 | `src/views/__tests__/SwarmControl.test.jsx`, `tests/e2e/04_swarm_control.spec.ts` | Integration + E2E | N/A        | ✅ Written earlier | ✅ Passed | ✅ jest + smoke path                  | ➖ None needed                   |

### Test Summary

- **Total tests written**: 7 net new assertions/scenarios across selector + UI + smoke coverage
- **Total tests passing**: 62 Jest tests + 1 Playwright smoke (`1 skipped` recovery gate existing behavior)
- **Layers used**: Unit (28), Integration (34), E2E (1 passed / 1 skipped)
- **Approval tests**: None — no approval-style refactor task required
- **Pure functions created**: 11 helper functions in `swarmControl.js`

### Deviations from Design

None — implementation matches design. CTA stayed anchor-only, preserving existing mutation seams.

### Issues Found

- Playwright strict mode became ambiguous after the new hero duplicated durable evidence/copy; bounded `.first()` locators fixed the smoke without changing UX.
- Jest view tests still emit the pre-existing outdated JSX transform warning; not introduced by this change.

### Remaining Tasks

- [ ] None for `sw-9-5a-swarm-control-launchpad-redesign`

### Status

15/15 tasks complete. Ready for verify.
