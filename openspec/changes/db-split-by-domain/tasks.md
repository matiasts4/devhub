# Tasks: db-split-by-domain

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 800–1100 (3813-line file split across 9 modules + barrel) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → core + leaf modules · PR 2 → composite modules · PR 3 → barrels + verification |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | `core.js` + leaf modules (artifacts, telegram, workspaces, observability) | PR 1 | Base = main; includes per-module tests GREEN |
| 2 | Composite modules (agentRuns, supervisor, swarmMissions) | PR 2 | Base = PR 1 branch |
| 3 | Barrels (index.js + localDb.js) + madge guard + symbol diff verification | PR 3 | Base = PR 2 branch; merges to main |

---

## Phase 1: Pre-Split Audit

- [x] 1.1 Run symbol audit script: `node -e "const m=require('./src/lib/db/localDb'); console.log(Object.keys(m).sort().join('\n'))" > /tmp/pre-split-symbols.txt` — save output as reference artifact `openspec/changes/db-split-by-domain/pre-split-symbols.txt`
- [x] 1.2 Add `madge` devDependency: `npm install --save-dev madge`; verify `npx madge --version` works
- [x] 1.3 Add `"check:circular": "npx madge --circular src/lib/db/"` to `package.json` scripts; run it baseline (expect 0 cycles in pre-split `src/lib/db/` if only `localDb.js` exists)
- [x] 1.4 Run `npm test` — confirm full suite passes; record pass count as baseline

## Phase 2: Core Module (PR 1 foundation)

- [x] 2.1 **RED** — Write `src/lib/db/core.test.js`: failing tests for `getDb()` singleton identity, `closeDb()`, `ensureRuntimeSchema()` completing without error
- [x] 2.2 **GREEN** — Create `src/lib/db/core.js`: move `_db`, `DB_PATH`, `getDb`, `closeDb`, `ensureRuntimeSchema`, `makeTableOps`, `LocalQuery`, `tables`, shared query/delete helpers; exports named only
- [x] 2.3 Confirm `core.test.js` passes and `npm check:circular` still 0

## Phase 3: Leaf Domain Modules (PR 1 continuation)

- [x] 3.1 **RED** `artifacts.test.js` — failing test for one representative artifact function (e.g., `appendAgentArtifact`)
- [x] 3.2 **GREEN** Create `src/lib/db/artifacts.js` — move all artifact functions; imports `getDb` from `./core`
- [x] 3.3 **RED** `telegram.test.js` — failing test for one telegram function (e.g., `recordTelegramAdapterIntent`)
- [x] 3.4 **GREEN** Create `src/lib/db/telegram.js` — move all telegram functions; imports `getDb` from `./core`
- [ ] 3.5 **RED** `workspaces.test.js` — failing test for `saveAgentWorkspace` / `getAgentWorkspace`
- [ ] 3.6 **GREEN** Create `src/lib/db/workspaces.js` — move all workspace functions; imports `getDb` from `./core`
- [ ] 3.7 **RED** `observability.test.js` — failing test for observability event function
- [ ] 3.8 **GREEN** Create `src/lib/db/observability.js` — move all observability functions; imports `getDb` from `./core`
- [ ] 3.9 Run `npm check:circular` — assert 0; run `npm test` — all tests pass

## Phase 4: Composite Domain Modules (PR 2)

- [ ] 4.1 **RED** `agentRuns.test.js` — failing test for `saveAgentRun` / `getAgentRun`
- [ ] 4.2 **GREEN** Create `src/lib/db/agentRuns.js` — imports `getDb` from `./core`, workspace helpers from `./workspaces`
- [ ] 4.3 **RED** `supervisor.test.js` — failing test for `requestSupervisorApproval`
- [ ] 4.4 **GREEN** Create `src/lib/db/supervisor.js` — imports `getDb` from `./core`, agent-run helpers from `./agentRuns`
- [ ] 4.5 **RED** `swarmMissions.test.js` — failing test for swarm mission CRUD
- [ ] 4.6 **GREEN** Create `src/lib/db/swarmMissions.js` — imports from `./core`, `./agentRuns`, `./workspaces`
- [ ] 4.7 Run `npm check:circular` — assert 0; run `npm test` — all tests pass

## Phase 5: Barrels + Verification (PR 3)

- [ ] 5.1 Create `src/lib/db/index.js` — named re-exports from all 8 domain modules; no logic
- [ ] 5.2 Replace body of `src/lib/db/localDb.js` with ~120-line named re-export barrel (re-exports from domain modules); keep the same public surface
- [ ] 5.3 Run symbol diff: `node -e "const m=require('./src/lib/db/localDb'); console.log(Object.keys(m).sort().join('\n'))" > /tmp/post-split-symbols.txt && diff /tmp/pre-split-symbols.txt /tmp/post-split-symbols.txt` — assert empty diff
- [ ] 5.4 Run `npm check:circular` — assert 0 cycles in `src/lib/db/`
- [ ] 5.5 Run `npm test` — assert same count of passing tests as Phase 1.4 baseline; 0 failures
- [ ] 5.6 Run ESLint: `npx eslint src/lib/db/` — assert 0 new errors
- [ ] 5.7 Verify no file outside `src/lib/db/` was modified: `git diff --name-only | grep -v src/lib/db` must return empty

## Phase 6: Cleanup

- [ ] 6.1 Remove any `// TODO` or dead code left in domain modules during extraction
- [ ] 6.2 Add JSDoc `@module` tag to each new file (one line each)
- [ ] 6.3 Update `openspec/changes/db-split-by-domain/tasks.md` — mark all tasks complete
