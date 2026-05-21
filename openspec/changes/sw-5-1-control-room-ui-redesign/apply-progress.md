## Apply Progress — SW-5.1A

### Scope
- Real apply slice in `/tmp/opencode/devhub-sw-5-1a`
- Batch merged prior Phase 1 completion with Phase 2 Control Room composition work

### Completed
- [x] 1.1 Added RED-first unit coverage for `composeControlRoomSnapshot` authority precedence and selectors.
- [x] 1.2 Extended Control Room status helpers in `src/lib/operations/contracts.js`.
- [x] 1.3 Implemented `composeControlRoomSnapshot` plus read-model selectors in `src/lib/operations/swarmControl.js`.
- [x] 1.4 Added reusable snapshot fixture builder under `src/lib/operations/__tests__/fixtures/`.
- [x] 2.1 Added RED-first React coverage for snapshot-only Control Room rendering in `src/views/__tests__/SwarmControl.test.jsx`.
- [x] 2.2 Created focused read-only Control Room panels under `src/components/control-room/`.
- [x] 2.3 Replaced legacy mixed-telemetry `SwarmControl.jsx` with snapshot-first Control Room composition and UI-only presentation state.
- [x] 3.1 Added RED-first stale/degraded/unavailable/approval-pending scenario coverage in unit and integration suites.
- [x] 3.2 Rendered authority, freshness, evidence refs, and missing-source messaging across Control Room trust surfaces.
- [x] 3.3 Kept concurrency and queue metrics snapshot-owned and marked risky outcomes unapplied until approval evidence exists.
- [x] 3.4 Demoted live activity to a secondary hint so canonical status remains durable-snapshot owned.

### TDD Cycle Evidence
| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 | `src/lib/operations/__tests__/swarmControl.test.js` | Unit | N/A (new file) | ✅ Written first | ✅ Passed via targeted Jest run | ✅ 3 cases | ✅ Fixture extraction in 1.4 |
| 1.2 | `src/lib/operations/__tests__/swarmControl.test.js` | Unit | N/A (new behavior in existing file) | ✅ Covered by failing status assertions | ✅ Passed via targeted Jest run | ✅ Authority + degraded + empty cases | ➖ None needed |
| 1.3 | `src/lib/operations/__tests__/swarmControl.test.js` | Unit | N/A (new behavior in existing file) | ✅ Covered by failing selector assertions | ✅ Passed via targeted Jest run | ✅ Header/agents/workspaces/runs/approvals/diagnostics/errors | ➖ None needed |
| 1.4 | `src/lib/operations/__tests__/swarmControl.test.js` | Unit | ✅ Related `SwarmQueuePanel` suite green before/after | ✅ Fixture consumer updated first | ✅ Passed via targeted Jest run | Triangulation skipped: structural fixture extraction | ✅ Builder created |
| 2.1 | `src/views/__tests__/SwarmControl.test.jsx` | Integration | N/A (new file) | ✅ Written first | ✅ Passed via targeted Jest run | ✅ Snapshot render + local presentation-only state case | ✅ Shared panel extraction in 2.2/2.3 |
| 2.2 | `src/views/__tests__/SwarmControl.test.jsx` | Integration | N/A (new components) | ✅ Covered by missing component imports/render failures | ✅ Passed via targeted Jest run | ✅ Header/agents/workspaces/runs/approvals/diagnostics coverage | ✅ Panel split into focused components |
| 2.3 | `src/views/__tests__/SwarmControl.test.jsx` | Integration | N/A (full file replacement) | ✅ Covered by failing composition assertions | ✅ Passed via targeted Jest run | ✅ Layout toggle preserves canonical header counts | ✅ Legacy view reduced to read-only composition |
| 3.1 | `src/lib/operations/__tests__/swarmControl.test.js`, `src/views/__tests__/SwarmControl.test.jsx` | Unit + Integration | ✅ Both related suites green before changes | ✅ Written first | ✅ Passed via targeted Jest runs | ✅ Stale + degraded + unavailable + pending-approval cases | ✅ Shared trust messaging extracted into panel utils |
| 3.2 | `src/views/__tests__/SwarmControl.test.jsx` | Integration | ✅ View suite green before changes | ✅ Covered by missing-source assertions first | ✅ Passed via targeted Jest run | ✅ Header + runs + approvals + diagnostics trust metadata cases | ✅ Reused shared missing-source formatting |
| 3.3 | `src/lib/operations/__tests__/swarmControl.test.js`, `src/views/__tests__/SwarmControl.test.jsx` | Unit + Integration | ✅ Relevant suites green before changes | ✅ Covered by canonical count and pending outcome assertions first | ✅ Passed via targeted Jest runs | ✅ Active/max + queue depth + unapplied risky outcome cases | ➖ None needed |
| 3.4 | `src/views/__tests__/SwarmControl.test.jsx` | Integration | ✅ View suite green before changes | ✅ Covered by live activity secondary-hint assertion first | ✅ Passed via targeted Jest run | Triangulation skipped: hint-only presentation rule piggybacks on degraded scenario | ✅ Live hint formatting isolated in utils |

### Test Notes
- `npm test -- src/lib/operations/__tests__/swarmControl.test.js` could not run directly in this hidden worktree because local `node_modules` is absent.
- Targeted Jest execution succeeded by reusing canonical repo dependencies through `NODE_PATH="/home/matias/ArxonLabs/devhub/node_modules"`.
- Targeted React view execution emits an existing React/Jest warning about the outdated JSX transform in repo test tooling, but assertions pass.
- Phase 3 kept the same dependency reuse path and targeted only the touched unit + integration suites per strict TDD.

### Files Changed
- `src/lib/operations/contracts.js`
- `src/lib/operations/swarmControl.js`
- `src/lib/operations/__tests__/swarmControl.test.js`
- `src/lib/operations/__tests__/fixtures/controlRoomSnapshot.js`
- `src/views/SwarmControl.jsx`
- `src/views/__tests__/SwarmControl.test.jsx`
- `src/components/control-room/utils.js`
- `src/components/control-room/ControlRoomHeader.jsx`
- `src/components/control-room/AgentsClaimsPanel.jsx`
- `src/components/control-room/WorkspacesPanel.jsx`
- `src/components/control-room/RunsArtifactsPanel.jsx`
- `src/components/control-room/ApprovalsErrorsPanel.jsx`
- `src/components/control-room/DiagnosticOverlay.jsx`
- `openspec/changes/sw-5-1-control-room-ui-redesign/tasks.md`
- `openspec/changes/sw-5-1-control-room-ui-redesign/apply-progress.md`

### Remaining
- 2.4 remains open intentionally: `SwarmQueuePanel.jsx` and `MCPStatusPanel.jsx` were not required for the Control Room path in this batch, so they were left untouched to avoid widening scope.
- Fetched runtime path still tolerates absent `control_room_input` payload and falls back to empty composed snapshot until backend slice exposes it.
- Phase 4 still needs explicit regressions proving runtime mirrors can never override durable truth and any remaining legacy authoritative leaks must be removed.

### Risks / Notes
- Hidden worktree cannot execute plain `npm test` without borrowing canonical repo dependencies.
- Current `SwarmControl.jsx` was replaced with a read-only composition shell, so any legacy mutating controls removed here may still need parity review in later slices.
- Missing-source messaging now depends on operation-layer labels (`approval evidence`, `telegram snapshot`, etc.); future slices should reuse these labels instead of inventing panel-local wording.
