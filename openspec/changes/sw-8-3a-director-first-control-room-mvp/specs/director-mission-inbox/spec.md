# Director Mission Inbox Specification

## Purpose

Render the existing `mission_control` snapshot as first-class Director context inside Control Room without changing durable semantics.

## Requirements

### Requirement: mission_control remains the canonical Director source

The system MUST derive Director-first mission rendering from the existing `mission_control` snapshot already exposed to Control Room. UI summaries, ordering, and emphasis MAY be additive presentation logic, but they MUST be computed only from `mission`, `participants`, `recent_messages`, `latest_message`, `pending_deliveries`, `presence`, `snapshot_at`, and `watermark`. The slice MUST NOT require a new backend or source-of-truth contract unless it is strictly additive and UI-supporting.

#### Scenario: Director context renders from the existing snapshot

- GIVEN the Control Room receives a `mission_control` snapshot with mission, participants, messages, deliveries, and presence
- WHEN the Director-first room renders
- THEN those fields are shown as the primary mission context
- AND no alternate runtime-only truth source is required

#### Scenario: Legacy latest_message compatibility is preserved

- GIVEN `mission_control` provides `latest_message` and omits `recent_messages`
- WHEN the Director-first room renders mission context
- THEN the latest durable message still appears in the mission area
- AND no contract expansion is required for compatibility

### Requirement: Director-first mission behavior is read-only for this slice

The Director-first rendering defined by this slice MUST function from read-only `mission_control` data. It MUST NOT require lifecycle, terminal, binding, browser, GTK, or dispatch controls to render correctly.

#### Scenario: Missing mission snapshot degrades safely

- GIVEN the Control Room snapshot has no `mission_control`
- WHEN the Director-first room renders
- THEN the mission area shows an empty read-only state instead of failing
- AND the existing secondary panels remain available
