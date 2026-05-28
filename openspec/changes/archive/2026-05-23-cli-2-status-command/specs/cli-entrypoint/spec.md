# Delta for CLI Entry Point

## MODIFIED Requirements

### Requirement: Shared Core Re-Export

The CLI MUST provide `lib/db.js` as a barrel that re-exports all public functions from `../../src/lib/db/compactReads.js` AND also re-exports `getDb` from `../../src/lib/db/core.js` for commands that need direct database access.

(Previously: Re-exported only from `compactReads.js`, no `getDb` from `core.js`)

#### Scenario: Re-export resolves correctly

- GIVEN `devhub-cli/lib/db.js` exists
- WHEN imported
- THEN all exports from `src/lib/db/compactReads.js` are available
- AND `getDb` from `src/lib/db/core.js` is also available
- AND no additional functions or transformations are introduced

#### Scenario: Path resolution across worktrees

- GIVEN the CLI runs from a worktree or symlinked install
- WHEN `lib/db.js` resolves the shared core path
- THEN the resolution uses `__dirname`-relative path resolution
- AND the module loads without path errors
