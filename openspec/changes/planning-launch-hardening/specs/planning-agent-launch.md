# Delta Spec: planning-agent-launch

## Type: NEW

Introduces the dedicated planning launch surface (prompt builder, shell command, dispatch, gate skip) that replaces the planning path's accidental dependency on the DocOps/SDD orchestrator wrapper. Mirrors `openspec/changes/planning-launch-hardening/proposal.md` FR-PL01, FR-PL02, FR-PL03, FR-PL06, FR-PL07.

## Purpose

Launch a planning agent into a terminal with the right prompt, environment, and close contract. The planning path operates the kanban through DevHub MCP (`get_project_context`, `bulk_create_milestones`, `bulk_create_tasks`, `update_project`); it MUST NOT inherit the DocOps/SDD gate language, the `/sdd-new` prefix, the `validate_topic_key` / `build_context_pack` refusal rule, the `update_task` close, or the missing `DEVHUB_PROJECT_ID` env. The dispatch MUST be reliable enough that a freshly-mounted `TerminalWorkspacesManager` listener still receives the `devhub:run-agent` event.

## ADDED Requirements

### Requirement: Planning launch uses dedicated prompt builder

The system SHALL build the planning kickoff prompt via `buildPlanningLaunchPrompt({ mode, projectId, projectName, documentationPolicy, hasExistingWork })` and MUST NOT call `buildDocOpsOrchestratorLaunchPrompt` on the planning path. The produced prompt SHALL wrap `buildPlanningKickoffPrompt(mode, …)` in an envelope whose first line is `[DevHub Planning Agent]` and that lists the mandatory MCP sequence: `1. get_project_context({ project_id: "<uuid>" })`, `2. bulk_create_milestones + bulk_create_tasks`, `3. update_project({ project_id: "<uuid>", planning_status: "completed" })`. The produced prompt SHALL NOT contain the literal substrings `validate_topic_key`, `build_context_pack`, or `/sdd-new`; the builder MUST treat their presence as a hard failure of the unit test, not a soft warning.

#### Scenario: Prompt envelope includes mandatory MCP sequence

- GIVEN `buildPlanningLaunchPrompt({ mode: 'initial', projectId: 'p-1', projectName: 'Demo', documentationPolicy: 'shared', hasExistingWork: false })`
- WHEN the prompt is built
- THEN the first line equals `[DevHub Planning Agent]`
- AND the body contains the literal `get_project_context({ project_id: "p-1" })`
- AND the body contains `bulk_create_milestones` and `bulk_create_tasks`
- AND the body contains `update_project({ project_id: "p-1", planning_status: "completed" })`

#### Scenario: Prompt omits DocOps tokens and /sdd-new prefix

- GIVEN the same builder call as above
- WHEN the prompt is built
- THEN the body does NOT contain the substring `validate_topic_key`
- AND the body does NOT contain the substring `build_context_pack`
- AND the body does NOT contain the substring `/sdd-new`

#### Scenario: Replan mode preserves close contract

- GIVEN `buildPlanningLaunchPrompt({ mode: 'replan', projectId: 'p-2', projectName: 'Demo', documentationPolicy: 'shared', hasExistingWork: true })`
- WHEN the prompt is built
- THEN the envelope close instruction is still `update_project({ project_id: "p-2", planning_status: "completed" })`
- AND no `update_task` instruction appears anywhere in the body

### Requirement: Planning launch sets DEVHUB_PROJECT_ID env

The system SHALL prepend `export DEVHUB_PROJECT_ID="<projectId>"` to every shell command produced for the planning path, and the value SHALL be quoted with `shellQuotePrompt` (or the equivalent JSON-stringify quoter in `docopsPrompts.js`). The builder SHALL validate that `<projectId>` matches a UUID v4 pattern before quoting; on mismatch the builder SHALL throw with a clear message and MUST NOT produce a shell command. The `<projectId>` literal MUST appear in the command string as the value of `DEVHUB_PROJECT_ID=`, in addition to appearing inside the prompt body, so the launched agent can read it from the environment without parsing the prompt.

#### Scenario: Command exports DEVHUB_PROJECT_ID before opencode

- GIVEN `buildPlanningLaunchCommand({ mode: 'initial', projectId: '11111111-1111-4111-8111-111111111111', projectName: 'Demo', documentationPolicy: 'shared', hasExistingWork: false })`
- WHEN the command is built
- THEN the command starts with `export DEVHUB_PROJECT_ID="11111111-1111-4111-8111-111111111111"`
- AND `&&` separates the export from the `opencode --agent ... --prompt ...` invocation
- AND the prompt argument is wrapped with `shellQuotePrompt` (JSON-stringified)

#### Scenario: Non-UUID projectId is rejected before shell command is built

- GIVEN a `projectId` of `'not-a-uuid'`
- WHEN `buildPlanningLaunchCommand` is called
- THEN the builder throws
- AND no shell command string is returned
- AND the thrown message identifies the offending `projectId` value

#### Scenario: Prompt in command contains the project id twice

- GIVEN a valid `projectId` of `'22222222-2222-4222-8222-222222222222'`
- WHEN the command is built
- THEN the literal string `22222222-2222-4222-8222-222222222222` appears at least twice in the command: once as the env-var value and once inside the prompt body

