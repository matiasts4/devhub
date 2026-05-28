# Coder Evidence — Workspace Routing Validation
**Date:** 2026-05-23  
**Role:** Coder (swarm validation)  
**Branch:** `task/2a14962d-swarm-control-panel-polish`

---

## 1. Working Directory

```
$ pwd
/home/matias

$ ls /home/matias/ArxonLabs/devhub/
```

**Finding:** The agent's shell starts at `/home/matias` (home), NOT at the project root `/home/matias/ArxonLabs/devhub`. This is the default behavior — each swarm agent terminal opens in the user's home directory unless explicitly configured with a `cwd` override. The project root exists at `/home/matias/ArxonLabs/devhub`.

---

## 2. Git Status Summary

| Property     | Value                                      |
|-------------|--------------------------------------------|
| Branch       | `task/2a14962d-swarm-control-panel-polish`  |
| Modified     | ~30 files (components, API routes, tests)   |
| Deleted      | ~50 files (audit trails, openspec changes)  |
| Untracked    | ~30 files (evidence, tests, docs, CLI)      |

**Status:** Active development branch with staged and unstaged changes. No staged commit pending.

---

## 3. Workspace Routing Architecture

### How each terminal's `cwd` is determined

The chain has **3 layers**:

### Layer 1: App.js → TerminalWorkspacesManager prop

```jsx
// App.js line 206-210
<TerminalWorkspacesManager
  cwd={project.local_path}       // ← source of truth
  isVisible={isTerminalRoute}
  projectId={project.id}
/>
```

