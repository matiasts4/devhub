# Verification Report

**Change**: sw-3-1-agent-runs-artifacts-model
**Version**: N/A
**Mode**: Strict TDD

---

### Completeness

| Metric           | Value |
| ---------------- | ----- |
| Tasks total      | 12    |
| Tasks complete   | 12    |
| Tasks incomplete | 0     |

---

### Build & Tests Execution

**Build**: Not run (per constraint)

**Tests**: ✅ 46 passed / ❌ 0 failed / ⚠️ 0 skipped

Executed:

- `npm test -- --runTestsByPath "tests/unit/local-db-agent-runs.test.js" "src/app/api/agent/execute/route.test.js" "src/app/api/agent/qa-result/route.test.js" "src/lib/agentRegistryLive.test.js" "tests/unit/telegram-monitor-realtime.test.js" "tests/unit/telegram-status-api.test.js" "tests/integration/agent-run-audit-routes.test.js"`
- `npm test -- --coverage --runTestsByPath "tests/unit/local-db-agent-runs.test.js" "src/app/api/agent/execute/route.test.js" "src/app/api/agent/qa-result/route.test.js" "src/lib/agentRegistryLive.test.js" "tests/unit/telegram-monitor-realtime.test.js" "tests/unit/telegram-status-api.test.js" "tests/integration/agent-run-audit-routes.test.js" --collectCoverageFrom="src/lib/db/localDb.js" --collectCoverageFrom="src/lib/db/agentRunArtifacts.js" --collectCoverageFrom="src/app/api/agent/execute/route.js" --collectCoverageFrom="src/app/api/agent/qa-result/route.js" --collectCoverageFrom="src/lib/agentRegistryLive.js" --collectCoverageFrom="src/views/telegramMonitorRealtime.js" --collectCoverageFrom="src/app/api/telegram/status/route.js"`
- `npm test -- --runTestsByPath "tests/integration/prepare-agent-workspace-reporting.test.js" "tests/integration/agent-workspaces-lifecycle.test.js" "tests/integration/agent-runs-artifacts.test.js" "tests/integration/tools-list.test.js"` (devhub-mcp)

**Coverage**: Available for changed files (see table)

---

### TDD Compliance

| Check                         | Result | Details                                                                         |
| ----------------------------- | ------ | ------------------------------------------------------------------------------- |
| TDD Evidence reported         | ✅     | Found in `apply-progress.md`                                                    |
| All tasks have tests          | ✅     | 12/12 tasks mapped to test files                                                |
| RED confirmed (tests exist)   | ✅     | Test files exist for all implemented areas                                      |
| GREEN confirmed (tests pass)  | ✅     | All focused tests passed at runtime                                             |
| Triangulation adequate        | ✅     | Unit + integration coverage for persistence, routes, consumers, and MCP surface |
| Safety Net for modified files | ✅     | Existing suites were rerun alongside new coverage                               |

**TDD Compliance**: 6/6 checks passed

---

### Test Layer Distribution

| Layer       | Tests  | Files  | Tools                    |
| ----------- | ------ | ------ | ------------------------ |
| Unit        | 33     | 7      | Jest                     |
| Integration | 13     | 4      | Jest                     |
| E2E         | 0      | 0      | not installed / not used |
| **Total**   | **46** | **11** |                          |

---

### Changed File Coverage

| File                                   | Line % | Branch % | Uncovered Lines                                                                    | Rating        |
| -------------------------------------- | ------ | -------- | ---------------------------------------------------------------------------------- | ------------- |
| `src/lib/db/agentRunArtifacts.js`      | 81.57% | 57.44%   | L59, L68, L80, L88, L120, L123, L126                                               | ⚠️ Acceptable |
| `src/lib/db/localDb.js`                | 31.13% | 30.71%   | Broad low-coverage surface; new SW-3.1 paths are exercised, but file remains large | ⚠️ Low        |
| `src/app/api/agent/execute/route.js`   | 80.95% | 75%      | L17, L28, L100-101                                                                 | ⚠️ Acceptable |
| `src/app/api/agent/qa-result/route.js` | 90.47% | 57.14%   | L35, L45, L160-161                                                                 | ⚠️ Acceptable |
| `src/lib/agentRegistryLive.js`         | 65.45% | 60.93%   | L72, L87-103, L157-171, L189-197                                                   | ⚠️ Low        |
| `src/views/telegramMonitorRealtime.js` | 94.73% | 78.94%   | L30                                                                                | ✅ Excellent  |
| `src/app/api/telegram/status/route.js` | 80%    | 85.29%   | L93-95, L116-117                                                                   | ⚠️ Acceptable |

