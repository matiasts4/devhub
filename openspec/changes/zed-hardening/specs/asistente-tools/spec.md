# Spec: asistente-tools

## Purpose

Define the tool registry and the contract of every tool that Asistente ZED can invoke. Covers registration, execution, path sandboxing, URL safety, terminal session lifecycle, and the confirm-mode guard for destructive operations. Greenfield — no prior asistente spec exists.

## Requirements

### Requirement: Tool Registry Operations

The tool registry (`src/lib/asistente/tools/registry.js`) MUST expose three operations:

- `register(name, definition)` — stores a tool definition under `name`. The definition MUST include at minimum `description` (string) and `execute(params, context)` (function).
- `execute(name, params, context)` — looks up the tool by name and invokes its `execute(params, context)` function. If the tool is not registered, the registry MUST throw a `ToolNotFoundError` whose `message` is `"Unknown tool: <name>"`.
- `list()` — returns the array of registered tool names.

A registered `execute` MUST always return an object. It MUST NOT throw; instead, it SHOULD return `{ error: <string> }` on failure so callers can treat tool output uniformly.

#### Scenario: Register then execute round-trip

- GIVEN a tool `foo` is registered with `description: "foo tool"` and `execute: () => ({ ok: true })`
- WHEN the registry's `execute("foo", {})` is called
- THEN the result equals `{ ok: true }`

#### Scenario: Execute unknown tool throws ToolNotFoundError

- GIVEN no tool named `nope` is registered
- WHEN the registry's `execute("nope", {})` is called
- THEN it throws an error
- AND the error message equals `"Unknown tool: nope"`

#### Scenario: List returns registered names

- GIVEN tools `a` and `b` are registered
- WHEN `list()` is called
- THEN the result includes both `"a"` and `"b"`

#### Scenario: Tool execute returning error object

- GIVEN a registered tool whose `execute` returns `{ error: "boom" }`
- WHEN the registry's `execute(...)` runs
- THEN the result is the same `{ error: "boom" }` object (not thrown)

### Requirement: All Ten Tools Are Registered

The chat route MUST register the following 10 tools, in this exact set, on every request handling path. The set MUST NOT regress to the current 5-tool subset.

| # | Tool name | Purpose |
|---|-----------|---------|
| 1 | `open_terminal` | Open a new PTY terminal session |
| 2 | `list_terminals` | List active terminal sessions |
| 3 | `review_terminal_output` | Capture recent output of a terminal session |
| 4 | `execute_in_terminal` | Send input (keystrokes) to a running terminal session |
| 5 | `close_terminal` | Close a terminal session (confirm-mode) |
| 6 | `open_url` | Open a URL in the user's default browser |
| 7 | `delegate_to_opencode` | Hand off a task to opencode via tmux |
| 8 | `browse_files` | List or read files in the project |
| 9 | `review_log_file` | Read the tail of a log file |
| 10 | `get_swarm_status` | Read swarm mission state from the local DB |

#### Scenario: Registry exposes all 10 names

- GIVEN the chat route has been imported
- WHEN `list()` is called
- THEN the returned array includes every name in the table above (order-independent)

#### Scenario: Stub tools are no longer stubs

- GIVEN any of the names 2, 3, 4, 5, 9 in the table above is registered
- WHEN its `execute` is called with the appropriate params
- THEN it returns a structured result object
- AND it does NOT return a hardcoded placeholder like `{ terminals: [], message: 'not yet implemented' }`

### Requirement: `open_terminal` Creates a Terminal Session

`open_terminal` MUST create a new terminal session by POSTing to the terminal backend and return a normalized result object. The execution contract:

- HTTP call: `POST /api/terminal/session` with JSON body `{ command?: string, program?: string, cwd?: string }`.
- The `program` and `cwd` parameters MUST be passed through unchanged from the model to the request body.
- The response MUST be normalized to `{ session_id: <string>, port: <number>, wsPath: <string> }`.
- If the response from the backend is missing any of these fields, `open_terminal` MUST return `{ error: "terminal session response missing required fields", raw: <response> }`.

#### Scenario: Successful open_terminal returns normalized shape

