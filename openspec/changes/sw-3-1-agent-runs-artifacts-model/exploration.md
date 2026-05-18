# Exploration: SW-3.1 agent runs/artifacts model

### Current State

DevHub already treats Git/workspaces as executor-owned and keeps `devhub_agent_runs` as UI/runtime-local state. SW-2.1 froze `agent_workspaces` as the durable control-plane record and intentionally left `evidence_ref` opaque, so SW-3.1 should define the audit layer that records what happened during a run without turning runtime-local state into the source of truth. Current code still mixes observer and control-plane concerns in a few places (`src/lib/agentRegistryLive.js`, `src/app/api/agent/execute/route.js`, `src/app/api/agent/qa-result/route.js`), which confirms the need for a separate durable run/artifact model.

### Affected Areas

- `src/lib/db/localDb.js` — already contains traces/session tables; SW-3.1 likely adds durable run/artifact tables here, separate from runtime-local maps.
- `src/lib/agentRegistryLive.js` — explicitly bridges `agent_registry` to `devhub_agent_runs`; it must remain observer-only, not become run ownership.
- `src/app/api/agent/execute/route.js` — currently creates branches and updates task/agent state directly; this is the kind of executor-side action SW-3.1 should audit, not own.
- `src/app/api/agent/qa-result/route.js` — currently merges/cleans up directly; SW-3.1 needs a durable record of QA outcome, not just side effects.
- `docs/23_Swarm_Workspace_Intencion_y_Roadmap.md` / `docs/24_Politica_Git_y_Versionado_Agentes.md` / `docs/08_Enjambre_Agentes_y_Orquestacion.md` — these docs already define the control-plane vs executor boundary and SW-3.1’s dependency on auditable artifacts.
- `openspec/changes/sw-2-1-agent-workspaces-strategy/*` — SW-2.1 defines the frozen workspace contract and the opaque `evidence_ref` hook that SW-3.1 must consume.

### Approaches

1. **Dedicated durable runs + artifact ledger** — add `agent_runs` as the immutable execution header and `agent_artifacts` as the append-only evidence ledger, linked by `workspace_id`, `task_id`, and opaque `evidence_ref`.
   - Pros: clean audit trail, easy recovery, no ambiguity between runtime state and durable history.
   - Cons: more schema and query surface, needs explicit lifecycle rules.
   - Effort: High

2. **Extend `agent_workspaces` with run/event payloads** — store run summaries and artifacts inside the workspace record.
   - Pros: fewer tables, simpler initial wiring.
   - Cons: mixes reservation/lifecycle with evidence history, harder to replay or version, weakens append-only guarantees.
   - Effort: Medium

3. **Reuse `devhub_agent_runs` as the durable store** — promote the UI/runtime map into the audit model.
   - Pros: fastest path.
   - Cons: wrong ownership boundary, browser/runtime drift, poor recovery, and it contradicts SW-2.1’s freeze.
   - Effort: Low

### Recommendation

Use **Approach 1**. Make `agent_runs` the durable execution envelope and `agent_artifacts` the evidence stream, with `evidence_ref` as the opaque pointer from SW-2.1 to the first-class artifact set. Keep `devhub_agent_runs` observer-only so the UI can mirror state, but never own it.

Suggested shape:

- run header: identity, task/workspace linkage, agent/model, lifecycle timestamps, outcome, recovery metadata
- artifact rows: commands, diffs, logs, tests, QA notes, attachments, all append-only
- `evidence_ref`: opaque pointer to the run’s artifact bundle or timeline, not raw embedded data

### Risks

- `devhub_agent_runs` will keep drifting if any flow starts using it as durable truth.
- If `evidence_ref` is defined too loosely, SW-2.2 will not know what to emit back.
- Without immutable run headers, recovery can overwrite history instead of linking successors.
- Existing direct branch/merge flows in execute/qa routes will keep leaking control-plane behavior into executor logic unless they are later refactored.

### Ready for Proposal

Yes — SW-3.1 is ready for proposal once the run/artifact split and the `evidence_ref` contract are frozen.
