# Auditor Evidence — Swarm Feature Delivery Readiness (Pass 3)

**Date**: 2026-05-23 20:06 UTC
**Role**: Auditor (Worker)
**Agent**: `opencode-go/qwen3.6-plus`
**Workspace**: `/home/matias/ArxonLabs/devhub`
**Branch**: `task/2a14962d-swarm-control-panel-polish`

---

## Executive Summary

**VERDICT: NOT READY FOR FEATURE DELIVERY**

The swarm launch infrastructure exists but the codebase has significant test regressions, an uncommitted working tree, and no active dev server. Launching a swarm now would compound existing instability.

---

## 1. Test Suite Status (CRITICAL)

| Metric | Value | Trend |
|--------|-------|-------|
| Test Suites | 37 failed / 193 passed / 230 total | Degraded |
| Individual Tests | 107 failed / 1 skipped / 1674 passed / 1782 total | Degraded |
| Pass Rate | 93.9% | Below threshold |

### Failing Suites by Category

| Category | Failed Suites | Root Cause |
|----------|--------------|------------|
| `devhub-cli/commands/` | 9 | API mocking gaps, CLI test infrastructure |
| `src/components/__tests__/` | 4 | Module resolution (CopilotAuthPanel), DOM null refs |
| `src/views/__tests__/` | 1 | SwarmControl — "Stale" string assertion mismatch |
| `tests/agenthub/` | 1 | API mocking |
| `tests/integration/` | 1 | Integration test setup |
| `telegram-bot/` | 2 | Bot auth/adapter test gaps |
| `src/app/api/` | 1 | Route handler issues |

### Specific Regression Analysis

**SwarmControl.test.jsx — 1 failure (line 440)**
- Assertion: `expect(text).not.toContain('Stale')`
- Reality: Diagnostic overlay renders "Stale registry: 0" as part of runtime diagnostics
- Fix: Update assertion to `expect(text).not.toContain('Stale registry: 0')` or exclude diagnostic overlay from snapshot test

**Right-dock tests — NOW PASSING (43/43)**
- Previous auditor report flagged 4 failures — these are now passing
- Likely fixed by working tree changes or test environment stabilization

**DevHub CLI suites — 9 failures**
- `swarm.test.js`, `queue.test.js`, `ws.test.js`, `claim.test.js`, `task.test.js`, `release.test.js`, `agents.test.js`, `heartbeat.test.js`, `tell.test.js`
- Pattern: CLI commands depend on API endpoints that are not mocked in test environment
- Impact: Blocks CLI feature delivery verification

---

## 2. Workspace Routing Validation

### Terminal CWD Resolution
- Dev server NOT RUNNING — cannot validate live terminal sessions
- `cwdGuard.js` fallback chain confirmed: requested cwd → process.cwd() → $HOME → /
- If mission prompt specifies `/home/matias/devhub` (wrong), fallback resolves to `/home/matias/ArxonLabs/devhub` (correct)
- **Risk**: Silent fallback masks configuration errors — agents may not notice they're not in the intended directory

### Launch Command Analysis
- `agentLaunchCommand.js`: Hardcoded paths (`/home/matias/.opencode/bin/opencode`) — verified exists
- `swarm-launch.js`: Role profile mapping verified:
  - `auditor` → `swarm-reviewer`
  - `director` → `gentle-orchestrator`
  - `coder` → `swarm-coder`
  - `devops` → `swarm-coder`
  - `architect` → `swarm-explorer`

### Per-Role Isolation
- cwd: Same for all roles (project.local_path from DB)
- Branch: `swarm/{launchId}/{roleKey}` — unique per role
- Worktree: `${workspacePath}/.worktrees/swarm/{launchId}/{roleKey}`
- **Confirmed**: Isolation is at git branch/worktree level, not filesystem level

---

## 3. Working Tree Risk Assessment

| Metric | Value |
|--------|-------|
| Modified files | 28 |
| Deleted files | 14 (all `data/audit-trails/headless-*.json`) |
| Untracked files | 48+ |
| Total dirty | 90+ |
| Commits ahead of main | 15 |
| Open PR | NO |

### Critical Risks

