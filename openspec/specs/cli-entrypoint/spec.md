# CLI Entry Point Specification

## Purpose

Defines the minimal CLI scaffold (`devhub-cli/`) for DevHub Fase 14. Provides arg parsing, version/help output, exit code contract, a terminal formatter, and a barrel re-export of the shared durable-read core. No command logic is implemented here — commands are stubs.

## Requirements

### Requirement: CLI Package Manifest

The CLI package MUST declare `name: devhub-cli`, a `bin` entry mapping `devhub` to the executable, and `type: commonjs`.

#### Scenario: Valid package manifest

- GIVEN `devhub-cli/package.json` exists
- WHEN the package is inspected
- THEN `name` is `devhub-cli`
- AND `bin.devhub` points to the executable entry
- AND `type` is `commonjs`

### Requirement: Executable Entry

The CLI MUST provide an executable at `devhub-cli/bin/devhub` that invokes the main entry point.

#### Scenario: Executable runs on Node

- GIVEN `devhub-cli/bin/devhub` exists with execute permission
- WHEN invoked via `node devhub-cli/bin/devhub`
- THEN the process starts the CLI main entry without error

### Requirement: Help Output

The CLI MUST print a help message listing available (stub) commands when `--help` or `-h` is passed, then exit with code 0.

#### Scenario: --help flag

- GIVEN the CLI is installed or invoked directly
- WHEN `devhub --help` is executed
- THEN stdout contains a command list
- AND the process exits with code 0

### Requirement: Version Output

The CLI MUST print the version from `package.json` when `--version` or `-V` is passed, then exit with code 0.

#### Scenario: --version flag

- GIVEN the CLI is installed or invoked directly
- WHEN `devhub --version` is executed
- THEN stdout contains the version string from `devhub-cli/package.json`
- AND the process exits with code 0

### Requirement: Exit Code Contract

The CLI MUST use three exit codes: 0 for success, 1 for runtime errors, 2 for invalid arguments or unknown commands.

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

### Requirement: Terminal Formatter

The CLI MUST provide `lib/format.js` that outputs compact plain text and detects TTY to conditionally apply color.

#### Scenario: TTY output includes color

- GIVEN `process.stdout.isTTY` is `true`
- WHEN format functions are called
- THEN output includes ANSI color codes

#### Scenario: Piped output is plain text

- GIVEN `process.stdout.isTTY` is `false` or `undefined`
- WHEN format functions are called
- THEN output contains no ANSI escape sequences

### Requirement: Unit Tests

The CLI scaffold MUST include unit tests covering arg parsing, exit codes, formatter TTY detection, and the re-export barrel. Tests MUST run via Jest.

#### Scenario: All scaffold tests pass

- GIVEN `devhub-cli/` with test files
- WHEN `cd devhub-cli && npm test` is executed
- THEN all tests pass with zero failures

#### Scenario: Strict TDD — tests written before implementation

- GIVEN strict TDD is enabled in `openspec/config.yaml`
- WHEN implementation begins
- THEN failing tests exist before corresponding production code is written

### Requirement: Agents Command Registration

The CLI MUST register the `agents` command and the `swarm` command in `cli.js` and remove both from the stub commands list.

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

#### Scenario: Swarm command is recognized

- GIVEN the `swarm` command is registered in `cli.js`
- WHEN `devhub swarm` is executed
- THEN the swarm command handler is invoked (not a stub)

#### Scenario: Swarm command appears in help

- GIVEN the `swarm` command is registered
- WHEN `devhub --help` is executed
- THEN the help output includes `swarm` in the command list

#### Scenario: Swarm is not a stub

- GIVEN the CLI has a stub commands list
- WHEN `cli.js` is loaded
- THEN `swarm` is NOT in the stub commands list
