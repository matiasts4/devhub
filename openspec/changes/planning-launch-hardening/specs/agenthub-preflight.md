# Delta Spec: agenthub-preflight

## Type: NEW

Introduces the async preflight that `Planificacion.jsx` runs before launching a planning agent. The preflight validates infrastructure readiness (OpenCode process, LLM provider, DevHub MCP planning tools, project context) and blocks the launch when any blocking check fails. Mirrors `openspec/changes/planning-launch-hardening/proposal.md` FR-PL04, FR-PL05, and the new `GET /api/agenthub/llm/status` route.

## Purpose

Validate infrastructure readiness (OpenCode + LLM + DevHub MCP) before launching the planning agent. Replace the synchronous guard `!planningPrompt && files.length === 0` with an async check matrix that returns `{ ok, checks[] }` and a Spanish message list the UI can render. A failing preflight MUST short-circuit the launch before `navigate('/terminales')` and before `launchPlanningAgent` is invoked.

## ADDED Requirements

### Requirement: Preflight blocks launch when OpenCode is down

The system SHALL call `GET /api/agenthub/opencode/status` and treat the response's `process.running` and `process.healthy` fields as the authoritative OpenCode liveness signal. When `process.running === false` OR `process.healthy === false`, the preflight SHALL mark the OpenCode check as `ok: false, level: 'error'` and the overall result as `ok: false`. The launch MUST be blocked in that case.

#### Scenario: OpenCode down blocks the launch

- GIVEN `GET /api/agenthub/opencode/status` returns `{ process: { running: false, healthy: false, status: 'offline' }, ... }`
- WHEN `validatePlanningLaunch({ projectId, documentationPolicy, localPath, hasContext })` resolves
- THEN the result `ok` is `false`
- AND the `checks` array contains an entry with `id: 'opencode'`, `ok: false`, `level: 'error'`, and a Spanish message that mentions OpenCode

#### Scenario: OpenCode healthy passes the check

- GIVEN `GET /api/agenthub/opencode/status` returns `{ process: { running: true, healthy: true, status: 'healthy' }, concurrency: { atLimit: false }, ... }`
- WHEN the preflight resolves
- THEN the `opencode` check entry has `ok: true, level: 'info'` (or `ok: true, level: 'ok'`)

### Requirement: Preflight blocks launch when LLM provider missing

The system SHALL call `GET /api/agenthub/llm/status` and treat the response as the authoritative LLM readiness signal. The endpoint SHALL return `{ ready, provider, reason }`. When `ready === false`, the preflight SHALL mark the LLM check as `ok: false, level: 'error'` and the overall result as `ok: false`. The launch MUST be blocked in that case.

#### Scenario: New /api/agenthub/llm/status route returns ready shape

- GIVEN the provider config has at least one provider with `enabled !== false` and the minimum required fields
- WHEN `GET /api/agenthub/llm/status` is called
- THEN the response is `200` with body `{ ready: true, provider: '<key>', reason: null }`

#### Scenario: No enabled provider returns ready false

- GIVEN the provider config has no provider with `enabled !== false`
- WHEN `GET /api/agenthub/llm/status` is called
- THEN the response is `200` with body `{ ready: false, provider: null, reason: '<spanish reason>' }`
- AND no provider key is leaked in the response

#### Scenario: LLM status endpoint is unit-testable

- GIVEN a test injects a fake provider config
- WHEN the route handler runs
- THEN it produces the shape above without performing any I/O beyond reading the in-memory config

### Requirement: Preflight blocks launch when DevHub MCP lacks planning tools

The system SHALL call `GET /api/agenthub/mcp/status` (which returns the `assembleMcpControlCenterSnapshot(...)` JSON) and assert that `list_tools.tools` (or the equivalent grouped `servers[*].tools[*]` projection) contains the four planning tool names: `get_project_context`, `bulk_create_milestones`, `bulk_create_tasks`, `update_project`. When any of the four is missing, the preflight SHALL mark the MCP check as `ok: false, level: 'error'` and the overall result as `ok: false`. The launch MUST be blocked in that case.

#### Scenario: MCP snapshot with all four planning tools passes the check

- GIVEN `GET /api/agenthub/mcp/status` returns a snapshot whose flat tool list contains `get_project_context`, `bulk_create_milestones`, `bulk_create_tasks`, and `update_project`
- WHEN the preflight resolves
- THEN the `mcp` check entry has `ok: true`

#### Scenario: Missing get_project_context blocks the launch

- GIVEN the snapshot's tool list does NOT contain `get_project_context` (other planning tools may be present)
- WHEN the preflight resolves
- THEN the result `ok` is `false`
- AND the `mcp` check entry has `ok: false, level: 'error'` and a Spanish message that names the missing tool

#### Scenario: MCP endpoint unreachable blocks the launch

- GIVEN `GET /api/agenthub/mcp/status` rejects (network error, 5xx, or `reachable: false` in the live probe)
- WHEN the preflight resolves
- THEN the result `ok` is `false`
- AND the `mcp` check entry has `ok: false, level: 'error'`

### Requirement: Preflight returns actionable errors in Spanish

The system SHALL surface every check entry's `message` field in Spanish, with concrete next-step guidance (e.g. *“OpenCode no está corriendo. Inicialo desde Ajustes → Swarm antes de planificar.”*). The first failing `error`-level check's `message` SHALL be the one shown to the user when the UI renders a blocking toast or modal. The full `checks[]` array SHALL be available to the UI for a richer matrix view (modal), but the minimum-blocking contract is a single Spanish sentence per blocking failure.

#### Scenario: First failing error is the one surfaced

- GIVEN the OpenCode check fails AND the MCP check fails
- WHEN the UI reads `result.checks`
- THEN the first entry with `ok: false, level: 'error'` is the OpenCode check
- AND its `message` is non-empty, in Spanish, and mentions the next action (e.g. start OpenCode)

#### Scenario: Every error message is in Spanish and actionable

- GIVEN the preflight result `result.checks` where any entry has `ok: false, level: 'error'`
- WHEN each entry's `message` is inspected
- THEN it is a non-empty string written in Spanish
- AND it names the failing subsystem AND the concrete next step the user can take

### Requirement: Preflight surfaces warnings without blocking

The system SHALL support `level: 'warn'` entries in `checks[]` for non-blocking conditions (e.g. concurrency at limit, missing `local_path`, `documentation_policy: 'missing'`). A `warn` entry SHALL NOT cause `result.ok` to be `false`. The launch MAY proceed when only warnings are present; the UI MAY render warnings inline (e.g. a per-check chip) without blocking the button.

#### Scenario: Concurrency at limit is a warning, not a block

- GIVEN `GET /api/agenthub/opencode/status` returns `{ process: { running: true, healthy: true }, concurrency: { atLimit: true }, ... }`
- WHEN the preflight resolves
- THEN the `opencode` (or a derived `concurrency`) check entry has `level: 'warn'`
- AND `result.ok` is `true`

#### Scenario: Missing local_path is a warning, not a block

- GIVEN `validatePlanningLaunch({ projectId, localPath: '', hasContext: true, ... })`
- WHEN the preflight resolves
- THEN a check entry with `id: 'local-path'` (or equivalent) has `level: 'warn'`
- AND `result.ok` is `true`
