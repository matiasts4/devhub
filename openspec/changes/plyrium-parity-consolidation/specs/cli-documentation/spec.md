# Delta for CLI Documentation

## ADDED Requirements

### Requirement: Current Command Surface Documentation

The documentation SHALL describe 20 implemented top-level CLI commands and SHALL NOT present planned commands as shipped.

#### Scenario: README matches implemented commands

- GIVEN the CLI command registry
- WHEN the README command reference is reviewed
- THEN every implemented top-level command is documented
- AND no implemented command is omitted

#### Scenario: Unsupported commands stay out of docs

- GIVEN older parity notes mention commands like `register`
- WHEN the README is reviewed
- THEN unsupported commands are not presented as executable CLI behavior

### Requirement: Executable Agent Workflow Docs

The documentation SHALL describe agent workflows only with implemented commands and SHALL describe registration as runtime or launch setup, not as CLI command.

#### Scenario: Workflow remains executable

- GIVEN a reader follows the workflow section
- WHEN they execute the referenced commands
- THEN each command exists in the CLI
- AND registration is documented outside the command list

## REMOVED Requirements

### Requirement: Command Reference

(Reason: the old requirement fixed the CLI surface at 11 commands.)

### Requirement: Agent Workflow Patterns

(Reason: the old workflow depended on nonexistent `devhub register`.)
