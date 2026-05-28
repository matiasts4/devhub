# Swarm Session Binding Specification

## Purpose

Persist verified OpenCode session identity into canonical swarm session state so delivery binding reads durable truth.

## Requirements

### Requirement: Verified session reconciliation

The system MUST persist a verified OpenCode session identity into the canonical `agent_hub_sessions` row associated with the durable workspace/run binding for a mission participant. Reconciliation SHALL update session identity only when durable ownership exists and the verified session is active for that same participant.

#### Scenario: Verified active session becomes durable

- GIVEN a mission participant has durable workspace and run ownership
- AND runtime verification resolves one active OpenCode session for that same participant
- WHEN session reconciliation executes
- THEN the canonical `agent_hub_sessions` row stores that verified `opencode_session_id`

#### Scenario: Missing verified binding stays missing

- GIVEN a mission participant has no verified OpenCode session identity
- WHEN session reconciliation executes
- THEN no `opencode_session_id` is invented or copied from unverified runtime state
- AND delivery binding remains `binding_missing`

### Requirement: Delivery binding classification uses reconciled state

The system MUST evaluate mission delivery binding from the reconciled durable state. It SHALL classify `bound` only when canonical session state is active and verified, SHALL classify `stale` when durable ownership exists but the verified session is inactive or missing, and SHALL classify `orphaned` when durable workspace or run state is orphaned.

#### Scenario: Stale verified session remains stale

- GIVEN durable workspace and run ownership still exist
- AND the canonical session row lacks an active verified `opencode_session_id`
- WHEN delivery binding is evaluated
- THEN the result is `binding_stale`

#### Scenario: Orphaned workspace is not downgraded to missing

- GIVEN durable workspace or supervisor state marks the participant binding as orphaned
- WHEN delivery binding is evaluated
- THEN the result is `binding_orphaned`
- AND it is not reported as `binding_missing`
