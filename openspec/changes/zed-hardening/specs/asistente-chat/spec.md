# Spec: asistente-chat

## Purpose

Define the server-side chat surface of Asistente ZED: the MiniMax model client configuration, the system-prompt contract, the textual `TOOL:` / `PARAM:` parser, the bounded tool-call loop, and the route's error contract. Greenfield — no prior asistente spec exists.

## Requirements

### Requirement: MiniMax Model Client Configuration

The chat route MUST use a MiniMax client whose configuration matches the production deployment. The client MUST be configured as follows:

- Base URL: `https://api.minimax.io/anthropic/v1/messages`
- API key: `process.env.MINIMAX_API_KEY`, falling back to `process.env.ANTHROPIC_API_KEY` when the former is unset.
- Model identifier: `minimax-coding-plan/MiniMax-M3`
- `x-api-key` header carries the resolved API key.

The system MUST return a 500 error with a JSON body if neither environment variable is set, so the route never silently misconfigures against a different provider.

#### Scenario: API key resolved from MINIMAX_API_KEY

- GIVEN `process.env.MINIMAX_API_KEY` is set to a non-empty value
- AND `process.env.ANTHROPIC_API_KEY` is unset
- WHEN the chat route constructs the request
- THEN the `x-api-key` header equals the value of `MINIMAX_API_KEY`
- AND the request targets `https://api.minimax.io/anthropic/v1/messages`
- AND the model identifier is `minimax-coding-plan/MiniMax-M3`

#### Scenario: API key falls back to ANTHROPIC_API_KEY

- GIVEN `process.env.MINIMAX_API_KEY` is unset
- AND `process.env.ANTHROPIC_API_KEY` is set to `fallback-key`
- WHEN the chat route constructs the request
- THEN the `x-api-key` header equals `fallback-key`

#### Scenario: Missing API key returns 500

- GIVEN both `MINIMAX_API_KEY` and `ANTHROPIC_API_KEY` are unset
- WHEN a POST request hits `/api/assistant/chat`
- THEN the response status is `500`
- AND the response body is JSON containing a descriptive error message
- AND no outbound request is made to MiniMax

### Requirement: Externalized System Prompt

The chat route MUST load the system prompt from the file `docs/prompts/asistente/zed-system-prompt.md` (read once at module init) rather than inlining its text in the route source.

The prompt MUST list every tool the route registers, with a short description, required `PARAM:` keys, and at least one `PARAM:` example per tool. The route registers 10 tools, so the prompt MUST cover all 10:

1. `open_terminal`
2. `list_terminals`
3. `review_terminal_output`
4. `execute_in_terminal`
5. `close_terminal`
6. `open_url`
7. `delegate_to_opencode`
8. `browse_files`
9. `review_log_file`
10. `get_swarm_status`

The prompt MUST instruct the model to emit calls in the exact textual format: `TOOL: <name>` on one line, followed by one or more `PARAM: <key>=<value>` lines, with no surrounding JSON or markdown fences.

#### Scenario: Prompt file lists all 10 tools

- GIVEN the system prompt is loaded
- WHEN the file content is parsed for tool names
- THEN each of the 10 tool names listed above appears in the prompt body
- AND each tool entry includes a `PARAM:` example

#### Scenario: Prompt instructs the textual format

- GIVEN the system prompt is loaded
- WHEN the file content is searched for the call format
- THEN the prompt explicitly mentions the `TOOL:` and `PARAM:` line format
- AND the prompt forbids wrapping calls in JSON or markdown code fences

#### Scenario: Missing prompt file fails fast

- GIVEN `docs/prompts/asistente/zed-system-prompt.md` does not exist
- WHEN the chat route module initializes
- THEN module load MUST throw a descriptive error
- AND the route MUST NOT silently fall back to a hardcoded prompt

### Requirement: Tool Call Parser

