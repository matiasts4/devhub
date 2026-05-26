# Delta for swarm-observability

## ADDED Requirements

### Requirement: Durable director feed observability

The system MUST publish director feed state from durable read models already used for mission snapshots and director queue state. Snapshot consumers MUST receive `authority`, `freshness`, `watermark`, `items`, and `handoff`, and transport-only signals MUST NOT create or hide feed items.

#### Scenario: Control room shows durable idle state

- GIVEN the durable queue and mission feed are empty
- WHEN the control-room snapshot is composed
- THEN `handoff.status` is `idle`
- AND no transport-only event creates a fake item

#### Scenario: Watermark tracks durable mutation only

- GIVEN two polls with no durable row changes
- WHEN only TTL regrouping or stream polling changes
- THEN the watermark stays stable
- AND it changes only after a durable mission or feed row mutates
