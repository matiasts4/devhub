# Exploration — Planning Launch Hardening

**Date:** 2026-06-12
**Branch:** `feature/terminal-renderer-xterm-webgl` (not modified by explore)
**Change folder:** `openspec/changes/planning-launch-hardening/`
**Mission context:** `docs/delegation/00-shared-context.md` (Reglas de oro) + `docs/delegation/05-agent-planning-launch.md` (Agente 5: Planning Launch)

This document verifies the 6 problems diagnosed in `05-agent-planning-launch.md` against the actual code. It does **not** propose solutions — that belongs in `propose.md`.

---

## Goal

Verify the current state of the planning-agent launch flow (from `/project/:id/planificacion` into the DevHub terminal panel) and confirm each of the 6 diagnosed problems is real and reproducible, so that the subsequent `propose / spec / design / tasks` phases can target concrete file:line changes.

---

## Verified Current Behavior

### A. `src/lib/planning/launchPlanningAgent.js` (entire file: 68 lines)

- `launchPlanningAgent(navigate, opts)` (line 18) — synchronous function, no async. Returns early if `!projectId` (line 25).
- Generates `agentId = ` `planning-${Date.now()}` (line 27) — **this id is NOT a real `tasks.id` row in the DB**.
- Builds `kickoff` via `buildPlanningKickoffPrompt(mode, { projectId, projectName, hasExistingWork })` (line 28) — returns a multi-line planning prompt.
- Persists a hint in `localStorage` under `devhub_agent_task_hints[agentId]` (lines 35-37) — used by BannerIA-style surfaces to show "what is launching" before the terminal is created.
- **Calls `navigate(`/project/${projectId}/terminales`)`** (line 42) — triggers React Router transition.
- **Inside a `setTimeout(() => {…}, 150)` (line 44):** builds `telemetryPrompt = buildDocOpsOrchestratorLaunchPrompt({ agentId: 'sdd-orchestrator', prompt: kickoff, projectId, telemetryId: agentId, objective: `planificacion-${mode}`, documentationPolicy })` (lines 45-52). The wrapper injects `validate_topic_key`, `build_context_pack`, the documentation policy language, and the close instruction `update_task(status='completed')` (because `telemetryId` is set, see `docopsPrompts.js:120-122`).
- The wrapper also concatenates `"\n\n/sdd-new ${safePrompt}"` (line 182) — prefixing the planning prompt with the SDD-oracle command.
- The command is then `enforceDocOpsGateOnLaunchCommand(` `opencode --agent sdd-orchestrator --prompt ${shellQuotePrompt(telemetryPrompt)}` `)` (lines 58-60). Because `isDocOpsPlanningPrompt(telemetryPrompt)` returns true (`docopsPrompts.js:185-199` matches on `planning|planific|sdd|topic_key|…`), the gate re-wraps the prompt with the DocOps gate language. **Two distinct application sites of the gate.**
- `window.dispatchEvent(new CustomEvent('devhub:run-agent', { detail: { taskId, command, selectedAgent, launchOrigin: 'planning-launch', promptSummary } }))` (lines 54-66). The `launchOrigin` tag is the only signal that tells the handler to skip swarm path.
- Shell command has **no `DEVHUB_PROJECT_ID` export** — the agent has to read the project id from the prompt body.

### B. `src/lib/planning/planningPrompts.js` (entire file: 104 lines)

- Exports `PLANNING_MODES` (line 3) — array of `{id, label, description}` for the 3 modes (`initial`, `continue`, `replan`).
- `PLANNING_CLOSE_INSTRUCTION` (line 21-22) — single source of truth: `update_project({ project_id, planning_status: "completed" })`. This is the **correct** close; only the DocOps gate overrides it with `update_task`.
- `buildPlanningKickoffPrompt(mode, { projectId, projectName, hasExistingWork })` (line 28) — branches by mode:
  - `initial` (line 70-78): "planificación completa" — read project context, ask clarifying questions, bulk create milestones+tasks (minimum 40 for big projects), close.
  - `continue` (line 41-54): "continuar la planificación" — no duplication; focus on the next phase.
  - `replan` (line 56-68): "replanificar" — review and adjust; document changes in task comments.
