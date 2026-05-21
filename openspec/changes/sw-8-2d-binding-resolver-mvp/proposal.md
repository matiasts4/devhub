# Proposal: SW-8.2D Binding Resolver MVP

## Intent

SW-8.2D drifted toward terminal lifecycle, but repo truth says ownership already lives in `agent_workspaces` + `agent_runs`. Smallest safe slice is a durable-first resolver/projection for agent ↔ workspace ↔ run ↔ reusable runtime session state without making runtime maps, PTY state, or `agent_hub_sessions` a second source of truth.

## Scope

### In Scope

- Add one read-side resolver over existing durable records with classification states: `bound`, `stale`, `missing`, `orphaned`.
- Clarify `run_id_or_session_id` as correlation input only; derive ownership from `workspace_id` + latest durable `run_id`.
- Freeze deterministic tests with fixtures/mocks only; no terminal open, attach, focus, close, or restore.

### Out of Scope

- Terminal lifecycle ownership, provider UI, PTY/VTE control, SSE/stdout/log truth, SW-8.3A, SW-8.4A.
- New durable binding table unless resolver proves existing schema cannot express the read model.

## Capabilities

### New Capabilities

- `agent-runtime-binding-resolver`: derive durable-first binding state for agent/workspace/run/runtime-session reuse without opening terminals.

### Modified Capabilities

- `agent-workspace-lifecycle`: `run_id_or_session_id` SHALL remain optional correlation metadata and SHALL NOT be treated as durable ownership truth.

## Approach

Promote current ad-hoc lookup (`getVerifiedMissionRecipientBinding`) into a generic `localDb` resolver plus thin consumer helper. Resolver reads `agent_workspaces`, latest `agent_runs`, and bounded runtime evidence only for classification. `agent_hub_sessions.opencode_session_id`, `sessionStore`, `ttyServer`, and `native_vte` stay evidence surfaces; they MAY explain runtime presence but SHALL NOT own the binding.

## Affected Areas

| Area                                                        | Impact                   | Description                                           |
| ----------------------------------------------------------- | ------------------------ | ----------------------------------------------------- |
| `openspec/changes/sw-8-2d-binding-resolver-mvp/proposal.md` | New                      | MVP proposal anchored to repo reality                 |
| `src/lib/db/localDb.js`                                     | Modified                 | Durable-first binding resolver + classification rules |
| `src/lib/db/localDb.test.js`                                | Modified                 | Fixtures for bound/stale/missing/orphaned             |
| `src/lib/swarm/opencodeTargetResolver.js`                   | Modified                 | Consume generic resolver, not session-owned truth     |
| `src/lib/terminal/sessionStore.js`                          | Reference                | Runtime evidence only; no ownership promotion         |
| `src/lib/terminal/ttyServer.js`                             | Reference                | Runtime evidence only; no lifecycle scope             |
| `src/app/api/agenthub/sessions/route.js`                    | Reference/Maybe Modified | Only if bounded read reuse is required                |
| `src-tauri/src/native_vte.rs`                               | Reference                | Native runtime signal source, never durable truth     |

## Risks

| Risk                                                  | Likelihood | Mitigation                                                                |
| ----------------------------------------------------- | ---------- | ------------------------------------------------------------------------- |
| Resolver accidentally canonizes runtime session ids   | High       | Derive ownership from workspace/run only; tests reject runtime-only truth |
| `run_id_or_session_id` ambiguity leaks into API shape | High       | Return explicit derived fields (`workspace_id`, `run_id`, classification) |
| Scope bleed into lifecycle work                       | Med        | Keep read model pure and exclude open/focus/close behavior                |

## Rollback Plan

Revert resolver/helper changes and keep the current mission-specific lookup. No schema migration, no new table, no runtime cleanup required.

## Dependencies

- `openspec/changes/sw-2-1-agent-workspaces-strategy/specs/agent-workspace-lifecycle/spec.md`
- Durable execution path in `src/app/api/agent/execute/route.js`
- Existing orphan signal in `src/lib/swarm/supervisorLoop.js`

## Success Criteria

- [ ] Resolver returns durable-first binding facts with explicit `bound` / `stale` / `missing` / `orphaned` states.
- [ ] No new binding ownership table is introduced for the MVP.
- [ ] Tests prove runtime evidence cannot become durable truth and no real terminal is opened.
