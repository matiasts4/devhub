# Exploration: SW-4.1 supervisor loop design

### Current State

SW-2.1 froze `agent_workspaces` as the durable control-plane reservation and SW-3.1 froze `agent_runs` + `agent_artifacts` as the audit layer. SW-2.2 then narrowed `prepare_agent_workspace` to intent/ack + executor evidence. The current runtime still keeps task leases in `tasks`/`agent_registry`, with queue selection, claim, renew, release, cleanup, and escalation logic in `devhub-mcp/server.js`. The direct git side effects remain in `src/app/api/agent/execute/route.js` and `src/app/api/agent/qa-result/route.js`, so SW-4.1 must supervise those boundaries, not re-own them.

### Affected Areas

- `devhub-mcp/server.js` — owns queue scoring, claim/release, lease cleanup, and agent status sync today.
- `src/lib/db/localDb.js` — current durable store for tasks/agent registry; future supervisor state must not blur into runtime-local maps.
- `src/lib/agentRegistryLive.js` — observer-only bridge; it must stay a mirror, not a source of truth.
- `src/app/api/agent/execute/route.js` — direct branch creation debt that the supervisor must treat as executor-side evidence.
- `src/app/api/agent/qa-result/route.js` — direct merge/cleanup debt that must stay behind approval gates.
- `openspec/changes/sw-2-1-agent-workspaces-strategy/*` and `openspec/changes/sw-3-1-agent-runs-artifacts-model/*` — frozen dependencies SW-4.1 must consume.
- `docs/23_Swarm_Workspace_Intencion_y_Roadmap.md` and `docs/24_Politica_Git_y_Versionado_Agentes.md` — already state the durable supervisor boundary and human-approval rules.

### Approaches

1. **Supervise existing queue/lease primitives** — build SW-4.1 as a coordinator over `get_execution_queue`, `claim_next_task`, `renew_task_lease`, `release_task`, workspace/run artifacts, and human escalation.
   - Pros: smallest delta, matches existing DevHub ownership model, avoids new control-plane verbs.
   - Cons: some retry/recovery semantics remain implicit until later specs tighten them.
   - Effort: Medium

2. **Introduce a new supervisor-owned orchestration state machine** — add a separate supervisor model that owns retries, blocked resolution, and escalation independently of task leases.
   - Pros: clearer conceptual split.
   - Cons: risks duplicating lease logic and drifting from the frozen task/workspace contracts.
   - Effort: High

### Recommendation

Use **Approach 1**. SW-4.1 should be a durable loop that _observes and orchestrates_ the existing task/lease/workspace/run contracts, not a parallel scheduler. It should read queue state, inspect artifact evidence, renew or release leases, detect orphan/expired/blocked states, and escalate risky actions to a human without taking over git/worktree execution.

### Risks

- If SW-4.1 redefines claim or retry semantics, it will conflict with the frozen queue/lease contracts.
- If it consumes `devhub_agent_runs` as truth, recovery will drift from durable state.
- If it treats `execute/qa-result` routes as supervisor-owned, the git boundary regression comes back.
- Dirty-excluded and expired-lease drift must be treated as recoverable evidence, not cleaned away.

### Ready for Proposal

Yes — the contract is narrow enough now. Next phase should specify supervisor loop inputs/outputs, escalation gates, and the minimal read adapters over queue, workspace, and run/artifact state.
