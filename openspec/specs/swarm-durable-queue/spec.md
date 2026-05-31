# Swarm Durable Queue Specification

## Purpose

SQLite-backed persistence for SwarmQueue so enqueued agent launches survive process restarts and prevent double-processing.

## Requirements

### REQ-DQ-1: Persistent Queue Table

The system MUST store queue items in a `swarm_queue_items` SQLite table with columns: `id` (TEXT PK), `body` (TEXT JSON), `status` (TEXT: pending|processing|completed|cancelled), `enqueued_at` (TEXT ISO 8601), `started_at` (TEXT nullable), `completed_at` (TEXT nullable). The table MUST be created idempotently via `ensureRuntimeSchema`.

#### Scenario: Table created on fresh DB

- GIVEN a fresh database with no `swarm_queue_items` table
- WHEN `ensureRuntimeSchema` runs
- THEN the `swarm_queue_items` table exists with the required columns and status CHECK constraint

### REQ-DQ-2: Durable Enqueue

The system MUST persist every enqueue to `swarm_queue_items` with `status = 'pending'` via `withDbWriteQueue` BEFORE resolving the caller's Promise. In-memory state MUST mirror the DB row.

#### Scenario: Enqueue persists to DB

- GIVEN the queue is empty
- WHEN `enqueue({ body: { agentId: 'a1', task: 't1' } })` is called
- THEN a row with `status = 'pending'` exists in `swarm_queue_items`
- AND the returned Promise resolves with `{ queued: true, queuePosition: 1 }`

#### Scenario: Enqueue survives process restart

- GIVEN 3 items are enqueued and `status = 'pending'`
- WHEN the process restarts
- THEN all 3 items are recovered and available for processing

### REQ-DQ-3: Dequeue with Processing Lock

The system MUST atomically update an item's status from `pending` to `processing` before handing it to the consumer. Only one consumer MUST acquire a given item (no double-processing).

#### Scenario: Slot available — item dequeued

- GIVEN 1 pending item and an available concurrency slot
- WHEN the polling loop processes the queue
- THEN the item's `status` becomes `processing` in DB
- AND `started_at` is set to the current timestamp
- AND the consumer receives the item body

#### Scenario: Two consumers — no double-acquire

- GIVEN 1 pending item in the queue
- WHEN two polling ticks attempt to dequeue nearly simultaneously
- THEN only one tick acquires the item
- AND the other tick finds no pending items

### REQ-DQ-4: Acknowledgment (Completion)

The system MUST mark a processed item as `completed` with `completed_at` timestamp after successful consumer resolution. This ACK is separate from dequeue and confirms processing finished without error.

#### Scenario: Successful processing acknowledged

- GIVEN an item with `status = 'processing'`
- WHEN the consumer resolves successfully
- THEN the item's `status` becomes `completed`
- AND `completed_at` is set

### REQ-DQ-5: Startup Recovery

On startup, the system MUST: (1) load all `pending` rows into the in-memory queue; (2) identify `processing` rows older than the staleness threshold (5 minutes) and reset them to `pending` for re-processing; (3) leave recent `processing` rows untouched.

#### Scenario: Recovery of pending items

- GIVEN the DB contains 2 rows with `status = 'pending'`
- WHEN SwarmQueue initializes
- THEN both items are loaded into the in-memory queue
- AND they are available for dequeue

#### Scenario: Stale processing items re-enqueued

- GIVEN the DB contains 1 row with `status = 'processing'` and `started_at` is 10 minutes ago
- WHEN SwarmQueue initializes
- THEN the item's `status` is reset to `pending`
- AND the item is loaded into the in-memory queue

#### Scenario: Recent processing items left alone

- GIVEN the DB contains 1 row with `status = 'processing'` and `started_at` is 2 minutes ago
- WHEN SwarmQueue initializes
- THEN the item's `status` remains `processing`
- AND the item is NOT added to the in-memory queue

### REQ-DQ-6: Cancelled Items

The system MUST support cancellation by updating `status` to `cancelled` and removing the item from the in-memory queue. The caller's Promise MUST be rejected with a `cancelled: true` error.

#### Scenario: Cancel a pending item

- GIVEN a pending queue item with id `queue-123`
- WHEN `remove('queue-123')` is called
- THEN the DB row's `status` becomes `cancelled`
- AND the item is removed from the in-memory queue
- AND the caller's Promise is rejected with `error.cancelled === true`

### REQ-DQ-7: Staleness Cleanup

The system SHOULD periodically clean up `completed` and `cancelled` items older than 1 hour to prevent unbounded table growth. Cleanup MUST use `withDbWriteQueue` for serialized writes.

#### Scenario: Old completed items purged

- GIVEN rows with `status = 'completed'` and `completed_at` older than 1 hour exist
- WHEN periodic cleanup runs
- THEN those rows are deleted from `swarm_queue_items`

### REQ-DQ-8: Consumed Delivery State

**Priority**: P0 | **Status**: approved

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

**Priority**: P1 | **Status**: approved

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