# Proposal: session-workspace-restore

## Intent

DevHub loses standalone terminal sessions on restart because `restoreSessions()` skips sessions lacking a `ptyPid`. Additionally, after closing a swarm workspace (director + agents), newly opened workspaces can incorrectly show recently closed terminal identities — first shows `director`, second shows `coder`, third is clean. Root cause: `removeWorkspace` clears React state but orphaned `devhub_agent_runs` localStorage entries persist; new workspaces reuse low counter panel IDs that match stale entries.

## Scope

### In Scope

- Session classification: `pty-durable`, `opencode-durable`, `shell-ephemeral`
- Standalone shell restore by cwd/shell (no PTY pid required)
- Backend/React startup sequencing to prevent double-launch
- Swarm workspace semantic naming (`swarm-{role}`)
- **Terminal identity cleanup on workspace close** — clean `devhub_agent_runs` for removed panels + randomize panel ID counters to prevent stale rebinding

### Out of Scope

- Hermes Workspace tmux-backed persistent workers (separate track)
- Full PTY history replay (cwd-only for standalone shells)

## Capabilities

### New Capabilities

- `session-classification`: `pty-durable` (has `ptyPid`), `opencode-durable` (has `opencodeSessionId`), `shell-ephemeral` (cwd-only respawn)
- `semantic-workspace-naming`: workspace labels from `swarmRole`/`swarmId` instead of raw `workspace.name`
- `terminal-identity-cleanup`: explicit `devhub_agent_runs` cleanup on workspace close + randomized panel ID counter init to prevent stale identity inheritance

### Modified Capabilities

- `pty-identity-binding`: PTY-4 extended to cover `shell-ephemeral` cases where `ptyPid` is null but cwd/shell are available
- `swarm-process-lifecycle`: no requirement change

## Approach

1. **Session classification** — add `sessionType` field in `sessionStore.js`; classify on save
2. **Shell restore** — update `restoreSessions()` in `ttyServer.js` to handle `shell-ephemeral`: skip `ptyPid` gate, call `createSession()` with saved cwd/shell. Add `RESTORE_SHELL_EMERGENT` to coordinator manifest
3. **Startup mutex** — add `devhub_restore_in_progress` localStorage flag; `TerminalWorkspacesManager` blocks `devhub:relaunch-panel` until flag cleared
4. **Swarm naming** — `semanticMetadata.js` derives `workspace_label` from `swarmRole`/`swarmId`; wired into `panelHelpers.js` before `workspace.name` fallback
5. **Workspace close cleanup** — `removeWorkspace` deletes `devhub_agent_runs` entries for all panel IDs in removed workspace; `addWorkspace` initializes `panelCounterRef` to random high value
6. **TTL migration** — add `schemaVersion`; reclassify existing sessions on first load

## Affected Areas

| Area                                                | Impact   |
| --------------------------------------------------- | -------- |
| `src/lib/terminal/sessionStore.js`                  | Modified |
| `src/lib/terminal/ttyServer.js`                     | Modified |
| `src/lib/terminal/startupRestoreCoordinator.js`     | Modified |
| `src/components/TerminalWorkspacesManager.jsx`      | Modified |
| `src/components/terminal/utils/semanticMetadata.js` | Modified |
| `src/components/terminal/utils/panelHelpers.js`     | Modified |

## Risks

| Risk                          | Likelihood   | Mitigation                                                               |
| ----------------------------- | ------------ | ------------------------------------------------------------------------ |
| PID reuse (zombie session)    | Low          | `process.kill(pid, 0)` for `pty-durable`; `shell-ephemeral` bypasses pid |
| Double-launch race            | Medium       | `devhub_restore_in_progress` mutex flag                                  |
| Stale terminal identity bleed | High → Fixed | Clean `devhub_agent_runs` on close + randomized panel counter init       |

## Rollback Plan

1. Revert `sessionStore.js` + `ttyServer.js` (removes `sessionType`, restores `ptyPid` gate)
2. Remove `RESTORE_SHELL_EMERGENT` from `startupRestoreCoordinator.js`
3. Remove mutex + cleanup + counter randomization from `TerminalWorkspacesManager.jsx`
4. Revert `semanticMetadata.js` + `panelHelpers.js` naming changes
5. `schemaVersion < 2` sessions re-read as legacy automatically

## Dependencies

- `sessionStore.js` backwards compat (new field must not break existing reads)
- `startupRestoreCoordinator.js` existing `RESTORE_ACTION` values stable

## Success Criteria

- [ ] Standalone shell sessions resumed after restart with correct cwd
- [ ] `shell-ephemeral` sessions respawn without `ptyPid` in store
- [ ] Swarm workspaces named `swarm-{role}` not raw `workspace.name`
- [ ] No double-launch of OpenCode sessions
- [ ] Existing sessions migrated transparently
- [ ] 7-day TTL still evicts stale sessions
- [ ] **First new workspace after swarm close starts clean — no director/coder label bleed**
- [ ] **Second new workspace also clean — no pattern of N workspaces showing recently closed identities**
