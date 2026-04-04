# Delta for Trace Viewer

## ADDED Requirements

### Requirement: Trace Search & Filter UI

The system MUST provide a filter UI in SwarmControl and AgentHub with the following filter controls: tool type dropdown (all, tool, reasoning, text, subtask), status dropdown (all, running, completed, error), agent name dropdown, date range picker, and free-text search input.

#### Scenario: Filter by tool type

- GIVEN the trace viewer shows mixed trace types
- WHEN the user selects "tool" in the tool type filter
- THEN only tool execution rows are displayed

#### Scenario: Filter by status

- GIVEN the trace viewer shows tools in various states
- WHEN the user selects "error" in the status filter
- THEN only tool rows with `tool_status='error'` are displayed

#### Scenario: Full-text search in traces

- GIVEN the trace viewer has traces with tool outputs
- WHEN the user types "TypeError" in the search input
- THEN traces containing "TypeError" in content or tool_output are highlighted and shown

#### Scenario: Date range filter

- GIVEN traces exist across multiple days
- WHEN the user sets a date range from 2026-04-01 to 2026-04-02
- THEN only traces within that range are displayed

### Requirement: Full Output Viewer Modal

The system MUST provide a modal dialog for viewing complete tool output without truncation. The modal MUST include: tool name header, full input (JSON formatted), full output (plain text with syntax highlighting for code), copy-to-clipboard button, and close button.

#### Scenario: Open full output viewer

- GIVEN a trace row shows a truncated tool output preview
- WHEN the user clicks "View full output" on the row
- THEN a modal opens showing the complete tool input and output without any truncation

#### Scenario: Copy output to clipboard

- GIVEN the full output viewer modal is open
- WHEN the user clicks the copy button
- THEN the tool output is copied to the clipboard and a toast confirms "Copiado al portapapeles"

#### Scenario: Syntax highlighting for code output

- GIVEN a tool output contains JSON or code
- WHEN the full output viewer modal is opened
- THEN the output is displayed with syntax highlighting appropriate to the content type

### Requirement: Expandable Tool Input/Output in Trace Panel

The AgentTracePanel component MUST support expandable/collapsible sections for tool input and output with "show more/less" behavior, replacing the current fixed `max-h-32`/`max-h-40` truncation.

#### Scenario: Expand tool input

- GIVEN a collapsed tool row in the trace panel
- WHEN the user clicks the expand chevron
- THEN the tool input section expands to full height with a "show less" option

#### Scenario: Expand tool output beyond truncation

- GIVEN a tool output exceeds 1200 characters
- WHEN the user expands the tool row
- THEN the full output is shown with a "show more" button if it exceeds the visible area

### Requirement: Multi-Session Trace Browser

The system MUST provide a trace browser that allows switching between sessions to view their respective traces, with a session selector dropdown showing session title, date, and status.

#### Scenario: Switch between sessions

- GIVEN the trace browser shows traces for session A
- WHEN the user selects session B from the session dropdown
- THEN the trace panel updates to show session B's traces

### Requirement: Trace Export

The system MUST allow exporting a session's traces as JSON via a download button in the trace viewer.

#### Scenario: Export traces as JSON

- GIVEN a session has persisted traces
- WHEN the user clicks "Export traces"
- THEN a JSON file is downloaded containing all trace parts for that session
