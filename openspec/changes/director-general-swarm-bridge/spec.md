# Spec: Director General Swarm Bridge

## Status

**Change**: director-general-swarm-bridge
**Phase**: spec
**Artifact store**: openspec
**Author**: SDD orchestrator
**Date**: 2026-05-30

---

## Overview

This spec defines the thin Director General (DG) bridge layer that wraps the existing `swarm-director` subsystem inside Operator View. DG is a *visible sequencing and narration* layer — it coordinates, narrates, and surfaces state; it does not execute delegation. The Operator retains full authority; DG is the membrane between Operator intent and Director execution.

---

## Normative References

- `docs/prompts/swarm/swarm-director-v2.md` — the authoritative DG ↔ Director boundary contract
- `openspec/specs/swarm-observability/spec.md` — delegation/result visibility rules for SwarmControl
- Proposal: `openspec/changes/director-general-swarm-bridge/proposal.md`

---

## Terminology

| Term | Definition |
|------|------------|
| **Director General (DG)** | Thin Operator-side bridge that composes requests, polls state, and surfaces approvals. Never calls workers directly. |
| **swarm-director** | The existing delegation engine. DG routes all work through it; Director is the only entity that spawns workers. |
| **Operator** | The human user in Operator View who reviews, approves, and initiates work. |
| **Mission inbox** | Shared channel DG and Director use to exchange requests, replies, and escalations. |
| **Timeline row** | A single timestamped entry in the operational timeline describing one DG action. |
| **Observer sidebar** | The live state panel showing DG → Director → worker chain with authority and freshness metadata. |

---

## Authority Boundary

```
Operator
  └─► Director General  (sequences, narrates, surfaces approvals)
 └─► swarm-director  (executes, delegates to workers)
              └─► visible swarm workers
```

**Invariant**: DG SHALL NOT call worker APIs, spawn workers, or write directly to the worker roster. All delegation passes through `swarm-director`.

---

## Capability: director-general-bridge

### 1. Request Composition

DG receives an intent from Operator View (e.g., "run a swarm mission"). It composes a structured mission request and submits it to the mission inbox for Director consumption.

**MUST** emit a timeline row containing:
- `initiator`: "operator"
- `target`: "swarm-director"
- `action`: "mission-request"
- `status`: "pending"
- `fallback`: manual action text (e.g., "Operator may approve or cancel")

#### Scenario: Operator initiates a mission

- GIVEN the Operator is authenticated in Operator View
- WHEN the Operator submits a mission intent
- THEN DG SHALL compose a mission request payload and post it to the mission inbox
- AND a timeline row SHALL be written with `initiator: "operator"`, `target: "swarm-director"`, `status: "pending"`
- AND the observer sidebar SHALL display the row with `freshness: "just_now"` and `authority: "operator-initiated"`

### 2. Waiting / Polling State

While Director processes the request, DG SHALL poll the existing read model for Director status updates and surface the current state in the observer sidebar.

**MUST** emit a timeline row containing:
- `initiator`: "director-general"
- `target`: "swarm-director"
- `action`: "status-poll"
- `status`: "waiting" | "in-progress" | "completed" | "failed"
- `fallback`: manual escalation text when `status: "failed"`

#### Scenario: Director is processing a mission

- GIVEN DG has submitted a mission request to the mission inbox
- WHEN Director is actively processing the mission
- THEN DG SHALL poll the Director read model at a fixed interval (TBD; must not exceed 1 poll/second)
- AND the observer sidebar SHALL show `status: "in-progress"` with a timestamp
- AND DG SHALL NOT take any autonomous action while `status: "in-progress"`

#### Scenario: Director mission fails

- GIVEN DG has submitted a mission request and Director returns `status: "failed"`
- WHEN DG receives the failure signal
- THEN DG SHALL write a timeline row with `status: "failed"` and `fallback: "<escalation text>"`
- AND the observer sidebar SHALL display the failure row with `authority: "director-escalated"` and a manual fallback prompt
- AND DG SHALL NOT retry or re-submit without Operator action

### 3. Approval Gate

When Director surfaces an approval item (e.g., a dangerous action requires Operator confirmation), DG presents it in the observer sidebar and waits for Operator approval or rejection.

**MUST** emit a timeline row containing:
- `initiator`: "swarm-director"
- `target`: "operator"
- `action`: "approval-required"
- `status`: "awaiting-approval"
- `fallback`: empty (approval is explicitly Operator-driven)

#### Scenario: Director escalates an approval request

- GIVEN Director emits an approval-required signal on the mission inbox
- WHEN DG reads the signal
- THEN DG SHALL write a timeline row with `action: "approval-required"` and `status: "awaiting-approval"`
- AND the observer sidebar SHALL display the approval item with `authority: "operator"` and a visible approve/reject control
- AND DG SHALL NOT forward the request to workers until Operator approves

#### Scenario: Operator approves

- GIVEN an approval row exists with `status: "awaiting-approval"`
- WHEN the Operator clicks approve
- THEN DG SHALL post the approval reply to the mission inbox
- AND DG SHALL write a timeline row with `status: "approved"` and `initiator: "operator"`
- AND the observer sidebar SHALL update to show `status: "approved"`

#### Scenario: Operator rejects

- GIVEN an approval row exists with `status: "awaiting-approval"`
- WHEN the Operator clicks reject
- THEN DG SHALL post the rejection reply to the mission inbox
- AND DG SHALL write a timeline row with `status: "rejected"` and `initiator: "operator"`
- AND DG SHALL NOT forward the request to workers

### 4. Result Surface

When Director completes a mission, DG reads the result from the mission inbox and presents it in the observer sidebar with authority and evidence metadata.

