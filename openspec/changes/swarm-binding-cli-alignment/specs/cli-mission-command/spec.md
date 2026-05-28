# CLI Mission Command Specification

## Purpose

Expose mission diagnosis through shared durable readers aligned with canonical swarm binding state.

## Requirements

### Requirement: Mission diagnosis uses shared read helpers

The system SHALL serve `devhub mission list` and `devhub mission status` from shared domain/helper-backed reads. These reads MUST align mission, participant, presence, and binding diagnosis with the canonical durable swarm state and MUST NOT depend on ad-hoc raw SQL diagnosis paths.

#### Scenario: Mission status reflects canonical participant diagnosis

- GIVEN a mission includes participants with durable presence and binding state
- WHEN `devhub mission status <mission-id>` is executed
- THEN the command reports mission diagnosis from shared readers
- AND any participant binding state reflects the canonical durable classification

#### Scenario: Unknown mission returns not found

- GIVEN no mission exists for the requested id
- WHEN `devhub mission status <mission-id>` is executed
- THEN the command returns a not-found result
- AND it does not emit a partial ad-hoc diagnosis payload

### Requirement: Mission write scope stays unchanged

This slice MUST keep `devhub mission close` on its existing mutation path. It SHALL NOT expand into a full mission command rewrite.

#### Scenario: Mission close remains existing behavior

- GIVEN an operator closes a mission through `devhub mission close <mission-id>`
- WHEN the command executes in this slice
- THEN the existing close workflow is used
- AND the read-path alignment does not alter close semantics
