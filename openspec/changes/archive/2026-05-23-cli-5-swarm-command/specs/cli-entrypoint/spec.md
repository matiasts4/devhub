# Delta for CLI Entry Point

## MODIFIED Requirements

### Requirement: Agents Command Registration

The CLI MUST register the `agents` command and the `swarm` command in `cli.js` and remove both from the stub commands list.
(Previously: Only `agents` command was registered; `swarm` was not mentioned.)

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
