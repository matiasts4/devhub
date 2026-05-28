## Exploration: swarm binding + CLI alignment

### Current State

`teamTell` only delivers when `getVerifiedMissionRecipientBinding` resolves a bound recipient. That path requires: mission participant → durable workspace → latest run → active `agent_hub_sessions` row with `opencode_session_id`. If any link is missing, the result stays `binding_missing`/`binding_stale` and the adapter is never called.

The launch/runtime side already creates mission, participant, workspace lease, run, and a synthetic `agent_hub_sessions` row, but there is no shared reconciliation step that guarantees the real OpenCode session id is written back into the canonical session row. `updateSessionOpenCodeId` exists, but it is only used by the Telegram bridge, not the swarm launch/runtime flow.

CLI coverage is partial: `tell` uses domain helpers, `ws` already uses compact evidence reads, but `status`, `mission`, and `worktree` still use direct SQL for operator reads. That is workable, but it leaves the operator surface fragmented.

### Affected Areas

- `src/lib/swarm/teamTell.js` — final delivery gate; shows `binding_missing` when binding lookup is incomplete.
- `src/lib/swarm/opencodeTargetResolver.js` — thin wrapper around the verified binding lookup.
- `src/lib/swarm/opencodeDeliveryAdapter.js` — only runs after binding is verified.
- `src/lib/db/swarmMissions.js` — canonical mission→participant→workspace→run→session binding logic.
- `src/lib/db/workspaces.js` — resolves runtime bindings and owns workspace lease state.
- `src/lib/db/observability.js` — has `updateSessionOpenCodeId`, but swarm flow does not use it.
- `src/app/api/agenthub/operations/health/route.js` — launch path creates the workspace/run/session chain; likely missing the final session-binding write.
- `src/app/api/agenthub/sessions/stream/route.js` — reads session state only; no binding repair.
- `src/app/api/agenthub/sessions/[sessionId]/traces/route.js` — trace read/write only.
- `devhub-cli/cli.js` — CLI surface to align.
- `devhub-cli/commands/tell.js` — already domain-shaped write path.
- `devhub-cli/commands/mission.js` — still raw SQL for mission reads.
- `devhub-cli/commands/worktree.js` — still raw SQL for workspace reads/cleanup.
- `devhub-cli/lib/db.js` — domain helpers available to CLI.
- `docs/Plyrium/documentos.md` — baseline/contract framing.
- `docs/Plyrium/comparacion_devhub.md` — backlog vs shipped contract.

### Approaches

1. **Shared binding reconciliation helper** — Add one canonical helper for launch/runtime to reconcile `agent_hub_sessions.opencode_session_id` with workspace/run state, then reuse the same binding snapshot in delivery lookup and the highest-friction CLI reads.
   - Pros: fixes the real `binding_missing` gap; small surface; preserves current mission/workspace model.
   - Cons: does not remove every raw SQL query from CLI.
   - Effort: Medium

2. **Operator read-contract refactor** — Replace mission/worktree/status raw SQL with compact domain readers everywhere, and add an explicit binding inspection/repair command.
   - Pros: cleaner CLI contract; less duplication; easier to reason about reads.
   - Cons: larger change; not necessary to unblock delivery binding; higher review cost.
   - Effort: Medium/High

### Recommendation

Do approach 1. The smallest coherent fix is to close the missing launch/runtime/session handshake by writing the verified OpenCode session id back through a shared domain helper, then use the same domain readers to trim the CLI’s ad-hoc SQL where it overlaps with mission/workspace state.

### Risks

- Wrong session-id reconciliation could bind deliveries to stale sessions.
- Refactor must preserve the current `binding_missing` vs `binding_stale` distinction.
- CLI read changes must not drift from the durable mission/workspace model.

### Ready for Proposal

Yes — the root cause is narrow enough for one SDD change: a binding-reconciliation fix plus targeted CLI contract cleanup.
