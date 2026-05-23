# MCP Public Contract Specification

## Purpose

Defines the official MCP tool surface for DevHub, the deprecation policy for CLI-duplicated tools, and the ownership boundary between MCP and CLI.

## Requirements

### Requirement: Tool Categorization

The system SHALL classify every MCP tool into exactly one category: `crud`, `portable-contract`, `deprecated`, or `external-integration`.

#### Scenario: CRUD tools are documented as MCP-owned

- GIVEN the MCP server exposes project, task, and milestone tools
- WHEN a client queries the public contract
- THEN `list_projects`, `get_project`, `create_project`, `update_project`, `delete_project` are classified as `crud` (MCP-owned)
- AND `list_tasks`, `create_task`, `bulk_create_tasks`, `update_task`, `add_task_comment` are classified as `crud` (MCP-owned)
- AND `list_milestones`, `create_milestone`, `bulk_create_milestones`, `update_milestone` are classified as `crud` (MCP-owned)

#### Scenario: Portable contract tools are documented as client-portable

- GIVEN a portable client needs execution coordination
- WHEN consulting the public contract
- THEN `get_execution_queue`, `claim_next_task`, `renew_task_lease`, `release_task`, `request_supervisor_approval`, `team_tell` are classified as `portable-contract`
- AND these tools remain stable across CLI changes

#### Scenario: Deprecated tools are identified with CLI equivalents

- GIVEN the 6 CLI-duplicated tools
- WHEN consulting the public contract
- THEN `get_dashboard`, `register_agent`, `heartbeat_agent`, `unregister_agent`, `update_agent_status`, `get_next_task` are classified as `deprecated`
- AND each deprecated tool maps to its CLI equivalent per the deprecation table

#### Scenario: External integration tools are MCP-owned

- GIVEN Telegram and agent workspace/run/artifact tracking tools
- WHEN consulting the public contract
- THEN all 5 Telegram tools, 6 workspace tools, 4 run tools, 2 artifact tools, `get_workspace_evidence`, and `get_project_context` are classified as `external-integration`

### Requirement: Deprecation Markers

The system SHALL mark deprecated tools with a `@deprecated` prefix in their tool descriptions, referencing the CLI equivalent.

#### Scenario: Deprecated tool description includes @deprecated prefix

- GIVEN a tool is classified as `deprecated`
- WHEN the tool description is rendered
- THEN it starts with `@deprecated` followed by the CLI equivalent command

#### Scenario: Deprecated tools remain fully functional

- GIVEN a deprecated tool exists
- WHEN a client calls it
- THEN the tool executes normally with no behavioral change
- AND no error or warning is returned at runtime

#### Scenario: Deprecation markers are machine-readable

- GIVEN the `@deprecated` prefix convention
- WHEN a client parses tool descriptions
- THEN it can detect deprecation via string prefix matching

### Requirement: Documentation Updates

The system SHALL maintain `devhub-mcp/README.md` as the authoritative source for the MCP vs CLI ownership boundary.

#### Scenario: README contains ownership matrix

- GIVEN the README is updated
- WHEN a developer reads it
- THEN it contains a table mapping each MCP tool to its category (crud, portable-contract, deprecated, external-integration)
- AND deprecated tools show their CLI equivalent

#### Scenario: README documents deprecation policy

- GIVEN a developer reads the README
- WHEN looking for deprecation guidance
- THEN it states that deprecation is advisory (no tools removed)
- AND it states the rollback plan (git revert description changes)

#### Scenario: README documents portable client contract

- GIVEN a portable client developer reads the README
- WHEN looking for stable integration points
- THEN it identifies which tools form the portable contract (queue, claim/release, approvals)

### Requirement: Backward Compatibility Guarantee

The system SHALL NOT remove, rename, or change the signature of any existing MCP tool as part of this change.

#### Scenario: All 45 tools remain callable

- GIVEN the deprecation changes are applied
- WHEN any of the 45 tools is called
- THEN it returns the same result as before
- AND no breaking change occurs

#### Scenario: Tool signatures are unchanged

- GIVEN a deprecated tool
- WHEN its parameters are inspected
- THEN they match the pre-deprecation signature exactly

#### Scenario: Rollback restores original descriptions

- GIVEN the deprecation changes need to be reverted
- WHEN `git revert` is applied
- THEN tool descriptions return to their original form
- AND no data migration is required
