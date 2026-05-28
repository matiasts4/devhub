# Delta for CLI Entry Point

## MODIFIED Requirements

### Requirement: Agents Command Registration

The CLI MUST register the `agents`, `swarm`, `task`, `ws`, `heartbeat`, and `update-status` commands in `cli.js` and remove all from the stub commands list.
(Previously: Registered `agents`, `swarm`, `task`, and `ws` only)

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

#### Scenario: Heartbeat command is recognized

- GIVEN the `heartbeat` command is registered in `cli.js`
- WHEN `devhub heartbeat test-agent-1` is executed
- THEN the heartbeat command handler is invoked (not a stub)

#### Scenario: Heartbeat command appears in help

- GIVEN the `heartbeat` command is registered
- WHEN `devhub --help` is executed
- THEN the help output includes `heartbeat` in the command list

#### Scenario: Heartbeat is not a stub

- GIVEN the CLI has a stub commands list
- WHEN `cli.js` is loaded
- THEN `heartbeat` is NOT in the stub commands list

#### Scenario: Update-status command is recognized

- GIVEN the `update-status` command is registered in `cli.js`
- WHEN `devhub update-status test-agent-1 active` is executed
- THEN the update-status command handler is invoked (not a stub)

#### Scenario: Update-status command appears in help

- GIVEN the `update-status` command is registered
- WHEN `devhub --help` is executed
- THEN the help output includes `update-status` in the command list

#### Scenario: Update-status is not a stub

- GIVEN the CLI has a stub commands list
- WHEN `cli.js` is loaded
- THEN `update-status` is NOT in the stub commands list
