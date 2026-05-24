# Architect Evidence: Swarm Workspace Routing & Terminal Isolation

**Date:** 2026-05-23  
**Author:** Architect Agent  
**Workspace:** `/home/matias/ArxonLabs/devhub`

---

## Working Directory

Current: `/home/matias`  
Project root: `/home/matias/ArxonLabs/devhub`  
Command used: `pwd` → `/home/matias`

---

## Files Analyzed

| File | Purpose |
|------|---------|
| `src/components/TerminalWorkspacesManager.jsx` | Core workspace/panel orchestration, swarm launch handling |
| `src/components/TerminalTTY.jsx` | Terminal instance, WebSocket session setup, cwd propagation to sidecar |
| `src/components/terminal/utils/swarmRoleMeta.js` | Role constants, role inference, role metadata builder |
| `src/lib/operations/swarmControl.js` | Swarm catalog, launch draft/preview, control room state |
| `src/lib/terminal/cwdGuard.js` | Server-side cwd validation and fallback resolution |
| `src/lib/terminal/nativeVteBridge.js` | Tauri native VTE panel lifecycle |
| `src/app/api/agenthub/operations/health/route.js` | `launch_swarm_local` server-side mission/workspace/run creation |
| `sidecar-backend/server.js` | PTY process spawn, session cwd binding |
| `sidecar-backend/sessionCwd.js` | Sidecar adapter for cwdGuard |
| `.plyrium-forge/worktrees.json` | Agent pane worktree registration |
| `.plyrium-forge/worktrees/` | Actual worktree directories (2 entries) |

---

## Architecture Findings: How Workspace Routing Works

### 1. Data Model

Each **panel** (terminal) carries three routing-relevant fields:

```js
createPanel(id, initialCommand, panelCwd, metadata)
// { id, initialCommand, cwd: panelCwd, swarmRole: metadata?.swarmRole }
```

Each **workspace** is a named collection of columns → panels. Workspaces don't have an independent cwd; they inherit from the parent `TerminalWorkspacesManager` prop.

### 2. cwd Propagation Chain (Browser → PTY Process)

```
App.jsx / Layout
  ↓ cwd prop
TerminalWorkspacesManager (lines 851, 3580-3592)
  ↓ panel.cwd || cwd
renderWorkspacePanel() → <TerminalTTY cwd={panel.cwd || cwd} .../>
  ↓ cwd prop
TerminalTTY.connect() (line 1265)
  ↓ cwd param in WebSocket URL
/api/terminal/session?cwd=/home/matias/ArxonLabs/devhub&sessionId=p1
  ↓ URL param on server
sidecar-backend/server.js (line 232: urlParams.get('cwd') || os.homedir())
  ↓
getOrCreateSession() → resolveSidecarSessionCwd()
  ↓
cwdGuard.js → resolveTerminalSpawnCwd() → fs.statSync validation
  ↓
pty.spawn(shell, [], { cwd: effectiveCwd })
```

**Security guard at the floor:** `cwdGuard.js` validates the requested cwd exists on disk via `fs.statSync`. If it doesn't exist, it falls back to `process.cwd()` → `os.homedir()` → `/`. This prevents a panel from spawning a shell in a non-existent directory.

### 3. Swarm Launch Routing

```
SwarmLaunchWizardModal → handleTerminalSwarmLaunch()
  ↓ POST /api/agenthub/operations/health { action: 'launch_swarm_local' }
launchSwarmLocal()  (route.js:416)
  ├─ Creates mission in DB
  ├─ For each role: create workspace lease, register participant, create session & run
  ├─ Builds runtime_requests[] with { taskId, roleKey, command, ... }
  └─ Returns { runtime_requests }
  ↓
Handler dispatches `devhub:run-agent` events (line 1615)
  ↓
useEffect listener (line 2865): checks launchOrigin === 'swarm-control-launch'
  ↓
enqueueSwarmLaunchRequest() → flushPendingSwarmLaunchRequests()
  ↓
createWorkspaceForSwarmLaunchRequests() (line 2199)
  ├─ Groups agents by role → maps to column layout (director gets own column)
  ├─ Creates panels via createPanel(panelId, commandToRun, cwd, { swarmRole })
  │                                          ^^^ ALL panels get the SAME cwd
  └─ Sets active workspace, persists agent run metadata
```

### 4. Worktree Infrastructure (existing but NOT wired)

- `.plyrium-forge/worktrees.json` registers agent worktrees
- Current entry: `pane-p_40df269092784f5f894c83-coder` at path `.plyrium-forge/worktrees/pane-p_40df269092784f5f894c83-coder/` — a full directory copy
- `swarm-feature-delivery/` is another worktree (full repo copy per agent)

