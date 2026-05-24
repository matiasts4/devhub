# Architect Handoff — Swarm Workspace Routing & Test Suite Health

**Date**: 2026-05-23
**Role**: Architect Worker
**Branch**: `task/2a14962d-swarm-control-panel-polish`
**Working tree**: 78 files changed (+603/−31174), includes audit-trail cleanup + feature work

---

## 1. Workspace Path Validation: `/home/matias/devhub`

### Finding: PATH DOES NOT EXIST ON DISK

The mission workspace `/home/matias/devhub` is **not a real directory**. The actual project root is `/home/matias/ArxonLabs/devhub`.

### Why terminals will still work

The `cwdGuard.js:23-56` has a fallback chain:
```
requested cwd → process.cwd() → $HOME → /
```

When a terminal session requests cwd=`/home/matias/devhub` (doesn't exist), `resolveTerminalSpawnCwd()` validates it via `isUsableDirectory()`, gets `false`, and falls back to `process.cwd()` which resolves to `/home/matias/ArxonLabs/devhub` — the real project root.

### Per-role workspace isolation

| Aspect | How it works |
|---|---|
| cwd (PTY spawn dir) | **Same for all roles** — `project.local_path` from DB |
| Branch isolation | `swarm/{launchId}/{roleKey}` — unique per role per launch |
| Worktree isolation | `${workspacePath}/.worktrees/swarm/{launchId}/{roleKey}` |
| Role differentiation | Only via `--agent` flag (coder/auditor/devops/architect) |

**Architecture constraint**: There is no per-role workspace path configuration. This is by design — isolation is at the git branch/worktree level, not at the filesystem level.

---

## 2. Full Routing Flow (UI → PTY)

```
User clicks "Launch Swarm"
  → SwarmControl.jsx:286 handleLaunchSubmit()
    → POST /api/agenthub/operations/health {action: "launch_swarm_local"}
      → swarmControl.js:1544 createSwarmLaunchDraft()
        → health/route.js:410 launchSwarmLocal()
          → For each role: creates workspace lease, session, run, runtime_request
    → Dispatch devhub:run-agent CustomEvent per role
      → TerminalWorkspacesManager.jsx:2801 handleRunAgent()
        → createWorkspaceForSwarmLaunchRequests()
          → createPanel(panelId, command, cwd, {swarmRole})
            → TerminalTTY.jsx:684 (renders panel)
              → connect() builds WS URL with ?cwd=...
                → GET /api/terminal/session → returns {port, wsPath}
                  → WebSocket ws://127.0.0.1:{port}{wsPath}?cwd=...
                    → ttyServer.js:725 extracts cwd from URL
                      → cwdGuard.js:23 resolveTerminalSpawnCwd()
                        → pty.spawn(shell, args, {cwd})
```

---

## 3. Key Architecture Constraints

### Hardcoded paths (not portable)
- `agentLaunchCommand.js:3-7`: OpenCode, Hermes, Codex paths are absolute `/home/matias/...`
- `AGENT_WORKSPACE_BASE_COMMIT` in `core.js:26`: Hardcoded SHA `f814998dd05cb491caf8637bf570dbd74b539090`

### Health endpoint legacy check
- `GET /health` checks port 4154 for process health → returns `status=offline, pid=null`
- Live opencode swarm agents run on **different PIDs** — the health check targets a legacy sidecar that no longer represents the actual agent fleet

### `ensureTTYServer()` ignores cwd
- `session/route.js:164` passes cwd to `ensureTTYServer()` but the function takes no args — cwd is only picked up per-connection at the WebSocket level

---

## 4. Test Suite Health

| Suite | Status | Count |
|---|---|---|
| TerminalTTY.test.js | ✅ ALL PASS | 74/74 |
| SwarmQueuePanel.test.js | ✅ ALL PASS | 20/20 |
| swarmControl.test.js | ✅ ALL PASS | 41/41 |
| TerminalWorkspacesManager.right-dock.test.jsx | ❌ 4 FAIL | 29/33 |
| SwarmControl.test.jsx | ❌ 10 FAIL | 27/37 |

### Root cause of 14 regressions

**4 right-dock failures**: `isFullscreenBrowser` condition in `TerminalWorkspacesManager.jsx:1410` now includes `maximizedView === 'swarm'`. This changes rendering behavior for panel-tab-browser and associated elements (wrapped in Fragment). Tests can't find `workspace-browser-window-close` → `click(null)` crash.

**10 SwarmControl failures**: Same `click(null)` pattern — test helper in `domHarness.js:64` calls `element.dispatchEvent()` on a null element. UI copy changes (e.g., "esperando aprobación" → "aprobación requerida", "1 agente activo" → "1 agente") also mismatch expected strings.

### Self-check notes
- These tests previously passed (per earlier session memory). The regression was introduced by working tree changes in this branch.
- No changes to test infrastructure — just component rendering + copy string shifts.

---

## 5. Next Steps for Director

1. **Coder**: Fix 14 test regressions — update `click()` guards for element-null case in test helpers, update expected strings
2. **Auditor**: Verify fix + run full test suite (`npx jest --no-coverage`)
3. **DevOps**: Resolve health endpoint legacy port divergence (port 4154 → live agent PID check)
4. **Architect (future)**: Consider per-role workspace paths if worktree isolation proves insufficient; extract hardcoded paths to config

---

*Evidence left by Architect Worker. No mission close — delivery to Director for handoff.*
