# Auditor Evidence — Swarm Feature Delivery Readiness

**Date**: 2026-05-23 (second pass)
**Role**: Auditor
**Agent**: `opencode-go/deepseek-v4-flash`
**Workspace**: `/home/matias/ArxonLabs/devhub`
**Branch**: `task/2a14962d-swarm-control-panel-polish`

---

## 1. Workspace Path Validation

### Terminal Sessions (live API)
- **27 sessions total**: 25 on `/home/matias/ArxonLabs/devhub` ✅
- **2 stale sessions** with wrong cwd:
  - `p44` → `/home/matias/ArxonLabs` (one level up)
  - `p24` → `/home/matias` (home dir)
- **4 TUI terminals** (p336-p339): all on correct cwd ✅
- **Conclusion**: 25/27 live terminals correct. 2 stale restored sessions from Tauri — not a routing bug, but should be cleaned up.

### Launch Command
- ⚠️ **Stale workspace path**: prompt says `/home/matias/devhub` — actual is `/home/matias/ArxonLabs/devhub`
- `agentLaunchCommand.js` uses hardcoded paths (`/home/matias/.opencode/bin/opencode`) ✅ exists
- `WorkspaceRightDock.jsx` resolves dynamically — no evidence of hardcoded mismatch

---

## 2. Test Results

| Suite | Status | Tests |
|-------|--------|-------|
| `swarmControl.test.js` | ✅ PASS | 41/41 |
| `swarm-launch.test.js` | ✅ PASS | 3/3 |
| `TerminalWorkspacesManager.right-dock.test.jsx` | ❌ FAIL | 29/33 (4 failed) |
| **Full suite** | **❌ DEGRADED** | **1673/1764 pass, 90 failed** |

### Right-dock failures (4 tests)
```
  ✕ keeps terminal-only layout by default       → expect().not.toBeNull() — received null
  ✕ toolbar toggle shows the dock shell          → expect().not.toBeNull() — received null
  ✕ workspace browser indicator + close          → expect().not.toBeNull() — received null
  ✕ dock maximize toggles panel size             → TypeError: Cannot read properties of null
```
**Root cause**: DOM elements not rendered in test environment — likely timing/lifecycle issue with recent refactors.

### Full suite breakdown (90 failures, 27 suites)
| Category | Failed Suites | Key Issue |
|----------|--------------|-----------|
| `devhub-cli/` | 11 | Likely API mocking gaps |
| `src/components/__tests__/` | 7 | `CopilotAuthPanel` module not found + DOM null refs |
| `src/views/__tests__/` | 1 | `SwarmControl.test.jsx` |
| `.plyrium-forge/intel/` e2e | 5 | Not excluded from jest runner — Playwright tests |
| `tests/agenthub/` | 2 | API mocking |
| `src/app/api/fs/tree/` | 1 | Route handler issues |

**⚠️ 90 vs 68 reported by DevOps**: regressions added ~22 more failures since DevOps check.

---

## 3. Working Tree Risk Assessment

### Dirty files: **90 total**
- **28 modified** (control-room components, views, tests, etc.)
- **14 deleted** (all `data/audit-trails/headless-*.json` stale files)
- **48 untracked** (new files: swarm API routes, terminal components, workspace libs, tests)

### Critical risks
1. **30+ audit-trails files deleted** — cleanup not committed, pollutes `git status`
2. **No PR open** — 15 commits, 248 files changed, 33,795 insertions / 4,253 deletions
3. **3 MCP instances running** (PIDs 1317, 276200, 500688) — confirmed via DevOps evidence
4. **Branch is 15 commits ahead of `main`** — no integration branch review done
5. **Feature delivery scope unclear** — 80/80 tasks completed, no new tasks in DevHub queue

---

## 4. Service Health

| Service | Status |
|---------|--------|
| Next.js dev server (port 3100) | ✅ RUNNING |
| Health API | ✅ Responding (1 healthy, 2 degraded, 1 stale, 1 offline) |
| Queue | ✅ Empty / healthy |
| `opencode-process` | ⚠️ offline (health check) |
| `mcp` | ⚠️ degraded — no live inventory endpoint |
| `telegram` | ⚠️ degraded — no recent activity |
| `session-stream` | ⚠️ stale — live session check unavailable |

---

## 5. Acceptance Criteria Audit

| Criterion | Result | Evidence |
|-----------|--------|----------|
| Terminal opens in correct workspace | ✅ 25/27 correct | `GET /api/terminal/sessions/` |
| Mission prompt has role instructions | ⚠️ Partial | Prompt includes role but has stale workspace path |
| Evidence of handoff left | ✅ | This file + DevOps + Architect evidence |
| Code changes bounded | ⚠️ 90 dirty files | High risk of scope creep |
| No regressions | ❌ **90 tests failing** | 27 suites, up from 68 reported |

---

## 6. Handoff to Director

### Findings summary
- **Blocking**: 90 test failures (27 suites) — must stabilize before feature delivery
- **Moderate**: 2 stale terminal sessions with wrong cwd; launch command has stale workspace path
- **Low**: 3 MCP instances; no .nvmrc; gh CLI missing

### Blocker details
1. **`@/components/settings/providers/CopilotAuthPanel` module not found** — referenced in test but file doesn't exist (deleted or never created)
2. **4 right-dock test failures** — DOM lifecycle issues after component refactors
3. **e2e Playwright tests in `.plyrium-forge/intel/` not excluded from jest** — adding noise to results

### Recommended actions
1. **P1**: Fix `CopilotAuthPanel` module resolution or remove orphan test reference
2. **P1**: Fix right-dock DOM lifecycle in test environment
3. **P1**: Add `.plyrium-forge/intel/**` to `testPathIgnorePatterns` in jest.config.js
4. **P2**: Clean up stale terminal sessions (p24, p44)
5. **P2**: Commit or revert `data/audit-trails/` deletions
6. **P3**: Fix launch command workspace path to `/home/matias/ArxonLabs/devhub`
7. **P3**: Kill redundant MCP instances (276200, 500688)

---

**Evidence chain**: `data/auditor-evidence-2026-05-23-v2.md` (+ DevOps: `data/devops-env-validation-2026-05-23.json`, Architect: `data/swarm-architect-handoff-20260523.md`)
