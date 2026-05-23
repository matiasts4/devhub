# Verification Report

**Change**: `sw-14-1a-cli-shared-core-extraction`
**Version**: N/A
**Mode**: Strict TDD

---

## Completeness

| Metric           | Value |
| ---------------- | ----- |
| Tasks total      | 12    |
| Tasks complete   | 8     |
| Tasks incomplete | 4     |

**Incomplete core tasks**: 2.2, 2.3, 2.4, 3.2

---

## Build & Tests Execution

**Build**: ➖ Not applicable (no build step for this slice)

**Tests**: ✅ 53 passed / ❌ 0 failed / ⚠️ 0 skipped

```text
Main repo:  PASS src/lib/db/compactReads.test.js (4 tests)
            PASS tests/agenthub/api/operations-health.test.js (19 tests)
            PASS tests/agenthub/mcp/task-leases.test.js (8 tests)

DevHub-MCP: PASS tests/integration/tasks.test.js
            PASS tests/integration/agent-runs-artifacts.test.js (22 tests total)
```

**Coverage**: 90.41% statements / 55.3% branches / 95.31% lines for `src/lib/db/compactReads.js`

---

## Spec Compliance Matrix

| Requirement                                      | Scenario                                         | Test                                                                               | Result       |
| ------------------------------------------------ | ------------------------------------------------ | ---------------------------------------------------------------------------------- | ------------ |
| Shared compact durable summaries                 | Shared core returns compact durable summaries    | `compactReads.test.js > readExecutionQueueSummary keeps deterministic order`       | ✅ COMPLIANT |
| Shared compact durable summaries                 | Shared core returns compact durable summaries    | `compactReads.test.js > readWorkspaceEvidenceSummary returns latest durable run`   | ✅ COMPLIANT |
| Runtime hints do not replace durable truth       | Runtime hints do not replace durable truth       | `compactReads.test.js > readWorkspaceEvidenceSummary prefers durable emptiness`    | ✅ COMPLIANT |
| MCP and health-route adapter parity              | Queue semantics stay aligned across adapters     | `operations-health.test.js > projects director_queue from durable execution queue` | ⚠️ PARTIAL   |
| MCP and health-route adapter parity              | Empty or missing states stay aligned             | `operations-health.test.js > returns a stable empty director_queue shape`          | ⚠️ PARTIAL   |
| Explicit public-MCP vs internal-runtime boundary | External consumer reads bounded durable contract | `task-leases.test.js > get_execution_queue releases expired leases`                | ✅ COMPLIANT |
| Explicit public-MCP vs internal-runtime boundary | Internal runtime keeps high-frequency ownership  | `operationalHealthSources.js` module exists with correct comments                  | ✅ COMPLIANT |
| Slice remains schema-preserving                  | Shared-core extraction requires no schema change | No schema changes detected in migration or DDL                                     | ✅ COMPLIANT |
| Slice remains dependency-scoped                  | Future CLI work stays deferred                   | No CLI commands or MCP pruning introduced                                          | ✅ COMPLIANT |

**Compliance summary**: 7/9 scenarios fully compliant; 2/9 partial (adapter parity verified through test mocks but not through actual shared-core consumption).

---

## Correctness (Static Evidence)

| Requirement                                | Status             | Notes                                                                   |
| ------------------------------------------ | ------------------ | ----------------------------------------------------------------------- |
| Shared core module exists                  | ✅ Implemented     | `src/lib/db/compactReads.js` with 5 exports                             |
| Barrel re-export                           | ✅ Implemented     | `src/lib/db/index.js` re-exports compactReads                           |
| Runtime-internal module exists             | ✅ Implemented     | `src/lib/runtime/operationalHealthSources.js` created                   |
| No schema changes                          | ✅ Verified        | No ALTER or CREATE TABLE changes for this slice                         |
| No CLI commands                            | ✅ Verified        | No CLI surface introduced                                               |
| No MCP pruning                             | ✅ Verified        | All existing MCP tools preserved                                        |
| Adapter reuse of shared core               | ❌ NOT Implemented | `devhub-mcp/server.js` and `health/route.js` do NOT import compactReads |
| operationalHealthSources consumed by route | ❌ NOT Implemented | `health/route.js` never imports the module                              |
| Harness deduplication                      | ❌ NOT Implemented | `tests/agenthub/mcp/harness.js` still has own `_buildExecutionQueue`    |

---

## Coherence (Design)

| Decision                                                                 | Followed?  | Notes                                                                 |
| ------------------------------------------------------------------------ | ---------- | --------------------------------------------------------------------- |
| Core placement: `src/lib/db/compactReads.js` (CJS)                       | ✅ Yes     | File created and exported via barrel                                  |
| Shared boundary: Both adapters call shared core directly                 | ❌ No      | Neither adapter imports or calls compactReads                         |
| Runtime isolation: Durable-only core + internal runtime helper           | ⚠️ Partial | `operationalHealthSources.js` exists but is orphaned (never imported) |
| Contract rules: present\* helpers transport-neutral                      | ✅ Yes     | Implemented correctly                                                 |
| No schema or tool-argument drift                                         | ✅ Yes     | No schema changes, tool signatures unchanged                          |
| Migration step 1: compactReads + tests with zero adapter changes         | ✅ Yes     | Phase 1 completed                                                     |
| Migration step 2: Switch SQLite MCP path and health route to shared core | ❌ No      | Adapters never switched                                               |
| Migration step 3: Switch Supabase MCP path to shared present\* helpers   | ❌ No      | Supabase path still uses inline logic                                 |
| Migration step 4: Remove dead inline helpers after parity                | ❌ No      | Dead helpers still present                                            |

