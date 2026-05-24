# Runtime Diagnostics Reconciliation Specification

## Purpose

Provide a single, read-only runtime snapshot that reconciles terminal sessions, OpenCode processes, and swarm metadata into canonical statuses for troubleshooting and restore planning.

## Requirements

### Requirement: Unified Runtime Snapshot Endpoint

The system MUST expose a single diagnostics endpoint that aggregates runtime evidence without mutating operational state.

#### Scenario: Agent requests runtime diagnostics

- GIVEN terminal sessions, process scans, and DB metadata are available
- WHEN a client calls `GET /api/swarm/runtime-diagnostics`
- THEN the response includes terminals, processes, registry rows, runs, missions, anomalies, and summary counts
- AND the endpoint performs read-only operations

### Requirement: Canonical Runtime Status Normalization

The system MUST classify terminal/process/registry entities using a shared canonical status vocabulary.

#### Scenario: Alive terminal without clients

- GIVEN a terminal session marked alive with `socketCount = 0`
- WHEN diagnostics snapshot is computed
- THEN that terminal is classified as `reattachable`
- AND its terminal id appears in `anomalies.reattachableTerminals`

#### Scenario: Process without matching terminal

- GIVEN an OpenCode process with no matching terminal session
- WHEN diagnostics snapshot is computed
- THEN that process is classified as `orphaned-process`
- AND its pid appears in `anomalies.orphanedProcesses`

### Requirement: Quota-Blocked Runtime Signal

The system MUST detect quota/rate-limit runtime evidence from logs and surface it in canonical diagnostics.

#### Scenario: Quota error appears in logs

- GIVEN recent logs contain `429` or `GoUsageLimitError`
- WHEN diagnostics snapshot is computed
- THEN `anomalies.quotaBlocked` is true
- AND affected entities can be classified as `quota-blocked`
