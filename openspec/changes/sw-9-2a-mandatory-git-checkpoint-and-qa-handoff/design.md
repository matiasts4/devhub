# Design: SW-9.2A mandatory git checkpoint and QA handoff

## Technical Approach

Enforce the checkpoint gate at the durable mutation boundary, not in UI copy. `devhub-mcp/server.js` will centralize validation for any terminal handoff request (`completed` plus the QA-handoff path documented as `qa-ready`) before task state persists. Human-readable comments stay as audit trail, but server validation becomes the write authority. Snapshot and Control Room layers only project accepted/rejected gate results.

## Architecture Decisions

| Decision           | Options                                                    | Choice                                                                               | Rationale                                                               |
| ------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Gate location      | UI/prompt, comment-only parser, MCP mutation path          | MCP mutation path                                                                    | Only server-side enforcement closes the documented loophole.            |
| Evidence source    | Comment text only, structured DB field, hybrid validator   | Hybrid validator over latest `[git:checkpoint]` comment + task/workspace/run context | Reuses existing audit trail without inventing a parallel user workflow. |
| `commit=none` rule | Always allow, never allow, allow only zero-change analysis | Allow only zero-change analysis                                                      | Matches policy docs and avoids bypass for changed work.                 |
| UI authority       | Client decides gate, client projects gate                  | Client projects gate only                                                            | Keeps durable truth in server; UI remains read-model.                   |

## Data Flow

```text
Executor
  └─ add_task_comment([git:checkpoint] ...)
        └─ update_task(completed) or QA-handoff mutation
              └─ validateCheckpointHandoff(task, latest checkpoint, workspace/run facts)
                    ├─ valid   -> persist state + snapshot metadata
                    └─ invalid -> reject mutation + return remediation payload
                                └─ operations/health projects gate result
                                      └─ SwarmControl / DirectorQueuePanel shows status only
```

## File Changes

| File                                                 | Action | Description                                                                                                        |
| ---------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------ |
| `devhub-mcp/server.js`                               | Modify | Add shared checkpoint-handoff validator, comment parsing, terminal-state guard, and normalized rejection payloads. |
| `src/app/api/agent/qa-result/route.js`               | Modify | Reuse the same validator before approved QA can finalize task closure.                                             |
| `src/app/api/agenthub/operations/health/route.js`    | Modify | Project accepted/blocked handoff evidence and remediation details into snapshot input.                             |
| `src/lib/operations/swarmControl.js`                 | Modify | Normalize new director queue / handoff gate fields for UI consumers.                                               |
| `src/views/SwarmControl.jsx`                         | Modify | Render durable gate errors/status from snapshot, without local enforcement logic.                                  |
| `src/components/control-room/DirectorQueuePanel.jsx` | Modify | Show checkpoint gate outcome/remediation messaging as read-only operator context.                                  |
| `devhub-mcp/AGENT-FLOW.md`                           | Modify | Align tool contract text with enforced mutation behavior.                                                          |
| `docs/24_Politica_Git_y_Versionado_Agentes.md`       | Modify | Clarify that policy is now durably enforced, including `commit=none` exception boundaries.                         |

## Interfaces / Contracts

`validateCheckpointHandoff(task, context) -> { ok, code, message, checkpoint }`

Required parsed checkpoint fields:

```json
{
  "commit": "<sha|none>",
  "worktree": "clean|dirty-excluded",
  "docs": ["path|none"],
  "checks": ["check-name|not run"],
  "reason": "required when commit=none or dirty-excluded"
}
```

Validation rules:

- reject missing/incomplete checkpoint fields;
- reject `commit=none` unless task handoff is analysis-only and no changed-work evidence exists;
- reject terminal handoff when latest checkpoint is stale or not attributable to the same task context;
- return machine-stable error code plus remediation text for UI/Telegram/tests.

## Testing Strategy

| Layer       | What to Test                                                | Approach                                                                                       |
| ----------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Unit        | Checkpoint parser and validator branches                    | Jest cases for complete, incomplete, stale, `commit=none`, dirty-excluded.                     |
| Integration | `update_task` and QA approval paths reject/accept correctly | DevHub MCP + route tests asserting no terminal persistence on invalid evidence.                |
| E2E/UI      | Control Room projection of blocked/accepted handoff         | Existing React tests for `SwarmControl`/`DirectorQueuePanel`; add gate messaging expectations. |

## Migration / Rollout

No migration required. Rollout is atomic with tests/docs because the change tightens existing policy rather than introducing new durable entities.

## Open Questions

- [ ] `qa-ready` is documented as a handoff outcome but not a current `tasks.status` enum; implementation should gate the real QA-finalization mutation paths instead of inventing a new persisted task status.