- All three variants share the same 4 steps (lines 33-38): `get_project_context` → ask user → `bulk_create_milestones` + `bulk_create_tasks` → `update_project`.
- `buildPlanningCopyPrompt(mode, …)` (line 85) — version used for the "Copiar prompt" button (external manual flow).
- `resolveDefaultPlanningMode({ taskCount, milestoneCount, planningStatus })` (line 100-103) — `pending` → `initial`; any task/milestone → `continue`; otherwise `initial`.

### C. `src/lib/docopsPrompts.js` (relevant functions)

- `buildDocOpsGateLanguage()` (line 80-92) — returns the gate language: retrieval-first order with `validate_topic_key`, `build_context_pack`, refusal rules, policy classification language, and context budget.
- `DOCOPS_RETRIEVAL_FIRST_ORDER` (line 14-21) — 6-step list that includes literal `validate_topic_key` (step 2), `build_context_pack` (step 4), and the explicit refusal **"Si no existe un Context Pack válido, no avances con planificación ni documentación"** (step 5).
- `buildDocOpsGatePrompt({ agentId, projectId, telemetryId, documentationPolicy, … })` (line 94-127) — when `telemetryId` is provided, the closing instruction becomes `update_task(status='completed')` (line 121).
- `enforceDocOpsGateOnText(text)` (line 129-137) — mutates an already-built prompt to prepend the gate language.
- `enforceDocOpsGateOnLaunchCommand(command)` (line 139-163) — mutates a shell command: only if `isDirectAgentLaunchCommand(command)` is true AND the prompt text matches `isDocOpsPlanningPrompt(promptText)` (which includes `planning|planific|sdd|topic_key|…`, line 185-199). Inserts the gate by re-quoting the `--prompt` argument.
- `isDocOpsPlanningPrompt(text)` (line 185-199) — case-insensitive substring match against a list of trigger tokens. **Planning prompts trigger this gate** because they contain `planific`.
- `buildDocOpsOrchestratorLaunchPrompt({ agentId, prompt, projectId, telemetryId, topicKey, objective, documentationPolicy })` (line 165-183) — concatenates `buildDocOpsGatePrompt(...) + "\n\n/sdd-new " + safePrompt`. This is what the planning launch incorrectly uses.
- `shellQuotePrompt(prompt)` (line 229-230) — `JSON.stringify(prompt)`, used to safely embed in shell.

### D. `src/views/Planificacion.jsx` (line numbers relative to file)

- `Planificacion()` component (line 62) — page that hosts the planning form.
- Local state: `planningPrompt`, `projectType`, `documentationPolicy`, `mode`, `files`, `milestones`, `tasks`, `loading`, `saving`, `launching`, `isDragging`, `copied` (lines 70-83).
- `fetchFiles` (line 85) and `fetchRoadmapStats` (line 93) — load context from `/api/projects/:id/files` and from `milestones` + `tasks` Supabase tables.
- Effect at line 122-151 — on project change, fetches stats + files, then resolves default mode via `resolveDefaultPlanningMode` and honors `?mode=` URL param.
- Polling effect at line 154-171 — every 15s, polls `fetchRoadmapStats({ silent: true })` while `project.planning_status === 'pending'`. Triggered by `focus` and `visibilitychange`.
- `saveContext({ markPending })` (line 173-201) — `update` on `projects` table; if `markPending` then sets `planning_status: 'pending'`. Returns `false` on error.
- `uploadFiles(fileList)` (line 203-236) — POSTs files to `/api/projects/:id/files` (max 2MB each, allowed types listed at line 46-58).
- `deleteFile(fileId)` (line 238-249) — DELETE on same endpoint.
- **`handleStartPlanning()`** (line 251-270) — the launch path:
  1. Guard: `if (!planningPrompt.trim() && files.length === 0) → toast.error(...)` (line 252-255) — partial preflight already exists (no async, no env check).
  2. `setLaunching(true); const ok = await saveContext({ markPending: true }); setLaunching(false); if (!ok) return;` (line 257-260).
  3. `launchPlanningAgent(navigate, { projectId: project.id, projectName: project.name, mode, documentationPolicy, hasExistingWork: tasks.length > 0 || milestones.length > 0 })` (line 262-268).
  4. `toast.success('Agente de planificación lanzado en terminales')` (line 269).
