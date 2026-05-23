# DevHub CLI

CLI for DevHub — agent swarm orchestration and operations.

## Quick Start

```bash
# Install from source
cd devhub-cli && npm link

# Run any command
devhub status
devhub queue --limit 10
devhub agents --active
```

## Installation

| Method | Command | Use Case |
|--------|---------|----------|
| npm link (dev) | `cd devhub-cli && npm link` | Development, links local source globally |
| Direct invocation | `node devhub-cli/bin/devhub <cmd>` | No global install, CI/CD pipelines |
| Global install | `npm install -g devhub-cli` | Production use (when published) |

## Command Reference

| Command | Description |
|---------|-------------|
| [`status`](#status) | Show compact swarm dashboard |
| [`queue`](#queue) | Show prioritized execution queue |
| [`agents`](#agents) | Show registered swarm agents |
| [`swarm`](#swarm) | Show composite swarm overview |
| [`task`](#task) | Show task detail by ID |
| [`ws`](#ws) | Show workspace detail by ID |
| [`heartbeat`](#heartbeat) | Record agent heartbeat (idempotent) |
| [`update-status`](#update-status) | Update agent status |
| [`claim`](#claim) | Claim next pending task for an agent |
| [`release`](#release) | Release a claimed task |
| [`tell`](#tell) | Send a mission message to a recipient |

### status

Show compact swarm dashboard with projects, queue, agents, and milestones.

```
devhub status
```

**Example:**
```bash
devhub status
```

### queue

Show prioritized execution queue sorted by score.

```
devhub queue [options]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--limit <n>` | 20 | Maximum number of rows to display |
| `--project <id>` | — | Filter by project ID |
| `--blocked` | false | Show only blocked tasks |

**Examples:**
```bash
devhub queue --limit 10
devhub queue --project proj-alpha --blocked
```

### agents

Show registered swarm agents.

```
devhub agents [options]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--status <filter>` | — | Filter by exact status match |
| `--active` | false | Show only active agents (active, working, running, thinking) |

**Examples:**
```bash
devhub agents --active
devhub agents --status idle
```

### swarm

Show composite swarm overview (projects, queue, agents, milestones).

```
devhub swarm [options]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--compact` | false | Show collapsed one-line summaries |

**Example:**
```bash
devhub swarm --compact
```

### task

Show task detail by ID.

```
devhub task <task-id> [options]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--verbose` | false | Show full description without truncation |

**Example:**
```bash
devhub task task-1 --verbose
```

### ws

Show workspace detail by ID.

```
devhub ws <workspace-id>
```

**Example:**
```bash
devhub ws ws-abc123
```

### heartbeat

Record agent heartbeat (idempotent).

```
devhub heartbeat [agent-id]
```

| Argument | Required | Description |
|----------|----------|-------------|
| `agent-id` | No | Agent ID (uses env default if omitted) |

**Example:**
```bash
devhub heartbeat agent-1
```

### update-status

Update agent status with optional task description.

```
devhub update-status [agent-id] [status] [task-description]
```

| Argument | Required | Description |
|----------|----------|-------------|
| `agent-id` | No | Agent ID |
| `status` | No | New status value |
| `task-description` | No | Optional task description |

**Example:**
```bash
devhub update-status agent-1 working "Implementing auth middleware"
```

### claim

Claim next pending task for an agent.

```
devhub claim [agent-id]
```

| Argument | Required | Description |
|----------|----------|-------------|
| `agent-id` | No | Agent ID |

**Example:**
```bash
devhub claim agent-1
```

### release

Release a claimed task.

```
devhub release [task-id] [claim-token] [options]
```

| Argument | Required | Description |
|----------|----------|-------------|
| `task-id` | No | Task ID |
| `claim-token` | No | Claim token from claim command |

| Option | Default | Description |
|--------|---------|-------------|
| `--outcome <value>` | completed | Outcome: completed, paused, failed, abandoned |

**Example:**
```bash
devhub release task-1 TOKEN123 --outcome completed
```

### tell

Send a mission message to a recipient.

```
devhub tell [recipient] [message] [options]
```

| Argument | Required | Description |
|----------|----------|-------------|
| `recipient` | No | Recipient agent ID |
| `message` | No | Message body |

| Option | Default | Description |
|--------|---------|-------------|
| `--kind <kind>` | directive | Message kind: directive, status, handoff, decision, risk, approval_request, approval_result |
| `--mission <id>` | — | Mission ID (required) |
| `--sender <id>` | — | Sender agent ID (required) |

**Example:**
```bash
devhub tell agent-2 "Auth middleware done" --kind status --mission m-1 --sender agent-1
```

## Exit Codes

| Code | Meaning | Trigger |
|------|---------|---------|
| 0 | Success | Command completes normally |
| 1 | Runtime error | Command action throws or stub executed |
| 2 | Invalid args | Unknown command or invalid arguments |

## Output Modes

The CLI adapts output based on the environment:

- **TTY (terminal):** ANSI color codes applied. Section headers in cyan, dividers in gray.
- **Piped/redirected:** Plain text, no ANSI escapes. Pipe-separated tables.
- **Override:** Set `FORCE_TTY=1` to force colored output even when piped.

```bash
# Piped output (plain text)
devhub queue | grep proj-alpha

# Force color in pipe
FORCE_TTY=1 devhub status | cat
```

## Integration Test Guide

```bash
npm run test:integration
```

Tests use a seed factory (`tests/fixtures/seed-factory.js`) that creates deterministic fixtures per test:

- **Temp DB isolation:** Each test gets an isolated SQLite DB via `DEVHUB_DB_PATH` in a temp directory.
- **Seed factory:** Creates projects, tasks, agents, milestones, workspaces, and dependencies.
- **Cleanup:** DB files (`.db`, `-wal`, `-shm`) are removed after each test.

Run CLI against a test DB:

```bash
DEVHUB_DB_PATH=/tmp/devhub-test.db node devhub-cli/bin/devhub status
```

## Agent Workflow Patterns

Standard agent lifecycle:

```
register → heartbeat (loop) → claim → work → release → heartbeat
```

| Step | CLI Command | Purpose |
|------|-------------|---------|
| Register | `devhub register` | Announce agent to swarm |
| Heartbeat loop | `devhub heartbeat [agent-id]` | Prevent orphan detection, keep lease valid |
| Claim | `devhub claim [agent-id]` | Get next pending task |
| Work | — | Execute task logic |
| Release | `devhub release [task-id] [token] --outcome <value>` | Mark task complete/paused/failed |
| Final heartbeat | `devhub heartbeat [agent-id]` | Confirm agent still alive |

> Heartbeats prevent orphan detection and keep task leases valid.
