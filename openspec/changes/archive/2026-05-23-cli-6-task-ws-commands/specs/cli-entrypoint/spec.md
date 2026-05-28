# Delta for CLI Entry Point

## ADDED Requirements

None — task and ws commands are new capabilities with their own full specs.

## MODIFIED Requirements

### Requirement: Agents Command Registration

The CLI MUST register the `agents`, `swarm`, `task`, and `ws` commands in `cli.js` and remove all from the stub commands list.
(Previously: Registered only `agents` and `swarm`.)

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

#### Scenario: Task command is recognized

- GIVEN the `task` command is registered in `cli.js`
- WHEN `devhub task <id>` is executed
- THEN the task command handler is invoked (not a stub)

#### Scenario: Task command appears in help

- GIVEN the `task` command is registered
- WHEN `devhub --help` is executed
- THEN the help output includes `task` in the command list

#### Scenario: Task is not a stub

- GIVEN the CLI has a stub commands list
- WHEN `cli.js` is loaded
- THEN `task` is NOT in the stub commands list

#### Scenario: Workspace command is recognized

- GIVEN the `ws` command is registered in `cli.js`
- WHEN `devhub ws <id>` is executed
- THEN the ws command handler is invoked (not a stub)

#### Scenario: Workspace command appears in help

- GIVEN the `ws` command is registered
- WHEN `devhub --help` is executed
- THEN the help output includes `ws` in the command list

#### Scenario: Workspace is not a stub

- GIVEN the CLI has a stub commands list
- WHEN `cli.js` is loaded
- THEN `ws` is NOT in the stub commands list

## REMOVED Requirements

None.
