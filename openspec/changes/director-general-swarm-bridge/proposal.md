# Proposal: Director General Swarm Bridge

## Intent

Decision: add a thin Director General layer in Operator View that wraps the existing `swarm-director` as a visible subsystem. Operator chooses and approves; Director General sequences and narrates; `swarm-director` remains the only delegation engine. This is roadmap point 5 and starts only after the action contract, timeline, observer sidebar, and limited operator actions land.

## Scope

### In Scope
- Define the Operator vs Director General authority boundary.
- Define a bridge contract from Operator View into existing Director mission, approval, and report seams.
- Make delegation, waiting, approval, failure, and fallback states visible in Operator timeline/observer surfaces.
- Gate implementation on the first four roadmap changes.

### Out of Scope
- Replacing `swarm-director` or duplicating orchestration logic.
- Hidden delegation, hidden agents, or direct worker spawning from Operator View.
- New durable truth, direct Git/worktree/filesystem authority, or broader autonomy before steps 1-4.

## Capabilities

### New Capabilities
- `director-general-bridge`: visible Operator-to-Director wrapper that requests work, exposes state, and surfaces escalation without becoming a second control plane.

### Modified Capabilities
- `swarm-observability`: show DG -> Director request/status/result/escalation chain with authority, freshness, and evidence.
- `director-mission-inbox`: carry DG-originated requests/replies through the existing mission channel, not a parallel transport.

## Approach

Threat model first:
- Assets: operator trust, permissioned action contract, mission/approval state, terminal/browser control authority.
- Entry points: Operator View actions, DG bridge controller, health snapshot, Director message/approval/report seams.
- Trust boundaries: Operator -> Director General -> `swarm-director` -> visible swarm workers.

Use existing `docs/prompts/swarm/swarm-director-v2.md` and current mission/approval/read-model seams as the only execution path. DG MAY compose requests, poll existing read models, and present approvals, but MUST NOT call workers directly. Every DG action SHALL emit a visible timeline row plus observer/sidebar state with initiator, target, status, and manual fallback text.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `docs/prompts/swarm/swarm-director-v2.md` | Reused | Explicit subsystem boundary DG must honor. |
| `openspec/specs/swarm-observability/spec.md` | Modified | Visible delegation/result rules. |
| `openspec/changes/director-general-swarm-bridge/proposal.md` | New | Bridge contract and rollout gates. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| DG bypasses Director | High | Ban direct worker APIs from DG scope. |
| Authority becomes implicit | High | Require visible escalation and review states. |
| Prerequisites slip | Medium | Defer implementation until steps 1-4 are accepted. |

## Rollback Plan

Do not ship the bridge before prerequisites exist. If implementation creates ambiguity, remove DG wiring and keep Operator View on the first four surfaces plus direct visible `swarm-director` usage.

## Dependencies

- Step 1: action contract and permissions.
- Step 2: operational timeline.
- Step 3: observer sidebar.
- Step 4: limited operator actions.

## Success Criteria

- [ ] DG wraps `swarm-director` instead of replacing it.
- [ ] No hidden delegation is introduced by default.
- [ ] Operator can review requests, feedback, and escalations from one visible surface.