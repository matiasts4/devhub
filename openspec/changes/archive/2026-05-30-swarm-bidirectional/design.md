# Design: swarm-bidirectional

## Technical Approach

Workers push lightweight status events to Director's tmux pane via `tmux send-keys`, replacing expensive 30s HTTP heartbeat polling with free local syscalls + a 120s presence pulse. Event types: `task_start`, `found_issue`, `task_complete`, `needs_help`, `blocked`.

## Architecture Decisions

### Decision: tmux send-keys over HTTP agent-say

**Choice**: `tmux send-keys` to Director's pane
**Alternatives considered**: HTTP API to Director's `/api/agenthub/events`, WebSocket relay
**Rationale**: All agents run on same Linux host — tmux is a local syscall with near-zero latency. No new HTTP routes, no WebSocket infrastructure. Director already has a tmux pane attached; injecting status there is equivalent to a log line but with visual prominence.

### Decision: `DEVHUB_DIRECTOR_SESSION` as env var over runtime discovery

**Choice**: Pass `DEVHUB_DIRECTOR_SESSION=devhub-swarm-${launchId}-director` at worker launch
**Alternatives considered**: Workers discover Director's session via heartbeat response, query DB for active Director
**Rationale**: `configureLaunchRole()` already knows the Director's session name at launch time — no extra lookup needed. One-line env injection, zero runtime discovery overhead.

### Decision: 120s heartbeat interval

**Choice**: Increase from 30s to 120s
**Alternatives considered**: 60s, 300s, remove heartbeat entirely
**Rationale**: 120s = 4x reduction in API calls. Event-driven status injection covers task-scoped updates; 120s pulse is sufficient for presence confirmation. Going longer risks Director missing stale workers in `dispatch_pending` state.

## Data Flow

```
Worker spawns
    │
    ├─► buildAgentEnvExports() ──► DEVHUB_DIRECTOR_SESSION=devhub-swarm-${launchId}-director
    │
    ├─► buildDirectorTmuxInjection() ──► _devhub_tell_director() injected into wrapper
    │
    └─► Agent starts, calls _devhub_tell_director "task_start" "file X"
              │
              └─► tmux send-keys -t $DEVHUB_DIRECTOR_SESSION "✅ coder: task_start file X"
                          │
                          ▼
                   Director terminal (real-time)
```

## File Changes

| File                                              | Action | Description                                                                                                |
| ------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------- |
| `src/lib/agentLaunchWrapper.js`                   | Modify | Add `buildDirectorTmuxInjection()`, inject into wrapper                                                    |
| `src/app/api/agenthub/operations/health/route.js` | Modify | Export `DEVHUB_DIRECTOR_SESSION` in `buildAgentEnvExports`, update `buildLaunchPrompt` for Director/Worker |
| `openspec/changes/swarm-bidirectional/design.md`  | Create | This document                                                                                              |

### `src/lib/agentLaunchWrapper.js` — `buildDirectorTmuxInjection()`

New helper added to exports. Returns bash function:

```bash
_devhub_tell_director() {
  if [ -z "${DEVHUB_DIRECTOR_SESSION:-}" ]; then
    return 0
  fi
  tmux send-keys -t "${DEVHUB_DIRECTOR_SESSION}" "$1" 2>/dev/null || true
}
```

Injected into wrapper after env exports. `_devhub_tell_director` is called by worker prompts directly (no args escaping needed for simple status strings).

### `src/app/api/agenthub/operations/health/route.js` — `buildAgentEnvExports` modification

In `buildLaunchCommand()`, add to exports when `tmuxSessionName` exists and `roleKey !== 'director'`:

```js
if (tmuxSessionName && roleKey !== 'director') {
  const directorSession = `devhub-swarm-${launchId}-director`;
  exports.push(`export DEVHUB_DIRECTOR_SESSION="${directorSession}"`);
}
```

### `src/app/api/agenthub/operations/health/route.js` — `buildLaunchPrompt` modifications

**Director prompt** — add after the "Comportamiento del Director" section:

```js
'=== Sistema de Status ===',
'- Workers te envían status vía tmux: ✅ coder: started, ⚠️ architect: found issue, etc.',
'- Estos mensajes aparecen en tu terminal en tiempo real.',
'- NO esperes polling de workers — el status llega solo.',
```

**Worker prompt** — add after the "Comportamiento del Worker" section:

```js
'=== Reporte de Status ===',
'- Usa _devhub_tell_director para notificar eventos al Director.',
'- Eventos: task_start, found_issue, task_complete, needs_help, blocked.',
'- Ejemplo: _devhub_tell_director "✅ coder: started task X"',
```

### `src/lib/agentLaunchWrapper.js` — heartbeat interval

In `buildHeartbeatLoopCommand()`, change:

```js
sleep 30  →  sleep 120
```

## Interfaces / Contracts

### `_devhub_tell_director` bash function

- **Input**: Single string argument — formatted status message
- **Env**: Requires `DEVHUB_DIRECTOR_SESSION` set
- **Output**: None (void); fails silently if tmux unreachable
- **Example call**: `_devhub_tell_director "✅ coder: task_start file:///src/auth.ts"`

### `DEVHUB_DIRECTOR_SESSION` env var

- **Set on**: All workers (`roleKey !== 'director'`)
- **Value**: `devhub-swarm-${launchId}-director`
- **Not set on**: Director agent itself

## Testing Strategy

| Layer       | What to Test                                                            | Approach                                                         |
| ----------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Unit        | `buildDirectorTmuxInjection()` output format                            | Assert function body contains `tmux send-keys` and env var guard |
| Unit        | `buildAgentEnvExports()` includes `DEVHUB_DIRECTOR_SESSION` for workers | Mock `tmuxSessionName` and `roleKey !== 'director'`              |
| Unit        | `buildLaunchPrompt()` Director section includes status system           | Assert substring presence                                        |
| Unit        | `buildLaunchPrompt()` Worker section includes `_devhub_tell_director`   | Assert substring presence                                        |
| Unit        | `buildHeartbeatLoopCommand()` uses 120s interval                        | Assert `sleep 120` present, `sleep 30` absent                    |
| Integration | Worker wrapper script contains `_devhub_tell_director`                  | `buildAgentLaunchWrapper()` output grep                          |

## Migration / Rollout

No data migration. Phased rollout:

1. Deploy with `buildDirectorTmuxInjection()` + `DEVHUB_DIRECTOR_SESSION` env injection
2. Update Director prompt to recognize tmux status messages
3. Update Worker prompts to call `_devhub_tell_director` on key events
4. Change heartbeat interval to 120s

Rollback: reverse all changes (see proposal rollback plan).

## Open Questions

- [ ] Should `_devhub_tell_director` timestamp each message? (Would require date subshell in tmux send-keys — more complex; skip for now)
- [ ] Does Director's tmux pane have scrollback sufficient to see historical status? (If not, status may scroll off screen — acceptable tradeoff for v1)
