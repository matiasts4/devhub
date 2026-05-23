# Delta for CLI Entry Point

## ADDED Requirements

### Requirement: Tell Command Registration

The CLI MUST register the `tell` command in `cli.js` and remove it from the stub commands list.

#### Scenario: Tell command is recognized

- GIVEN the `tell` command is registered in `cli.js`
- WHEN `devhub tell worker-1 "msg" --mission m-1 --sender worker-2` is executed
- THEN the tell command handler is invoked (not a stub)

#### Scenario: Tell command appears in help

- GIVEN the `tell` command is registered
- WHEN `devhub --help` is executed
- THEN the help output includes `tell` in the command list

#### Scenario: Tell is not a stub

- GIVEN the CLI has a stub commands list
- WHEN `cli.js` is loaded
- THEN `tell` is NOT in the stub commands list
