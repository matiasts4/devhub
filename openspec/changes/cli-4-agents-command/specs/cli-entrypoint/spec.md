# Delta for CLI Entry Point

## MODIFIED Requirements

### Requirement: Exit Code Contract

The CLI MUST use three exit codes: 0 for success, 1 for runtime errors, 2 for invalid arguments or unknown commands.
(Previously: Stub commands exit with code 1 and "not yet implemented" message)

#### Scenario: Unknown command exits 2

- GIVEN the CLI is running
- WHEN an unrecognized command is passed (e.g., `devhub nonexistent`)
- THEN the process exits with code 2

#### Scenario: Agents command exits 0 on success

- GIVEN agents are registered in the database
- WHEN `devhub agents` is executed successfully
- THEN the process exits with code 0

#### Scenario: Successful help exits 0

- GIVEN the CLI is running
- WHEN `--help` is passed
- THEN the process exits with code 0

### Requirement: Shared Core Re-Export

The CLI MUST provide `lib/db.js` as a barrel that re-exports all public functions from `../../src/lib/db/compactReads.js` AND also re-exports `getDb` from `../../src/lib/db/core.js` for commands that need direct database access, including the new `readAgentRegistrySummary` function.
(Previously: Re-exports compactReads and getDb without readAgentRegistrySummary)

#### Scenario: Re-export resolves correctly

- GIVEN `devhub-cli/lib/db.js` exists
- WHEN imported
- THEN all exports from `src/lib/db/compactReads.js` are available
- AND `getDb` from `src/lib/db/core.js` is also available
- AND `readAgentRegistrySummary` is available
- AND no additional functions or transformations are introduced

#### Scenario: Path resolution across worktrees

- GIVEN the CLI runs from a worktree or symlinked install
- WHEN `lib/db.js` resolves the shared core path
- THEN the resolution uses `__dirname`-relative path resolution
- AND the module loads without path errors

## ADDED Requirements

### Requirement: Agents Command Registration

The CLI MUST register the `agents` command in `cli.js` and remove `agents` from the stub commands list.

#### Scenario: Agents command is recognized

- GIVEN the `agents` command is registered in `cli.js`
- WHEN `devhub agents` is executed
- THEN the agents command handler is invoked (not a stub)

#### Scenario: Agents command appears in help

- GIVEN the `agents` command is registered
- WHEN `devhub --help` is executed
- THEN the help output includes `agents` in the command list

#### Scenario: Agents is not a stub

- GIVEN the CLI has a stub commands list
- WHEN `cli.js` is loaded
- THEN `agents` is NOT in the stub commands list
