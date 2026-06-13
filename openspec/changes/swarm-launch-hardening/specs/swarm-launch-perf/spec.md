# Swarm Launch Performance Specification

## Purpose

Define the launch-time latency contract for the 5-role swarm so the desktop app brings all role panes online well within the 4s p95 budget. The contract removes sequential gates (`DIRECTOR_FIRST_FANOUT_DELAY_MS`, `SWARM_LAUNCH_BATCH_DEADLINE_MS`, `SWARM_CONNECT_STAGGER_MS`) in favor of event-driven fan-out and parallel worktree / WS / wrapper construction. The performance budget is verified by `scripts/verify-swarm-launch.mjs` over 50 launches.

## Requirements

### Requirement: R-PERF-1 — Parallel Worktree Preparation

`prepareAgentWorktree` MUST run all 5 role worktrees concurrently under a single `Promise.all`, with each worker acquiring the `withDbWriteQueue` lock for its DB write. No sequential `await` between roles. Roles in scope: `director`, `architect`, `implementer`, `reviewer`, `devops`.

#### Scenario: 5 worktrees complete in parallel

- **GIVEN** Linux + NVMe SSD host and a fresh launch
- **WHEN** `prepareAgentWorktree` is called with the 5-role roster
- **THEN** all 5 worktree paths exist on disk within 2s wall-clock from `Promise.all` start
- **AND** the DB rows are inserted under `withDbWriteQueue` without deadlocks

#### Scenario: One slow role does not block the others

- **GIVEN** the `devops` role takes 1.8s to materialize
- **WHEN** the 4 other roles finish in 200ms
- **THEN** the launch orchestrator does not wait for `devops` before kicking off fan-out
- **AND** `devops` is added to the active roster on its own completion

### Requirement: R-PERF-2 — Director-Event-Triggered Worker Fan-Out

`DIRECTOR_FIRST_FANOUT_DELAY_MS` MUST be removed. Worker fan-out MUST be triggered by the director's `READY` event through an event listener on the launch bus, not by a fixed timeout.

#### Scenario: Director READY fires worker spawn within 50ms

- **GIVEN** the director pane emits `READY` on the launch bus
- **WHEN** the listener receives the event
- **THEN** the 4 worker spawns are scheduled within 50ms
- **AND** no `setTimeout` is used as the trigger

### Requirement: R-PERF-3 — Promise.race Batch Gate

`SWARM_LAUNCH_BATCH_DEADLINE_MS` MUST be removed. The batch gate MUST release on a `Promise.race` between (a) the director's `READY` event and (b) a 4s safety timeout that aborts the launch with a diagnostic.

#### Scenario: Director prompt appears, batch gate releases

- **GIVEN** the director pane is rendering and emits `READY` at 1.2s
- **WHEN** the batch gate awaits `Promise.race([directorReady, abortPromise])`
- **THEN** the gate resolves at 1.2s with the director's prompt payload
- **AND** the abort timer is cleared

#### Scenario: Director never READYs, gate aborts at 4s

- **GIVEN** the director pane hangs and never emits `READY`
- **WHEN** the safety timer fires
- **THEN** the launch aborts with a diagnostic naming the missing READY event
- **AND** the launch state is marked `failed` in the launch record

### Requirement: R-PERF-4 — Parallel WebSocket Handshake

`SWARM_CONNECT_STAGGER_MS` MUST be reduced to 0 OR removed in favor of parallel WS handshakes for all 5 roles. The sidecar `wss.on('connection')` handler MUST accept concurrent connections without serialization.

#### Scenario: 5 WS connections establish in parallel

- **GIVEN** 5 role clients attempting WS handshake simultaneously
- **WHEN** the sidecar receives the 5 upgrade requests
- **THEN** all 5 connections reach `open` state within 200ms of first upgrade
- **AND** the per-WS PTY spawn is queued with `setImmediate` to keep the event loop responsive

### Requirement: R-PERF-5 — Cached Wrapper Bash

The static portion of the agent launch wrapper bash (bus-helpers, identity, heartbeat, exit-trap prologue) MUST be cached on disk at `__dirname/.cache/wrapper-bash-v1.bash`. Only the per-launch variable block is appended at build time.

#### Scenario: 5 wrapper builds total < 100ms

- **GIVEN** the cache file exists from a prior launch
- **WHEN** 5 role wrappers are assembled in sequence
- **THEN** the cumulative wall-clock for `buildAgentLaunchWrapper` × 5 is under 100ms
- **AND** only the per-role variable block (≤ 1KB) is rewritten

#### Scenario: First launch primes the cache

- **GIVEN** no cache file exists
- **WHEN** the first launch assembles a wrapper
- **THEN** the static portion is written to `__dirname/.cache/wrapper-bash-v1.bash`
- **AND** the next launch reads it from disk

## Out of Scope

- Renderer-level performance (handled in `terminal-renderer-capability`).
- Long-running agent throughput after the launch window.
- Cross-host fan-out (the contract is single-host desktop).
- The 48-file `WIP: pre-sdd-batch 2026-06-08` files; this change touches only the launch orchestrator and the constants being removed.