- GIVEN the backend `POST /api/terminal/session` returns `{ id: "abc", port: 4001, wsPath: "/tty" }`
- WHEN `open_terminal` is called with `{ program: "zsh", cwd: "/tmp/devhub-x" }`
- THEN the result is `{ session_id: "abc", port: 4001, wsPath: "/tty" }`
- AND the request body sent to the backend includes `program: "zsh"` and `cwd: "/tmp/devhub-x"`

#### Scenario: open_terminal with minimal params

- GIVEN `open_terminal` is called with `{}`
- WHEN the tool runs
- THEN it still POSTs to `/api/terminal/session`
- AND the result is the normalized shape from the backend

#### Scenario: Backend missing fields

- GIVEN the backend returns `{ id: "abc" }` (no port, no wsPath)
- WHEN `open_terminal` is called
- THEN the result is `{ error: "terminal session response missing required fields", raw: { id: "abc" } }`

### Requirement: `list_terminals` Returns Active Sessions

`list_terminals` MUST query `GET /api/terminal/processes` and return its result. The tool MUST NOT return a hardcoded empty array.

#### Scenario: Lists sessions from backend

- GIVEN the backend `GET /api/terminal/processes` returns `{ processes: [{ id: "s1" }, { id: "s2" }] }`
- WHEN `list_terminals` is called with no params
- THEN the result includes the two sessions from the backend response
- AND the result is not an empty array stub

#### Scenario: Empty active set

