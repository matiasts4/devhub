# Proposal: SW-8.7A Durable Evidence Timeline MVP

## Intent

Control Room already has durable truth in `mission_messages`, `message_deliveries`, `agent_presence`, `agent_runs`, `agent_artifacts`, `supervisor_snapshots`, and `supervisor_approval_checkpoints`. The gap is operator visibility: today the room is snapshot-first and mostly read-only, but it does not project one ordered evidence narrative from that truth. SW-8.7A adds that read-only evidence timeline without turning `agent_traces`/session SSE into primary state and without opening any new mutation surface.

## Scope

### In Scope

- Add a read-only evidence timeline/projection over the existing durable Control Room snapshot.
- Derive ordered timeline entries from existing durable records and explicit relationships already present in the snapshot truth.
- Mark `agent_traces` and session SSE as optional secondary evidence only, never as durable authority.
- Add selector/API/UI tests that lock read-only behavior and source authority.

### Out of Scope

- No writes, no approvals mutation, no queue/dispatch mutation, and no new durable schema.
- No new control plane, no Browser/GTK/VTE work, and no terminal/session control surface.
- SW-8.8A approval actions/policy UX and SW-9.x orchestration, recovery, or hardening work.

## Capabilities

### New Capabilities

- `durable-evidence-timeline`: render an ordered, read-only evidence timeline from existing durable snapshot truth.

### Modified Capabilities

- `swarm-observability`: snapshot contract SHALL distinguish primary durable evidence from secondary runtime hints in timeline projections.

## Approach

Extend the existing snapshot assembly and `swarmControl` normalization with a deterministic `evidence_timeline` slice built from durable records first. Timeline items SHOULD carry event type, timestamp, linked ids, authority, freshness, and evidence refs. Runtime-local hints from `agent_traces` or SSE MAY appear only when linked to durable ids and MUST be labeled secondary/non-authoritative; they MUST NOT change approval, queue, run, or delivery truth.

## Affected Areas

| Area                                                                     | Impact   | Description                                         |
| ------------------------------------------------------------------------ | -------- | --------------------------------------------------- |
| `openspec/changes/sw-8-7a-durable-evidence-timeline-mvp/proposal.md`     | New      | Proposal artifact                                   |
| `openspec/specs/swarm-observability/spec.md`                             | Modified | Timeline authority and boundary rules               |
| `src/app/api/agenthub/operations/health/route.js`                        | Modified | GET snapshot projection only; no new POST mutations |
| `src/lib/operations/swarmControl.js`                                     | Modified | Normalize/select durable evidence timeline          |
| `src/views/SwarmControl.jsx` / `src/components/control-room/*`           | Modified | Render bounded read-only evidence timeline          |
| `tests/agenthub/api/operations-health.test.js` / `src/views/__tests__/*` | Modified | Lock projection order, authority, and non-mutation  |

## Risks

| Risk                                      | Likelihood | Mitigation                                        |
| ----------------------------------------- | ---------- | ------------------------------------------------- |
| Runtime traces become implied truth       | High       | Require explicit primary vs secondary authority   |
| Slice drifts into approvals/dispatch UX   | High       | Ban mutation paths and lock GET-only projection   |
| Cross-table ordering becomes inconsistent | Med        | Define deterministic ordering and tie-break rules |

## Rollback Plan

Revert timeline projection/UI changes. Existing durable tables, approval flow, queue flow, and snapshot contract remain the source of truth.

## Dependencies

- Existing snapshot-first Control Room and `swarm-observability` read model.
- Durable evidence tables and relations already present in `localDb`.

## Success Criteria

- [ ] Control Room shows one ordered evidence timeline sourced from existing durable truth.
- [ ] `agent_traces`/session SSE, if shown, are explicitly secondary evidence and never primary authority.
- [ ] No writes, approval mutations, queue/dispatch mutations, schema additions, or Browser/GTK work are introduced.
- [ ] Proposal keeps SW-8.7A separate from SW-8.8A approval UX and SW-9.x orchestration hardening.
