# Architect Evidence — Feature Delivery Swarm Launch

**Date:** 2026-05-23
**Rol:** Architect (Worker)
**Branch:** `task/2a14962d-swarm-control-panel-polish`
**Repo:** `/home/matias/ArxonLabs/devhub`
**HEAD:** `db93e5c`

---

## 1. Workspace Path Validation

### CRITICAL: Mismatch detected — `local_path` vs real path

| Source | Path | Exists? |
|--------|------|---------|
| DevHub DB `projects.local_path` | `/home/matias/devhub` | ❌ NO |
| Real git repo | `/home/matias/ArxonLabs/devhub` | ✅ SÍ |
| DevHub MCP `repo_root` | `process.cwd()` → `/home/matias/ArxonLabs/devhub` | ✅ SÍ |

**Impact on terminals**: When a swarm terminal requests `cwd=/home/matias/devhub`, `cwdGuard.js:23-56` runs `isUsableDirectory()`, gets `false`, and falls back to `process.cwd()` (`/home/matias/ArxonLabs/devhub`). Terminals **will work** but the intended path is wrong. All roles get the **same fallback path** — isolation is at git worktree/branch level, not filesystem.

**Fix needed**: Update `projects.local_path` in DevHub DB to `/home/matias/ArxonLabs/devhub`.

### Per-role workspace isolation (confirmed)

| Mechanism | How it works | Status |
|-----------|-------------|--------|
| cwd (PTY spawn dir) | Same for all roles — falls back to `process.cwd()` | ⚠️ Works via fallback |
| Branch isolation | `swarm/{launchId}/{roleKey}` per role | ✅ Pattern works |
| Worktree isolation | `.worktrees/swarm/{launchId}/{roleKey}` | ✅ 5 worktrees exist for launch-9dac5968 |
| Role differentiation | `--agent` flag (coder/auditor/devops/architect) | ✅ |

---

## 2. Architecture State Assessment

### 2.1 Codebase Health

| Metric | Value |
|--------|-------|
| Project maturity | Desktop Tauri + Next.js, ~120+ source files |
| Tasks completed | 80/80 |
| Milestones | 12/13 done, **1 overdue**: `[DESKTOP-4] Empaquetado Linux (.deb, .AppImage)` (due 2026-05-18) |
| Execution queue | **Empty** — no pending work for devhub project |
| Git state | 78 modified (48 untracked). Modifications include code changes + evidence artifacts from previous swarm runs |
| Stale active_workers | 2 entries from March 2026, both `completed` — harmless metadata |

### 2.2 Previous Swarm Artifacts Found

A complete RESUME-SWARM run was executed with 5 roles. Evidence in `data/`:

| Phase | Tasks | Status | Evidence |
|-------|-------|--------|----------|
| Phase 1 | RESUME-SWARM-01 (diagnóstico) + RESUME-SWARM-02 (estados) | ✅ Complete | `data/coder-evidence-20260523.md`, `data/architect-evidence-resume-swarm-02.md` |
| Phase 2 | RESUME-SWARM-03 (manifest) + RESUME-SWARM-04 (identidad) | ⏳ **Never dispatched** | Director's coordination plan shows Gate 1 approved but Phase 2 never started |
| Phase 3 | RESUME-SWARM-05 (coordinator) | ⏳ Never dispatched | — |

**Remaining P0-P1 issues from previous audit:**
- **P0**: Duplicate `persistAgentRunMetadata` — manager version loses 6 fields vs hook version
- **P1**: Race condition in flush mechanism — overlapping workspaces on rapid launches
- **P1**: Counter mutation outside setState — panel ID collisions
- **P1**: 3x duplicate `shortenCommandSummary`, 2x duplicate `buildSwarmRoleMetadata`

### 2.3 Test Suite Health