1. **No PR for 15 commits** — 248 files changed, 33,795 insertions / 4,253 deletions
2. **37 failing test suites** — must stabilize before feature delivery
3. **Dev server not running** — cannot validate swarm launch end-to-end
4. **DevHub CLI tests failing** — new CLI feature not verified
5. **5 pending RESUME-SWARM tasks** in execution queue — swarm stability work incomplete

---

## 4. DevHub Project State

| Metric | Value |
|--------|-------|
| Project progress | 94% |
| Completed tasks | 80/85 |
| Pending tasks | 5 (all RESUME-SWARM, critical priority) |
| Execution queue | 5 tasks, all unblocked |
| Overdue milestone | DESKTOP-4 (due 2026-05-18, still in_progress) |

### Pending Tasks (by priority)
1. `RESUME-SWARM-01` — Diagnóstico unificado de runtime (critical, score 4.603)
2. `RESUME-SWARM-05` — Startup Restore Coordinator (critical, score 4.603)
3. `RESUME-SWARM-03` — Restore Manifest versionado (critical, score 4.603)
4. `RESUME-SWARM-02` — Normalizar estados terminal/agente/proceso (critical, score 4.303)
5. `RESUME-SWARM-04` — Persistir identidad panel-terminal-agente (high, score 3.903)

---

## 5. Acceptance Criteria Audit

| Criterion | Result | Evidence |
|-----------|--------|----------|
| Terminal opens in correct workspace | ⚠️ Unverified | Dev server not running; cwdGuard fallback confirmed |
| Mission prompt has role instructions | ✅ Verified | `swarm-launch.js` role mapping correct |
| Evidence of handoff left | ✅ | This file + prior evidence chain |
| Code changes bounded | ❌ 90+ dirty files | Scope creep risk |
| No regressions | ❌ 107 tests failing | 37 suites, degraded from prior session |
| Dev server operational | ❌ Not running | Cannot validate end-to-end |
| PR exists for review | ❌ No PR | 15 commits unreviewed |

---

## 6. Blockers for Feature Delivery

### P0 — Must Fix Before Launch
1. **Stabilize test suite** — 107 failures across 37 suites
   - Priority: Fix SwarmControl "Stale" assertion (1 line change)
   - Priority: Fix devhub-cli API mocking (9 suites)
   - Priority: Fix telegram-bot test gaps (2 suites)

2. **Start dev server** — Required for swarm launch validation
   - Command: `npm run dev` or `next dev -p 3000`

### P1 — Should Fix Before Launch
3. **Create PR for current branch** — 15 commits need review
4. **Complete RESUME-SWARM tasks** — Swarm stability work is prerequisite
5. **Clean up working tree** — Commit or revert audit-trail deletions

### P2 — Nice to Have
6. **Fix health endpoint** — Port 4154 check targets legacy sidecar
7. **Extract hardcoded paths** — `agentLaunchCommand.js` not portable
8. **Resolve DESKTOP-4 milestone** — Linux packaging overdue

---

## 7. Handoff to Director

### What's Working
- Swarm launch CLI (`swarm-launch.js`) — code complete, tests passing (3/3)
- Role profile mapping — all 5 roles correctly mapped
- Workspace routing architecture — cwdGuard fallback chain functional
- Right-dock tests — now passing (43/43), regression resolved

### What's Broken
- 107 test failures (37 suites) — primarily CLI mocking + 1 SwarmControl assertion
- No dev server — cannot validate end-to-end swarm launch
- No PR — 15 commits unreviewed
- RESUME-SWARM tasks incomplete — swarm stability not guaranteed

### Recommended Action Sequence
1. Fix SwarmControl test assertion (line 440: `Stale` → `Stale registry: 0`)
2. Fix devhub-cli test mocking (9 suites)
3. Start dev server, validate `devhub swarm-launch` end-to-end
4. Create PR for branch review
5. Begin RESUME-SWARM task execution

---

**Evidence chain**: `data/auditor-evidence-2026-05-23-v3.md`
**Prior evidence**: `data/auditor-evidence-2026-05-23.md` (v1), `data/auditor-evidence-2026-05-23-v2.md` (v2)
**Related**: `data/architect-handoff-swarm-routing-2026-05-23.md`, `data/swarm-architect-handoff-20260523.md`, `data/devops-env-validation-2026-05-23.json`
