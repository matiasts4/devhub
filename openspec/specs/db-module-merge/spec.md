# DB Module Merge Specification

## Purpose

Eliminate the ~95% code duplication between `core.js` and `localDb.js` by making `localDb.js` the single source of truth and converting `core.js` to a thin re-export shim, preserving all existing import paths.

## Requirements

### REQ-DB-1: Thin Re-export Shim

The file `src/lib/db/core.js` MUST become a thin re-export wrapper that re-exports every export from `src/lib/db/localDb.js`. The shim MUST NOT contain any `Database`, `require('better-sqlite3')`, schema definitions, query builders, table ops, or singleton state — all logic MUST live in `localDb.js`.

#### Scenario: core.js re-exports all localDb.js exports

- GIVEN `localDb.js` exports `{ getDb, closeDb, tables, LocalQuery, buildSelectQuery, ... }`
- WHEN any module does `require('./core')`
- THEN it receives the same object references as `require('./localDb')`
- AND every exported function/constant is referentially equal between the two imports

#### Scenario: core.js only contains re-export statements

- GIVEN the content of `core.js`
- WHEN the line count is measured
- THEN `core.js` is under 20 lines
- AND it contains no `Database`, `new Database`, `db.exec`, or `ensureRuntimeSchema` definitions

### REQ-DB-2: Import Path Backward Compatibility

All existing import paths MUST continue to work without modification. This includes: `require('./core')` from within `db/` (25+ files), `require('@/lib/db/core')` from outside `db/`, and the spread re-export in `src/lib/db/index.js`.

#### Scenario: Internal db/ imports still resolve

- GIVEN a file in `src/lib/db/` that does `const { getDb } = require('./core')`
- WHEN the module is loaded after the merge
- THEN `getDb` resolves to the canonical `localDb.getDb` function
- AND the DB singleton is shared (not duplicated)

#### Scenario: External @/lib/db/core imports still resolve

- GIVEN `src/lib/swarm/processes/route.js` does `require('@/lib/db/core')`
- WHEN the module is loaded after the merge
- THEN all expected exports are available
- AND no runtime error occurs

#### Scenario: db/index.js spread re-export works

- GIVEN `src/lib/db/index.js` does `{ ...require('./core') }`
- WHEN the module is loaded after the merge
- THEN all exports from `localDb.js` are available through `index.js`

### REQ-DB-3: Single Source of Truth

`localDb.js` MUST be the only module that defines the `_db` singleton, `ensureRuntimeSchema`, `buildSelectQuery`, `buildWhere`, `makeTableOps`, `tables`, `LocalQuery`, and DB helper functions. No other `db/` module MUST contain duplicate definitions of these.

#### Scenario: Only one \_db singleton across the process

- GIVEN both `core.js` and `localDb.js` were previously imported (creating two singletons)
- WHEN `core.js` becomes a re-export shim
- THEN there is exactly one `_db` singleton instance
- AND `getDb()` from `core` and `localDb` return the same object reference

#### Scenario: Schema changes applied once

- GIVEN a new column is added to `ensureRuntimeSchema` in `localDb.js`
- WHEN the database is initialized
- THEN the ALTER TABLE is executed exactly once
- AND no duplicate column name error occurs

### REQ-DB-4: No Behavior Change for Callers

After the merge, all callers MUST observe identical behavior: same query results, same error types, same singleton instance. The merge is a pure refactor with zero visible behavior changes.

#### Scenario: Existing tests pass unchanged

- GIVEN the existing test suite passes before the merge
- WHEN `core.js` is replaced with the re-export shim
- THEN all existing tests still pass
- AND no test modifications are required

#### Scenario: Schema bootstrap unchanged

- GIVEN a fresh database
- WHEN the module is loaded
- THEN `ensureRuntimeSchema` runs exactly once (from `localDb.js`)
- AND all tables, indexes, and triggers are created identically to the pre-merge behavior
