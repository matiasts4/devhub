# Proposal: SW-9.5A end-to-end demo prompt → handoff

## Intent

Package the existing SW-9.1A–SW-9.4A seams into one reproducible acceptance demo from prompt intake to QA/PR handoff. Goal: prove the platform works end-to-end with deterministic setup, visible checkpoints, and portable evidence.

## Scope

### In Scope

- Deterministic seeded scenario covering prompt → team → terminals → dispatch → approvals → checks → QA/PR handoff.
- Demo glue/harness that drives existing APIs, MCP tools, and UI checkpoints without redefining their contracts.
- Acceptance checklist plus evidence bundle location/format for logs, snapshots, screenshots, and handoff notes.

### Out of Scope

- Changes to queue, lease, terminal, approval, or supervisor primitives from SW-9.1A–SW-9.4A.
- New durable schema, new orchestration engine, or broad MCP surface redesign.

## Capabilities

### New Capabilities

- `swarm-demo-handoff`: reproducible demo harness, seeded scenario, checklist, and evidence bundle for prompt-to-handoff acceptance.

### Modified Capabilities

- None.

## Approach

Add a thin demo layer that composes existing seams: headless prompt intake, team dispatch, terminal/runtime status, approval snapshots, checks, and queue/handoff UI. Define fixed IDs/fixtures, standard evidence outputs, and a pass/fail walkthrough so acceptance can be replayed locally and in QA without inventing demo-only platform behavior.

## Affected Areas

| Area                                                          | Impact   | Description                                                           |
| ------------------------------------------------------------- | -------- | --------------------------------------------------------------------- |
| `openspec/changes/sw-9-5a-end-to-end-demo-prompt-to-handoff/` | New      | Proposal/spec/design/tasks for the demo package                       |
| `devhub-mcp/tests/integration/`                               | Modified | Seeded end-to-end acceptance harness and scenario coverage            |
| `src/app/api/agenthub/headless/route.js`                      | Modified | Reuse as prompt-entry seam for deterministic demo kickoff             |
| `src/app/api/agenthub/operations/health/route.js`             | Modified | Reuse snapshot seam for curated acceptance evidence                   |
| `src/views/SwarmControl.jsx`                                  | Modified | Demo-visible checkpoints for dispatch, approvals, checks, and handoff |

## Risks

| Risk                                   | Likelihood | Mitigation                                                    |
| -------------------------------------- | ---------- | ------------------------------------------------------------- |
| Demo drifts from real runtime behavior | Med        | Only compose existing seams; no parallel demo logic           |
| Flaky evidence output                  | Med        | Use deterministic seeds, stable IDs, and fixed artifact paths |
| Scope creep into platform redesign     | High       | Treat earlier SW-9.x primitives as fixed dependencies         |

## Rollback Plan

Remove the demo harness, seeded fixtures, and checklist artifacts. Keep existing runtime, approval, and handoff primitives untouched so rollback is file-level and low risk.

## Dependencies

- SW-9.1A queue/lease recovery
- SW-9.2A team dispatch semantics
- SW-9.3A terminal lifecycle/runtime truth
- SW-9.4A approval/supervisor gating

## Success Criteria

- [ ] One documented scenario can be replayed from prompt submission to QA/PR handoff with deterministic seeds.
- [ ] Acceptance output includes checklist status plus a canonical evidence bundle path.
- [ ] Demo coverage reuses existing seams and introduces no new platform primitive contract.
