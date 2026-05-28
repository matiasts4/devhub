# CLI Documentation Specification

## Purpose

User-facing documentation for the `devhub` CLI covering all 11 commands, installation, exit codes, output modes, integration tests, and agent workflow patterns. Source of truth is `devhub-cli/README.md`.

## Requirements

### Requirement: Command Reference

The documentation SHALL list all 11 implemented commands with usage syntax, arguments, options, and at least one example per command.

#### Scenario: All commands documented

- GIVEN the README exists
- WHEN a reader searches for any implemented command
- THEN the command appears with its full signature
- AND no hallucinated commands or options are present

#### Scenario: Per-command detail format

- GIVEN a command section
- WHEN the reader reviews it
- THEN it includes: usage line, arguments table, options table, and ≥1 example

### Requirement: Installation Guide

The documentation SHALL describe how to install and run the CLI via `npm link`, global install, and direct invocation.

#### Scenario: npm link development install

- GIVEN the reader wants to develop against the CLI
- WHEN they follow the npm link instructions
- THEN the `devhub` command is available globally from the local source

#### Scenario: Direct invocation

- GIVEN the reader does not want a global install
- WHEN they invoke `node devhub-cli/bin/devhub`
- THEN the CLI runs without requiring installation

### Requirement: Exit Code Contract

The documentation SHALL document the three exit codes: 0 (success), 1 (runtime error/not found), 2 (invalid args or unknown command).

#### Scenario: Exit code table present

- GIVEN the README
- WHEN the reader looks for exit codes
- THEN a table or list shows codes 0, 1, and 2 with their meanings

#### Scenario: Exit code matches cli.js behavior

- GIVEN the documented exit codes
- WHEN compared against `cli.js` error handling
- THEN they match: unknown command → 2, runtime error → 1, success → 0

### Requirement: Output Modes

The documentation SHALL explain TTY vs piped output behavior (color in TTY, plain text when piped).

#### Scenario: TTY color documented

- GIVEN the output modes section
- WHEN the reader reviews it
- THEN it explains ANSI color codes are applied when `process.stdout.isTTY` is true

#### Scenario: Piped output documented

- GIVEN the output modes section
- WHEN the reader reviews it
- THEN it explains output is plain text (no ANSI escapes) when piped or redirected

### Requirement: Integration Test Guide

The documentation SHALL explain how to run integration tests, including the test command, seed factory usage, and reference to actual test files.

#### Scenario: Test command documented

- GIVEN the integration test section
- WHEN the reader wants to run tests
- THEN it documents `npm run test:integration` as the command to execute

#### Scenario: Seed factory explained

- GIVEN the integration test section
- WHEN the reader reviews it
- THEN it explains the seed factory creates deterministic fixtures (projects, tasks, agents, milestones) per test

#### Scenario: Test isolation documented

- GIVEN the integration test section
- WHEN the reader reviews it
- THEN it explains each test gets an isolated temp SQLite DB via `DEVHUB_DB_PATH`

### Requirement: Agent Workflow Patterns

The documentation SHALL describe the agent lifecycle pattern: register → heartbeat → claim → work → release → heartbeat.

#### Scenario: Lifecycle sequence documented

- GIVEN the agent patterns section
- WHEN the reader reviews it
- THEN it shows the complete sequence: register, heartbeat loop, claim, work, release, heartbeat

#### Scenario: Per-step CLI commands mapped

- GIVEN the agent patterns section
- WHEN the reader reviews it
- THEN each step maps to the corresponding CLI command (register, heartbeat, claim, release, update-status)

#### Scenario: Heartbeat purpose explained

- GIVEN the agent patterns section
- WHEN the reader reviews it
- THEN it explains heartbeats prevent orphan detection and keep task leases valid
