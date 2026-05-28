# Delta for mcp-public-contract

## MODIFIED Requirements

### Requirement: Supported Surface Contract

The system SHALL publish one MCP contract of 24 tools. It MUST keep project, task, and milestone CRUD plus read-only planning and evidence queries. It MUST NOT expose runtime coordination mutations for task leases, supervisor approval, `team_tell`, workspace preparation or reporting, run lifecycle mutation, or artifact append. Those actions SHALL be CLI or runtime-owned.
(Previously: the public contract exposed 36 tools including runtime coordination mutations and `team_tell`.)

#### Scenario: Catalog and docs match corrected surface

- GIVEN the MCP server tool list, README, and catalog test
- WHEN the supported contract is reviewed
- THEN all three show the same 24 supported tools
- AND tools like `claim_next_task`, `team_tell`, `prepare_agent_workspace`, `create_agent_run`, and `append_agent_artifact` are not listed

#### Scenario: Read-only evidence stays public while runtime mutation stays out

- GIVEN a public MCP consumer needs durable inspection
- WHEN the supported contract is checked
- THEN read-only tools like `get_agent_workspace`, `list_agent_runs`, and `get_workspace_evidence` remain listed
- AND excluded runtime mutations remain out of the public MCP surface
