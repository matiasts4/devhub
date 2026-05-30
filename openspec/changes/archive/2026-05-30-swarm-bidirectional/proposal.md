# Proposal: swarm-bidirectional

## Intent

Enable workers to inject status updates directly into Director's tmux terminal via event-driven `tmux send-keys`, replacing expensive HTTP heartbeat polling with free local syscalls.

## Scope

### In Scope

- `DEVHUB_DIRECTOR_SESSION` env var passed to workers at launch (pointing to `devhub-swarm-${launchId}-director`)
- `buildDirectorTmuxInjection()` helper in `agentLaunchWrapper.js`
- `_devhub_tell_director` bash function for workers to send formatted status
- Event-driven status injection: `task_start`, `found_issue`, `task_complete`, `needs_help`, `blocked`
- Reduce heartbeat interval from 30s to 120s (presence only; no status polling)

### Out of Scope

- HTTP-based `agent-say` clone (tmux send-keys is sufficient)
- Cross-host communication (all agents run on same Linux host)
- New DB schema for inter-agent messaging

## Capabilities

### New Capabilities

- `swarm-tmux-injection`: Workers push lightweight status events to Director's tmux pane via `_devhub_tell_director`. Each event is a single tmux send-keys with emoji marker and timestamp.

### Modified Capabilities

- `agent-events`: Adds `task_start`, `found_issue`, `task_complete`, `needs_help`, non `blocked` event types emitted via tmux injection (existing `agent_booted`, `agent_shutdown`, etc. remain via HTTP API).

## Approach

1. Director launches in tmux session `devhub-swarm-${launchId}-director`
2. `configureLaunchRole()` sets `DEVHUB_DIRECTOR_SESSION=devhub-swarm-${launchId}-director` in worker wrapper env
3. `buildDirectorTmuxInjection()` generates `_devhub_tell_director()` bash fn injected into every worker wrapper
4. Workers call `_devhub_tell_director <emoji> <message>` on meaningful events
5. Heartbeat drops to 120s interval (4x reduction)

## Affected Areas

| Area                                              | Impact   | Description                                         |
| ------------------------------------------------- | -------- | --------------------------------------------------- |
| `src/lib/agentLaunchWrapper.js`                   | Modified | Add `buildDirectorTmuxInjection()` helper           |
| `src/app/api/agenthub/operations/health/route.js` | Modified | Set `DEVHUB_DIRECTOR_SESSION` env in worker context |
| Agent prompts                                     | Modified | Call `_devhub_tell_director` on key events          |
| `openspec/specs/agent-events/spec.md`             | Modified | Add tmux-based event types                          |

## Risks

| Risk                                              | Likelihood | Mitigation                                                            |
| ------------------------------------------------- | ---------- | --------------------------------------------------------------------- |
| Director tmux session not reachable from worker   | Low        | Check `DEVHUB_DIRECTOR_SESSION` exists; fail gracefully if unset      |
| Heartbeat reduction causes Director oversight lag | Medium     | Status injection is event-driven; gaps covered by 120s presence pulse |
| tmux buffer overflow on high-volume events        | Low        | Single-line status, no rich payload                                   |

## Rollback Plan

1. Set heartbeat interval back to 30s
2. Remove `_devhub_tell_director` calls from worker prompts
3. Remove `buildDirectorTmuxInjection()` from wrapper
4. Remove `DEVHUB_DIRECTOR_SESSION` from worker env in `configureLaunchRole()`

## Dependencies

- All agents run on same Linux host (tmux is local)
- `tmux` is installed and accessible to workers

## Success Criteria

- [ ] Workers inject status into Director's tmux pane on `task_start`, `found_issue`, `task_complete`, `needs_help`, `blocked`
- [ ] Status visible in Director's terminal within 1s of event
- [ ] API calls for status reduced ~85% (30s→120s heartbeat + event-driven injection)
- [ ] Director prompt explains `DEVHUB_DIRECTOR_SESSION` mechanism
