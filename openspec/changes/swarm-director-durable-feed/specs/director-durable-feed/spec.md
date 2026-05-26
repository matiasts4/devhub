# Director Durable Feed Specification

## Purpose

Give directors one durable feed for worker completion, handoff readiness, and next action.

## Requirements

### Requirement: Durable-first director visibility

The system MUST derive director-visible completion and handoff items from durable mission and runtime rows. It MUST NOT depend on chat delivery, live session binding, or trace-only transport. Each item MUST identify mission, task, agent, kind, and occurred time, and MAY include evidence metadata.

#### Scenario: Completion survives missing binding

- GIVEN a worker completion is durably recorded and delivery binding is `binding_missing`
- WHEN the director feed is read
- THEN the completion item remains visible
- AND binding state is metadata only

#### Scenario: Empty state stays honest

- GIVEN no durable completion or handoff fact exists
- WHEN the director feed is read
- THEN the feed returns an empty or idle state
- AND it does not invent handoff truth from chat traces

### Requirement: Shared director feed contract

The system MUST expose one ordered director feed contract with `authority`, `freshness`, `watermark`, `items`, and `handoff` state. Control-room APIs, CLI status views, and session stream adapters SHALL reuse that contract and MUST NOT create a second truth source.

#### Scenario: Adapters observe the same durable order

- GIVEN the same durable mission and queue state
- WHEN two adapters read the director feed
- THEN they receive the same item order and watermark
