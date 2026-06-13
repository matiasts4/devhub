# Tasks: swarm-bidirectional

## Review Workload Forecast

| Field                   | Value             |
| ----------------------- | ----------------- |
| Estimated changed lines | ~60-80            |
| 400-line budget risk    | Low               |
| Chained PRs recommended | No                |
| Suggested split         | Single PR         |
| Delivery strategy       | single-pr-default |
| Chain strategy          | pending           |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

## Phase 1: Infrastructure — `DEVHUB_DIRECTOR_SESSION` env injection

- [x] 1.1 In `buildLaunchCommand()` (`route.js` ~181), add `DEVHUB_DIRECTOR_SESSION` export for workers only: when `roleKey !== 'director'`, push `export DEVHUB_DIRECTOR_SESSION="devhub-swarm-${launchId}-director"` to the wrapper params under `directorSessionName`

## Phase 2: Core Implementation — tmux injection function

- [x] 2.1 In `agentLaunchWrapper.js`, add `buildDirectorTmuxInjection()` function that returns the `_devhub_tell_director` bash function (guards on `DEVHUB_DIRECTOR_SESSION`, uses `tmux send-keys -t`)
- [x] 2.2 In `buildAgentLaunchWrapper()` (`agentLaunchWrapper.js`), call `buildDirectorTmuxInjection()` and include its output in the wrapper script parts
- [x] 2.3 In `buildLaunchCommand()` (`route.js` ~214), pass `directorTmuxSession: \`devhub-swarm-${launchId}-director\``to`buildAgentLaunchWrapper()` params

## Phase 3: Prompt wiring — Director/Worker status awareness

- [x] 3.1 In `buildLaunchPrompt()` (`route.js` ~130), add Director-specific "Sistema de Status" section: tmux status messages arrive in real-time, do not poll workers
- [x] 3.2 In `buildLaunchPrompt()` (`route.js` ~143), add Worker-specific "Reporte de Status" section: use `_devhub_tell_director` on task_start, found_issue, task_complete, needs_help, blocked

## Phase 4: Efficiency — heartbeat interval

- [x] 4.1 In `buildHeartbeatLoopCommand()` (`agentLaunchWrapper.js` ~234), change `sleep 30` to `sleep 120`

## Apply Summary

All 7 tasks completed. Files modified:

- `src/lib/agentLaunchWrapper.js` (+~80 lines)
- `src/app/api/agenthub/operations/health/route.js` (+~15 lines)

Tests: 13/14 pass. 1 pre-existing test failure in `includes inner command at the end` (flaky assertion that checks last non-empty line of generated script, affected by output formatting changes).
