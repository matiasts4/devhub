# Delta for Swarm Observability

## ADDED Requirements

### Requirement: Mission control health projection

The health read model MUST surface `mission_control` as the canonical Director inbox projection. `GET /api/agenthub/operations/health` and the local composer `POST` response MUST remain semantically aligned: both SHALL expose the same durable mission kernel fields, ordering rules, bounded collections, and watermark contract. The projection SHALL NOT leak runtime/session truth and SHALL NOT include SW-8.2D, SW-8.3A, or SW-8.4A behavior.

#### Scenario: GET health returns pollable mission control

- GIVEN an active mission with durable messages, pending deliveries, and presence rows
- WHEN the health endpoint responds
- THEN `control_room_snapshot_input.mission_control` contains the compact Director inbox snapshot
- AND the payload omits session logs, live stream state, terminal bindings, and full history rehydration

#### Scenario: POST composer returns the same mission control contract

- GIVEN Director creates a local mission message through the composer
- WHEN the POST succeeds
- THEN the response returns `control_room_snapshot_input.mission_control` using the same snapshot semantics as GET
- AND consumers can refresh from the returned watermark without adapting to a second shape
