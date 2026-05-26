# Design: Swarm Binding CLI Alignment

This change makes one truth source for swarm session binding, then reuses that truth in the CLI paths operators actually use.

## Quick path

1. Launch writes mission/workspace/run/canonical session, but NOT a guessed `opencode_session_id`.
2. Runtime detects the real OpenCode session id and sends it through one shared reconciliation step.
3. `teamTell`, `mission`, and `worktree` read the same durable binding contract.

## Technical Approach

Add a shared reconciliation helper in the DB layer that validates the workspace→run→session chain before calling `updateSessionOpenCodeId(...)`. Call it from the swarm runtime path that already knows both the canonical session id and the detected OpenCode session id. Keep `getVerifiedMissionRecipientBinding()` as the only delivery gate; the fix is to feed it repaired durable state, not bypass it.

## Architecture Decisions

| Topic                   | Decision                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reconciliation location | Put canonical reconciliation in shared DB/runtime code (`src/lib/db/workspaces.js` + `observability.js` export path), not in `teamTell`, CLI commands, or route-local SQL. Reason: binding validity depends on workspace/run/session topology already owned there.                                                                                               |
| Write evidence          | Write `opencode_session_id` only when all are true: canonical `agent_hub_sessions.id` exists, workspace id exists, latest run matches workspace, `agent_workspaces.run_id_or_session_id === session.id`, session is still active, and runtime reports a concrete OpenCode id for that exact launched panel/session. Reason: prevents guessed or cross-panel ids. |
| Missing vs stale        | Preserve current semantics: missing = chain absent (no participant/workspace/run/session identity); stale = chain exists but verified OpenCode binding is absent or unusable. Reason: operators and delivery logic already depend on this distinction.                                                                                                           |
| CLI rollout order       | Move `mission status` first, then `worktree status`/`worktree list`. Leave `mission list` and `worktree clean` alone. Reason: the first two are the highest-friction diagnostic reads for `binding_missing`; the others are summary/mutation paths with low contract value.                                                                                      |

## Data Flow

```text
launchSwarmLocal
  -> create workspace + run + canonical session(id=sessionId, opencode_session_id=null)
  -> runtime_request { workspaceId, runId, sessionId }
  -> terminal panel starts OpenCode
  -> tty detection emits real opencode session id
  -> POST /api/agenthub/sessions/{sessionId}/binding
  -> reconcile helper validates workspace/run/session evidence
  -> updateSessionOpenCodeId(sessionId, detectedId)
  -> getVerifiedMissionRecipientBinding() returns bound
  -> teamTell may send
```

## File Changes

| File                                                         | Action | Description                                                                                                             |
| ------------------------------------------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------- |
| `src/lib/db/workspaces.js`                                   | Modify | Add shared reconciliation helper that validates workspace/run/session evidence before durable write.                    |
| `src/lib/db/observability.js`                                | Modify | Keep low-level writer, but expose reconciliation-safe usage path.                                                       |
| `src/lib/db/localDb.js`                                      | Modify | Re-export reconciliation helper for routes/tests.                                                                       |
| `src/lib/db/compactReads.js`                                 | Modify | Add mission/workspace diagnostic readers built on domain helpers.                                                       |
| `src/lib/db/swarmMissions.js`                                | Modify | Keep verified-binding gate; optionally harden verified-session checks to reconciled runtime ids only.                   |
| `src/app/api/agenthub/operations/health/route.js`            | Modify | Stop seeding guessed `opencode_session_id`; keep canonical session/workspace/run ids in runtime request payload.        |
| `src/app/api/agenthub/sessions/[sessionId]/binding/route.js` | Create | Route that receives detected OpenCode id and invokes shared reconciliation helper.                                      |
| `src/components/TerminalWorkspacesManager.jsx`               | Modify | Persist `workspaceId/runId/sessionId` with panel metadata and call binding route on `devhub:opencode-session-detected`. |
| `devhub-cli/lib/db.js`                                       | Modify | Export new mission/workspace diagnosis readers.                                                                         |
| `devhub-cli/commands/{mission,worktree}.js`                  | Modify | Replace raw diagnostic SQL with shared readers.                                                                         |

## Interfaces / Contracts

```js
reconcileAgentRuntimeSessionBinding(db, {
  session_id,
  workspace_id,
  run_id,
  opencode_session_id,
}) => {
  status: 'reconciled' | 'noop',
  reason: 'binding_reconciled' | 'binding_missing' | 'binding_stale',
}
```

`mission status` should return mission snapshot + participant binding summaries. `worktree status/list` should return workspace evidence + canonical session binding state, not ad-hoc table reads.

## Testing Strategy

| Layer       | What to Test                                                                                                                  | Approach                                                               |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Unit        | Reconciliation helper writes only on aligned evidence; refuses mismatched workspace/run/session; preserves missing vs stale   | Add DB-first Jest tests in `src/lib/db/*test.js` before implementation |
| Integration | Launch path creates canonical rows with unresolved binding, then binding route reconciles real OpenCode id                    | Extend `operations-health` tests plus new route test                   |
| UI/CLI      | `TerminalWorkspacesManager` posts reconciliation after session detection; `mission`/`worktree` commands read shared summaries | Add focused component test and CLI JSON contract tests                 |

Strict TDD order: helper red tests -> route red tests -> CLI reader red tests -> implementation -> refactor.

## Migration / Rollout

No schema migration required. Rollout is code-only: new launches stop writing guessed ids; active launches reconcile lazily on first detected OpenCode session event.

## Open Questions

- [ ] Should rollout also clear legacy guessed `opencode_session_id` values, or only stop producing them going forward?