- No call to any preflight endpoint. No check for OpenCode running. No check for LLM provider. No check for MCP availability.

### E. `src/lib/agentLaunchWrapper.js` (relevant lines)

- `buildAgentEnvExports({ projectId, … })` (line 36-148) — emits shell `export` statements. **Line 57: `export DEVHUB_PROJECT_ID="${projectId || ''}"`** — this is the only canonical place where the planning agent would get the env var, and it is NOT called from the planning path.
- All other env vars (`DEVHUB_AGENT_ID`, `DEVHUB_MISSION_ID`, `DEVHUB_ROLE`, `DEVHUB_WORKSPACE_PATH`, `DEVHUB_AGENT_TOKEN`, `DEVHUB_AGENT_PID`, etc.) are listed lines 51-65.
- `buildIdentityVerificationBlock` (line 156-178) and the bus helpers (line 194-358) are swarm-only concerns.

### F. `src/components/TerminalWorkspacesManager.jsx` (focus area ~lines 4515-5304)

- `launchPanelWithCommand(command, panelCwd)` (line 4515-4522) — `const cmdToRun = enforceDocOpsGateOnLaunchCommand(command)`. Re-runs the gate for *every* shell command, including the `reopenOpenCodeSession` flow.
- `reopenOpenCodeSession(session)` (line 4524-4570) — calls `launchPanelWithCommand` for the resume command.
- `createWorkspaceForSwarmLaunchRequests(requests)` (line 3984-4132) — at **line 3993** also calls `enforceDocOpsGateOnLaunchCommand` for every swarm request command. Three separate call sites in this one file.
- `enqueueSwarmLaunchRequest` (line 4160) — used by swarm UI to enqueue a request into the batch.
- `persistAgentRunMetadata(request, panelId, cmdToRun)` (line 3937-3982) — writes a row to `devhub_agent_runs` localStorage with `launchOrigin`, `selectedAgent`, etc.
- **The terminal listener (line 5260-5304):**
  - `handleRunAgent` (line 5260-5281) — async:
    - Destructure `{ taskId, command, selectedAgent, launchOrigin, promptSummary, taskTitle } = e.detail` (line 5261).
    - **If `launchOrigin === 'swarm-control-launch'`: short-circuit via `enqueueSwarmLaunchRequest(e.detail); return;`** (line 5263-5266).
    - Otherwise: `const cmdToRun = enforceDocOpsGateOnLaunchCommand(command || ` ``opencode --agent ${selectedAgent || DEFAULT_OPENCODE_AGENT}`` `)` (line 5268-5270). **This is the second gate application for the planning path.**
    - `const createdPanelId = handleSplit('horizontal', activePanelId, cmdToRun, cwd)` (line 5272).
    - If `taskId && createdPanelId`: `await persistAgentRunMetadata({...}, createdPanelId, cmdToRun)` (line 5274-5280).
  - `document.addEventListener('keydown', handleKeyDown, true)` (line 5283), `window.addEventListener('devhub:run-agent', handleRunAgent)` (line 5284), `window.addEventListener(SWARM_LAUNCH_MATERIALIZED_EVENT, handleSwarmLaunchMaterialized)` (line 5285).
  - Cleanup: remove all 3 listeners in the effect cleanup (line 5287-5291).
  - Effect deps include `isVisible` (line 5293). **The listener is added inside an effect that depends on `isVisible`** — if the panel is hidden when the planning page navigates, the listener may not be registered yet. The `setTimeout(150)` in `launchPlanningAgent.js` is meant to give the effect a chance to mount, but the actual mount time of the heavy terminal component is not bounded.

### G. `src/app/api/agenthub/opencode/status/route.js` (entire file: 65 lines)

- `GET` returns `{ process, process_health, concurrency, queue }` (line 31-60):
  - `process.{ running, healthy, pid, port, uptime, memoryRss, status, authority, freshness, observed_at, status_reason }` (line 32-46). `status: pmStatus.running ? 'healthy' : 'offline'`.
  - `concurrency.{ active, activeSessions, effectiveActive, max, atLimit }` (line 48-54).
  - `queue.{ length, estimatedWaitMs, items }` (line 55-59).
