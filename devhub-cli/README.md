# DevHub CLI

CLI operativo de DevHub para swarm, ejecución y surfaces de soporte.

**Baseline soportado hoy:** 20 comandos top-level. La registración de agentes ocurre en runtime o durante `swarm-launch`; `devhub register` NO existe como comando CLI.

## Quick Start

```bash
cd devhub-cli && npm link

devhub status
devhub queue --limit 10
devhub swarm-launch <project-id>
```

## Installation

| Method            | Command                            | Use case                             |
| ----------------- | ---------------------------------- | ------------------------------------ |
| npm link          | `cd devhub-cli && npm link`        | Desarrollo local                     |
| Direct invocation | `node devhub-cli/bin/devhub <cmd>` | CI/CD o ejecución sin install global |
| Global install    | `npm install -g devhub-cli`        | Cuando el paquete se publique        |

## Command Reference

| Command                           | Description                                      |
| --------------------------------- | ------------------------------------------------ |
| [`status`](#status)               | Show compact swarm dashboard                     |
| [`queue`](#queue)                 | Show prioritized execution queue                 |
| [`agents`](#agents)               | Show registered swarm agents                     |
| [`swarm`](#swarm)                 | Show composite swarm overview                    |
| [`task`](#task)                   | Show task detail and history                     |
| [`ws`](#ws)                       | Show workspace detail                            |
| [`heartbeat`](#heartbeat)         | Record agent heartbeat                           |
| [`update-status`](#update-status) | Update agent status                              |
| [`claim`](#claim)                 | Claim next pending task                          |
| [`release`](#release)             | Release a claimed task                           |
| [`tell`](#tell)                   | Send mission message                             |
| [`swarm-launch`](#swarm-launch)   | Launch a swarm from a project                    |
| [`auth`](#auth)                   | Manage CLI auth (`login`, `status`, `verify`)    |
| [`events`](#events)               | Query or stream agent events                     |
| [`inbox`](#inbox)                 | List, read, and dismiss inbox items              |
| [`presence`](#presence)           | List active agent presence                       |
| [`mission`](#mission)             | List, inspect, or close missions                 |
| [`run`](#run)                     | List runs or inspect one run                     |
| [`worktree`](#worktree)           | List, inspect, or clean worktrees                |
| [`supervisor`](#supervisor)       | Inspect supervisor state and resolve checkpoints |

### status

```bash
devhub status
```

Muestra dashboard compacto del swarm.

### queue

```bash
devhub queue [--limit <n>] [--project <id>] [--blocked]
```

### agents

```bash
devhub agents [--status <filter>] [--active]
```

### swarm

```bash
devhub swarm [--compact]
```

### task

```bash
devhub task <task-id> [--verbose] [--json] [--limit <n>]
```

### ws

```bash
devhub ws <workspace-id>
```

### heartbeat

```bash
devhub heartbeat [agent-id]
```

### update-status

```bash
devhub update-status [agent-id] [status] [task-description]
```

### claim

```bash
devhub claim [agent-id]
```

### release

```bash
devhub release [task-id] [claim-token] [--outcome <value>]
```

### tell

```bash
devhub tell [recipient] [message] [--kind <kind>] [--mission <id>] [--sender <id>]
```

### swarm-launch

```bash
devhub swarm-launch <project> [--template <id>] [--swarm-type <id>] [--team <id>] [--provider <id>] [--mission <text>] [--workspace-path <path>]
```

### auth

```bash
devhub auth <login|status|verify> [--agent-id <id>] [--workspace-id <id>] [--json]
```

### events

```bash
devhub events <list|stream> [--agent <id>] [--type <type>] [--since <iso>] [--limit <n>] [--interval <ms>] [--json]
```

### inbox

```bash
devhub inbox <list|read|dismiss> [--status <s>] [--category <c>] [--limit <n>] [--json]
```

### presence

```bash
devhub presence [list] [--mission <id>] [--agent <id>] [--json]
```

### mission

```bash
devhub mission <list|status|close> [--outcome <val>] [--summary <text>] [--check <text>] [--commit <sha>] [--json]
```

### run

```bash
devhub run <list|status> [--workspace <id>] [--task <id>] [--limit <n>] [--json]
```

### worktree

```bash
devhub worktree <list|status|clean> [--status <val>] [--force] [--json]
```

### supervisor

```bash
devhub supervisor <status|approve|reject> [--json]
```

## Exit Codes

| Code | Meaning                           |
| ---- | --------------------------------- |
| 0    | Success                           |
| 1    | Runtime error or missing resource |
| 2    | Invalid args or unknown command   |

## Output Modes

- **TTY:** salida con color.
- **Piped/redirected:** salida plain text.
- **Override:** `FORCE_TTY=1` fuerza color.

## Integration Test Guide

```bash
npm run test:integration
```

Los tests usan SQLite temporal por test vía `DEVHUB_DB_PATH` y seed factory determinística.

## Agent Workflow Patterns

Standard agent lifecycle:

```text
runtime registration or swarm-launch setup → heartbeat → claim → work → release → heartbeat
```

| Step            | CLI Command                                          | Purpose                                                    |
| --------------- | ---------------------------------------------------- | ---------------------------------------------------------- |
| Runtime setup   | `devhub swarm-launch <project>` o launcher runtime   | Provisiona contexto operativo; no existe `devhub register` |
| Heartbeat loop  | `devhub heartbeat [agent-id]`                        | Mantener presencia viva                                    |
| Claim           | `devhub claim [agent-id]`                            | Reclamar trabajo                                           |
| Work            | —                                                    | Ejecutar tarea                                             |
| Release         | `devhub release [task-id] [token] --outcome <value>` | Cerrar o pausar tarea                                      |
| Final heartbeat | `devhub heartbeat [agent-id]`                        | Confirmar presencia final                                  |

Registration happens during runtime or swarm-launch setup, not as a CLI command.
