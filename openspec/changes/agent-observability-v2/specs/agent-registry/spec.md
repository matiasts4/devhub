# Delta for Agent Registry

## REMOVED Requirements

### Requirement: Agent Registry Table

(Reason: OpenCode native profiles replace the need for a separate agent registry. Agent information now comes from OpenCode's `/agent` endpoint and session state via SSE.)

The `agent_registry` table, `agentRegistryLive` module, and all MCP-based agent registration logic MUST be deprecated. The table MUST NOT be dropped (to preserve historical data), but MUST NOT be used for any active functionality.

#### Scenario: SwarmControl works without registry

- GIVEN the `agent_registry` table contains stale data
- WHEN SwarmControl loads
- THEN it displays agents from OpenCode SSE, ignoring the registry table

#### Scenario: AgentHub works without registry

- GIVEN the `agent_registry` table is empty
- WHEN AgentHub loads
- THEN it fetches available agents from OpenCode's `/agent` endpoint

### Requirement: MCP Connection Table

(Reason: MCP connections are now managed natively by OpenCode. The `mcp_connections` table is no longer the source of truth.)

The `mcp_connections` table MUST be deprecated. MCP status MUST be queried directly from OpenCode.

#### Scenario: MCP status from OpenCode

- WHEN MCP server status is requested
- THEN the system queries OpenCode's API, not the `mcp_connections` table
