# Apply Progress: SW-9.2A mandatory git checkpoint and QA handoff

## Change

- sw-9-2a-mandatory-git-checkpoint-and-qa-handoff

## Mode

- Strict TDD

## Completed Tasks

- [x] 1.1 Extend `devhub-mcp/tests/integration/tasks.test.js` to prove `update_task(status=completed)` is rejected without a valid `[git:checkpoint]` comment and accepted with auditable checkpoint evidence.
- [x] 1.2 Add `commit=none` contract cases in `devhub-mcp/tests/integration/tasks.test.js` for zero-change analysis acceptance and changed-work rejection with remediation text.
- [x] 1.3 Extend `src/app/api/agent/qa-result/route.test.js` to fail QA finalization when checkpoint evidence is missing/stale and to pass only when the linked handoff evidence is valid.
- [x] 1.4 Add projection assertions in `tests/agenthub/api/operations-health.test.js`, `src/lib/operations/__tests__/swarmControl.test.js`, and `src/views/__tests__/SwarmControl.test.jsx` for blocked and accepted checkpoint gate messaging.
- [x] 2.1 Modify `devhub-mcp/server.js` to parse the latest `[git:checkpoint]` comment, require `commit`, `checks`, `docs`, `worktree`, and conditional `reason`, and return machine-stable rejection codes/messages.
- [x] 2.2 Update the terminal task transition path in `devhub-mcp/server.js` so `completed` is blocked unless checkpoint evidence matches the same task context and remains auditable.
- [x] 2.3 Implement `commit=none` validation in `devhub-mcp/server.js` so only zero-change analysis handoffs pass, while changed-work or non-analysis handoffs are rejected with checkpoint remediation.
- [x] 2.4 Modify `src/app/api/agent/qa-result/route.js` to reuse the same validator for QA-finalization paths instead of inventing a new persisted `qa-ready` status.
- [x] 3.1 Update `src/app/api/agenthub/operations/health/route.js` and `src/lib/operations/swarmControl.js` to project accepted checkpoint summaries and blocked remediation payloads from durable gate outcomes.
- [x] 3.2 Update `src/views/SwarmControl.jsx` and `src/components/control-room/DirectorQueuePanel.jsx` to render checkpoint gate status as read-only operator context, including the `commit=none` zero-change rule when relevant.
- [x] 3.3 Align `devhub-mcp/AGENT-FLOW.md`, `docs/24_Politica_Git_y_Versionado_Agentes.md`, and `tests/unit/git-versioning-policy-doc.test.js` with the enforced checkpoint and `commit=none` contract.
- [x] 4.1 Refactor duplicated checkpoint parsing/remediation text in `devhub-mcp/server.js` and `src/app/api/agent/qa-result/route.js` behind one canonical handoff contract.
- [x] 4.2 Run targeted verification for `devhub-mcp/tests/integration/tasks.test.js`, `src/app/api/agent/qa-result/route.test.js`, `tests/agenthub/api/operations-health.test.js`, `src/lib/operations/__tests__/swarmControl.test.js`, `src/views/__tests__/SwarmControl.test.jsx`, and `tests/unit/git-versioning-policy-doc.test.js`.

## Files Changed

