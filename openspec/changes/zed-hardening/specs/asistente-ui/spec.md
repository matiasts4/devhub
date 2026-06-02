# Spec: asistente-ui

## Purpose

Define the React UI surface of Asistente ZED: the `ChatPanel` component (send/stop/loading states, hydration safety, message rendering) and the `ToolResult` component (full tool-result body rendering). Defines how the right-dock "zed" tab mounts `ChatPanel`. Greenfield — no prior asistente spec exists.

## Requirements

### Requirement: Role-Based Message Styling

`ChatPanel` MUST render each message with styling that reflects the message's `role`. Specifically:

- `assistant` messages MUST be visually distinct from `user` messages (alignment, background, or border per the existing design tokens).
- `user` messages MUST be visually distinct from `assistant` messages.
- The initial greeting message MUST render as `assistant` and appear exactly once on first load.

A message's role is determined by the `role` field on the message object (`'user' | 'assistant' | 'tool'`). A `tool` message MUST render its full result body via the `ToolResult` component (see separate requirement).

#### Scenario: User message aligns one way

- GIVEN the message list contains a `user` message
- WHEN `ChatPanel` renders
- THEN the user message element has the user-role styling class

#### Scenario: Assistant message aligns the other way

- GIVEN the message list contains an `assistant` message
- WHEN `ChatPanel` renders
- THEN the assistant message element has the assistant-role styling class
- AND it is visually distinguishable from the user message

#### Scenario: Tool message renders via ToolResult

- GIVEN the message list contains a `tool` message
- WHEN `ChatPanel` renders
- THEN the tool message element renders `<ToolResult />` for its body
- AND the inline `ToolBadge` from the old implementation is NOT used

### Requirement: Send Button Loading State and Disable

`ChatPanel` MUST show a loading state on the send button while a chat request is in flight. Specifically:

- The send button MUST be disabled (not clickable) when `isLoading` is true.
- The send button MUST show a visual loading indicator (spinner, "Sending…" text, or equivalent) while `isLoading` is true.
- After the request settles (success or error), `isLoading` MUST be set back to false and the send button MUST be re-enabled.
- Pressing Enter in the textarea while `isLoading` is true MUST NOT submit a new request.

#### Scenario: Send button disabled while in flight

- GIVEN `isLoading` is true
- WHEN the user looks at the send button
- THEN the button is disabled
- AND the button shows a loading indicator

#### Scenario: Send button re-enabled after response

- GIVEN a chat request resolves
- WHEN the response handling completes
- THEN `isLoading` becomes false
- AND the send button is enabled again

#### Scenario: Enter during in-flight request is ignored

- GIVEN `isLoading` is true
- WHEN the user presses Enter in the textarea
- THEN no new request is sent
- AND the message list is not extended

### Requirement: Stop Button Aborts the In-Flight Fetch

`ChatPanel` MUST abort an in-flight chat request when the user clicks the Stop button. Specifically:

- A new `AbortController` MUST be created at the start of each send.
- The controller's `signal` MUST be passed to `fetch()`.
- The controller MUST be stored in component state so `handleStop` can call `.abort()` on it.
- After `abort()` is called, the in-flight request MUST be cancelled and `isLoading` MUST be set to false within 100ms.
- The Stop button MUST be visible (or accessible) only while a request is in flight.

#### Scenario: Stop aborts the fetch

- GIVEN a chat request is in flight
- WHEN the user clicks the Stop button
- THEN `fetch` is aborted (signal aborted)
- AND `isLoading` becomes false within 100ms
- AND no further messages are appended to the chat

#### Scenario: Stop button is not visible when idle

- GIVEN no chat request is in flight
- WHEN the panel renders
- THEN the Stop button is not visible (or is hidden)

#### Scenario: New send creates a fresh controller

- GIVEN a previous request was just aborted
- WHEN the user sends a new message
- THEN a new `AbortController` is created
- AND the new controller's signal is passed to the new `fetch` call

### Requirement: Hydration-Safe Initial Timestamp

`ChatPanel` MUST NOT call `new Date().toISOString()` (or any other non-deterministic function) during render. The initial message's timestamp MUST be produced via a `useState` lazy initializer, so that server-rendered HTML matches the first client render exactly.

The initial state MUST be stable across server and client renders (i.e., the same string on both sides), even if the actual timestamp drifts. The lazy initializer SHOULD return a sentinel value (e.g. `"initial"`) or a value derived from props that are stable between server and client.

#### Scenario: No hydration mismatch warning on first load

- GIVEN the panel is mounted via SSR
- WHEN the first client render runs
- THEN the React console shows no hydration mismatch warning for the initial message timestamp
- AND the initial message's `timestamp` field is identical on server and client

#### Scenario: Timestamp becomes real after first client interaction

- GIVEN the initial message's timestamp is the sentinel value
- WHEN the user sends the first message
- THEN the assistant's response message receives a real ISO timestamp captured in the client (not via render-time `new Date()`)

### Requirement: `ToolResult` Renders Full Result Body

`ToolResult` MUST render the full body of a tool result. Specifically:

- When the result is a string, the component MUST render that string as plain text in a monospace or pre-formatted block.
- When the result is an object, the component MUST render the JSON via `JSON.stringify(result, null, 2)` (pretty-printed) inside a `<pre>` or equivalent.
- The component MUST accept `toolName` and `result` as props.
- The component MUST gracefully handle `result === null` or `result === undefined` by rendering an empty body, not by throwing.

#### Scenario: String result renders as plain text

- GIVEN `<ToolResult toolName="list_terminals" result="hello" />` is rendered
- WHEN the component mounts
- THEN the output contains the literal text `hello`
- AND the output is not JSON-wrapped

#### Scenario: Object result renders as pretty-printed JSON

- GIVEN `<ToolResult toolName="get_swarm_status" result={{ active: 2 }} />` is rendered
- WHEN the component mounts
- THEN the output contains the substring `"active": 2` with indentation matching `JSON.stringify(_, null, 2)`

#### Scenario: Null result renders empty body

- GIVEN `<ToolResult toolName="x" result={null} />` is rendered
- WHEN the component mounts
- THEN the component does not throw
- AND the body region is empty

#### Scenario: Undefined result renders empty body

- GIVEN `<ToolResult toolName="x" result={undefined} />` is rendered
- WHEN the component mounts
- THEN the component does not throw
- AND the body region is empty

### Requirement: Right-Dock `zed` Tab Shows `ChatPanel`

`WorkspaceRightDock` MUST render `ChatPanel` when its `activeTab` is `"zed"`. Specifically:

- The dock's tab list MUST include a `zed` tab.
- When `activeTab === "zed"`, the dock's body MUST mount `<ChatPanel />`.
- When `activeTab !== "zed"`, the dock's body MUST NOT mount `ChatPanel` (no off-screen mounting).

#### Scenario: Active zed tab mounts ChatPanel

- GIVEN `dockState.activeTab === "zed"`
- WHEN the dock renders
- THEN `ChatPanel` is mounted in the dock's body region
- AND the chat input and message list are reachable

#### Scenario: Inactive zed tab does not mount ChatPanel

- GIVEN `dockState.activeTab === "files"`
- WHEN the dock renders
- THEN `ChatPanel` is NOT mounted
- AND no chat-related DOM nodes appear in the dock