- GIVEN the backend returns `{ processes: [] }`
- WHEN `list_terminals` is called
- THEN the result is `{ processes: [] }` (or the backend's equivalent empty shape)

### Requirement: `review_terminal_output` Captures Session Output

`review_terminal_output` MUST call `GET /api/terminal/session/:id/capture` where `:id` is the `session_id` parameter, and return the recent output of that session.

The tool MUST reject calls that do not include `session_id` with `{ error: "missing required parameter: session_id" }`.

#### Scenario: Reads output by session id

- GIVEN the backend `GET /api/terminal/session/sess-1/capture` returns `{ output: "hello\n" }`
- WHEN `review_terminal_output` is called with `{ session_id: "sess-1" }`
- THEN the result includes `output: "hello\n"` (or its parsed equivalent)

#### Scenario: Missing session_id

- GIVEN `review_terminal_output` is called with `{}`
- WHEN the tool runs
- THEN the result is `{ error: "missing required parameter: session_id" }`
- AND no HTTP request is made to the backend

### Requirement: `execute_in_terminal` Sends Input to a Session

`execute_in_terminal` MUST send a `data` payload to `PUT /api/terminal/session/:id/input` where `:id` is the model's `session_id` parameter. The request body MUST be `{ data: <input> }`.

The tool MUST reject calls missing `session_id` or `input` with `{ error: "missing required parameter: <name>" }`.

#### Scenario: Sends input to session

- GIVEN `execute_in_terminal` is called with `{ session_id: "sess-1", input: "ls -la\n" }`
- WHEN the tool runs
- THEN it sends `PUT /api/terminal/session/sess-1/input` with body `{ data: "ls -la\n" }`
- AND the result is the backend's response

#### Scenario: Missing input parameter

- GIVEN `execute_in_terminal` is called with `{ session_id: "sess-1" }` (no `input`)
- WHEN the tool runs
- THEN the result is `{ error: "missing required parameter: input" }`
- AND no HTTP request is made

### Requirement: `close_terminal` Is Confirm-Mode

`close_terminal` MUST close a terminal session only when the model supplies `confirm: true` as a parameter. When the model calls `close_terminal` without `confirm: true` (or with `confirm: false`, or with no `confirm` at all), the tool MUST return a dry-run preview that includes what would happen, and MUST NOT make any destructive HTTP call.

The dry-run preview MUST include the `session_id`, the action ("would close"), and a hint that the model must call the tool again with `confirm: true`.

When `confirm: true` is supplied AND `session_id` is present, the tool MUST call the close endpoint and return the backend's response. When `session_id` is missing, the tool MUST return `{ error: "missing required parameter: session_id" }`.

#### Scenario: Dry-run without confirm

- GIVEN `close_terminal` is called with `{ session_id: "sess-1" }` (no `confirm`)
- WHEN the tool runs
- THEN no HTTP request is made
- AND the result is a dry-run object containing `action: "would close"`, `session_id: "sess-1"`, and an instruction to call again with `confirm: true`

#### Scenario: Confirm true executes close

- GIVEN `close_terminal` is called with `{ session_id: "sess-1", confirm: true }`
- WHEN the tool runs
- THEN the tool calls the close endpoint with `session_id: "sess-1"`
- AND the result is the backend's response (success or backend error)

#### Scenario: Confirm false is a dry-run

- GIVEN `close_terminal` is called with `{ session_id: "sess-1", confirm: false }`
- WHEN the tool runs
- THEN no HTTP request is made
- AND the result is a dry-run object

#### Scenario: Missing session_id

- GIVEN `close_terminal` is called with `{ confirm: true }` and no `session_id`
- WHEN the tool runs
- THEN the result is `{ error: "missing required parameter: session_id" }`

### Requirement: `open_url` Validates URL and Scheme

`open_url` MUST validate the supplied `url` parameter using `new URL(url)`. The tool MUST accept ONLY URLs whose parsed `protocol` is `http:` or `https:`. Any other scheme — including `javascript:`, `data:`, `file:`, `vbscript:`, and `ftp:` — MUST be rejected with `{ error: "unsupported scheme: <scheme>" }`. A malformed URL (one that throws from `new URL(...)`) MUST be rejected with `{ error: "invalid url" }`.

After validation, the tool MUST hand off to the OS default browser. The tool MUST NOT write a temp file as a side channel.

#### Scenario: https URL is accepted

- GIVEN `open_url` is called with `{ url: "https://github.com/foo" }`
- WHEN the tool runs
- THEN the URL passes the scheme check (`https:`)
- AND the OS browser handler is invoked with that URL

#### Scenario: javascript: scheme is rejected

- GIVEN `open_url` is called with `{ url: "javascript:alert(1)" }`
- WHEN the tool runs
- THEN the result is `{ error: "unsupported scheme: javascript:" }`
- AND no browser process is spawned

#### Scenario: data: scheme is rejected

- GIVEN `open_url` is called with `{ url: "data:text/html,<script>1</script>" }`
- WHEN the tool runs
- THEN the result is `{ error: "unsupported scheme: data:" }`

#### Scenario: Malformed URL is rejected

- GIVEN `open_url` is called with `{ url: "not a url" }`
- WHEN the tool runs
- THEN the result is `{ error: "invalid url" }`

#### Scenario: No orphan temp file is written

- GIVEN `open_url` runs successfully with an https URL
- WHEN the tool completes
- THEN no file is created under `/tmp/devhub-*` as a side effect of the URL flow

### Requirement: File Tools Resolve Paths Against a Sandbox Root

`browse_files` and `review_log_file` MUST resolve any user/model-supplied path against `resolveProjectRoot()` before any filesystem access. The tool MUST reject any path that resolves outside the allow-list with `{ error: "path outside project root" }`.

`resolveProjectRoot()` MUST return `process.env.DEVHUB_PROJECT_ROOT` when set, otherwise `process.cwd()`. The allow-list MUST include:

- The resolved project root and any subpath of it.
- Any path under `<projectRoot>/.devhub/`.
- Any path matching `/tmp/devhub-*` (the devhub scratch space under `/tmp`).

Path resolution MUST use `path.resolve()` and the comparison MUST use a normalized prefix check on the resolved absolute path.

#### Scenario: Path inside project root is accepted

- GIVEN `resolveProjectRoot()` returns `/home/me/project`
- WHEN `browse_files` is called with `{ action: "list", path: "/home/me/project/src" }`
- THEN the tool reads `/home/me/project/src` (or its sandbox-validated equivalent)
- AND does not return an "outside project root" error

#### Scenario: Path escape with `..` is rejected

- GIVEN `resolveProjectRoot()` returns `/home/me/project`
- WHEN `browse_files` is called with `{ action: "list", path: "/home/me/project/../etc" }`
- THEN the tool resolves the path to `/home/me/etc`
- AND the result is `{ error: "path outside project root" }`
- AND no filesystem read occurs

#### Scenario: /etc/passwd is rejected

- GIVEN `resolveProjectRoot()` returns `/home/me/project`
- WHEN `browse_files` is called with `{ action: "read", path: "/etc/passwd" }`
- THEN the result is `{ error: "path outside project root" }`

#### Scenario: `.devhub/` subpath is allowed

- GIVEN `resolveProjectRoot()` returns `/home/me/project`
- WHEN `browse_files` is called with `{ action: "read", path: "/home/me/project/.devhub/state.json" }`
- THEN the path passes the sandbox check
- AND the read proceeds

#### Scenario: /tmp/devhub-* is allowed

- GIVEN a file exists at `/tmp/devhub-scratch/log.txt`
- WHEN `review_log_file` is called with `{ path: "/tmp/devhub-scratch/log.txt" }`
- THEN the path passes the sandbox check
- AND the tool returns the file's tail

#### Scenario: Arbitrary /tmp path is rejected

- GIVEN a file exists at `/tmp/some-other-tool/file.txt`
- WHEN `review_log_file` is called with `{ path: "/tmp/some-other-tool/file.txt" }`
- THEN the result is `{ error: "path outside project root" }`

### Requirement: `browse_files` Read Operation Truncates and Reports Line Count

`browse_files` with `action: "read"` MUST truncate the file content to a maximum of 4096 bytes. The returned result MUST include both the truncated content and the total line count of the full file (not the truncated chunk).

If the file does not exist, the tool MUST return `{ error: "file not found" }`. If the resolved path is a directory, the tool MUST return `{ error: "path is a directory" }`.

#### Scenario: Read returns content and line count

- GIVEN a file at the sandbox-allowed path contains 1000 lines
- WHEN `browse_files` is called with `{ action: "read", path: "<that file>" }`
- THEN the result includes `content` of at most 4096 bytes
- AND the result includes `line_count: 1000`

#### Scenario: Read of large file is truncated to 4KB

- GIVEN a file at the sandbox-allowed path is 20KB
- WHEN `browse_files` is called with `{ action: "read", path: "<that file>" }`
- THEN the returned `content` is at most 4096 bytes
- AND the line count reflects the full file, not the truncated chunk

#### Scenario: Read of directory

- GIVEN the path resolves to a directory
- WHEN `browse_files` is called with `{ action: "read", path: "<that dir>" }`
- THEN the result is `{ error: "path is a directory" }`

#### Scenario: Read of missing file

- GIVEN the path resolves to a non-existent file
- WHEN `browse_files` is called with `{ action: "read", path: "<missing>" }`
- THEN the result is `{ error: "file not found" }`

### Requirement: `delegate_to_opencode` Continues to Use the Existing tmux Approach

`delegate_to_opencode` MUST continue to delegate work to opencode via a tmux session, matching the existing behavior. The tool MUST accept a `task` parameter and create a detached tmux session that runs opencode with that task.

The tool SHOULD return a result that includes the created session id so the model can refer to it later. This requirement exists to lock in the current behavior — no behavioral change is required beyond any incidental fix-ups called out in the proposal.

#### Scenario: Delegation creates a tmux session

- GIVEN the OS has `tmux` available
- WHEN `delegate_to_opencode` is called with `{ task: "run the test suite" }`
- THEN a tmux session is created with opencode running the given task
- AND the result includes a `session_id` string

### Requirement: `get_swarm_status` Reads the `swarm_missions` Table

`get_swarm_status` MUST read from the `swarm_missions` table in the local database. When no active mission exists, the tool MUST return a result whose `swarm_status` field is the string `"no_active_mission"`. When the table query fails (e.g. table does not exist), the tool MUST return `{ error: <string> }` and MUST NOT crash the chat loop.

#### Scenario: Active mission present

- GIVEN the `swarm_missions` table contains a row with status `running`
- WHEN `get_swarm_status` is called
- THEN the result reflects that row's data
- AND the `swarm_status` field is not `"no_active_mission"`

#### Scenario: No active mission

- GIVEN the `swarm_missions` table is empty
- WHEN `get_swarm_status` is called
- THEN the result's `swarm_status` equals `"no_active_mission"`

#### Scenario: Missing table returns error result

- GIVEN the `swarm_missions` table does not exist in the DB
- WHEN `get_swarm_status` is called
- THEN the tool returns `{ error: <string> }`
- AND the chat loop continues with that error visible to the model
