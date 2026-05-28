# Delta for cli-entrypoint

## ADDED Requirements

### Requirement: Claim Command Registration

The CLI MUST register the `claim` command in `cli.js` and remove it from the stub commands list.

#### Scenario: Claim command is recognized

- GIVEN the `claim` command is registered in `cli.js`
- WHEN `devhub claim agent-1` is executed
- THEN the claim command handler is invoked (not a stub)

#### Scenario: Claim command appears in help

- GIVEN the `claim` command is registered
- WHEN `devhub --help` is executed
- THEN the help output includes `claim` in the command list

#### Scenario: Claim is not a stub

- GIVEN the CLI has a stub commands list
- WHEN `cli.js` is loaded
- THEN `claim` is NOT in the stub commands list

### Requirement: Release Command Registration

The CLI MUST register the `release` command in `cli.js` and remove it from the stub commands list.

#### Scenario: Release command is recognized

- GIVEN the `release` command is registered in `cli.js`
- WHEN `devhub release task-123 token --outcome completed` is executed
- THEN the release command handler is invoked (not a stub)

#### Scenario: Release command appears in help

- GIVEN the `release` command is registered
- WHEN `devhub --help` is executed
- THEN the help output includes `release` in the command list

#### Scenario: Release is not a stub

- GIVEN the CLI has a stub commands list
- WHEN `cli.js` is loaded
- THEN `release` is NOT in the stub commands list
