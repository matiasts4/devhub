# Tasks: Desktop QA Plan for Multi-Agent Runs

## Phase 1: Deterministic Scenario Foundation

- [x] 1.1 Add Linux QA scenario fixtures/helpers in `tests/e2e/04_swarm_control.spec.ts` (or extracted helper) for approval->closure checkpoints keyed by `scenario_id` and `QA_RUN_ID`.
- [x] 1.2 Add recovery scenario gating in `tests/e2e/04_swarm_control.spec.ts` so SW-9.1A readiness can disable deterministic recovery assertions without changing runner semantics.
- [x] 1.3 Update `playwright.config.ts` to scope output/report paths by `QA_RUN_ID` under `test-results/desktop-qa/<qa_run_id>/browser` while preserving current reporters.

## Phase 2: Thin Runner and Surface Reporting

- [x] 2.1 Create `scripts/qa/run-multi-agent-desktop.cjs` to stamp `qa_run_id`/`scenario_id`, invoke Playwright/native/agenthub smoke on Linux, and collect exit/status metadata per surface.
- [x] 2.2 Update `scripts/native-vte-smoke.cjs` to accept optional QA flags and emit machine-readable summary JSON with status and artifact paths.
- [x] 2.3 Update `bin/agenthub-smoke.js` to emit `qa_run_id`, `scenario_id`, surface status, and durable evidence references for approvals/runs/workspaces/recovery without copying durable payloads.

## Phase 3: Manifest and Bounded Reporting

- [x] 3.1 Implement manifest builder helpers for `test-results/desktop-qa/<qa_run_id>/manifest.json` covering browser/native/headless surfaces, `durable_refs`, and `incomplete` markers.
- [x] 3.2 Wire runner and smoke outputs so partial failures still produce a manifest with explicit incomplete entries and stable `evidence_ref` links.
- [x] 3.3 Keep reporting bounded to existing Control Room/health read models in `src/lib/operations/swarmControl.js` and `src/views/SwarmControl.jsx` only if selectors/assertions need normalization for deterministic checks.

## Phase 4: Verification and Checkpoint

- [x] 4.1 Write Jest tests for manifest assembly, path normalization, and incomplete-marker behavior around the new runner helpers.
- [x] 4.2 Add integration coverage for agenthub/health reporting to verify durable references stay link-only and are tagged with the shared `qa_run_id`.
- [x] 4.3 Add or update Playwright coverage for the seeded approval->closure flow and gated recovery coverage, asserting shared `scenario_id` checkpoints across local and CI runs.
- [x] 4.4 Document the verification checkpoint in runner/task notes: Linux command path, expected bundle layout, and failure triage rules before marking the change ready for `sdd-apply`/`sdd-verify`.
