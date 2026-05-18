# Proposal: SW-6.1 Telegram External Adapter Plan

## Intent

SW-6.1 starts now because SW-2.1, SW-3.1, SW-2.2, and SW-4.1 already freeze durable workspace/run/artifact/lease contracts. With control-plane truth stabilized, Telegram can be bounded as an external channel instead of a shadow orchestrator.

## Scope

### In Scope

- Define Telegram as a bounded adapter over durable DevHub Swarm state.
- Define allowed Telegram intents, readable status/evidence, and approval/audit/idempotency rules.
- Mark docs/spec follow-up needed for SW-5.1 and SW-7.1.

### Out of Scope

- No Telegram-owned queue, lease, workspace, run, artifact, git, worktree, merge, or filesystem authority.
- No implementation or revival of legacy LLM-bridge behavior beyond audited adapter-safe reuse.

## Capabilities

### New Capabilities

- `telegram-external-adapter`: Telegram channel contract for intent submission, durable state reads, approvals, audit, and idempotent delivery.

### Modified Capabilities

- `swarm-observability`: add durable channel/supervisor snapshots consumable by Telegram/UI without `devhub_agent_runs`.
- `telegram-flow-tests`: require adapter-safe tests for intent envelopes, approval gates, and no orchestration verbs.

## Approach

Adopt a split-boundary plan: reuse chat/session persistence only where adapter-safe, deprecate legacy bridge/orchestration paths, and route all meaningful writes through DevHub control-plane contracts. Telegram may send intents like status query, queue view, task detail, approve/reject pending action, retry notification, and subscribe/unsubscribe; it may read durable summaries, run/task/workspace state, approvals, and artifact evidence references.

## Affected Areas

| Area                                               | Impact   | Description                                         |
| -------------------------------------------------- | -------- | --------------------------------------------------- |
| `openspec/specs/swarm-observability/spec.md`       | Modified | Durable channel snapshot contract                   |
| `openspec/specs/telegram-flow-tests/spec.md`       | Modified | Adapter-safe Telegram behavior coverage             |
| `openspec/specs/telegram-external-adapter/spec.md` | New      | New bounded adapter capability                      |
| `docs/13_Telegram_LLM_Bridge.md`                   | Modified | Rewrite/supersede stale bridge model                |
| `docs/review/MODULO-06-telegram-bot.md`            | Modified | Reference audit constraints and deprecation targets |

## Risks

| Risk                                      | Likelihood | Mitigation                                       |
| ----------------------------------------- | ---------- | ------------------------------------------------ |
| Legacy bridge leaks orchestration powers  | High       | Explicit verb denylist and audited reuse only    |
| Telegram status drifts from durable truth | Med        | Read only durable DevHub summaries/artifacts     |
| Replayed chat actions duplicate effects   | Med        | Idempotency keys plus approval/audit checkpoints |

## Rollback Plan

Keep Telegram on read-only status/notification mode, disable new intent handlers, and retain DevHub MCP/UI as sole mutation path until specs/design are corrected.

## Dependencies

- Frozen checkpoints: SW-2.1, SW-3.1, SW-2.2, SW-4.1
- Follow-up docs for SW-5.1 and SW-7.1 must consume the same adapter snapshot/intent envelope

## Success Criteria

- [ ] Proposal freezes Telegram as channel-only, with DevHub still sole durable authority.
- [ ] Specs can derive allowed intents, readable evidence, and approval/audit/idempotency rules without ambiguity.
