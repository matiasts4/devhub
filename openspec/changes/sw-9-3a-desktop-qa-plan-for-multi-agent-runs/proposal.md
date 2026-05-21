# Proposal: Desktop QA Plan for Multi-Agent Runs

## Intent

Define a Linux-first, reproducible QA plan for multi-agent desktop runs that reuses existing Playwright/browser smoke, native smoke, and durable evidence paths. Goal: make failures comparable across local runs and CI without rewriting the test platform.

## Scope

### In Scope

- Define deterministic multi-agent scenarios for Control Room/approval/recovery/closure coverage.
- Standardize evidence bundles from Playwright, native smoke, headless smoke, and durable DB/audit outputs.
- Specify a thin orchestration/report path for Linux operators and CI handoff.

### Out of Scope

- New runtime/operator surfaces such as PhantomPane integration.
- Replacing Playwright, Tauri smoke, or AgentHub smoke with a new platform.
- Broad product behavior changes outside QA harnessing and evidence contracts.

## Capabilities

### New Capabilities

- `multi-agent-desktop-qa`: Linux-first QA matrix, deterministic seeds, and evidence bundle contract for browser, native, and headless smoke.

### Modified Capabilities

- `swarm-observability`: extend observability coverage requirements so QA asserts durable evidence/report outputs for approvals, runs, workspaces, and recovery state.

## Approach

Keep the plan read-mostly and fixture-driven. Extend existing `tests/e2e/04_swarm_control.spec.ts` (or split it) into deterministic scenarios seeded from stable snapshots. Reuse `scripts/native-vte-smoke.cjs` and `bin/agenthub-smoke.js` as-is, with only minimal glue for run naming/manifest output. Store artifacts under existing Playwright/native paths plus one durable manifest that references DB/audit evidence instead of duplicating it.

## Affected Areas

| Area                                 | Impact   | Description                                                 |
| ------------------------------------ | -------- | ----------------------------------------------------------- |
| `tests/e2e/04_swarm_control.spec.ts` | Modified | Add deterministic multi-agent QA scenarios.                 |
| `playwright.config.ts`               | Modified | Normalize artifact/report paths for QA bundles.             |
| `scripts/native-vte-smoke.cjs`       | Modified | Optional naming/manifest glue only.                         |
| `bin/agenthub-smoke.js`              | Modified | Emit/report durable evidence references consistently.       |
| `src/views/SwarmControl.jsx`         | Modified | Browser assertions target existing operator surfaces only.  |
| `src/lib/operations/swarmControl.js` | Modified | QA validates normalized read models, not runtime mutations. |

## Risks

| Risk                           | Likelihood | Mitigation                                                                 |
| ------------------------------ | ---------- | -------------------------------------------------------------------------- |
| Flaky shared state across runs | Med        | Seed deterministic fixtures and isolate artifact folders per run.          |
| QA grows into platform rewrite | Med        | Limit glue to manifest/reporting; reuse existing smoke entrypoints.        |
| Noisy recovery assertions      | Med        | Gate scenarios on stable SW-9.1A recovery semantics and durable snapshots. |

## Rollback Plan

Revert the QA-specific scenario additions and manifest wiring, keep current smoke tests/artifact paths, and fall back to existing Playwright/native/headless smoke commands unchanged.

## Dependencies

- Existing Playwright artifact outputs in `playwright-report/` and `test-results/results.json`.
- Existing Linux smoke entrypoints: `npm run native:vte-smoke` and `npm run agenthub-smoke`.
- Stable durable evidence from local DB, audit-trail files, and health/swarm projections.

## Success Criteria

- [ ] Proposal yields one new QA capability and one observability delta with deterministic scenarios.
- [ ] Linux operators and CI can produce the same evidence bundle layout from the existing smoke stack.
- [ ] Scope stays bounded to QA planning/evidence contracts, not runtime architecture rewrite.
