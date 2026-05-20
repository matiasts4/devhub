# Proposal: SW-8.4A Terminal Lifecycle Contract MVP

## Intent

SW-8.4A must stay AFTER SW-8.2D durable binding resolution and BEFORE UI/workflow expansion. This slice defines a minimal terminal adapter lifecycle contract that consumes durable ownership from `agent_workspaces` + latest `agent_runs`, while keeping PTY/VTE/session maps as runtime evidence only.

## Scope

### In Scope

- Define MVP contract semantics for `open`, `attach`, `focus`, `resize`, `close`, `restore`, and `heartbeat`.
- Consume SW-8.2D binding projection as the only ownership input for lifecycle decisions.
- Normalize adapter/runtime outcomes across PTY, `sessionStore`, AgentHub session rows, and native VTE into evidence/status only.
- Add focused tests for contract semantics and durable-vs-runtime boundary.

### Out of Scope

- New durable ownership table or alternate ownership model.
- SW-8.3A UI/panel redesign, broader workflow UX, or orchestration/dispatch logic.
- Provider expansion beyond current PTY/native VTE seams.
- Deep native rewrite; only bounded adapter hooks if required by contract.

## Capabilities

### New Capabilities

- `terminal-adapter-lifecycle`: define durable-first lifecycle semantics for terminal runtime adapters without changing ownership truth.

### Modified Capabilities

- None

## Approach

Build one lifecycle boundary over existing seams (`ttyServer`, `sessionStore`, native VTE bridge, session routes). `open`/`restore` MUST start from SW-8.2D classification plus durable `workspace_id`/`run_id`; runtime state MAY confirm availability or mark stale/unavailable, but MUST NOT claim ownership. `attach`, `focus`, `resize`, and `close` act on adapter-held runtime handles only. `heartbeat` reports liveness/freshness as evidence, never canonical control-plane truth.

## Affected Areas

| Area                                                                   | Impact                   | Description                                             |
| ---------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------- |
| `openspec/changes/sw-8-4a-terminal-lifecycle-contract-mvp/proposal.md` | New                      | Proposal for bounded lifecycle slice                    |
| `src/lib/terminal/ttyServer.js`                                        | Modified                 | PTY adapter contract hooks and runtime evidence mapping |
| `src/lib/terminal/sessionStore.js`                                     | Modified                 | Restore/heartbeat evidence inputs only                  |
| `src/lib/terminal/nativeVteBridge.js`                                  | Modified                 | Native adapter contract surface                         |
| `src-tauri/src/native_vte.rs`                                          | Maybe Modified           | Only additive native hooks required by contract         |
| `src/app/api/terminal/sessions/route.js`                               | Modified                 | Expose contract-shaped runtime snapshot if needed       |
| `src/app/api/agenthub/sessions/route.js` / `health/route.js`           | Reference/Maybe Modified | Reuse evidence, not ownership                           |

## Risks

| Risk                                       | Likelihood | Mitigation                                                                            |
| ------------------------------------------ | ---------- | ------------------------------------------------------------------------------------- |
| Runtime session ids regain ownership power | High       | Require SW-8.2D binding input for `open`/`restore`; tests reject runtime-only binding |
| Scope bleeds into UI/orchestration         | Medium     | Keep acceptance on contract semantics only                                            |
| Native gap forces oversize work            | Medium     | Allow degraded/unsupported outcomes instead of deep rewrite                           |

## Rollback Plan

Revert lifecycle adapter changes and keep existing ad-hoc PTY/native behavior while preserving SW-8.2D durable binding projection unchanged.

## Dependencies

- `openspec/changes/sw-8-2d-binding-resolver-mvp/specs/agent-runtime-binding-resolver/spec.md`
- Existing durable ownership contract in `agent_workspaces` / `agent_runs`

## Success Criteria

- [ ] Contract defines `open|attach|focus|resize|close|restore|heartbeat` semantics against durable-first ownership.
- [ ] No new ownership table is introduced.
- [ ] Runtime evidence can refine availability/staleness but cannot create ownership.
- [ ] Slice stays bounded from SW-8.3A UI and broader dispatch/orchestration work.