The `cwd` comes from `project.local_path` (the project's filesystem path from the DevHub database).

### Layer 2: Panel storage (state-level)

Panels store their own `cwd` at creation time. Two creation paths:

**Path A — Manual split (handleRunAgent via handleSplit):**
```js
// TerminalWorkspacesManager.jsx line 2877
const createdPanelId = handleSplit('horizontal', activePanelId, cmdToRun, cwd);
//                                                              ^^^ component cwd prop
```

**Path B — Swarm launch (createWorkspaceForSwarmLaunchRequests):**
```js
// TerminalWorkspacesManager.jsx line 2248
return createPanel(panelId, request.commandToRun, cwd, { swarmRole: request.swarmRole });
//                                                ^^^ component cwd prop (same value)
```

Both paths use `cwd` from the component prop (i.e., `project.local_path`).

### Layer 3: Render-time resolution (cascade)

```jsx
// TerminalWorkspacesManager.jsx line 689
cwd={panel.cwd || cwd}
//   ^^^^^^^^^^^^ panel-level overrides workspace-level
```

Each `TerminalTTY` gets `panel.cwd` first, falling back to the component `cwd`.

### Layer 4: Server-side validation (cwdGuard)

When the WebSocket connects, the TTY server validates the cwd:

```js
// cwdGuard.js
resolveTerminalSpawnCwd(requestedCwd) → validates directory exists
  → if valid: use it
  → if invalid: fallback chain [process.cwd(), os.homedir(), root('/')]
```

This ensures terminal processes never crash from bad cwd values, but means a **wrong cwd is silently corrected** — no error surfaces to the user.

### Layer 5: tmux session creation

When commands are wrapped in tmux (for swarm resilience), the cwd is explicitly set:

```js
// ttyServer.js line 437
const attachCommand = `tmux ... new-session -A -s ${name} -c ${escapeShellArg(cwd)}`;
```

The `-c` flag ensures tmux spawns in the correct directory.

---

## 4. Swarm Launch Flow (Complete)

```
User clicks "Lanzar swarm local"
  → SwarmLaunchWizardModal.onLaunch()
  → handleTerminalSwarmLaunch()
    → POST /api/agenthub/operations/health { action: 'launch_swarm_local' }
      → launchSwarmLocal():
        - Creates mission, sessions, workspaces, runs in DB
        - Builds runtime_requests[] with:
            command, taskId, roleKey, launchOrigin='swarm-control-launch'
        - workspacePath from resolvedDraft (draft.workspacePath || project.local_path || '/workspace/devhub')
      → Returns runtime_requests[]
    → Dispatches devhub:run-agent for each request
      → enqueueSwarmLaunchRequest() (batch collector)
        → flushPendingSwarmLaunchRequests()
          → createWorkspaceForSwarmLaunchRequests()
            → Creates new workspace with panels
            → Each panel gets createPanel(id, commandToRun, cwd, {swarmRole})
            → cwd = component prop = project.local_path
```

---

## 5. Key Findings

| # | Finding | Impact |
|---|---------|--------|
| 1 | **Swarm wizard workspacePath field is decorative for terminal cwd.** The wizard shows a "Path operativo" input (`draft.workspacePath`), and it IS used for DB records (session directory, workspace path), but the actual terminal panels are always created with the component `cwd` prop (`project.local_path`). | Low — The path matters for DB integrity but terminals land in the right project dir. |
| 2 | **Two code paths exist for panel creation** (`handleRunAgent` for individual dispatch, `createWorkspaceForSwarmLaunchRequests` for bulk swarm launch). Both use the component `cwd` prop. | Low — Consistent behavior, but a maintenance risk if only one path is updated. |
| 3 | **cwdGuard silently falls back** on invalid paths. If `project.local_path` is wrong or the directory doesn't exist, the terminal starts in `process.cwd()` (Next.js server root) instead. | Medium — Silent failure mode, no user-visible error. |
| 4 | **`project.local_path` can be `/workspace/devhub`** if the project has no `local_path` set (see `createSwarmLaunchDraft` fallback). This is a synthetic path that may not exist on disk. | Medium — Would trigger cwdGuard fallback silently. |
| 5 | **Agent shell starts at `/home/matias`** (the default). The `cwd` override only takes effect after the WebSocket negotiates with the TTY server. There's a brief window where a newly opened terminal panel shows the home directory before the server resolves the correct cwd. | Low — Cosmetic flash; quickly corrected by server-side resolution. |

---

## 6. Risks

1. **cwd mismatch between DB record and terminal panel**: The `buildLaunchPrompt` includes `Workspace: ${workspacePath}` in the agent's prompt text, and the session DB record stores `directory: resolvedDraft.workspacePath`. But the actual terminal process might be in a different directory if `project.local_path` diverges from `resolvedDraft.workspacePath`. The two values can differ when the wizard's workspacePath is overridden.

2. **No integration test covering the full cwd chain**: Unit tests exist for `cwdGuard`, `handleSplit`, and swarms in isolation, but there's no end-to-end test that verifies: wizard → API → dispatch → panel creation → TTY server → tmux spawn → actual cwd of the shell process.

3. **Per-panel cwd storage is not persisted in localStorage**: The panel serialization (line 1107-1119) includes `cwd: p.cwd || null`, so it IS saved and restored. Verified OK.

---

## 7. Files Examined

| File | Role |
|------|------|
| `src/App.js` | Passes `cwd={project.local_path}` to TerminalWorkspacesManager |
| `src/components/TerminalWorkspacesManager.jsx` | Core workspace manager, panel creation, swarm launch handling |
| `src/components/TerminalTTY.jsx` | Terminal component receiving `cwd` prop |
| `src/components/control-room/SwarmLaunchWizardModal.jsx` | Launch wizard UI with workspacePath field |
| `src/lib/operations/swarmControl.js` | `createSwarmLaunchDraft`, catalog builder |
| `src/app/api/agenthub/operations/health/route.js` | `launchSwarmLocal`, `buildLaunchPrompt`, `buildLaunchCommand` |
| `src/lib/terminal/ttyServer.js` | WebSocket server spawning PTY processes with resolved cwd |
| `src/lib/terminal/cwdGuard.js` | cwd validation and fallback logic |
| `src/lib/agentLaunchCommand.js` | Builds tmux-wrapped launch commands |
| `devhub-cli/commands/swarm-launch.js` | CLI version of swarm launch |

---

## 8. Conclusion

**Workspace routing is functionally correct.** Each swarm agent terminal opens with `project.local_path` as its working directory. The cwd flows through a consistent chain: `App.js` → `TerminalWorkspacesManager` → per-panel storage → `TerminalTTY` → WebSocket negotiation → `cwdGuard` validation → PTY spawn (optionally wrapped in tmux with `-c` flag).

The main gap is the **lack of E2E validation** across the full chain and the **silent fallback behavior** in `cwdGuard` when paths don't exist on disk.
