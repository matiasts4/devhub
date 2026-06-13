# Proposal: Operator Execution Timeline

## Intent

Decision: freeze a canonical operator execution timeline before chat UX or operator-side actions. This starts now because roadmap step 2 is the trust boundary: without request -> policy -> tool -> status -> result/error -> audit refs, later Operator controls would be opaque and unsafe.

## Scope

### In Scope
- Define the ordered event model for action request, policy decision, tool invocation, status transition, result/error, and audit linkage.
- Define durable-vs-live authority rules so later UI/chat surfaces read one truth.
- Identify affected modules and the minimum contract later specs/design must cover.

### Out of Scope
- Storage schema, transport, or UI implementation.
- Chat composer UX, terminal/browser mutations, or autonomy rollout.
- New operator permissions beyond naming the policy checkpoints the timeline must expose.

## Capabilities

### New Capabilities
- `operator-execution-timeline`: ordered, auditable narrative for operator requests, policy decisions, tool executions, state changes, and outcomes.

### Modified Capabilities
- `agent-events`: operator actions need correlation IDs, policy/tool stage vocabulary, and idempotent event semantics.
- `swarm-observability`: Operator projections must keep durable-first authority and mark live hints as secondary.

## Approach

Reuse the durable-projection pattern from SW-8.7A and the director feed: durable records first, read models second, transport hints never authoritative. Timeline items should carry actor, stage, status, correlation/action IDs, tool name, evidence ref, redaction level, and next-step hint. The initial status vocabulary should at least cover requested, policy-approved, policy-denied, invoked, running, completed, failed, rolled-back, and deferred. Chat UX and action controls later consume this timeline; they do not create competing status.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `openspec/specs/agent-events/spec.md` | Modified | Freeze operator event vocabulary and correlation semantics. |
| `openspec/specs/swarm-observability/spec.md` | Modified | Extend durable-first timeline authority rules to Operator surfaces. |
| `openspec/specs/operator-execution-timeline/spec.md` | New | Future spec for event order, status model, and audit contract. |
| `devhub-mcp/server.js` | Reference | Future read-model exposure without changing the worker contract. |
| `src/lib/db/observability.js`, `src/lib/db/localDb.js` | Reference | Likely durable event/projector seam. |
| `src/app/api/agenthub/operations/health/route.js` and future Operator routes | Reference | Future projection transport surface. |
| `src/lib/operations/*`, `src/views/SwarmControl.jsx`, future Operator view | Reference | UI consumers of the canonical timeline. |
| Terminal/Browser/Agent/Swarm adapters | Reference | Future emitters of invocation and outcome evidence. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Chat or adapters become a second truth source | High | Freeze one canonical projection and label transport hints secondary. |
| Status model is too vague for trust or rollback | High | Design must lock explicit states and terminal reasons before UI/actions. |
| Sensitive command context leaks into audit | Med | Design must define redaction and evidence-reference policy. |

## Design Questions

- Which store is authoritative: extend `agent_events`, reuse observability tables, or introduce a dedicated append-only operator ledger?
- How are ordering, dedupe, retries, and correlation IDs defined across policy, tool, and result events?
- Which live transport is allowed later: SSE, WebSocket, MCP pull, or a mixed model with one durable watermark contract?

## Rollback Plan

If design cannot answer storage/transport cleanly, defer Operator to observer-only surfaces and keep chat UX plus action buttons out of scope. No operator autonomy ships without this timeline contract.

## Dependencies

- Roadmap step 2 in `docs/Implementaciones_Futuras.md`
- SW-8.7A durable evidence timeline pattern
- Existing `agent-events` and `swarm-observability` contracts

## Success Criteria

- [ ] Proposal makes timeline the prerequisite for chat UX and operator actions.
- [ ] Affected surfaces and capability ownership are explicit enough for specs/design.
- [ ] Storage, transport, redaction, and rollback questions are explicit and testable later.