# Delta: swarm-durable-queue — delivery-consumed-state + broadcast-fan-out

## ADDED Requirements

### REQ-DQ-8: Consumed Delivery State

**Priority**: P0 | **Status**: delta

The system SHALL add `consumed` as a terminal delivery state in `swarm_delivery_log`. The `consumed` state indicates the delivery was received and processed by the recipient; no further transitions are allowed from `consumed`.

#### Scenario: DQ-S8 — ack_delivery transitions to consumed

- GIVEN a delivery with `status = 'delivered'`
- WHEN the recipient calls `ack_delivery` with `status='consumed'`
- THEN the delivery's `status` becomes `consumed`
- AND no further state transitions are permitted

#### Scenario: DQ-S9 — Consumed state rejects further transitions

- GIVEN a delivery with `status = 'consumed'`
- WHEN any transition attempt is made
- THEN the transition is rejected
- AND an error is returned indicating `consumed` is terminal

### REQ-DQ-9: Broadcast Fan-Out

**Priority**: P1 | **Status**: delta

The system SHALL interpret `recipient_agent_ids: ['*']` or an empty array as a broadcast to all active mission participants. When fan-out occurs, the delivery is enqueued once per active participant.

#### Scenario: DQ-S10 — Broadcast fan-out to all participants

- GIVEN a mission has 3 active participants with agent IDs `['a1', 'a2', 'a3']`
- WHEN a delivery is created with `recipient_agent_ids: ['*']`
- THEN 3 separate deliveries are created in `swarm_delivery_log`
- AND each delivery has a distinct `recipient_agent_id` from the active participants
- AND each delivery has `status = 'pending'`

#### Scenario: DQ-S11 — Empty array triggers fan-out

- GIVEN a mission has 2 active participants
- WHEN a delivery is created with `recipient_agent_ids: []`
- THEN 2 deliveries are created, one per active participant

## REMOVED Requirements

None.