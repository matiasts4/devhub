# Exploration: session-workspace-restore

## Current State

DevHub has a three-layer session persistence model:

### Layer 1 — PTY Session Store (`~/.devhub/terminal-sessions.json`)

- `sessionStore.js`: `saveSessions()` (debounced atomic write), `loadSessions()` (7-day TTL filter)
- `restoreSessions()` in `ttyServer.js` called at server startup
- **Critical gap**: `restoreSessions()` requires `ptyPid` to restore — line 970 `if (!s.ptyPid) { skipped++; continue; }`. Standalone shell sessions have no saved PTY PID so they're skipped entirely on reboot.
- Saved fields: `id, cwd, shell, title, createdAt, lastSeenAt, lastActivityAt, ptyPid, restored`

### Layer 2 — Workspace Layout (localStorage per project)

- Key: `devhub_terminal_state:{projectId}` + fallback `devhub_terminal_state`
- `TerminalWorkspacesManager` writes on every state change (debounced via React effects)
- Persists: `workspaces[].columns[].panels[]` with `id, cwd, initialCommand`, plus `activeWsId, activePanelIds, workspaceWindows, activeWindowIds`
- Reads back on mount, normalizes IDs, restores layout

### Layer 3 — Swarm/Agent State (localStorage + SQLite)

- `devhub_swarm_control_snapshot:{projectId}`: SwarmControl cached snapshot (localStorage)
- `devhub_agent_runs`: agentRun objects indexed by panelId (localStorage)
- `agent_registry`, `swarm_processes` SQLite tables (legacy DevHub Swarm)
- Hermes Workspace: `~/.hermes/profiles/` + `runtime.json` (not yet integrated in DevHub)

### The Restore Coordinator (`startupRestoreCoordinator.js`)

1. `buildRestoreManifestFromWorkspaceState()` — collects `terminalSessions[]` and `swarmRuns[]` from current workspace state + `agentRunsByPanel`
2. `buildStartupRestorePlan()` — matches manifest entries against live `runtimeSnapshot` from `/api/swarm/runtime-diagnostics`, produces `RESTORE_ACTION` per entry
3. `RESTORE_ACTION` values: `RESTORE_READY`, `REATTACH_LIVE_TERMINAL`, `RESUME_OPENCODE_SESSION`, `PROCESS_ORPHAN`, `QUOTA_BLOCKED`, `METADATA_STALE`, `TERMINATED`

### The Relaunch Mechanism (TerminalWorkspacesManager.jsx, ~line 1251)

For `RESUME_OPENCODE_SESSION` actions: dispatches `devhub:relaunch-panel` with `command = "opencode --session {opencodeSessionId}"`. Panels with `initialCommand` matching `/opencode/i` are pre-marked as needing relaunch via `devhub_pending_session_recovery` in localStorage.

### Why Standalone Terminals Fail to Resume

The `createSession()` call during `restoreSessions()` (line 986) is fed `cwd` and `shell` from the saved session, but since `ptyPid` was null for non-swarm sessions (PTY was never persisted — only live PTY pids were saved), those sessions are skipped. The session data for standalone terminals IS in `terminal-sessions.json` but without a pid it's treated as "unrestorable".

### Swarm vs Standalone Session Difference

- **Swarm OpenCode**: session ID is tracked (`opencodeSessionId`), OpenCode itself is the durable process that survives reboot, DevHub just re-issues `opencode --session <id>`
- **Standalone OpenCode terminal**: same pattern IF it has an `opencodeSessionId`, but if it's just a raw shell (`opencode` without `--session`) it's not tracked as resumable
- **Swarm Control**: localStorage snapshot is restored to UI but actual Swarm processes must be relaunched via headless endpoints

### Workspace Window Naming

- `workspace.name` or `Workspace ${index + 1}` fallback in `panelHelpers.js` (line 134)
- For swarm workspaces: `SwarmPrimarySurface` uses `workspace_label` derived from `input.project?.name` or `project?.id`
- No "swarm1" or "swarm-{role}" derived naming currently — just the raw `workspace.name`
- `semanticMetadata.js` derives panel labels from `swarmRole` when present: `${panelSwarmRole.label} 1` for named roles

## Affected Areas