---

## TDD Compliance

| Check                         | Result | Details                                                                |
| ----------------------------- | ------ | ---------------------------------------------------------------------- |
| TDD Evidence reported         | ✅     | Found in apply-progress artifact                                       |
| All tasks have tests          | ✅     | 8/8 completed tasks have covering tests                                |
| RED confirmed (tests exist)   | ✅     | compactReads.test.js exists and covers 4 scenarios                     |
| GREEN confirmed (tests pass)  | ✅     | All 53 tests pass on execution                                         |
| Triangulation adequate        | ⚠️     | 4 test cases for compactReads; adapter parity tests use mocks not core |
| Safety Net for modified files | ✅     | Existing tests in operations-health and task-leases still pass         |

**TDD Compliance**: 5/6 checks passed

---

### Test Layer Distribution

| Layer       | Tests  | Files | Tools                                      |
| ----------- | ------ | ----- | ------------------------------------------ |
| Unit        | 4      | 1     | Jest (better-sqlite3 in-memory)            |
| Integration | 49     | 5     | Jest + MCP test harness + Next route mocks |
| E2E         | 0      | 0     | Not applicable for this slice              |
| **Total**   | **53** | **6** |                                            |

---

### Changed File Coverage

| File                         | Line % | Branch % | Uncovered Lines | Rating        |
| ---------------------------- | ------ | -------- | --------------- | ------------- |
| `src/lib/db/compactReads.js` | 95.31% | 55.3%    | L84, L159, L218 | ⚠️ Acceptable |

**Average changed file coverage**: 95.31% line, 55.3% branch

---

### Assertion Quality

| File         | Line | Assertion | Issue | Severity |
| ------------ | ---- | --------- | ----- | -------- |
| (none found) | —    | —         | —     | —        |

**Assertion quality**: ✅ All assertions verify real behavior

---

### Quality Metrics

**Linter**: ✅ No new errors in modified files (devhub-mcp/server.js ignored by eslint config)
**Type Checker**: ➖ Not available for this CJS/ESM mixed repo

---

## Issues Found

**CRITICAL**:

1. Tasks 2.2, 2.3, 2.4, and 3.2 are marked `[x]` in `tasks.md` but were NOT actually implemented. `git status --short` confirms `devhub-mcp/server.js` and `src/app/api/agenthub/operations/health/route.js` were never modified; they contain no changes versus the committed base.
2. `devhub-mcp/server.js` does NOT import or consume `compactReads`. It retains its own inline `getWorkspaceEvidence`, queue scoring, and `getLatestAgentArtifactForRun` implementations.
3. `src/app/api/agenthub/operations/health/route.js` does NOT import or consume `compactReads`. It retains its own `createDirectorQueueSnapshot`, `createDirectorQueueItem`, and HTTP-bounce logic (`callDevhubTool`) instead of calling `readExecutionQueueSummary`/`createDirectorQueueContract` directly.
4. `src/lib/runtime/operationalHealthSources.js` exists but is completely orphaned — `health/route.js` never imports it. Runtime diagnostics remain inline inside `gatherOperationalHealth`.
5. `tests/agenthub/mcp/harness.js` still contains a duplicated `_buildExecutionQueue` method that re-implements the queue scoring/blocked logic instead of delegating to `readExecutionQueueSummary`.
6. The apply-progress artifact (`#5277`) misrepresents the implementation state by claiming all work units and phases are complete when adapter wiring was never performed.

**WARNING**:

1. Adapter parity is verified only through test mocks (`getExecutionQueue` dependency injection in health tests), not through actual shared-core consumption. Semantic parity is proven, but the core is not actually shared.
2. `compactReads.js` branch coverage is 55.3% — the tie-breaker `localeCompare` fallback (L84) and input validation throws (L159, L218) are uncovered.

**SUGGESTION**:

1. Add unit tests for the error paths in `readExecutionQueueSummary` (missing `projectId`) and `readWorkspaceEvidenceSummary` (missing `workspaceId`) to raise branch coverage.
2. A follow-up slice should wire `devhub-mcp/server.js`, `health/route.js`, and `tests/agenthub/mcp/harness.js` to consume `compactReads` so the extraction delivers its intended value.

---

## Verdict

**FAIL**

Primary success criterion #3 — "Existing MCP and health-route read paths reuse the extracted core without schema or behavior drift" — is not met. The shared core exists and is well-tested, but none of its intended consumers (MCP adapter, health route, test harness) actually import or call it. Four core tasks (2.2–2.4, 3.2) are marked complete in the task tracker but were never implemented in the codebase. The apply-progress artifact is misleading about adapter parity completion.

---

_Report generated by SDD Verify Executor_