The chat route MUST expose a `parseToolCalls(rawText)` function that converts the model's textual output into an array of `{ tool, params }` objects. The parser MUST recognize the following grammar:

- A `TOOL: <name>` line starts a new call.
- A `PARAM: <key>=<value>` line attaches a parameter to the most recent `TOOL:`.
- A value is everything after the first `=` on the `PARAM:` line, with leading/trailing whitespace trimmed and a single matched pair of surrounding double or single quotes stripped.
- Multiple `PARAM:` lines MAY follow one `TOOL:`.
- `PARAM:` lines with no current `TOOL:` MUST be ignored (not associated with the previous tool, since this is ambiguous).

The parser MUST handle values that contain `=`, `:`, `/`, whitespace, and quoted segments without truncation.

#### Scenario: Single key=value with whitespace in value

- GIVEN the raw text `TOOL: open_terminal\nPARAM: command=npm test --watch`
- WHEN `parseToolCalls()` runs
- THEN it returns exactly one call
- AND that call has `tool === "open_terminal"`
- AND `params.command === "npm test --watch"`

#### Scenario: Value containing `=` and `://` is preserved

- GIVEN the raw text `TOOL: open_url\nPARAM: url=https://github.com/foo?a=1&b=2`
- WHEN `parseToolCalls()` runs
- THEN `params.url === "https://github.com/foo?a=1&b=2"`

#### Scenario: Quoted value has surrounding quotes stripped

- GIVEN the raw text `TOOL: execute_in_terminal\nPARAM: command="echo hello world"`
- WHEN `parseToolCalls()` runs
- THEN `params.command === "echo hello world"` (no surrounding quotes)

#### Scenario: Multiple params for the same tool

- GIVEN the raw text `TOOL: open_terminal\nPARAM: command=zsh\nPARAM: cwd=/tmp/devhub-x`
- WHEN `parseToolCalls()` runs
- THEN the call has both `params.command === "zsh"` and `params.cwd === "/tmp/devhub-x"`

#### Scenario: Multiple TOOL blocks in one response

- GIVEN the raw text `TOOL: list_terminals\nTOOL: get_swarm_status`
- WHEN `parseToolCalls()` runs
- THEN it returns two calls
- AND the first has `tool === "list_terminals"`
- AND the second has `tool === "get_swarm_status"`

#### Scenario: Empty value is preserved as empty string

- GIVEN the raw text `TOOL: close_terminal\nPARAM: session_id=`
- WHEN `parseToolCalls()` runs
- THEN `params.session_id === ""`
- AND the call is still recorded (an empty string is a value, not absence)

#### Scenario: Input with no TOOL lines returns empty array

- GIVEN the raw text `Sure, here you go.`
- WHEN `parseToolCalls()` runs
- THEN it returns `[]`

### Requirement: Bounded Tool Loop

The chat route MUST run the assistant tool loop for at most `MAX_TURNS` iterations. `MAX_TURNS` MUST be an exported, named, mutable module-level constant (not a magic literal).

Each iteration of the loop MUST:

1. Send the current conversation (system + user + accumulated tool results) to MiniMax.
2. Parse the response with `parseToolCalls()`.
3. If no tool calls are produced, treat the response text as the final answer and exit the loop.
4. If tool calls are produced, execute each via the tool registry, collect results, and append the assistant message and the tool results to the conversation before looping.

If the loop reaches `MAX_TURNS` without producing a final answer, the route MUST return the last assistant text and a `meta.max_turns_reached: true` flag in the JSON body.

#### Scenario: Loop exits when model produces no tool call

- GIVEN MiniMax returns a response whose text contains no `TOOL:` line
- WHEN the route processes the response
- THEN the loop terminates after that iteration
- AND the route returns the assistant text as the final answer

#### Scenario: Loop exits after MAX_TURNS

