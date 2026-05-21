# Design: SW-9.5A end-to-end demo prompt → handoff

## Technical Approach

Implement SW-9.5A as a deterministic acceptance harness layered on current seams: `headless/route.js` starts the seeded prompt session, DevHub MCP integration fixtures create durable mission/workspace/run state, `operations/health/route.js` assembles authoritative checkpoints, and `SwarmControl.jsx` renders the same handoff path QA will inspect. The harness writes one manifest that points to existing evidence instead of duplicating runtime truth.

## Architecture Decisions

| Decision             | Options                                                            | Choice                                                                                     | Rationale                                                                                                                                                |
| -------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Demo driver location | New external script; Jest integration harness                      | Jest integration harness under `devhub-mcp/tests/integration/`                             | Matches existing durable-tool tests via `createTestHarness`, keeps seeded DB control, and produces replayable acceptance without adding runtime surface. |
| Prompt kickoff seam  | New demo endpoint; reuse `src/app/api/agenthub/headless/route.js`  | Reuse headless route with stable inputs                                                    | Existing route already accepts prompt/session/project context and persists audit/session state; demo must compose, not fork.                             |
| Evidence assembly    | Copy raw logs into new store; manifest referencing current sources | Canonical manifest referencing existing evidence refs plus generated screenshots/log paths | Preserves authoritative sources from runs/artifacts/approvals while still giving QA one bundle to review.                                                |
| UI checkpointing     | Separate demo page; augment `SwarmControl.jsx`                     | Reuse Swarm Control with demo-focused checkpoint labels/state                              | Acceptance must prove the real operator view, not a demo-only dashboard.                                                                                 |

## Data Flow

```text
seed fixture/test harness
  -> create project/task/workspace/run/approval state via MCP tools
  -> POST /api/agenthub/headless with canonical prompt/session inputs
  -> OpenCode/session traces persist existing runtime evidence
  -> GET /api/agenthub/operations/health projects mission + queue + approvals + artifacts
  -> SwarmControl renders dispatch/approval/check/handoff checkpoints
  -> manifest builder writes checklist + evidence locations
```

Sequence:

```text
Harness -> MCP tools: seed deterministic durable state
Harness -> headless route: kickoff prompt
headless route -> local DB/audit trail: persist session + traces
Harness/UI -> operations health: fetch authoritative snapshot
operations health -> SwarmControl: director queue, approvals, evidence timeline
Harness -> evidence manifest: checklist.json + bundle index
```

## File Changes

| File                                                                   | Action | Description                                                                                              |
| ---------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------- |
| `openspec/changes/sw-9-5a-end-to-end-demo-prompt-to-handoff/design.md` | Create | Technical design for SW-9.5A                                                                             |
| `devhub-mcp/tests/integration/swarm-demo-handoff.test.js`              | Create | Canonical seeded end-to-end acceptance scenario using `createTestHarness`                                |
| `devhub-mcp/tests/fixtures/swarmDemoHandoffSeed.js`                    | Create | Stable IDs, prompt text, checkpoint order, evidence path helpers                                         |
| `src/app/api/agenthub/headless/route.js`                               | Modify | Tag audit/session output with deterministic scenario metadata only; no new primitive semantics           |
| `src/app/api/agenthub/operations/health/route.js`                      | Modify | Project demo-ready checkpoint projection and manifest inputs from existing mission/run/approval evidence |
| `src/views/SwarmControl.jsx`                                           | Modify | Expose visible prompt→dispatch→approval→checks→handoff checkpoint states for acceptance review           |
| `tests/agenthub/api/operations-health.test.js`                         | Modify | Verify checkpoint projection / manifest input stays derived from durable truth                           |
| `src/views/__tests__/SwarmControl.test.jsx`                            | Modify | Verify demo checkpoint rendering and partial-failure visibility                                          |

## Interfaces / Contracts

```json
{
  "scenario_id": "sw-9-5a-demo",
  "seed_version": "v1",
  "checkpoints": [
    { "key": "prompt_submitted", "status": "passed", "evidence_ref": "..." },
    { "key": "dispatch_visible", "status": "passed", "evidence_ref": "..." },
    { "key": "approval_recorded", "status": "passed", "evidence_ref": "..." },
    { "key": "handoff_ready", "status": "passed", "evidence_ref": "..." }
  ],
  "bundle_path": "artifacts/swarm-demo-handoff/sw-9-5a-demo/<timestamp>/",
  "attachments": {
    "health_snapshot": ".../health.json",
    "ui_screenshot": ".../swarm-control.png",
    "handoff_notes": ".../handoff.md"
  }
}
```

Manifest is generated by the harness from existing evidence refs plus file artifacts; missing attachments are recorded explicitly as `missing`.

## Testing Strategy

| Layer       | What to Test                                           | Approach                                                                                      |
| ----------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Unit        | Manifest/checkpoint mapping from health snapshot       | Jest for pure mapping helpers                                                                 |
| Integration | Seeded prompt→durable state→health projection flow     | New `devhub-mcp` integration test with fixed IDs and ordered assertions                       |
| E2E/UI      | Demo checkpoints and partial failures in operator view | Existing React/Jest view tests; add Playwright only if screenshot automation becomes required |

## Migration / Rollout

No migration required. Rollout is file-scoped: add harness/fixtures/tests, then use the seeded scenario as the canonical acceptance path.

## Open Questions

- [ ] Should screenshot capture be mandatory in CI, or optional local/QA evidence when Playwright desktop context is available?