**MUST** emit a timeline row containing:
- `initiator`: "swarm-director"
- `target`: "operator"
- `action`: "mission-result"
- `status`: "completed" | "failed"
- `fallback`: empty for completed; escalation text for failed

#### Scenario: Director mission completes successfully

- GIVEN Director completes a mission and posts the result to the mission inbox
- WHEN DG reads the result
- THEN DG SHALL write a timeline row with `action: "mission-result"`, `status: "completed"`, and evidence metadata
- AND the observer sidebar SHALL display the result with `authority: "director"` and a visible result summary

### 5. DG → Director Request/Reply Contract

DG and Director communicate *only* through the mission inbox. No side-channel, no direct function call from DG to Director.

| DG action | Mission inbox direction | Director response |
|-----------|------------------------|-------------------|
| Submit mission request | DG → inbox | Director reads and processes |
| Poll status | DG reads read model | Director writes status to read model |
| Post approval reply | DG → inbox | Director reads and acts |
| Read result | DG reads from inbox | Director posts result to inbox |

---

## Capability: swarm-observability (Delta)

### Observer Sidebar — DG Chain Display

The observer sidebar SHALL display the full DG → Director → worker chain for every active mission. Each row MUST include:

- `initiator`: who started the action (`operator`, `director-general`, `swarm-director`)
- `target`: who received the action
- `action`: one of `mission-request`, `status-poll`, `approval-required`, `mission-result`
- `status`: one of `pending`, `waiting`, `in-progress`, `awaiting-approval`, `completed`, `rejected`, `failed`
- `authority`: one of `operator`, `operator-initiated`, `director`, `director-escalated`
- `freshness`: one of `just_now`, `stale`, `unknown`
- `fallback`: manual action text for `failed` or `awaiting-approval` states; empty otherwise

#### Scenario: Full chain visible in observer sidebar

- GIVEN a mission is in flight
- WHEN the observer sidebar renders
- THEN it SHALL display a chronological list of all timeline rows for the current mission
- AND each row SHALL show initiator, target, action, status, authority, and freshness
- AND failed rows SHALL show fallback text
- AND awaiting-approval rows SHALL show approve/reject controls

---

## Data Flows

### Mission Request Flow

```
Operator View
  │
  ▼ (intent)
Director General
  │
  ▼ (compose + post to mission inbox)
swarm-director
  │
  ▼ (execute delegation)
visible swarm workers
  │
  ▼ (result posted to mission inbox)
Director General
  │
  ▼ (read result + write timeline row)
Observer Sidebar / Timeline
```

### Approval Flow

```
swarm-director
  │
  ▼ (emit approval-required to mission inbox)
Director General
  │
  ▼ (write timeline row with awaiting-approval)
Observer Sidebar
  │
  ▼ (Operator clicks approve/reject)
Director General
  │
  ▼ (post approval/rejection to mission inbox)
swarm-director
 │
  ▼ (act on approval)
```

---

## Implementation Constraints

### DG MUST NOT

- Call worker APIs directly
- Spawn workers or modify the worker roster
- Write to the Director execution layer
- Emit timeline rows with `authority` set to `director` or `director-escalated` for actions not initiated by Director
- Skip the mission inbox for any DG → Director communication

### DG MAY

- Compose and submit mission requests
- Poll the Director read model
- Read and surface Director results
- Present approval controls to the Operator
- Emit timeline rows for any DG-initiated action

### Timeline Row Schema

Each timeline row is a structured object:

```js
{
  id: String,           // UUID
  timestamp: Number,    // Unix ms
  initiator: String,    // "operator" | "director-general" | "swarm-director"
  target: String,       // "director-general" | "swarm-director" | "operator"
  action: String,       // "mission-request" | "status-poll" | "approval-required" | "mission-result"
  status: String,       // "pending" | "waiting" | "in-progress" | "awaiting-approval" | "completed" | "rejected" | "failed"
  authority: String,   // "operator" | "operator-initiated" | "director" | "director-escalated"
  freshness: String,    // "just_now" | "stale" | "unknown"
  fallback: String,     // manual action text; empty string if not applicable
  missionId: String,   // links to the parent mission
}
```

---

## Rollback Plan

If DG introduces authority ambiguity or bypasses Director:

1. Remove DG wiring from Operator View
2. Revert Operator View to direct `swarm-director` usage through the first four surfaces
3. Delete DG timeline row logic; Director continues to emit its own rows
4. No database migration required — timeline rows are append-only and can be filtered by source

---

## Dependencies (Prerequisites)

Implementation of this spec MUST NOT begin until all four prerequisite changes are accepted:

| Step | Prerequisite | Reason |
|------|-------------|--------|
| 1 | Action contract and permissions | Establishes the permission model DG must respect |
| 2 | Operational timeline | DG emits timeline rows into this surface |
| 3 | Observer sidebar | DG populates the sidebar with chain state |
| 4 | Limited operator actions | Establishes the action surface DG wraps |

---

## Success Criteria

- [ ] DG routes all mission requests exclusively through `swarm-director` — no direct worker calls
- [ ] Every DG action emits a timeline row with all required schema fields
- [ ] The observer sidebar displays the full DG → Director → worker chain with authority and freshness
- [ ] Approval-required rows show approve/reject controls and block forwarding until Operator acts
- [ ] Failed rows display fallback text and do not auto-retry
- [ ] DG uses the mission inbox exclusively — no side-channel communication with Director
- [ ] Prerequisites (steps 1–4) are confirmed before implementation begins

---

## Non-Goals (Out of Scope)

- Replacing or duplicating `swarm-director` orchestration logic
- Hidden delegation, hidden agents, or direct worker spawning from Operator View
- New durable truth stores, direct filesystem authority, or worker roster writes from DG
- Implementation before steps 1–4 are accepted