- GIVEN `MAX_TURNS` is exported as `5`
- AND the model emits a tool call on every turn
- WHEN the route processes the conversation
- THEN the loop runs exactly 5 iterations
- AND the response body contains `meta.max_turns_reached: true`
- AND the response body contains the last assistant text produced in turn 5

#### Scenario: MAX_TURNS is the exported constant used by the loop

- GIVEN the route module is imported
- WHEN a test reads `MAX_TURNS` from the module
- THEN the value matches the constant the loop honors
- AND changing `MAX_TURNS` at module level (in tests) changes the loop's bound

### Requirement: No-Param Tool Calls Are Reported, Not Silently Dropped

When `parseToolCalls()` produces a call whose `params` object is empty (no `PARAM:` lines for that tool), the chat route MUST NOT drop the call. The route MUST execute the tool with the empty params, and the tool MUST return an error result object with shape `{ error: "missing required parameters" }`.

The route MUST treat this error result the same as any other tool result: it is injected into the conversation and the loop continues on the next turn.

#### Scenario: TOOL with no PARAMs is still executed

- GIVEN the model emits `TOOL: browse_files` with no `PARAM:` lines
- WHEN the route processes the turn
- THEN `browse_files` is invoked with `params === {}`
- AND the call's result (an error object) is appended to the conversation
- AND the loop continues to the next turn with that result visible to the model

#### Scenario: The result is the canonical error shape

- GIVEN `browse_files` is invoked with empty params
- WHEN the tool executes
- THEN the returned result equals `{ error: "missing required parameters" }`
- AND the result is JSON-serializable

### Requirement: Tool Results Are Injected as Assistant-Visible Content

After each turn, the chat route MUST append the assistant's raw text and the tool results to the conversation in a way the model can see on the next turn. The route MUST insert a follow-up message after the tool results that prompts the model to either produce another tool call or return a final natural-language answer.

Tool results MUST be passed as structured assistant-visible content (parsed object), not as opaque stringified JSON that the model has to re-parse.

#### Scenario: Tool results become model-visible on next turn

- GIVEN the model emits `TOOL: get_swarm_status` and the tool returns `{ active_missions: 2 }`
- WHEN the next turn begins
- THEN the conversation array contains an entry whose content carries the parsed object `{ active_missions: 2 }`
- AND the model's next response references that data (asserted via test fixture)

#### Scenario: Model produces final answer after seeing tool result

- GIVEN the tool loop has produced at least one tool result
- WHEN the model returns text with no `TOOL:` line
- THEN the route terminates the loop
- AND the final response includes the assistant's natural-language text

### Requirement: Error Contract on the Chat Route

The `POST /api/assistant/chat` route MUST handle all failure modes by returning a JSON error body with a stable shape. Specifically:

- If the request body is not valid JSON or is missing required fields (`messages` or `message`), the route MUST return `400` with `{ error: <string> }`.
- If the MiniMax client is misconfigured (missing API key), the route MUST return `500` with `{ error: <string> }`.
- If MiniMax returns a non-2xx response or the network request throws, the route MUST return `500` with `{ error: <string>, upstream_status?: <number> }`.
- If the route catches any unexpected exception, the route MUST return `500` with `{ error: <string> }` and MUST NOT crash the process.

In all error paths, the response body MUST be valid JSON, never an HTML error page.

#### Scenario: Malformed body returns 400

- GIVEN a POST request with body `not-json{`
- WHEN the route handles the request
- THEN the response status is `400`
- AND the response body parses as JSON with an `error` string field

#### Scenario: Upstream 502 from MiniMax

- GIVEN the MiniMax client throws a network error whose upstream status is `502`
- WHEN the route handles the request
- THEN the response status is `500`
- AND the response body includes `upstream_status: 502`

#### Scenario: Unexpected throw returns 500 JSON

- GIVEN the MiniMax client throws an unexpected error (not a structured ApiError)
- WHEN the route handles the request
- THEN the response status is `500`
- AND the response body is valid JSON
- AND no unhandled rejection is logged at the process level