However: the swarm launch routing code NEVER reads `.plyrium-forge/worktrees.json` and NEVER assigns a per-agent directory. Each agent gets a `workspacePath` from `resolvedDraft.workspacePath` (line 496, 520, 534), which is the **same** path for all agents.

### 5. Role Metadata

`swarmRoleMeta.js` exports pure functions for:
- `SWARM_ROLE_META` — static color/label map (director, coder, auditor, devops, architect, qa, builder, recovery_ops, evidence, scout, analyst)
- `inferSwarmRoleKey(input)` — heuristic extraction from taskId, roleLabel, promptSummary
- `buildSwarmRoleMetadata(input)` — constructs role display metadata with label, abbrev, rgb

These are purely cosmetic/discovery — no routing decisions depend on them.

---

## Risk Assessment

### P1 — ALL swarm agents share the same cwd (Critical)

**Location:** `createWorkspaceForSwarmLaunchRequests()` lines 2199-2305

Every agent panel in a swarm launch gets **the same** `cwd` prop from the `TerminalWorkspacesManager` component. There is no per-agent worktree routing. If a Coder and Auditor run in the same swarm, their shells spawn in the same directory. Any file mutations by one agent are immediately visible to the other.

**Impact:** Agents operating on the same filesystem without isolation risks cross-contamination of state, race conditions on file writes, and confusion about whose output is whose.

**Evidence:**
- Line 2248: `return createPanel(panelId, request.commandToRun, cwd, { swarmRole: request.swarmRole })` — `cwd` is the component prop, not a per-agent path
- The `buildLaunchPrompt()` in route.js (line 482) receives `resolvedDraft.workspacePath` and passes it uniformly to all roles
- The `insertAgentHubSession` (line 514) uses `directory: resolvedDraft.workspacePath` — uniform for all agents

### P2 — cwd is not validated at the UI level

**Location:** `TerminalTTY.jsx` line 1265, `TerminalWorkspacesManager.jsx` line 689

The `cwd` passed to `TerminalTTY` is used verbatim in the WebSocket URL. There's no sanitization or validation at the component level. The only validation happens server-side in `cwdGuard.js`, which is a stat-based guard (directory must exist) — not an isolation mechanism.

**Risk:** If the `cwd` prop is `null` or undefined, the sidecar falls back to `os.homedir()`, which is unpredictable for headless agent operations.

### P2 — Worktree infrastructure exists but is not connected to routing

**Location:** `.plyrium-forge/worktrees.json`, `.plyrium-forge/worktrees/`

Two worktrees exist (`pane-p_40df269092784f5f894c83-coder`, `swarm-feature-delivery`) but neither is referenced by any swarm control code. The `worktrees.json` file is never read in the routing path. The `workspacePath` used in `launchSwarmLocal()` is always the project root, never a per-agent worktree.

**Risk:** Extending the system to use per-agent worktrees would require changes in:
1. `launchSwarmLocal()` — assign distinct worktree paths per agent
2. `createWorkspaceForSwarmLaunchRequests()` — route panels to their assigned worktree
3. Sidecar cwd resolution — must allow worktree paths

### P3 — Terminal session cwd guard is effective for crash safety

**Location:** `cwdGuard.js` lines 23-56

The `resolveTerminalSpawnCwd()` function validates with `fs.statSync`, and falls back through `process.cwd()` → `os.homedir()` → `/`. This prevents shell spawn failures from invalid paths. This is good defense-in-depth but does nothing for isolation.

### P3 — Per-agent directory mapping doesn't exist in the data model

Each `runtime_request` carries a `roleKey` (coder, auditor, etc.) but no distinct path. The `prepareAgentWorkspaceLease` (route.js line 489) creates a DB workspace record per agent, but these all point to the same `workspace_path` from the draft.

---

## Recommendations for Director

1. **Address P1 as top priority:** Implement per-agent worktree routing. The worktree infra exists under `.plyrium-forge/` but is disconnected. Each agent panel in a swarm should spawn with `cwd` pointing to its own worktree clone.

2. **Wire worktree assignment into `launchSwarmLocal()`:** The server-side launch function should read/register worktrees per agent (reading `.plyrium-forge/worktrees.json`) and include the per-agent path in `runtime_requests`.

3. **Extend `createWorkspaceForSwarmLaunchRequests()`:** Modify the client-side panel creation to read per-agent cwd from the `runtime_request` detail, using `panelCwd` on `createPanel()` instead of the blanket `cwd` prop.

4. **Add per-panel cwd binding in TerminalTTY:** The WebSocket should include an explicit `cwd` per session that the sidecar respects. This already exists (the `cwd` URL param) but isn't varied per agent.

5. **Post-audit: cwd fallback logging:** Add a warning when `cwdGuard.js` falls back, so the system can detect when a panel unexpectedly falls through to `process.cwd()` or homedir.
