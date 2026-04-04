# Delta for Permission Flow

## ADDED Requirements

### Requirement: Permission Approval Modal in Web

The system MUST display a modal dialog when an OpenCode agent requests permission for a tool execution. The modal MUST show: the action/tool being requested, the context or reason for the request, an "Approve" button, a "Reject" button, and a countdown timer showing remaining time before auto-reject.

#### Scenario: Permission modal appears

- GIVEN an agent is executing and requires approval for a file write
- WHEN the SSE event `permission.asked` or `require.approval` arrives
- THEN a modal dialog appears showing the tool name, action details, and Approve/Reject buttons

#### Scenario: Approve permission

- GIVEN the permission modal is visible
- WHEN the user clicks "Approve"
- THEN a POST request is sent to OpenCode's permission endpoint with `response: "approve"` and the modal closes

#### Scenario: Reject permission

- GIVEN the permission modal is visible
- WHEN the user clicks "Reject"
- THEN a POST request is sent to OpenCode's permission endpoint with `response: "reject"` and the modal closes

#### Scenario: Permission timeout

- GIVEN the permission modal is visible with a 60-second timeout
- WHEN 60 seconds pass without user action
- THEN the permission is auto-rejected, the modal closes, and a toast notifies "Permiso rechazado por timeout"

### Requirement: Telegram Permission Approval via Inline Buttons

The system MUST handle OpenCode permission requests in Telegram by sending a message with inline callback buttons for "✅ Aprobar" and "❌ Rechazar". The buttons MUST trigger the appropriate OpenCode permission API call.

#### Scenario: Permission request in Telegram

- GIVEN an agent requires approval during Telegram execution
- WHEN the permission event arrives
- THEN the bot sends a message with the action details and inline Approve/Reject buttons

#### Scenario: User approves via Telegram

- GIVEN a permission message with inline buttons is visible in Telegram
- WHEN the user clicks "✅ Aprobar"
- THEN the approval is sent to OpenCode, the buttons are disabled, and the message is updated with "✅ Aprobado"

#### Scenario: User rejects via Telegram

- GIVEN a permission message with inline buttons is visible in Telegram
- WHEN the user clicks "❌ Rechazar"
- THEN the rejection is sent to OpenCode, the buttons are disabled, and the message is updated with "❌ Rechazado"

### Requirement: Permission Request Metadata

Permission requests MUST include sufficient context for the user to make an informed decision: tool name, action description, target resource (file path, command, URL), and any relevant parameters.

#### Scenario: File write permission shows path

- GIVEN an agent requests permission to write a file
- WHEN the permission modal is displayed
- THEN it shows the file path, the tool name (`write_file`), and a preview of the content to be written

#### Scenario: Command execution permission shows command

- GIVEN an agent requests permission to execute a shell command
- WHEN the permission modal is displayed
- THEN it shows the exact command string to be executed

### Requirement: Cross-Platform Permission Routing

If a session is active in web but the user is interacting via Telegram (or vice versa), permission requests MUST be routed to the most recently active platform.

#### Scenario: Permission routed to active platform

- GIVEN a session was started from web but the last message came from Telegram
- WHEN a permission request occurs
- THEN the permission is sent to Telegram with inline buttons
