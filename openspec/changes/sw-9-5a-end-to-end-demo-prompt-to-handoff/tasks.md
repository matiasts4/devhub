# Tasks: SW-9.5A end-to-end demo prompt → handoff

## Phase 1: Seed and failing acceptance specs

- [ ] 1.1 Create `devhub-mcp/tests/fixtures/swarmDemoHandoffSeed.js` with stable scenario ID, prompt payload, checkpoint order, and canonical evidence path helpers for `sw-9-5a-demo`.
- [ ] 1.2 RED: add `devhub-mcp/tests/integration/swarm-demo-handoff.test.js` assertions for seeded prompt→dispatch→approval→checks→handoff order and canonical bundle path, composing existing seams only.
- [ ] 1.3 RED: extend `tests/agenthub/api/operations-health.test.js` to expect checklist projection, explicit `missing` attachments, and no new primitive contract in the health snapshot.
- [ ] 1.4 RED: extend `src/views/__tests__/SwarmControl.test.jsx` to expect demo checkpoint labels, handoff readiness, and partial-failure visibility from provided state.

## Phase 2: Harness and API implementation

- [ ] 2.1 GREEN: implement `devhub-mcp/tests/integration/swarm-demo-handoff.test.js` with `createTestHarness` seeding deterministic project/task/workspace/run/approval records and writing checklist/manifest outputs.
- [ ] 2.2 GREEN: update `src/app/api/agenthub/headless/route.js` to tag audit/session output with seeded scenario metadata only, preserving current prompt and runtime contracts.
- [ ] 2.3 GREEN: update `src/app/api/agenthub/operations/health/route.js` to derive ordered demo checkpoints and canonical evidence-bundle manifest from existing mission/run/approval evidence, marking missing items explicitly.

## Phase 3: Operator-view wiring

- [ ] 3.1 GREEN: update `src/views/SwarmControl.jsx` to render prompt→dispatch→approval→checks→handoff checkpoint state from the health payload, without adding a demo-only dashboard.
- [ ] 3.2 REFACTOR: keep `src/views/__tests__/SwarmControl.test.jsx` and `tests/agenthub/api/operations-health.test.js` aligned with shared checkpoint names/statuses so API and UI assert the same contract.

## Phase 4: Verification and evidence hardening

- [ ] 4.1 REFACTOR: finalize `devhub-mcp/tests/integration/swarm-demo-handoff.test.js` so the manifest references existing evidence refs plus `health.json`, optional `swarm-control.png`, and `handoff.md` under the canonical bundle path.
- [ ] 4.2 Verify partial-failure behavior in `devhub-mcp/tests/integration/swarm-demo-handoff.test.js`, `tests/agenthub/api/operations-health.test.js`, and `src/views/__tests__/SwarmControl.test.jsx` so one failed checkpoint does not hide the rest of the checklist.
