# Design: SW-9.3A Desktop QA plan for multi-agent runs

## Technical Approach

Keep QA snapshot-first and Linux-first. Reuse the current browser, native, and headless smoke entrypoints, then add one thin orchestration layer that stamps a shared `qa_run_id`, passes a named `scenario_id`, and writes a single manifest that links existing artifacts plus durable evidence references. Browser checks MUST assert the current Control Room read model (`control_room_snapshot_input`, approvals, runs, workspaces, evidence timeline) instead of introducing runtime-only hooks.

## Architecture Decisions

| Decision           | Choice                                                                             | Alternatives considered                     | Rationale                                                                                                                                                                                   |
| ------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scenario authority | Seed deterministic Control Room fixtures around existing read models and selectors | Ad-hoc live setup; runtime mutation helpers | `tests/e2e/04_swarm_control.spec.ts` is shallow today, but `SwarmControl.jsx`, `swarmControl.js`, and health-route tests already expose stable approval/run/workspace/evidence projections. |
| Orchestration seam | Add one small Node QA runner that shells existing commands and collects outputs    | New test platform; large CI-only scripting  | `playwright.config.ts`, `scripts/native-vte-smoke.cjs`, and `bin/agenthub-smoke.js` already cover artifact capture and smoke semantics; only run metadata + manifest assembly are missing.  |
| Evidence contract  | Manifest stores paths, statuses, and durable references only                       | Copy DB rows/audit payloads into bundle     | Specs require comparable bundles without duplicating durable truth. Missing evidence should be explicit, not hidden.                                                                        |

## Data Flow

`qa-runner -> Playwright scenario`
`qa-runner -> native-vte-smoke`
`qa-runner -> agenthub-smoke`
`agenthub-smoke -> sqlite/audit-trail discovery`
`health route -> control_room_snapshot_input + evidence_timeline`
`manifest builder -> test-results/desktop-qa/<qa_run_id>/manifest.json`

### Sequence Diagram

`qa-runner -> playwright test (QA_RUN_ID, SCENARIO_ID)`  
`qa-runner -> node scripts/native-vte-smoke.cjs --qa-run-id ...`  
`qa-runner -> node bin/agenthub-smoke.js --qa-run-id ... --scenario ...`  
`bin/agenthub-smoke.js -> agent_hub_sessions + agent_traces + audit trail`  
`playwright/browser -> /api/agenthub/operations/health -> control_room_snapshot_input`  
`qa-runner -> manifest.json (browser/native/headless + durable refs + incomplete markers)`

## File Changes

| File                                                                      | Action          | Description                                                                         |
| ------------------------------------------------------------------------- | --------------- | ----------------------------------------------------------------------------------- |
| `openspec/changes/sw-9-3a-desktop-qa-plan-for-multi-agent-runs/design.md` | Create          | Technical design artifact.                                                          |
| `tests/e2e/04_swarm_control.spec.ts`                                      | Modify or split | Add deterministic named scenarios for approval->closure and recovery coverage.      |
| `playwright.config.ts`                                                    | Modify          | Support `QA_RUN_ID`-scoped report/output folders while keeping existing reporters.  |
| `scripts/native-vte-smoke.cjs`                                            | Modify          | Accept optional QA metadata and emit a small machine-readable result file.          |
| `bin/agenthub-smoke.js`                                                   | Modify          | Include `qa_run_id`, `scenario_id`, and durable evidence references in JSON output. |
| `scripts/qa/run-multi-agent-desktop.cjs`                                  | Create          | Thin Linux runner that invokes existing harnesses and assembles the manifest.       |

## Interfaces / Contracts

```json
{
  "qa_run_id": "qa-20260521-001",
  "scenario_id": "approval-closure",
  "platform": "linux",
  "surfaces": {
    "browser": { "status": "passed", "results_json": "...", "html_report": "..." },
    "native": { "status": "passed", "summary_json": "..." },
    "headless": { "status": "failed|passed", "report_json": "..." }
  },
  "durable_refs": {
    "approvals": ["evidence_ref..."],
    "runs": ["evidence_ref..."],
    "workspaces": ["evidence_ref..."],
    "recovery": ["evidence_ref..."]
  },
  "incomplete": []
}
```

Contract rules: every surface MUST report status even on failure; durable refs MAY be empty but missing classes MUST be listed in `incomplete`.

## Testing Strategy

| Layer       | What to Test                                                        | Approach                                                          |
| ----------- | ------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Unit        | Manifest builder, path normalization, incomplete markers            | Jest around runner helpers only.                                  |
| Integration | `agenthub-smoke`/health snapshot evidence references stay link-only | Jest against existing route/report builders and smoke JSON shape. |
| E2E         | Deterministic approval->closure and recovery scenarios              | Playwright with seeded fixtures and `QA_RUN_ID` env isolation.    |

## Migration / Rollout

No migration required. Roll out behind docs/command adoption only. Recovery scenario SHOULD stay disabled until SW-9.1A recovery projections are stable enough for deterministic assertions.

## Open Questions

- [ ] Whether recovery assertions ship in the first matrix slice or stay soft-gated on SW-9.1A readiness.