### Requirement: Planning launch closes via update_project only

The system SHALL instruct the agent to close the planning run with a single `update_project({ project_id, planning_status: "completed" })` call. The system MUST NOT inject any `update_task(status='completed')` instruction into the planning prompt, and MUST NOT pass a `telemetryId` (or equivalent field that triggers the `update_task` branch of `buildDocOpsGatePrompt`) into any planning-path builder. The dispatched `devhub:run-agent` event detail MAY include a `taskId` derived from `projectId` for `devhub_agent_runs` audit purposes, but the prompt body MUST not instruct the agent to mutate that row.

#### Scenario: Prompt close instruction is update_project, not update_task

- GIVEN any mode (`initial`, `continue`, `replan`) and any `hasExistingWork` value
- WHEN `buildPlanningLaunchPrompt` is built
- THEN the prompt contains `update_project({ project_id: "<uuid>", planning_status: "completed" })`
- AND the prompt does NOT contain `update_task`

#### Scenario: No telemetryId is passed to the prompt builder

- GIVEN `launchPlanningAgent` is invoked for the planning path
- WHEN the call chain reaches the new builders
- THEN no `telemetryId` is forwarded to `buildPlanningLaunchPrompt`
- AND `buildDocOpsGatePrompt` is not in the call chain

### Requirement: Planning launch uses reliable dispatch (no setTimeout race)

The system SHALL dispatch the `devhub:run-agent` event through `dispatchPlanningAgentRun(detail)` and SHALL retry the dispatch on a fixed interval until the listener accepts the event, the maximum number of attempts is reached, or the originating component unmounts. The dispatcher MUST NOT rely on a single `setTimeout(150)` hop between `navigate('/terminales')` and `window.dispatchEvent`; that race is the bug being eliminated. The `MAX_ATTEMPTS` and `RETRY_MS` values SHALL be exposed as named constants on the dispatcher module so unit tests can drive a fake clock and assert the bounded behavior.

#### Scenario: Dispatch fires the event at least once

- GIVEN a `detail` object `{ command, selectedAgent, launchOrigin: 'planning-launch', promptSummary }`
- WHEN `dispatchPlanningAgentRun(detail)` is called
- THEN `window.dispatchEvent` (or its mocked equivalent) is invoked at least once with a `CustomEvent` of type `devhub:run-agent`
- AND the `detail` carried on the event equals the input

#### Scenario: Dispatch retries while no listener accepts

- GIVEN no listener is registered for `devhub:run-agent`
- WHEN `dispatchPlanningAgentRun(detail)` is called with a fake clock
- THEN the dispatcher attempts the dispatch up to `MAX_ATTEMPTS` times
- AND consecutive attempts are spaced approximately `RETRY_MS` apart
- AND the function returns without throwing

#### Scenario: Dispatch stops retrying once accepted

- GIVEN a listener is registered on the first attempt that synchronously marks the detail as accepted
- WHEN `dispatchPlanningAgentRun(detail)` is called
- THEN no further attempts are made after acceptance
- AND the total number of `dispatchEvent` calls equals the number needed for acceptance (1 in the happy case)

### Requirement: Planning launch skips DocOps gate in terminal handler

The system SHALL, in `TerminalWorkspacesManager.handleRunAgent`, skip the `enforceDocOpsGateOnLaunchCommand` call when the dispatched event's `launchOrigin === 'planning-launch'`. The skip MUST be scoped to that one `launchOrigin` value; the swarm path (`launchOrigin === 'swarm-control-launch'`) MUST keep the gate, and the reopen-session path (`launchOrigin === 'reopen-session'` or undefined) MUST keep the gate. The system MUST NOT modify `enforceDocOpsGateOnLaunchCommand`, `isDocOpsPlanningPrompt`, or any other symbol in `src/lib/docopsPrompts.js`; the skip lives in the terminal handler, not in the gate function.

#### Scenario: handleRunAgent with planning-launch skips the gate

- GIVEN `handleRunAgent` is invoked with `{ command, launchOrigin: 'planning-launch', selectedAgent, promptSummary }`
- WHEN the handler decides which command to run
- THEN the value passed to `handleSplit` equals the input `command` verbatim
- AND `enforceDocOpsGateOnLaunchCommand` is NOT invoked

#### Scenario: handleRunAgent with swarm-control-launch keeps the gate

- GIVEN `handleRunAgent` is invoked with `{ command, launchOrigin: 'swarm-control-launch', selectedAgent, promptSummary }`
- WHEN the handler decides which command to run
- THEN `enforceDocOpsGateOnLaunchCommand(command)` is invoked
- AND the value passed to `handleSplit` is the gate's return value

#### Scenario: Reopen-session path keeps the gate

- GIVEN `handleRunAgent` is invoked with `{ command, launchOrigin: 'reopen-session', selectedAgent, promptSummary }` (or with no `launchOrigin` at all)
- WHEN the handler decides which command to run
- THEN `enforceDocOpsGateOnLaunchCommand(command)` is invoked
- AND the planning-skip branch is NOT taken