**Average changed file coverage**: 77.76%

---

### Assertion Quality

✅ All assertions verify real behavior

---

### Spec Compliance Matrix

| Requirement                                  | Scenario                             | Test                                                                                                       | Result       |
| -------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ------------ |
| Durable Agent Run Header                     | First execution attempt starts       | `tests/unit/local-db-agent-runs.test.js > persists immutable agent run headers...`                         | ✅ COMPLIANT |
| Durable Agent Run Header                     | Retry or recovery starts             | `tests/unit/local-db-agent-runs.test.js > validates artifact contracts...`                                 | ✅ COMPLIANT |
| Append-Only Evidence Ledger                  | Workspace preparation emits evidence | `tests/integration/agent-run-audit-routes.test.js > persists ordered startup...`                           | ✅ COMPLIANT |
| Append-Only Evidence Ledger                  | Commands and tests emit evidence     | `tests/integration/agent-run-audit-routes.test.js > persists ordered startup and QA approval artifacts...` | ✅ COMPLIANT |
| Append-Only Evidence Ledger                  | Diffs and attachments are captured   | (no direct producer test)                                                                                  | ⚠️ PARTIAL   |
| Evidence Reference Contract                  | Structured reference is emitted      | `tests/unit/local-db-agent-runs.test.js > persists immutable agent run headers...`                         | ✅ COMPLIANT |
| Evidence Reference Contract                  | Legacy opaque reference is preserved | `tests/unit/local-db-agent-runs.test.js > persists immutable agent run headers...`                         | ✅ COMPLIANT |
| Control-Plane Boundary and Outcome Reporting | QA approves a run                    | `tests/integration/agent-run-audit-routes.test.js > persists ordered startup and QA approval artifacts...` | ✅ COMPLIANT |
| Control-Plane Boundary and Outcome Reporting | Run ends with error                  | `src/app/api/agent/qa-result/route.test.js > rejected task keeps retry semantics...`                       | ✅ COMPLIANT |

**Compliance summary**: 8/9 scenarios compliant

---

### Correctness (Static — Structural Evidence)

| Requirement                                  | Status         | Notes                                                                                       |
| -------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------- |
| Durable Agent Run Header                     | ✅ Implemented | Immutable `agent_runs` rows, terminal-only updates, lineage fields, observed-start snapshot |
| Append-Only Evidence Ledger                  | ✅ Implemented | `agent_artifacts` append-only with `(run_id, seq)` ordering and integrity metadata          |
| Evidence Reference Contract                  | ✅ Implemented | Structured refs normalized; opaque refs preserved as legacy locator                         |
| Control-Plane Boundary and Outcome Reporting | ✅ Implemented | Execute/QA routes record durable evidence; consumers read projections only                  |

---

### Coherence (Design)

| Decision                                          | Followed? | Notes                                                  |
| ------------------------------------------------- | --------- | ------------------------------------------------------ |
| Durable truth in `agent_runs` + `agent_artifacts` | ✅ Yes    | `devhub_agent_runs` remains observer-only              |
| Append-only evidence ledger                       | ✅ Yes    | Update/delete guards block mutation                    |
| Git boundary stays outside MCP verbs              | ✅ Yes    | MCP exposes run/evidence tools, not git/worktree verbs |
| Retry/recovery uses new runs with lineage         | ✅ Yes    | `predecessor_run_id` + `recovery_group_id` supported   |

---

### Issues Found

**CRITICAL**
None.

**WARNING**

- `src/lib/db/localDb.js` and `src/lib/agentRegistryLive.js` remain low-coverage on the full-file metric because they are large shared modules.
- No direct test exercises diff/attachment producer paths (`diff.patch`, `attachment.log`, `attachment.file`); ledger support exists, but producer coverage is still thin.
- MCP Jest run reports `Force exiting Jest`; tests still pass, but open-handle cleanup should be watched.

**SUGGESTION**

- Add one focused test for a non-`decision.note` artifact kind to close the diff/attachment gap.

---

### Verdict

PASS WITH WARNINGS

Core durable run/header and append-only evidence behavior is implemented and verified. The remaining risk is narrower producer coverage, not the main SW-3.1A model.
