# Tasks: SW-9.2A mandatory git checkpoint and QA handoff

## Phase 1: RED — enforce contract with failing tests

- [x] 1.1 Extend `devhub-mcp/tests/integration/tasks.test.js` to prove `update_task(status=completed)` is rejected without a valid `[git:checkpoint]` comment and accepted with auditable checkpoint evidence.
- [x] 1.2 Add `commit=none` contract cases in `devhub-mcp/tests/integration/tasks.test.js` for zero-change analysis acceptance and changed-work rejection with remediation text.
- [x] 1.3 Extend `src/app/api/agent/qa-result/route.test.js` to fail QA finalization when checkpoint evidence is missing/stale and to pass only when the linked handoff evidence is valid.
- [x] 1.4 Add projection assertions in `tests/agenthub/api/operations-health.test.js`, `src/lib/operations/__tests__/swarmControl.test.js`, and `src/views/__tests__/SwarmControl.test.jsx` for blocked and accepted checkpoint gate messaging.

## Phase 2: GREEN — durable checkpoint gate

- [x] 2.1 Modify `devhub-mcp/server.js` to parse the latest `[git:checkpoint]` comment, require `commit`, `checks`, `docs`, `worktree`, and conditional `reason`, and return machine-stable rejection codes/messages.
- [x] 2.2 Update the terminal task transition path in `devhub-mcp/server.js` so `completed` is blocked unless checkpoint evidence matches the same task context and remains auditable.
- [x] 2.3 Implement `commit=none` validation in `devhub-mcp/server.js` so only zero-change analysis handoffs pass, while changed-work or non-analysis handoffs are rejected with checkpoint remediation.
- [x] 2.4 Modify `src/app/api/agent/qa-result/route.js` to reuse the same validator for QA-finalization paths instead of inventing a new persisted `qa-ready` status.

## Phase 3: Read-model and audit messaging

- [x] 3.1 Update `src/app/api/agenthub/operations/health/route.js` and `src/lib/operations/swarmControl.js` to project accepted checkpoint summaries and blocked remediation payloads from durable gate outcomes.
- [x] 3.2 Update `src/views/SwarmControl.jsx` and `src/components/control-room/DirectorQueuePanel.jsx` to render checkpoint gate status as read-only operator context, including the `commit=none` zero-change rule when relevant.
- [x] 3.3 Align `devhub-mcp/AGENT-FLOW.md`, `docs/24_Politica_Git_y_Versionado_Agentes.md`, and `tests/unit/git-versioning-policy-doc.test.js` with the enforced checkpoint and `commit=none` contract.

## Phase 4: Refactor and verification

- [x] 4.1 Refactor duplicated checkpoint parsing/remediation text in `devhub-mcp/server.js` and `src/app/api/agent/qa-result/route.js` behind one canonical handoff contract.
- [x] 4.2 Run targeted verification for `devhub-mcp/tests/integration/tasks.test.js`, `src/app/api/agent/qa-result/route.test.js`, `tests/agenthub/api/operations-health.test.js`, `src/lib/operations/__tests__/swarmControl.test.js`, `src/views/__tests__/SwarmControl.test.jsx`, and `tests/unit/git-versioning-policy-doc.test.js`.
