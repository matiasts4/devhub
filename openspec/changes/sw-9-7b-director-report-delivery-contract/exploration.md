# Exploration: SW-9.7B director report delivery contract

### Current State

- `src/lib/db/swarmMissions.js` already owns durable mission messages, deliveries, presence, and `getSwarmMissionDirectorSnapshot()`.
- `src/lib/swarm/teamTell.js` already creates a mission message and durable delivery receipts for recipients and sends only to verified sessions.
- `src/app/api/agenthub/operations/health/route.js` already projects `mission_control` and the Director queue/approval timeline from durable truth.
- `src/components/control-room/MissionKernelPanel.jsx` already surfaces recent messages, deliveries, presence, and a local composer, which is the closest existing Director inbox surface.
- What is missing is a verifiable contract that an agent report becomes a durable Director-visible delivery event tied to the Director terminal/session, with explicit receipt/status semantics.

### Affected Areas

- `src/lib/swarm/teamTell.js` — report emission and verified-session delivery semantics.
- `src/lib/db/swarmMissions.js` — mission-message/delivery helpers and Director snapshot projection.
- `src/app/api/agenthub/operations/health/route.js` — read-model surface for report delivery status.
- `src/components/control-room/MissionKernelPanel.jsx` — visible Director inbox/report feed.
- `src/views/SwarmControl.jsx` — wiring for any new report-delivery status copy.
- `src/lib/operations/__tests__/swarmControl.test.js`, `src/lib/db/swarmMissions.test.js`, `src/views/__tests__/SwarmControl.test.jsx` — contract tests for delivery receipts, ordering, and visible Director state.

### Approaches

1. **Reuse mission kernel as report transport** — model reports as mission messages plus delivery receipts, keep Director terminal/session as the verified consumer, and expose a narrow delivery-status projection.
   - Pros: no new tables, reuses proven durable seams, aligns with SW-8.2C/SW-8.1C.
   - Cons: must define exact message kind/channel mapping to avoid semantic drift.
   - Effort: Medium.

2. **Add a dedicated report subsystem** — new report envelope or transport route with its own persistence.
   - Pros: explicit semantics.
   - Cons: likely overkill, higher review risk, violates the repo's durable-first minimalism.
   - Effort: High.

### Recommendation

Use mission messages + deliveries as the report contract. Make Director terminal/session visibility a projection of durable receipts, not a new source of truth. Put the full-flow QA checklist here so it verifies the integrated observability + delivery path after 9-7A is merged.

### Risks

- If “report” stays implicit, the Director terminal/session contract will be hard to verify and easy to regress.
- If a new transport or storage layer is introduced, the repo will gain a second truth surface.
- Delivery receipts must stay aligned with durable mission snapshot fields, or the inbox will become misleading.

### Ready for Proposal

Yes — but only as a durable-contract slice. Do not introduce a second transport or runtime-only report store.
