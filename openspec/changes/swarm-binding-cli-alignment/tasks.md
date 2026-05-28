# Tasks: Swarm Binding CLI Alignment

## Review Workload Forecast

| Field                   | Value                         |
| ----------------------- | ----------------------------- |
| Estimated changed lines | 320-480                       |
| 400-line budget risk    | Medium                        |
| Chained PRs recommended | No                            |
| Suggested split         | Single current-branch PR flow |
| Delivery strategy       | single-pr                     |
| Chain strategy          | pending                       |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal                                       | Likely PR | Notes                                                                 |
| ---- | ------------------------------------------ | --------- | --------------------------------------------------------------------- |
| 1    | Canonical binding RED→GREEN                | Single PR | DB helper, binding route, launch/runtime wiring, tests together       |
| 2    | Mission CLI read alignment                 | Single PR | Shared reader + `mission status` JSON/TTY coverage; `close` untouched |
| 3    | Worktree CLI read alignment + verification | Single PR | Shared reader + `worktree status/list`; `clean` untouched             |

## Phase 1: Canonical Binding RED

- [x] 1.1 Add failing reconciliation tests in `src/lib/db/workspaces.test.js` for verified write, missing stays missing, and mismatched workspace/run/session refusal.
- [x] 1.2 Add failing binding classification cases in `src/lib/db/swarmMissions.test.js` for `binding_stale` and `binding_orphaned` after durable lookup.
- [x] 1.3 Add failing route flow coverage in `src/app/api/agenthub/operations/health/route.integration.test.js` and new `src/app/api/agenthub/sessions/[sessionId]/binding/route.test.js` for canonical session reconciliation.

## Phase 2: Canonical Binding GREEN

- [x] 2.1 Implement `reconcileAgentRuntimeSessionBinding` in `src/lib/db/workspaces.js`; export via `src/lib/db/localDb.js`; keep `src/lib/db/observability.js` as low-level writer only.
- [x] 2.2 Update `src/app/api/agenthub/operations/health/route.js` to stop seeding guessed `opencode_session_id` and create `src/app/api/agenthub/sessions/[sessionId]/binding/route.js` for verified writes.
- [x] 2.3 Update `src/components/TerminalWorkspacesManager.jsx` to keep `workspaceId/runId/sessionId` per launched panel and POST detected OpenCode ids once binding is verified.
- [x] 2.4 Tighten `src/lib/db/swarmMissions.js` so bound/stale/orphaned mission delivery reads come only from reconciled durable state.

## Phase 3: Mission CLI RED/GREEN

- [x] 3.1 Add failing reader/command tests in `src/lib/db/compactReads.test.js` and `devhub-cli/commands/mission.test.js` for canonical participant diagnosis and unknown-mission not-found output.
- [x] 3.2 Add mission diagnostic read helper in `src/lib/db/compactReads.js`, re-export from `devhub-cli/lib/db.js`, and switch `devhub-cli/commands/mission.js` status read path; keep `mission close` unchanged.

## Phase 4: Worktree CLI RED/GREEN

- [x] 4.1 Add failing reader/command tests in `src/lib/db/compactReads.test.js` and `devhub-cli/commands/worktree.test.js` for durable evidence summary, orphaned status, and JSON list/status output.
- [x] 4.2 Add workspace diagnostic readers in `src/lib/db/compactReads.js` and switch `devhub-cli/commands/worktree.js` list/status paths; keep `worktree clean` untouched.

## Phase 5: Focused Verification

- [x] 5.1 Run focused Jest suites for DB binding, binding route/health integration, `TerminalWorkspacesManager`, and CLI mission/worktree commands; confirm RED→GREEN progression.
- [x] 5.2 Check `git diff --stat`, update this file during apply, and prepare single-branch work-unit commits only if diff stays inside the narrow reconciliation/read-alignment scope.
