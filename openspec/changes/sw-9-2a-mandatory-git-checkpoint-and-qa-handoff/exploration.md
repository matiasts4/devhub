# Exploration: SW-9.2A mandatory git checkpoint and QA handoff

### Current State

- The checkpoint gate is already documented in several places: `docs/24_Politica_Git_y_Versionado_Agentes.md`, `docs/09_Prompts_Maestros_Agentes.md`, `devhub-mcp/AGENT-FLOW.md`, and `docs/swarm-control/SW-8.2A-checkpoint-criteria.md` all require `git status --short`, a local commit when files changed, `[git:checkpoint]` comments, and `commit=none` only for zero-change analysis.
- The Control Room UI repeats the rule in the Director queue: `src/components/control-room/DirectorQueuePanel.jsx` says to checkpoint locally before the next claim.
- The approval path is partially durable: `src/app/api/agenthub/director-approval/route.js` revalidates snapshot/checkpoint linkage before approving/rejecting, and `src/app/api/agenthub/operations/health/route.js` projects pending approvals into the snapshot.
- DevHub MCP already exposes the primitives needed for reporting: `add_task_comment`, `update_task`, `request_supervisor_approval`, `record_telegram_adapter_intent`, and task/workspace/run helpers in `devhub-mcp/server.js`.
- The evidence gap is real: the gate is advisory/read-model oriented, but there is no universal enforcement on the mutation paths that can still move tasks to `completed`/`qa-ready` without checkpoint evidence.

### Affected Areas

- `devhub-mcp/server.js` — current task mutation APIs and the place where a durable gate would need to live.
- `devhub-mcp/AGENT-FLOW.md` — current MCP-level policy text for `completed`/`qa-ready`.
- `src/app/api/agenthub/director-approval/route.js` — approval/revalidation path that already enforces checkpoint linkage for approvals.
- `src/app/api/agenthub/operations/health/route.js` — snapshot projection that surfaces approvals and evidence timeline.
- `src/components/control-room/DirectorQueuePanel.jsx` — UI copy that nudges checkpoint-before-next-claim behavior.
- `src/views/SwarmControl.jsx` and `src/views/__tests__/SwarmControl.test.jsx` — operator-facing handoff/approval surface and its expectations.
- `docs/24_Politica_Git_y_Versionado_Agentes.md` — canonical git policy and comment templates.
- `docs/09_Prompts_Maestros_Agentes.md` — worker/QA prompt contract that repeats the same gate.
- `tests/unit/git-versioning-policy-doc.test.js` — doc-level guardrails already asserting the policy language.

### Approaches

1. **Enforce in the task transition path** — gate `update_task` / task close flows so `completed`/`qa-ready` require checkpoint evidence, or require a structured checkpoint payload before the status change.
   - Pros: closes the real loophole; durable; matches the operational rule.
   - Cons: touches core task mutation behavior; needs careful compatibility handling for existing analysis-only flows.
   - Effort: Medium.

2. **Add a checkpoint validator around task comments + status updates** — require a `[git:checkpoint]` comment and verify its contents before state transitions.
   - Pros: reuses existing DevHub chronology; visible to humans.
   - Cons: comment text is less authoritative than a structured field; can drift or be spoofed if not backed by server-side checks.
   - Effort: Medium.

3. **UI/prompt-only hardening** — make the client and prompts block the action unless the operator has posted the evidence.
   - Pros: quick, low-risk.
   - Cons: still bypassable through APIs; not enough for a mandatory gate.
   - Effort: Low.

### Recommendation

Use **Approach 1**, optionally backed by Approach 2 as audit trail. The durable gap is not user education; it is missing enforcement in the transition path. The gate should be owned by the server/task mutation layer, with UI, prompts, and comments as supporting evidence only.

### Risks

- Overlapping with SW-9.1A if the change starts mutating queue/lease semantics instead of only checkpoint/QA handoff behavior.
- Overlapping with SW-9.3A, SW-9.4A, or SW-9.5A if the change expands into notification, orchestration, or broader lifecycle policies.
- Backward-compatibility issues for analysis-only tasks if `commit=none` is not narrowly limited to zero-change cases.
- False positives if the gate depends only on comment text instead of durable checkpoint metadata.

### Ready for Proposal

Yes — but keep the proposal narrow: enforce mandatory git checkpoint evidence before `completed` / `qa-ready`, preserve `commit=none` only for zero-change analysis, and keep QA handoff visible through comments and snapshot projection.
