# Proposal: Swarm Binding CLI Alignment

## Intent

Stop recurrent `binding_missing` delivery failures. Root cause: swarm launch/runtime creates mission/workspace/run/session rows, but no shared step guarantees the verified OpenCode session id is written back to canonical `agent_hub_sessions`, which `teamTell` requires.

## Scope

### In Scope

- Add one shared reconciliation write so verified `opencode_session_id` becomes durable in swarm runtime/session flow.
- Replace highest-friction `devhub mission` / `devhub worktree` diagnosis reads with narrow domain helpers.
- Add focused verification for binding repair and CLI alignment.

### Out of Scope

- Full CLI rewrite or broad SQL removal.
- MCP/runtime redesign, startup/Tauri work, branch/PR strategy changes.

## Capabilities

### New Capabilities

- `swarm-session-binding`: persist verified OpenCode session identity into canonical swarm session state.
- `cli-mission-command`: expose mission diagnosis through shared domain readers.
- `cli-worktree-command`: expose workspace diagnosis through shared domain readers.

### Modified Capabilities

None.

## Approach

Reuse `updateSessionOpenCodeId` in a shared post-activation reconciliation helper called from swarm launch/runtime flow. Keep `getVerifiedMissionRecipientBinding()` as gate, but feed it repaired durable state. Add narrow readers in `devhub-cli/lib/db.js` backed by existing localDb/compact-read helpers, then switch only `mission` and `worktree` list/status paths that operators use for swarm diagnosis. Verify with focused local tests on current branch.

## Affected Areas

| Area                                              | Impact   | Description                                             |
| ------------------------------------------------- | -------- | ------------------------------------------------------- |
| `src/app/api/agenthub/operations/health/route.js` | Modified | Trigger session-binding reconciliation                  |
| `src/lib/db/observability.js`                     | Modified | Canonical session-id write path                         |
| `src/lib/db/swarmMissions.js`                     | Modified | Preserve `binding_missing` vs `binding_stale` semantics |
| `devhub-cli/lib/db.js`                            | Modified | Add mission/workspace diagnostic readers                |
| `devhub-cli/commands/{mission,worktree}.js`       | Modified | Replace key raw SQL reads                               |
| tests in `src/lib/db` and `devhub-cli/commands`   | Modified | Focused regression coverage                             |

## Risks

| Risk                        | Likelihood | Mitigation                                              |
| --------------------------- | ---------- | ------------------------------------------------------- |
| Wrong session id reconciled | Med        | Write only verified active ids; add stale-session tests |
| CLI scope grows             | Med        | Limit changes to mission/worktree diagnosis reads       |

## Rollback Plan

Revert the reconciliation helper call and CLI reader swaps in one local commit. No schema rollback required.

## Dependencies

- Existing `agent_hub_sessions` row creation
- `updateSessionOpenCodeId`, `resolveAgentRuntimeBinding`, workspace evidence readers

## Success Criteria

- [ ] Verified swarm launches persist real `opencode_session_id` before delivery.
- [ ] Healthy recipients stop hitting recurrent `binding_missing`; `binding_stale` remains distinct.
- [ ] `mission` and `worktree` diagnosis views use shared domain helpers where binding/workspace state matters.
