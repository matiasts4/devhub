# Exploration: SW-2.2 prepare_agent_workspace tool

### Current State

SW-2.1 already froze the workspace reservation contract: DevHub owns `agent_workspaces`, stores desired/observed state, treats `dirty-excluded` as valid observed reality, and never performs git/worktree actions. SW-3.1 then freezes durable `agent_runs` + append-only `agent_artifacts`, with `evidence_ref` opaque on the control-plane side but concrete enough for audit routing. Current implementation still violates that boundary in `src/app/api/agent/execute/route.js` and `src/app/api/agent/qa-result/route.js`, where direct git checkout/merge side effects live.

### Minimum Contract Surface

`prepare_agent_workspace` should be tiny and explicit:

- input: `workspace_id` or `{task_id, agent_id}` plus optional requested base ref override
- output: control-plane accepted intent, workspace identity, requested base ref, and a reservation token/correlation id
- reported result: requested base ref, observed branch/head/dirty/path, status, timestamps, drift/error class, and opaque `evidence_ref`

Do **not** add git verbs, branch creation verbs, merge verbs, or workspace filesystem verbs to MCP.

### DevHub vs Executor Evidence

**DevHub belongs:**

- workspace identity and ownership (`workspace_id`, `task_id`, `agent_id`)
- requested base branch/commit
- lifecycle status (`planned`, `provisioning`, `ready`, `active`, `conflicted`, `cleanup_pending`, `failed`, `orphaned`)
- recovery metadata (`last_error`, `recovery_reason`)
- opaque `evidence_ref`

**Executor evidence belongs:**

- actual git/worktree actions taken
- observed branch/head/path/dirty snapshot
- provisioning success/failure
- collision/drift details
- cleanup outcome
- audit payloads for later run/artifact materialization

### Failure / Retry / Idempotency Model

- idempotency key should be `workspace_id` + executor correlation id
- repeated `prepare_agent_workspace` calls with same reservation MUST be no-ops unless the observed state changed
- drift or collision MUST transition workspace to `conflicted`
- executor loss SHOULD transition to `orphaned`, not silently retry
- retry must create fresh evidence and preserve prior evidence links; never overwrite prior truth

### Evidence Ref Contract

`evidence_ref` should be an opaque transport token in DevHub, but resolve to a routable artifact locator in the executor/audit layer.

Recommended shape:

- `kind` — workspace prep / drift / cleanup / QA / run artifact
- `locator` — pointer to executor-emitted bundle or artifact row
- `version` or integrity hint — checksum, sequence, or timeline id
- optional correlation ids to join back to `workspace_id` and later `agent_runs`

This lets DevHub store the reference without knowing git verbs, while SW-3.1 can dereference evidence consistently.

### Collision / Recovery Implications

The current `dirty-excluded` baseline is not a corner case; it is the expected recovery floor. `prepare_agent_workspace` must never normalize it to clean. If provisioning collides with existing branch/worktree ownership, the tool should report conflict evidence and let the control plane decide whether to pause, recover, or create a successor workspace.

### Approaches

1. **Thin control-plane command + executor evidence callback** — DevHub records intent and receives structured provisioning evidence.
   - Pros: cleanest boundary, aligns with SW-2.1/SW-3.1 freeze, auditable.
   - Cons: requires a well-defined evidence schema and executor adapter work.
   - Effort: Medium

2. **Rich workspace provisioning verb in MCP** — DevHub directly models more of the provisioning workflow.
   - Pros: faster to wire superficially.
   - Cons: reintroduces git/worktree control-plane leakage and violates frozen contracts.
   - Effort: Low initially, high later cleanup.

### Recommendation

Use **Approach 1**. Freeze `prepare_agent_workspace` as a narrow intent/acknowledgement surface and make all operational detail land in executor evidence referenced by opaque `evidence_ref`. This keeps SW-2.2 compatible with the frozen SW-2.1 workspace contract and the SW-3.1 audit model.

### Risks

- If `evidence_ref` is underspecified, SW-3.1 cannot audit workspace prep reliably.
- If `devhub_agent_runs` is treated as truth, UI drift will leak into durable planning.
- If collision handling is not explicit, dirty-excluded recovery will be mistaken for clean setup.
- Existing direct git side effects in agent routes will conflict with the new boundary unless later frozen out.

### Ready for Proposal

Yes — but only after the workspace contract and evidence locator semantics are frozen enough to keep `prepare_agent_workspace` narrow and auditable.
