# Proposal: swarm-launch-hardening

## Intent

The 5-role swarm launch in the DevHub desktop app shows three concrete failures: ~15s to bring all panes online, director system-prompt escape sequences (`[[35;60;4M^...`) leaking into the architect pane, and random crashes in architect/devops shortly after launch. One hardening pass — faster launch, isolated per-pane writes, bounded crash recovery — without redesigning the swarm model.

## Scope

### In Scope
- Parallelize worktree creation; memoise prompt + command per launch id
- Per-pane ring buffer between xterm `onData` and sidecar PTY writer
- PTY-exit watchdog with one-shot respawn for launch-window crashes
- Per-pane prompt flush gate to stop director→architect tail-leak
- Preflight in `scripts/verify-swarm-launch.mjs`: p95 latency, zero leak/crash × 10

### Out of Scope
- dualMutex / surface registry redesign; renderer swap
- Agent runtime changes beyond launch stability
- The 48-file `WIP: pre-sdd-batch 2026-06-08` batch — dependency, not part of this diff

## Capabilities

### New
- `swarm-launch-perf` — parallel worktree + cached payload
- `pane-prompt-buffer` — per-pane ring buffer + flush gate
- `pane-crash-recovery` — PTY-exit watchdog + bounded respawn

### Modified
- `swarm-process-lifecycle` — tighten launch contract (parallelism, flush gate, watchdog hook)
- `cli-swarm-command` — surface recoverable crash state in CLI summary

## Approach

`Promise.all` over role-scoped worktree workers; memoise prompt + command per launch id; bounded ring buffer between `TerminalTTY.jsx` `onData` and the sidecar writer stops backpressure-mix; per-pane flush gate on director prompt; PTY-exit watchdog in `sidecar-backend/server.js` triggers one respawn before surfacing recoverable state to the panel.

## Affected Areas

| Area | Files | Δ |
|------|-------|---|
| Launch orchestrator | `src/lib/operations/swarmControl.js`, `src/lib/agentLaunchWrapper.js` | M |
| Worktree + prompt cache | `src/lib/swarm/agentWorkspaceManager.js`, `src/lib/agentLaunchCommand.js` | M |
| TTY / xterm buffer | `src/lib/terminal/ttyServer.js`, `src/components/TerminalTTY.jsx`, `src/components/TerminalWorkspacesManager.jsx` | M |
| Sidecar transport | `sidecar-backend/server.js`, `sidecar-backend/sessionTransport.js` | M |
| Filter + stagger | `src/lib/terminal/terminalNoiseFilter.js`, `src/lib/terminal/terminalConnectStagger.js` | M |
| Preflight | `scripts/verify-swarm-launch.mjs` | M |

## Risks

| Risk | Like | Mitigation |
|------|------|------------|
| Worktree race on shared lock | Med | per-role lock + launch-id fence |
| Watchdog double-respawn | Low | one respawn budget per launch id |
| Buffer drops input under PTY stall | Low | bounded backpressure + overflow event |
| 48-file WIP not stable | Med | hard gate: apply only after batch clean |
| Diff > 800-line PR budget | Med | surgical; defer surface-registry work |

## Rollback Plan

Revert this change's merge commit. The 48-file WIP batch is isolated by `WIP: pre-sdd-batch 2026-06-08` headers and stays untouched — bad apply cannot corrupt the prior fix pass. Watchdog respawn state is in-memory; no schema to migrate.

## Dependencies

**Hard**: 48-file `WIP: pre-sdd-batch 2026-06-08` batch must be clean and committable; its `src/lib/terminal/terminalNoiseFilter.js` is the base for stricter leak-class regex. **Soft**: jest 149/149 green.

## Success Criteria

- [ ] p95 5-role launch < 4s over 50 launches (`scripts/verify-swarm-launch.mjs`)
- [ ] Zero `[[\d+;\d+;\d+M` prompt-leak observations × 10 launches
- [ ] Zero unexpected pane crashes (architect/devops) × 10 launches
- [ ] Net diff within ~800 lines (single-PR, C2 delivery)