| File                                                                        | Action   | Notes                                                                                                                        |
| --------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/gitCheckpointHandoff.js`                                           | Added    | Canonical parser/validator for `[git:checkpoint]` evidence and `commit=none` rules.                                          |
| `devhub-mcp/server.js`                                                      | Modified | Enforces checkpoint gate on `update_task(status=completed)` and returns gate payloads.                                       |
| `devhub-mcp/tests/integration/tasks.test.js`                                | Modified | Covers missing checkpoint, incomplete required fields, valid checkpoint, analysis `commit=none`, and changed-work rejection. |
| `src/app/api/agent/qa-result/route.js`                                      | Modified | Reuses canonical validator before approved QA finalization.                                                                  |
| `src/app/api/agent/qa-result/route.test.js`                                 | Modified | Covers missing/stale checkpoint rejection and accepted QA gate path.                                                         |
| `src/app/api/agenthub/operations/health/route.js`                           | Modified | Projects checkpoint gate outcomes into director queue and snapshot errors.                                                   |
| `tests/agenthub/api/operations-health.test.js`                              | Modified | Verifies blocked remediation and accepted checkpoint summary projection.                                                     |
| `src/lib/operations/swarmControl.js`                                        | Modified | Normalizes checkpoint gate payloads for UI consumers.                                                                        |
| `src/lib/operations/__tests__/swarmControl.test.js`                         | Modified | Verifies normalized checkpoint gate data on director queue items.                                                            |
| `src/components/control-room/DirectorQueuePanel.jsx`                        | Modified | Renders read-only checkpoint gate codes, remediation, and accepted summaries.                                                |
| `src/components/control-room/ApprovalsErrorsPanel.jsx`                      | Modified | Renders remediation text from projected checkpoint gate errors.                                                              |
| `src/views/__tests__/SwarmControl.test.jsx`                                 | Modified | Verifies blocked remediation and accepted checkpoint summary rendering.                                                      |
| `src/lib/db/localDb.js`                                                     | Modified | Adds `getLatestTaskComment` helper for QA checkpoint lookup.                                                                 |
| `devhub-mcp/AGENT-FLOW.md`                                                  | Modified | Documents durable server enforcement for the gate.                                                                           |
| `docs/24_Politica_Git_y_Versionado_Agentes.md`                              | Modified | States the gate is durably enforced by server mutations.                                                                     |
| `docs/09_Prompts_Maestros_Agentes.md`                                       | Modified | Aligns worker prompt with server rejection behavior.                                                                         |
| `tests/unit/git-versioning-policy-doc.test.js`                              | Modified | Asserts new durable-enforcement wording.                                                                                     |
| `openspec/changes/sw-9-2a-mandatory-git-checkpoint-and-qa-handoff/tasks.md` | Modified | Marks SW-9.2A tasks complete.                                                                                                |

## TDD Cycle Evidence

| Task                    | Test File                                           | Layer       | Safety Net                                                                         | RED                                                                | GREEN            | TRIANGULATE                                                                             | REFACTOR                                                                   |
| ----------------------- | --------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 1.1, 1.2, 2.1, 2.2, 2.3 | `devhub-mcp/tests/integration/tasks.test.js`        | Integration | ✅ 19/19 baseline (`npm test -- tests/integration/tasks.test.js` in `devhub-mcp/`) | ✅ Added failing incomplete-evidence case first                    | ✅ 20/20 passing | ✅ missing checkpoint, incomplete `docs`, valid checkpoint, analysis-only, changed-work | ➖ No new refactor needed for this verification-gap patch                  |
| 1.3, 2.4, 4.1           | `src/app/api/agent/qa-result/route.test.js`         | Integration | ✅ 4/4 baseline                                                                    | ✅ Added missing/stale/accepted QA gate tests first                | ✅ 7/7 passing   | ✅ missing checkpoint + stale checkpoint + accepted path                                | ✅ Route now reuses canonical validator helper                             |
| 1.4, 3.1                | `tests/agenthub/api/operations-health.test.js`      | Integration | ✅ 16/16 baseline                                                                  | ✅ Added blocked/accepted projection tests first                   | ✅ 18/18 passing | ✅ blocked remediation + accepted summary                                               | ✅ Shared queue payload handling + checkpoint error projection             |
| 1.4, 3.1                | `src/lib/operations/__tests__/swarmControl.test.js` | Unit        | ✅ 22/22 baseline                                                                  | ✅ Added checkpoint gate normalization test first                  | ✅ 23/23 passing | ✅ blocked + accepted gate payload cases                                                | ➖ None needed                                                             |
| 1.4, 3.2                | `src/views/__tests__/SwarmControl.test.jsx`         | Integration | ✅ 30/30 baseline                                                                  | ✅ Added blocked remediation + accepted summary render tests first | ✅ 32/32 passing | ✅ queue blocked remediation + snapshot error remediation + accepted summary            | ✅ Queue panel renders canonical gate fields without client-side authority |
| 3.3                     | `tests/unit/git-versioning-policy-doc.test.js`      | Unit        | ✅ 8/8 baseline                                                                    | ✅ Added durable enforcement doc expectations first                | ✅ 8/8 passing   | ✅ prompt + repo guide + MCP flow wording                                               | ➖ None needed                                                             |

## Test Summary

- Total tests written/expanded: 14 targeted assertions across 6 suites
- Targeted verification commands:
  - `npm test -- tests/integration/tasks.test.js` (workdir: `devhub-mcp/`)
  - `npm test -- src/app/api/agent/qa-result/route.test.js`
  - `npm test -- tests/agenthub/api/operations-health.test.js`
  - `npm test -- src/lib/operations/__tests__/swarmControl.test.js`
  - `npm test -- src/views/__tests__/SwarmControl.test.jsx`
  - `npm test -- tests/unit/git-versioning-policy-doc.test.js`
- Full targeted verification rerun completed green after refactor.
- Verification-gap rerun completed green after adding dedicated incomplete-evidence coverage.

## Deviations from Design

- None. `qa-ready` remains a handoff boundary, not a persisted task status enum.

## Issues Found

- Root Jest config ignores `devhub-mcp/**`, so MCP integration verification must run from `devhub-mcp/` workdir even though project-level strict TDD runner remains `npm test`.

## Remaining Tasks

- None for SW-9.2A apply scope; dedicated incomplete-evidence runtime coverage is now in place.

## Status

- 14/14 tasks complete. Ready for `sdd-verify`.
