# Director Mission Inbox Specification

## Purpose

Definir un inbox compacto y pollable para Director sobre el mission kernel durable existente.

## Requirements

### Requirement: Durable inbox source of truth

The system MUST derive Director inbox state only from `swarm_missions`, `mission_participants`, `mission_messages`, `message_deliveries`, and `agent_presence`. It SHALL NOT require new durable tables, enums, session logs, or runtime-only state. Legacy wording such as `team_messages` MUST be treated as stale and SHALL NOT create a new storage requirement.

#### Scenario: Legacy wording drift is resolved to the mission kernel

- GIVEN historical notes mention `team_messages`
- WHEN SW-8.2C scope is evaluated
- THEN the inbox contract uses `mission_messages` and `message_deliveries`
- AND no new durable table or enum is required

### Requirement: Compact ordered inbox snapshot

The system MUST expose `mission_control` as a compact snapshot with `recent_messages`, `pending_deliveries`, `presence`, `snapshot_at`, and `watermark`. `recent_messages` MUST be sorted newest-first and bounded to the newest 20 durable messages for the active mission. `pending_deliveries` MUST be sorted by newest delivery activity first and bounded to the newest 20 deliveries whose status is `pending` or `retry_pending`.

#### Scenario: Poll returns deterministic bounded inbox state

- GIVEN an active mission with more than 20 durable messages and pending deliveries
- WHEN Director polls `mission_control`
- THEN `recent_messages` contains only the newest 20 messages in descending durable order
- AND `pending_deliveries` contains only pending or retry-pending deliveries in descending durable order

### Requirement: Durable watermark and TTL-derived presence

The system MUST derive presence groups from `agent_presence` using the existing 120 second TTL semantics at `snapshot_at`. It MUST publish a durable `watermark` that changes only when a relevant durable row in the mission snapshot changes, and MUST remain unchanged across no-op polls even if request time changes.

#### Scenario: No-op poll keeps the same watermark

- GIVEN two Director polls with no durable mission, message, delivery, or presence changes between them
- WHEN the second snapshot is generated later in time
- THEN the `watermark` is identical to the first poll
- AND presence grouping still reflects TTL state at the new `snapshot_at`