- `src/lib/terminal/ttyServer.js` — `restoreSessions()` (skip logic), `createSession()` (swarmContext)
- `src/lib/terminal/sessionStore.js` — `saveSessions()` (fields saved), `loadSessions()` (filter)
- `src/lib/terminal/startupRestoreCoordinator.js` — `buildRestoreManifestFromWorkspaceState()`, `buildStartupRestorePlan()`
- `src/components/TerminalWorkspacesManager.jsx` — localStorage read/write, relaunch dispatch
- `src/components/terminal/utils/semanticMetadata.js` — panel label derivation
- `src/components/terminal/utils/panelHelpers.js` — workspace name normalization
- `src/views/SwarmControl.jsx` — `readCachedSwarmSnapshot()`, `writeCachedSwarmSnapshot()`
- `src/lib/agentSessions/resumableSessionAdapters.js` — OpenCode durable resume contract
- `src/lib/operations/swarmControl.js` — `persistMissionControlComposerMessage()`
- `src/app/api/terminal/session/route.js` — PTY session WebSocket upgrade endpoint
- `src/app/api/swarm/runtime-diagnostics/route.js` — runtime snapshot used by restore plan

## Approaches

### Approach A — Fix Standalone Terminal Resume (without PTY pid)

Enrich `sessionStore` to save standalone session metadata (cwd, shell, title, initialCommand) AND update `restoreSessions()` to recreate sessions from metadata even when `ptyPid` is null. On reboot, respawn a shell with the saved cwd.

**Pros**: Addresses the core gap — standalone terminals now resume
**Cons**: New shell won't have the same TTY history; cwd-only restore
**Effort**: Medium

### Approach B — Improve Swarm Workspace Naming

Add `swarmRole` or `swarmId` to the workspace metadata so names can be derived as `swarm1`, `swarm2`, or `swarm-{role}`. Wire `buildSwarmRoleMetadata()` output into workspace name normalization.

**Pros**: Better UX legibility, clearer workspace identity
**Cons**: Mostly cosmetic, doesn't fix session resume
**Effort**: Low

### Approach C — Unified Restore Plan with Session Classification

Distinguish three session types explicitly in `restoreManifest`: (1) `pty-durable` — has pid, full PTY restore; (2) `opencode-durable` — has sessionId, command-based resume; (3) `shell-ephemeral` — no pid, no sessionId, cwd-only restore. Make `buildStartupRestorePlan` handle each class separately.

**Pros**: Clean architecture, explicit contracts per session type, better debugging
**Cons**: Requires schema changes in restore manifest, affects multiple layers
**Effort**: High

### Approach D — Swarm Persistent Worker Recovery (Hermes alignment)

Align DevHub Swarm to Hermes Workspace model: checkpoint runtime state, persist mission context, support tmux-backed workers that survive app close. This is the `swarm-hermes-workspace-alignment` path already documented.

**Pros**: True swarm durability, aligns with Hermes architecture
**Cons**: Very large scope, requires new control plane endpoints, long timeline
**Effort**: Very High

## Recommendation

**Approach A (standalone terminal fix) + Approach B (workspace naming) as a combined first slice.**

The core user complaint is "simple terminal OpenCode sessions sometimes are NOT resumed if they are not part of a swarm." The gap is clear: standalone sessions lack `ptyPid` in the store so `restoreSessions` skips them. Fix the session classification and restore logic, then improve workspace naming as a UX enhancement. This covers the most impactful gap with bounded scope.

Approach C (unified plan) is worth doing but should be informed by A+B results. Approach D (Hermes alignment) is a separate strategic track.

## Risks

- **Zombie sessions after reboot**: `process.kill(pid, 0)` check in `restoreSessions` catches dead PTYs, but if the OS reuses the PID, a live-looking process could be the wrong one
- **Double-launch of OpenCode sessions**: `devhub_pending_session_recovery` dedup prevents some, but race between `restoreSessions()` (TTY server) and React mount (TerminalWorkspacesManager) could cause double-relauch
- **localStorage quota**: large workspace state (many panels, history) could exceed per-domain limits on some browsers
- **Swarm Control snapshot staleness**: cached snapshot could reflect dead Swarm state; no active liveness check on restore
- **Session store TTL**: 7-day stale eviction means sessions not seen in a week are silently dropped

## Ready for Proposal

**Yes** — the problem is well-scoped. The proposal should:

1. Define the three session classes and their restore contracts
2. Specify what fields each class saves to `sessionStore`
3. Detail the startup restore flow with explicit sequencing (TTY server first, then React, then relaunch dispatch)
4. Include swarm workspace naming improvement as secondary deliverable
5. Address double-launch prevention explicitly