| Suite | Status | Details |
|-------|--------|---------|
| TerminalTTY.test.js | ✅ 74/74 pass | — |
| SwarmQueuePanel.test.js | ✅ 20/20 pass | — |
| swarmControl.test.js | ✅ 41/41 pass | — |
| runtimeStatus.test.js | ✅ 17/17 pass | — |
| TerminalWorkspacesManager.right-dock.test.jsx | ❌ **4 FAIL** | `isFullscreenBrowser` condition change in Fragment wrapping |
| SwarmControl.test.jsx | ❌ **10 FAIL** | `click(null)` crash + copy string mismatches |

**14 regressions total** — introduced by working tree changes in this branch. Root causes: component rendering tweaks + copy changes.

### 2.4 Runtime Health

| Service | Status | Detail |
|---------|--------|--------|
| Sidecar (PTY backend) | ✅ ALIVE | `127.0.0.1:4000`, PID 1467543, 10 sessions, uptime 96s |
| Next.js dev server | ✅ ALIVE | port 3100 (from earlier devops report) |
| DevHub MCP servers | ✅ ALIVE | Multiple PIDs confirmed |
| DB | ✅ OK | `data/devhub.db` — 8 tables, operational |

### 2.5 Hardcoded Paths (portability risk)

`src/lib/agentLaunchCommand.js:4-6`:
- `opencode`: `/home/matias/.opencode/bin/opencode`
- `codex`: `/home/matias/.nvm/versions/node/v24.14.0/bin/codex`
- `hermes`: `/home/matias/.local/bin/hermes`

These are **absolute paths for THIS machine**. Not portable. Not configurable via env or config.

---

## 3. Existing Worktrees & Divergence

| Worktree | Branch | HEAD | Purpose |
|----------|--------|------|---------|
| `/home/matias/ArxonLabs/devhub` (main) | `task/2a14962d-swarm-control-panel-polish` | `db93e5c` | Active development |
| `.plyrium-forge/worktrees/swarm-feature-delivery` | `main` | `1b78c8f` | Previous swarm (48 commits behind current) |
| `.worktrees/swarm/launch-9dac5968/{architect,auditor,coder,devops,director}` | `main` | `1b78c8f` | All 5 roles — stale, never used |

The `swarm-feature-delivery` worktree and the `launch-9dac5968` worktrees are all at `1b78c8f` which is **12 commits behind** current HEAD `db93e5c`. If these worktrees are reused, they're working on stale code.

---

## 4. Handoff to Director

### What I validated

1. **Workspace routing**: Terminals resolve correctly via fallback, but `local_path` in DB is wrong.
2. **Architecture coherence**: Swarm infrastructure complete — control room, agent registry, runtime diagnostics, worktree isolation all functional.
3. **Previous swarm status**: Phase 1 complete, Phase 2+3 never executed. Evidence artifacts exist but the code changes from that swarm may have been superseded by subsequent commits.
4. **Test regressions**: 14 failures from active branch work — need resolution before next iteration.
5. **Runtime**: Sidecar and services operational.

### Recommended Next Steps

1. **Fix workspace path**: Update DevHub DB — `projects.local_path` should be `/home/matias/ArxonLabs/devhub`, not `/home/matias/devhub`.
2. **Coder**: Fix 14 test regressions (right-dock + SwarmControl) before any new feature work.
3. **DevOps**: Address overdue milestone DESKTOP-4 (Linux packaging `.deb`/`.AppImage`). Clean up stale worktrees.
4. **Auditor**: Verify test fixes, audit the P0 duplicate `persistAgentRunMetadata` issue.
5. **Director**: Decide: continue RESUME-SWARM Phase 2+3 (restore manifest + identity mapping) or define a new feature. If continuing, rebase worktrees off `task/2a14962d-swarm-control-panel-polish`.

### Constraints Documented

- All role terminals get the **same cwd** — isolation is git-level only
- No per-role workspace path configuration exists
- Hardcoded agent executable paths — not portable
- Health endpoint checks legacy port 4154, not live agent PIDs

---

*Evidence left by Architect Worker. No mission close — delivery to Director for handoff.*

## Git Checkpoint

```
git:checkpoint
commit=none (analysis only, zero file changes to source)
working-tree=78 modified, 48 untracked (pre-existing, not from this analysis)
evidence-file=data/architect-evidence-feature-swarm-2026-05-23.md
```