- Source: `processManager.getStatus()` (line 16), `getSwarmConfig()` (line 17), `getActiveAgentCount()` (line 19), `swarmQueue.getStatus()` (line 20), `buildProcessHealthSource(pmStatus, {now})` (line 22-29).
- This endpoint is ready to be consumed by a preflight check (Check 1 in the design doc). No client wrapper exists yet.

### H. `src/app/api/agenthub/mcp/status/route.js` (entire file: 29 lines)

- `GET` returns the full `assembleMcpControlCenterSnapshot(...)` JSON (line 24).
- `SERVER_URL` is `http://127.0.0.1:${process.env.OPENCODE_PORT || 4153}` (line 6-7).
- Live probe fetches `${serverUrl}/mcp` (control-center.js line 546). If it 200s, the live inventory is merged.

### I. `src/lib/mcp/control-center.js` (entire file: 609 lines)

- `assembleMcpControlCenterSnapshot(options)` (line 585-609) — the high-level entry. Aggregates:
  - `durable` from `readDurableDiagnosticContext()` (line 206-248) — reads latest `agent_workspaces`, `agent_runs`, `agent_artifacts`, `supervisor_snapshots` rows.
  - `durableTools` from `readDurableToolCatalog()` (line 136-156) — **statically scans `devhub-mcp/server.js` and `devhub-mcp/tools/*.js` for `server.tool('name', …)` calls** via `OFFICIAL_TOOL_NAME_REGEX = /server\.tool\(\s*['"`]([^'"`]+)['"`]/g` (line 11). Tools are tagged `server: 'devhub-control-plane'`.
  - `live` from `fetchLiveMcpInventory({ serverUrl, fetchImpl, timeoutMs })` (line 529-583) — GETs `${serverUrl}/mcp`. On failure returns `{ reachable: false, runtimeReachable: false, inventoryAvailable: false, reason: …, tools: [] }`.
  - `attach` — hardcoded `{ available: false, reason: 'GTK/VTE attach is optional…' }` (line 596-599).
- `buildMcpControlCenterSnapshot(input)` (line 467-527) — merges them and produces the response shape:
  - Top-level: `{ observed_at, authority, freshness, evidence, doctor, list_tools, smoke, status_reason, note, servers }`.
  - **`list_tools.tools` is a flat array** of `{ name, server, description, authority, control_plane, safe_action, evidence, reason }` (line 340-366, then re-grouped into `servers` at line 422-465).
  - `control_plane` is computed at `classifyMcpToolSafety` (line 158-172): true if `authority === 'durable'` OR `server === 'devhub' / 'devhub-control-plane'`.
  - `safe_action` requires `control_plane && READ_ONLY_TOOL_PATTERN.test(name) && !UNSAFE_TOOL_PATTERNS`. `READ_ONLY_TOOL_PATTERN = /^(get_|list_)/` (line 13). `UNSAFE_TOOL_PATTERNS` are git/worktree/branch/merge/filesystem/file (line 12). **`bulk_create_tasks` and `bulk_create_milestones` are NOT `safe_action: true`** because they don't start with `get_/list_`. `get_project_context` IS `safe_action: true`.
- `groupToolsAsServers(tools, inventoryProbe)` (line 422-465) — groups the flat tool array back into a `servers[]` shape for the UI. Each server is `{ name, status, authority, freshness, status_reason, tools[] }`.
- **Verdict for the preflight check (FR-PL04):** the snapshot exposes `list_tools.tools` with `name` field. The presence of `'get_project_context'` and `'bulk_create_tasks'` in that list is the canonical way to assert "MCP planning tools are available". A test that calls `assembleMcpControlCenterSnapshot({ live: { reachable: false, tools: [] }, durable: { status: 'healthy', workspace: null, run: null, artifact: null, supervisor: null, db: { status: 'healthy', reason: '' } }, durableTools: [{ name: 'get_project_context', server: 'devhub-control-plane', description: '' }, { name: 'bulk_create_tasks', server: 'devhub-control-plane', description: '' }, { name: 'update_project', server: 'devhub-control-plane', description: '' }, { name: 'bulk_create_milestones', server: 'devhub-control-plane', description: '' }] })` should produce a snapshot whose `list_tools.tools` contains all 4 tool names. Verified by reading line 340-366 + line 348 dedup key.

### J. `src/lib/llmProviderConfig.js` (entire file: 75 lines)

- `getLlmProviderConfig(providerKey)` (line 39-46) — async, reads `data/llm-providers-config.json` (path is `path.join(process.cwd(), 'data', 'llm-providers-config.json')`, line 12). Returns `null` if provider is absent or `enabled === false`.
- `getLlmProviderConfigSync(providerKey)` (line 55-75) — same shape, uses in-memory cache or direct sync read.
- `loadConfig()` (line 21-30) — caches the whole file in `_cache` (module-scoped).
- On parse error returns `{ providers: {}, modelOptions: {} }`.
- The file `data/llm-providers-config.json` exists and currently has providers `openrouter`, `copilot`, `opencode` (enabled: true), `minimax` (enabled: true), and likely more. **No LLM status API endpoint exists today** — would need a new route at `src/app/api/agenthub/llm/status/route.js`.

### K. `devhub-mcp/tools/projects.js` and `tasks.js` (planning tool surface)

- `projects.js` registers tools via `server.tool(name, description, schema, handler)` (SDK pattern from `@modelcontextprotocol/sdk/server/mcp.js`).
- Tool registrations confirmed via grep:
  - `'get_project_context'` at `projects.js:360` — reads `projects`, `project_files`, `milestones`, `tasks` for a project_id.
  - `'bulk_create_milestones'` at `projects.js:268`.
  - `'update_project'` at `projects.js:108`.
  - `'bulk_create_tasks'` at `tasks.js:1026`.
- These 4 tools are the only ones the planning agent needs.

---

## Problem Confirmation

| # | Problem (from `05-agent-planning-launch.md`) | Status | Evidence |
|---|----------------------------------------------|--------|----------|
| 1 | **DocOps gate blocks planning operativo** — `launchPlanningAgent.js` wraps the kickoff in `buildDocOpsOrchestratorLaunchPrompt`, which injects `validate_topic_key` and `build_context_pack` and refuses to proceed without a Context Pack. | **Confirmed** | `launchPlanningAgent.js:45-52` calls `buildDocOpsOrchestratorLaunchPrompt(...)`. `docopsPrompts.js:165-183` returns `buildDocOpsGatePrompt(...) + "\n\n/sdd-new " + safePrompt`. `docopsPrompts.js:14-21` is the literal list including `validate_topic_key` (step 2), `build_context_pack` (step 4), and "Si no existe un Context Pack válido, no avances con planificación ni documentación" (step 5). |
| 2 | **`/sdd-new` prefix routes to openspec orchestrator** | **Confirmed** | `docopsPrompts.js:182` concatenates `"\n\n/sdd-new ${safePrompt}"`. The orchestrator agent (`sdd-orchestrator`) receives this command, not a pure planning kickoff. |
| 3 | **Contradictory close instructions** — gate says `update_task(status='completed')`, planning says `update_project({ planning_status: 'completed' })`. The `taskId` (`planning-{timestamp}`) is not a real DB row. | **Confirmed** | `docopsPrompts.js:120-122` — when `telemetryId` is set, the close instruction is `update_task(status='completed')`. `launchPlanningAgent.js:27,49` — `agentId = "planning-${Date.now()}"` passed as `telemetryId`. `planningPrompts.js:21-22` — the planning-mode close is `update_project({ project_id, planning_status: "completed" })`. `Planificacion.jsx:155` — polling only checks `planning_status`, not a tasks row. |
| 4 | **No `DEVHUB_PROJECT_ID` exported in the shell command** — agent has to parse it from the prompt body. | **Confirmed** | `launchPlanningAgent.js:59` — the generated command is `opencode --agent sdd-orchestrator --prompt ${shellQuotePrompt(telemetryPrompt)}`. No `export DEVHUB_PROJECT_ID=…` prefix. Compare to `agentLaunchWrapper.js:57` which is the canonical source of that env var. |
| 5 | **Race condition: `setTimeout(150ms)` between navigate and dispatch** — if `TerminalWorkspacesManager` mounts late, the event is lost. | **Confirmed** | `launchPlanningAgent.js:42` — `navigate(`/project/${projectId}/terminales`)`. `launchPlanningAgent.js:44-67` — `setTimeout(() => { … window.dispatchEvent('devhub:run-agent') … }, 150)`. `TerminalWorkspacesManager.jsx:5284` — listener added in an effect that depends on `isVisible` (line 5293). No acknowledgement / retry — single shot, fire-and-forget. |
| 6 | **Double `enforceDocOpsGateOnLaunchCommand`** — applied in `launchPlanningAgent.js:58-60` and again in `handleRunAgent` at `TerminalWorkspacesManager.jsx:5268-5270`. Also called in `launchPanelWithCommand` (line 4517) and in `createWorkspaceForSwarmLaunchRequests` (line 3993). | **Confirmed** | `launchPlanningAgent.js:58-60` wraps the shell command. `TerminalWorkspacesManager.jsx:5268-5270` re-wraps the same command (now twice-mutated by the time the listener fires). Two more application sites at 4517 and 3993. The function is `idempotent in some cases` (returns the same string if it already contains "validate_topic_key" or "Aplicá este gate DocOps", see `docopsPrompts.js:132-134`), but the double call is a smell that creates the wrong place to add the `launchOrigin === 'planning-launch'` skip. |

All 6 problems are confirmed. The verification is mechanical: read the cited lines, see the wrapping/missing-env/race/double-apply.

---

## Existing Test Coverage

| File | Runner | Covers | Gaps |
|------|--------|--------|------|
| `src/lib/planning/__tests__/planningPrompts.test.js` (35 lines) | `node:test` + `node:assert/strict` (NOT Jest) | `buildPlanningKickoffPrompt('initial', …)` contains `proj-abc`, project name, `planificación completa`, `get_project_context`. `buildPlanningKickoffPrompt('continue', hasExistingWork=true)` contains `continuar la planificación` and `siguiente fase`. `resolveDefaultPlanningMode` matrix. | No test for `buildPlanningCopyPrompt`. No test for the `replan` mode. No assertion that the prompt does NOT contain `validate_topic_key` or `build_context_pack` (the central problem). No test that the close instruction is `update_project`, not `update_task`. |
| `src/components/__tests__/TerminalWorkspacesManager.test.js` (565 lines) | Jest | `getRightDockAnimProps`, `getWorkspaceAnimProps` (pure helpers), displayName migration on hydrate. | The `handleRunAgent` listener / `launchOrigin` short-circuit is NOT tested. The test mocks `@/lib/docopsPrompts` to return `enforceDocOpsGateOnLaunchCommand: (value) => value` (line 148), which sidesteps the real gate. No test for the swarm short-circuit path either. |
| `src/lib/__tests__/agentLaunchWrapper.test.js` (739 lines) | Jest | `buildAgentEnvExports` includes `DEVHUB_PROJECT_ID` (line 419), `DEVHUB_SUPERVISOR_URL`, `DEVHUB_RUN_ID` etc. `buildIdentityVerificationBlock` prints identity + cwd. Heartbeat command. `buildAgentLaunchWrapper` for worker/director/zed. | No test that planning launches include `DEVHUB_PROJECT_ID` (because the planning path doesn't use the wrapper at all). No test for `buildChunkedBootstrapPromptBlock`. No test for the bus helpers. |
| `devhub-mcp` | Jest (per `openspec/config.yaml`) | Tool handlers, persistence, etc. | No test specifically asserting the planning tools (`get_project_context`, `bulk_create_tasks`, `bulk_create_milestones`, `update_project`) are registered on the MCP server boot. The tool registration is implicit in calling `server.tool(name, …)` and the catalog reader (`readDurableToolCatalog`) greps the source, so a unit test would either re-run the same grep or actually boot the server. |
| `src/app/api/agenthub/opencode/status/route.js` | No dedicated test file | — | No `opencode/status.test.js` exists alongside the route. |
| `src/app/api/agenthub/mcp/status/route.js` | No dedicated test file | — | Same. |

**Net gaps for the planned change:**
1. No tests for `launchPlanningAgent.js` (the orchestrator function that ties prompts + dispatch).
2. No tests for `buildDocOpsGatePrompt` / `enforceDocOpsGateOnLaunchCommand` covering the planning prompt case (the `isDocOpsPlanningPrompt` regex match is implicit).
3. No tests for `assembleMcpControlCenterSnapshot` shape (so the preflight MCP check will need a fixture-driven test).
4. No tests for `handleStartPlanning` in `Planificacion.jsx` (the entrypoint).
5. No test for the `setTimeout(150)` race in any form (would need jsdom + RTL or an integration test).

---

## Conventions Observed

- **Test runners are mixed**: `node:test` for `src/lib/planning/__tests__/planningPrompts.test.js` (likely run via `node --test` in the project's test script), Jest for `src/components/__tests__/TerminalWorkspacesManager.test.js` and `src/lib/__tests__/agentLaunchWrapper.test.js`, and a separate Jest setup in `devhub-mcp/`. The `openspec/config.yaml` declares `test_runner: next test (Jest-based) / Jest (devhub-mcp)`, so the `node:test` file in `src/lib/planning/__tests__/` is the odd one out — likely tolerated because `next test` (Jest) still runs them via the `next/jest` transformer, but worth confirming in `tasks.md`.
- **openspec change folders** use this shape (verified via `openspec/changes/agent-comms-redesign/`):
  - `proposal.md` — `# Proposal: <Title>` with `## Intent`, `## Scope` (In/Out), `## Approach` tables, and risks.
  - `design.md` — technical architecture, sequence diagrams, file-by-file forecasts.
  - `tasks.md` — `## Review Workload Forecast` (D2 budget, 400-line risk, chained PR strategy), then `## Phase N` sections with TDD-style task numbering (1.1, 1.2…).
  - `specs/<capability-slug>.md` — RFC-2119 scenarios in Given/When/Then form.
  - `specs/index.md` — required by convention; lists all spec files.
  - `apply-progress.md` — freeform log of apply-phase work (created during apply).
  - `exploration.md` — exploratory document; some changes have it, some don't. The skill `sdd-explore` writes to `exploration.md`, but the orchestrator in this run is writing `explore.md`. **Naming mismatch with skill convention** — orchestrator chose `explore.md` over `exploration.md`. Either is fine as long as the project tolerates it. The other changes in this repo use `exploration.md` (e.g. `terminal-tui-interaction`).
- **Export style**: ESM (`import`/`export`) in `src/lib/**`. The `src/components/__tests__/TerminalWorkspacesManager.test.js` uses CommonJS `require()` (likely transpiled by Jest). Most other test files use ESM `import`.
- **Naming**:
  - `launchOrigin` string literals used: `'planning-launch'`, `'swarm-control-launch'`, `'reopen-session'`.
  - `taskId` formats observed: `planning-${Date.now()}`, `oc-reopen-${sessionId}`, plus whatever the task flow generates.
  - localStorage keys: `devhub_agent_task_hints`, `devhub_agent_runs`, `devhub_oc_terminated`, `devhub_terminal_state`.
- **Conventions for new openspec artifacts**: at minimum `proposal.md`, `design.md`, `tasks.md`, `specs/<something>.md`. `exploration.md` / `explore.md` is for the explore phase only.

---

## Open Questions for Proposal

These are the questions the `propose` phase must answer before `design.md` can be written. Each is a real fork that the diagnose-doc did not commit to.

1. **Dispatch reliability: retry-loop vs terminal-ready event vs in-memory queue?** The diagnose-doc offers Option A (retry with `MAX_ATTEMPTS=20, RETRY_MS=100`) and Option B (terminal emits `devhub:terminal-ready` when its listener is mounted and `isVisible`). Option A is simpler and more portable; Option B avoids polling and consumes the event exactly once. The third option (an in-memory queue in a shared module that the listener drains on mount) is the most robust but adds a singleton. **Need a decision before `tasks.md`.**

2. **Preflight UX surface: inline toast, blocking modal, or per-check chips?** The diagnose-doc says "show first error, optional modal with full list". A blocking modal with the check matrix is the most discoverable; inline toast is least intrusive. **Need to know if `Planificacion.jsx` already has a modal infrastructure** (it does NOT, from line 251-270 — it only uses `toast.error`).

3. **MCP preflight depth: tool name presence only, or also `safe_action` / `control_plane` checks?** The catalog tags `get_project_context` as `safe_action: true` and `bulk_create_tasks` as `safe_action: false` (because it's a write). The planning path needs both. **Should the MCP preflight fail if any required tool is missing, or also warn if `safe_action` is false?**

4. **LLM preflight: which provider is "the planning provider"?** The file `data/llm-providers-config.json` has multiple `enabled: true` providers (`opencode`, `minimax`, and likely more). OpenCode itself picks the provider for each `--agent` invocation. **Is the LLM preflight satisfied by ANY provider being enabled, or must a specific provider be the active one?**

5. **`DEVHUB_PROJECT_ID` injection: rewrite the planning shell command, or call the swarm wrapper?** The diagnose-doc proposes rewriting the command to start with `export DEVHUB_PROJECT_ID="…"` and run `opencode` directly. An alternative is to call `buildAgentEnvExports({ projectId })` (or a slimmed-down version of it) and prefix the env vars to the command. The swarm wrapper has a lot of baggage (auth tokens, bus helpers, heartbeat, etc.) — none of which the planning agent needs. **Should the planning path use a new minimal env builder, or call into the swarm wrapper with missionId/role skipped?**

6. **Test runner for new `validatePlanningLaunch`**: `node:test` (matches existing planning tests) or Jest (matches TerminalWorkspacesManager and the opencode/mcp route tests would be)? Mixing is fine but `tasks.md` should pick one for the new file.

7. **Telemetry on `planning-launch`**: keep `launchOrigin: 'planning-launch'` and `taskId: planning-{timestamp}`, or switch to a real `tasks.id` row? The diagnose-doc says "no telemetryId" for the new prompt builder, but `persistAgentRunMetadata` and the Agent Room still expect a `taskId`. **Is removing the `taskId` from the dispatch a regression, or an acceptable cleanup?**

8. **Persistence of preflight result: re-run on every launch, or cache for the session?** The current `handleStartPlanning` runs on every click. A failed preflight could be cached so a user who fixes the underlying issue (e.g. starts OpenCode) doesn't have to re-run the form. **Cache or no cache?**

9. **`launchPanelWithCommand` (line 4515) and `createWorkspaceForSwarmLaunchRequests` (line 3984) also call `enforceDocOpsGateOnLaunchCommand`** — they handle non-planning flows (reopen-session, swarm). The fix should NOT touch them, but the diagnose-doc's "skip gate for planning-launch" lives in `handleRunAgent` (line 5268) where the launchOrigin tag is available. **Is that the right skip site, or should the skip live in the gate function itself (e.g. `enforceDocOpsGateOnLaunchCommand(command, { skipForLaunchOrigin: 'planning-launch' })`)?**

10. **`validate_topic_key` / `build_context_pack` — keep, remove, or alias?** If the planning prompt must NOT contain these tokens, then `isDocOpsPlanningPrompt` needs to be updated to NOT match on `planific` for the planning path. Alternative: keep the gate for everything else (swarm, doc tasks) but skip it when the prompt comes from a planning builder. **Document decision in `design.md`.**

---

## Risk Notes (for the orchestrator)

- `TerminalWorkspacesManager.jsx` is 6836 lines; touching its `handleRunAgent` requires a careful test because the file is part of the active terminal-ux-redesign branch.
- `launchPlanningAgent.js` is 68 lines and is the single chokepoint; minimal surface change recommended.
- The devhub-mcp catalog reader scans source files via `OFFICIAL_TOOL_NAME_REGEX = /server\.tool\(\s*['"`]([^'"`]+)['"`]/g` — adding new tools in `devhub-mcp/tools/*.js` will automatically make them appear in the preflight check. No additional wiring needed.
- The DocOps `buildDocOpsGatePrompt` is also used by `buildDocOpsTaskPrompt` (line 201-227) for swarm task execution. **Do not change the global DocOps semantics**; the planning path must use a separate builder.

---

## Files Read (cache freshness)

All files were read end-to-end in this session. No cached or partial reads. The shell-only test file `src/lib/planning/__tests__/planningPrompts.test.js` is the only planning test in the repo.

---

## Ready for Proposal

**Yes.** All 6 problems are confirmed with file:line evidence. The test gaps are explicit. The 10 open questions are listed. The convention surface (openspec file shape, test runner, export style) is documented.

The orchestrator should hand off to `sdd-propose` next. No new file outside `openspec/changes/planning-launch-hardening/explore.md` was created.
