# Delta Spec: db-split-by-domain

> **Type**: Structural refactor — no behavioral change  
> **Date**: 2026-05-21  
> **Status**: Draft

---

## Summary

Pure structural split of `src/lib/db/localDb.js` into 9 domain modules. No new capabilities, no modified behavior. All 35 importers remain unchanged via a compatibility barrel.

---

## Functional Requirements

### Requirement: Module Decomposition

The codebase MUST decompose `localDb.js` into the following modules, each owning exactly the functions listed in the proposal's domain mapping:

| Module | Responsibility |
|--------|----------------|
| `core.js` | `getDb`, `closeDb`, `ensureRuntimeSchema`, shared query builders, table/delete helpers |
| `workspaces.js` | Workspace CRUD and lifecycle |
| `agentRuns.js` | Agent run CRUD, status transitions |
| `artifacts.js` | Artifact append-only storage |
| `supervisor.js` | Supervisor approval checkpoints |
| `swarmMissions.js` | Swarm mission management |
| `telegram.js` | Telegram adapter intents and delivery |
| `observability.js` | Observability events |
| `index.js` | Forward-compatible barrel for new internal code |

#### Scenario: Domain module exports correct functions

- GIVEN `core.js` is imported
- WHEN caller invokes `getDb()`
- THEN the existing singleton SQLite handle is returned
- AND `ensureRuntimeSchema` executes the same migrations as before

#### Scenario: Leaf domain module is importable standalone

- GIVEN `artifacts.js` is imported directly (no `localDb.js` involved)
- WHEN caller invokes any exported artifact function
- THEN the function executes without error and returns the same result as the original

---

### Requirement: Compatibility Barrel

`src/lib/db/localDb.js` MUST become a pure re-export barrel. It SHALL re-export every public symbol from the domain modules so that all 35 existing importers continue to work without modification.

#### Scenario: Existing importer unchanged

- GIVEN a file that currently imports `{ getDb, saveWorkspace }` from `localDb.js`
- WHEN the split is applied
- THEN the import resolves to the same functions with the same signatures
- AND no source change is required in the importer

#### Scenario: Barrel exports complete symbol set

- GIVEN a static analysis of `localDb.js` before split
- WHEN compared to the re-export barrel after split
- THEN every exported symbol name present before MUST appear in the barrel
- AND no symbol is missing or renamed

---

### Requirement: Singleton Integrity

`getDb()` MUST remain a singleton. No domain module MAY create its own SQLite connection. All domain modules MUST import `getDb` exclusively from `core.js`.

#### Scenario: Single connection across modules

- GIVEN `workspaces.js` and `agentRuns.js` are both imported
- WHEN each calls `getDb()`
- THEN both receive the same database handle instance

---

### Requirement: No Circular Imports

No module in `src/lib/db/` MAY form a circular dependency chain. The allowed import direction is:

```
domain modules → core.js
index.js       → domain modules
localDb.js     → domain modules (barrel only)
```

#### Scenario: Circular import check passes

- GIVEN the split is applied
- WHEN a static circular-dependency check is run (e.g., `madge` or equivalent)
- THEN zero circular dependencies are reported within `src/lib/db/`

---

## Non-Functional Requirements

| Requirement | Constraint |
|-------------|------------|
| Zero regressions | All existing tests in `localDb.test.js` MUST pass unmodified |
| Signature preservation | Every function signature MUST be identical to the original |
| No importer changes | 0 files outside `src/lib/db/` MAY be modified |
| Test suite compatibility | `npm test` MUST pass before and after the split |
| Lint compliance | ESLint MUST report 0 new errors in the new modules |

#### Scenario: Test suite passes after split

- GIVEN the split is fully applied
- WHEN `npm test` is executed
- THEN all tests that passed before the split still pass
- AND no test is skipped or modified

---

## Out of Scope

- Updating any of the 35 production importers
- Changing function signatures or behavior
- Splitting `pathResolver.js` or any other file
- Adding new test coverage beyond verifying existing tests pass
- Migrating to TypeScript

---

## Risks and Mitigations

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Re-export shape mismatch (missing symbol in barrel) | Medium | Automated symbol diff before/after using `node -e` or AST audit |
| Circular import between domain modules | Medium | Extract in strict dependency order; cross-domain calls import the module directly |
| Multiple SQLite handles opened | Low | Singleton only in `core.js`; enforced by linting import origin |
| `ensureRuntimeSchema` call order regression | Low | Keep in `core.js`; called once at app boot |
| Test isolation broken by module-level state | Low | `getDb` singleton pattern unchanged; Jest module cache unchanged |
