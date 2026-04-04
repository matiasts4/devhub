# Delta for MCP Status

## ADDED Requirements

### Requirement: MCP Server Status Display

The system MUST display connected MCP servers in the AgentHub UI showing: server name, connection status (connected, disconnected, error), list of available tools per server, and tool status (available, error, disabled).

#### Scenario: Show connected MCP servers

- GIVEN 3 MCP servers are connected to OpenCode
- WHEN the AgentHub MCP section is rendered
- THEN each server is shown with its name, status badge, and list of tools

#### Scenario: Show tool status

- GIVEN an MCP server has 5 tools, one of which is returning errors
- WHEN the MCP status is displayed
- THEN 4 tools show "available" (green) and 1 shows "error" (red)

### Requirement: Real-Time MCP Tool Execution Visibility

The system MUST show real-time MCP tool execution in the trace panel, including: tool name, server name, execution status, input parameters, and output. MCP tool executions MUST be visually distinguishable from native OpenCode tools.

#### Scenario: MCP tool execution visible in trace

- GIVEN an agent calls an MCP tool `engram_mem_search`
- WHEN the trace panel renders
- THEN the tool row shows the MCP tool with a distinct icon/badge indicating it's an MCP tool

#### Scenario: MCP tool error shown

- GIVEN an MCP tool call fails
- WHEN the trace panel renders
- THEN the tool row shows error status with the error message

### Requirement: MCP Server Refresh

The system MUST provide a manual refresh button in the MCP status section to re-query connected servers and their tool lists.

#### Scenario: Refresh MCP status

- GIVEN the MCP status section is visible
- WHEN the user clicks the refresh button
- THEN the server and tool list is re-fetched from OpenCode and the UI updates

### Requirement: MCP Status API

The system MUST provide GET `/api/agenthub/mcp/status` endpoint returning connected MCP servers, their tools, and current status by querying OpenCode's `/agent` or equivalent endpoint.

#### Scenario: Get MCP status

- WHEN GET `/api/agenthub/mcp/status` is called
- THEN the response includes an array of servers with name, status, and tools array
