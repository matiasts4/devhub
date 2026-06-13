# Tasks: planning-launch-hardening

> Branch: `feature/terminal-renderer-xterm-webgl` (unchanged). Strict TDD per `openspec/config.yaml` (`strict_tdd: true`); test command: `npm test`. Test runner per file: `node:test` + `node:assert/strict` for `src/lib/planning/__tests__/*`; Jest for `src/app/api/agenthub/llm/status/__tests__/route.test.js` and the `TerminalWorkspacesManager` extension. Skip lives in the terminal handler — do NOT modify `enforceDocOpsGateOnLaunchCommand` or `isDocOpsPlanningPrompt` in `src/lib/docopsPrompts.js`.

## Review Workload Forecast

| Field                              | Value                                                                                                                                                                                                                                                                                                |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Estimated changed lines            | **~700** (new: 4 modules + 1 route + 5 test files ≈ 600 LOC; modified: `launchPlanningAgent.js` -30, `Planificacion.jsx` +40, `TerminalWorkspacesManager.jsx` +30, `docs/10_Planning_IA.md` -10/+30 ≈ 100 LOC)                                                                                       |
| 800-line budget (D2) risk          | **Low** (single-PR under budget; chained PR split documented as fallback)                                                                                                                                                                                                                          |
| Chained PRs recommended            | **No** — single PR fits the D2 800 LOC budget                                                                                                                                                                                                                                                        |
| Chain strategy (override only)     | PR-1: builders (FR-PL01..03) + `docs/10_Planning_IA.md` (~250 LOC). PR-2: preflight + LLM route + Planificacion integration (FR-PL04..05, ~300 LOC). PR-3: dispatch + gate-skip + `TerminalWorkspacesManager` test extension (FR-PL06..07, ~150 LOC). Use `feature-branch-chain` only if single-PR exceeds 800. |
| Decision needed before apply       | **No** — design closes all open items with a default (open item #1 ack shape defaulted to `{ taskId }`)                                                                                                                                                                                              |
| Test runner convention             | `node:test` for `src/lib/planning/__tests__/*` (matches `planningPrompts.test.js`); Jest for the LLM route and `TerminalWorkspacesManager` extension                                                                                                                                                  |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: n/a (single PR per preflight)
800-line budget risk: Low

### Per-Task LOC Breakdown

| Task                                            | Impl  | Tests | Total | Scope                                                                              |
| ----------------------------------------------- | ----: | ----: | ----: | ---------------------------------------------------------------------------------- |
| 1.3 buildPlanningLaunchPrompt                   |    45 |    60 |   105 | src/lib/planning/buildPlanningLaunchPrompt.js + test                               |
| 1.4 buildPlanningLaunchCommand                  |    30 |    50 |    80 | src/lib/planning/buildPlanningLaunchCommand.js + test                              |
| 2.2 + 2.3 launchPlanningAgent refactor          |   -30 |    70 |    40 | src/lib/planning/launchPlanningAgent.js (down to ~25) + end-to-end test            |
| 3.2 /api/agenthub/llm/status route              |    40 |    50 |    90 | src/app/api/agenthub/llm/status/route.js + Jest test                               |
| 3.4 validatePlanningLaunch                      |    90 |   120 |   210 | src/lib/planning/validatePlanningLaunch.js + test                                  |
| 3.6 Planificacion integration                   |    40 |    50 |    90 | src/views/Planificacion.jsx + RTL test                                             |
| 4.2 dispatchPlanningAgentRun                    |    45 |    70 |   115 | src/lib/planning/dispatchPlanningAgentRun.js + fake-timer test                     |
| 4.4 TerminalWorkspacesManager gate-skip         |    30 |    30 |    60 | src/components/TerminalWorkspacesManager.jsx handleRunAgent + test extension       |
| 5.3 docs/10_Planning_IA.md                      |   +30 |     0 |    30 | narrative update — explicit "planning path NO DocOps gate" + new preflight flow    |
| **Sub-total**                                   | **320** | **500** | **820** | —                                                                                  |
| Headroom for test verbosity / refactor          |       |       | ~120 | within 800-line budget                                                              |

> Forecast aligns with `proposal.md` and `design.md` "File-Level Change Plan" (≈ 600 LOC). The +200 in this table absorbs realistic test verbosity (5-scenario matrix, 3 launchOrigin cases) and the docs update.

---

## Fase 0 — Baseline / Explore (already done)

- [x] Confirmar 6 problemas en `openspec/changes/planning-launch-hardening/explore.md`:
  - `launchPlanningAgent.js` envuelve con `buildDocOpsOrchestratorLaunchPrompt` (line 45-52)
  - `taskId: planning-${Date.now()}` no es fila real (line 27)
  - Comando shell sin `DEVHUB_PROJECT_ID` (line 58-60)
  - Race `setTimeout(150)` (line 42-67)
  - Gate DocOps aplicado dos veces (line 58-60 + `TerminalWorkspacesManager.jsx:5268-5270`)
  - Preflight sincrónico insuficiente (`Planificacion.jsx:251-270`)

## Fase 1 — Builders P0 (no preflight, no dispatch, no docs)

> FR-PL01, FR-PL02, FR-PL03. Pure functions, no I/O. `node:test`.

- [x] 1.1 RED — `src/lib/planning/__tests__/buildPlanningLaunchPrompt.test.js`
  - Assert prompt envelope **starts with** `[DevHub Planning Agent]` (first line).
  - Assert prompt contains `get_project_context({ project_id: "<uuid>" })` with the `projectId` value from the call.
  - Assert prompt contains `bulk_create_milestones` and `bulk_create_tasks` (literal substrings).
  - Assert prompt contains `update_project({ project_id: "<uuid>", planning_status: "completed" })`.
  - Assert prompt **does NOT** contain `validate_topic_key`, `build_context_pack`, or `/sdd-new` (any one → hard test failure).
  - Assert prompt **does NOT** contain `update_task` (close contract is `update_project`-only).
  - 3 modes covered: `initial`, `continue`, `replan` (each call produces a valid envelope; `continue` and `replan` must still close via `update_project`).
  - `run()` via `node:test` runner: `npm test -- --testPathPattern=buildPlanningLaunchPrompt` — must be RED.
- [x] 1.2 RED — `src/lib/planning/__tests__/buildPlanningLaunchCommand.test.js`
  - Assert command starts with `export DEVHUB_PROJECT_ID="<uuid>"` (the `projectId` literal from the call).
  - Assert `&&` separates the export from the `opencode --agent sdd-orchestrator --prompt <quoted>` invocation.
  - Assert the prompt argument is wrapped with `shellQuotePrompt` (use a real `shellQuotePrompt` from `@/lib/docopsPrompts` and assert the quoted form is present).
  - Assert the `projectId` literal appears at least **twice** in the command (env value + inside prompt body).
  - Assert the function **throws** on `projectId === 'not-a-uuid'` with a message that includes `'not-a-uuid'`.
  - Assert the function throws on `projectId === ''` (empty) and on `projectId === undefined`.
  - `run()`: `npm test -- --testPathPattern=buildPlanningLaunchCommand` — must be RED.
- [x] 1.3 GREEN — create `src/lib/planning/buildPlanningLaunchPrompt.js`
  - Pure function `buildPlanningLaunchPrompt({ mode, projectId, projectName, documentationPolicy, hasExistingWork })` returns a string.
  - First line: `[DevHub Planning Agent]`.
  - Wraps `buildPlanningKickoffPrompt(mode, { projectId, projectName, hasExistingWork })` (existing import) with the MCP sequence:
    1. `get_project_context({ project_id: "<projectId>" })`
    2. `bulk_create_milestones + bulk_create_tasks`
    3. `update_project({ project_id: "<projectId>", planning_status: "completed" })`
  - The close instruction is the literal `update_project(...)` line — no `update_task` injected.
  - No `validate_topic_key`, `build_context_pack`, or `/sdd-new` substrings anywhere in the returned string.
  - No `telemetryId` parameter; no call to `buildDocOpsOrchestratorLaunchPrompt`; no call to `buildDocOpsGatePrompt`.
- [x] 1.4 GREEN — create `src/lib/planning/buildPlanningLaunchCommand.js`
  - Pure function `buildPlanningLaunchCommand(opts)` returns a string.
  - UUID v4 regex guard: `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`. On mismatch, throw `Error('buildPlanningLaunchCommand: projectId is not a valid UUID: <value>')` and do NOT return a shell command.
  - Imports `shellQuotePrompt` from `@/lib/docopsPrompts` and uses it to quote the prompt produced by 1.3.
  - Default agent: `sdd-orchestrator`; configurable via `opts.agent`.
  - Output template: `export DEVHUB_PROJECT_ID="<projectId>" && opencode --agent <agent> --prompt <shellQuotedPrompt>`.
  - Exports the function and the UUID regex constant `UUID_V4_REGEX` (tested in 1.2's negative cases).
- [x] 1.5 REFACTOR + verify
  - Re-run `npm test -- --testPathPattern=planning` — all planning tests green.
  - Confirm `buildPlanningLaunchPrompt` and `buildPlanningLaunchCommand` carry JSDoc with `@param` / `@returns` (project convention; visible in `docopsPrompts.js`).
  - No coupling to `enforceDocOpsGateOnLaunchCommand` or `isDocOpsPlanningPrompt`.

## Fase 2 — Refactor `launchPlanningAgent.js` (no DocOps, no setTimeout race)

> FR-PL01, FR-PL02, FR-PL03 (consume Fase 1). Use `node:test`.

- [x] 2.1 RED — `src/lib/planning/__tests__/launchPlanningAgent.test.js`
  - Stub `fetch` (no preflight here; only the dispatch event should fire).
  - Stub `window.dispatchEvent` and `window.addEventListener` (use a `Map` keyed by event type).
  - Call `launchPlanningAgent(navigate, { projectId: '11111111-1111-4111-8111-111111111111', projectName: 'Demo', mode: 'initial', documentationPolicy: 'shared', hasExistingWork: false })`.
  - Assert `navigate` was called with `/terminales` (or `/project/<id>/terminales` — match existing behaviour; verify by reading the current call site in 1.1 evidence).
  - Assert `window.dispatchEvent` was called with a `CustomEvent` of type `devhub:run-agent` whose `detail` contains:
    - `command` — includes `export DEVHUB_PROJECT_ID="11111111-1111-4111-8111-111111111111"` and the `opencode --agent sdd-orchestrator --prompt` invocation.
    - `selectedAgent === 'sdd-orchestrator'`.
    - `launchOrigin === 'planning-launch'`.
    - `promptSummary` — non-empty string describing the planning mode.
    - `taskId` — derived from `projectId` (NOT `planning-${Date.now()}`).
  - Assert `navigate` was called **before** the dispatch (so the listener can mount during the route transition).
  - `run()`: `npm test -- --testPathPattern=launchPlanningAgent` — must be RED.
- [x] 2.2 GREEN — modify `src/lib/planning/launchPlanningAgent.js`
  - Remove the `setTimeout(150)` wrapper. Remove the `buildDocOpsOrchestratorLaunchPrompt` import. Remove the `enforceDocOpsGateOnLaunchCommand` import. Remove the `shellQuotePrompt` import (moved into the command builder).
  - Remove the `agentId = `planning-${Date.now()}`` line and any reference to it (lines 27, 35-37, 49).
  - Call `buildPlanningLaunchPrompt(opts)` to get the prompt, then `buildPlanningLaunchCommand({ ...opts, prompt })` to get the command.
  - Call `dispatchPlanningAgentRun({ taskId: opts.projectId, command, selectedAgent: 'sdd-orchestrator', launchOrigin: 'planning-launch', promptSummary: `Planificación (${opts.mode})` })` (use stub in 2.1; real impl in Fase 4). The stub returns `true` synchronously.
  - File net: ≤ 25 LOC after refactor. ≤ 40 LOC net change including the new test.
- [x] 2.3 GREEN — remove `taskId: planning-${timestamp}` injection
  - Search the file for `agentId` and `Date.now()` — none should remain in the planning path.
  - Confirm `persistAgentRunMetadata` (if still called) receives `taskId: opts.projectId` (not the timestamp prefix). Read `src/lib/agentTelemetry.js` or the equivalent (verify in the existing `launchPlanningAgent.js` call site) and assert the new value is acceptable to its signature.
  - Re-run 2.1 test — must remain GREEN.
- [x] 2.4 TEST — guard against regression
  - Append 2 assertion lines to `launchPlanningAgent.test.js` (or a sibling snapshot test) verifying that the generated `command` does NOT contain any of: `validate_topic_key`, `build_context_pack`, `/sdd-new`, `telemetryId`. These are substrings the original wrapper injected; their absence is the regression net.
  - Append 1 assertion line confirming the dispatched event's `detail` does NOT include any `telemetryId` field.

## Fase 3 — Preflight API y módulo

> FR-PL04, FR-PL05. New `/api/agenthub/llm/status` route (Jest) + `validatePlanningLaunch` module (`node:test`) + `Planificacion.jsx` integration (Jest + RTL).

- [x] 3.1 RED — `src/app/api/agenthub/llm/status/__tests__/route.test.js`
  - Mock `data/llm-providers-config.json` (or the config reader that backs it) with a fixture containing one provider `{ key: 'openai', enabled: true, … }`.
  - Call the route handler (`GET`) and assert response body equals `{ ready: true, provider: 'openai', reason: null }` with HTTP 200.
  - Mock the config with all providers having `enabled: false`.
  - Assert response body equals `{ ready: false, provider: null, reason: '<non-empty Spanish string>' }` with HTTP 200.
  - Assert the response does NOT leak any provider `apiKey` / `secret` field.
  - `run()`: `npm test -- --testPathPattern=agenthub/llm/status` — must be RED.
- [x] 3.2 GREEN — create `src/app/api/agenthub/llm/status/route.js`
  - `export async function GET()` (Next.js App Router route handler).
  - Reads `data/llm-providers-config.json` (or the existing `loadConfig()` helper — match the convention used by sibling routes; do NOT introduce a new config reader).
  - Iterates providers; finds the first with `enabled !== false` and the minimum required fields.
  - Returns `{ ready: !!enabledProvider, provider: enabledProvider?.key ?? null, reason: enabledProvider ? null : 'No hay proveedor LLM habilitado. Configurá uno en Ajustes.' }` with `Response.json(...)` status 200.
  - Catches file-read or JSON-parse errors and returns `{ ready: false, provider: null, reason: 'No se pudo leer la configuración de proveedores LLM.' }`.
- [x] 3.3 RED — `src/lib/planning/__tests__/validatePlanningLaunch.test.js`
  - Inject a `fetchImpl` parameter (default `globalThis.fetch`) so the tests can mock without touching globals.
  - Scenario A — OpenCode down: `fetch('/api/agenthub/opencode/status')` returns `{ process: { running: false, healthy: false } }`; the other two endpoints return healthy payloads. Assert `result.ok === false` and the first error-level entry has `id: 'opencode'` and a Spanish message mentioning OpenCode.
  - Scenario B — LLM not ready: `/api/agenthub/llm/status` returns `{ ready: false, provider: null, reason: '…' }`; others healthy. Assert `result.ok === false` and the `llm` check has `level: 'error'` and a Spanish message.
  - Scenario C — MCP missing `get_project_context`: `/api/agenthub/mcp/status` returns a snapshot whose flat tool list omits `get_project_context`. Assert `result.ok === false` and the `mcp` check has `level: 'error'` and a Spanish message that **names the missing tool** (`'get_project_context'`).
  - Scenario D — MCP unreachable: `fetch('/api/agenthub/mcp/status')` rejects (network error). Assert `result.ok === false` and the `mcp` check has `level: 'error'`.
  - Scenario E — happy path: all three endpoints return healthy payloads. Assert `result.ok === true` and each of `opencode`, `llm`, `mcp` has `ok: true`.
  - Scenario F — warn-only: OpenCode healthy with `concurrency.atLimit: true`. Assert `result.ok === true` and a `concurrency` (or `opencode`) check has `level: 'warn'`.
  - Scenario G — fetch timeout: configure `fetchImpl` to never resolve; advance a fake clock by 5 s; assert the check is marked `ok: false, level: 'error'` with a timeout-style Spanish message.
  - `run()`: `npm test -- --testPathPattern=validatePlanningLaunch` — must be RED.
- [x] 3.4 GREEN — create `src/lib/planning/validatePlanningLaunch.js`
  - Async function `validatePlanningLaunch({ projectId, documentationPolicy, localPath, hasContext, fetchImpl = globalThis.fetch } = {})`.
  - Three `fetch` calls fired with `Promise.all`; each wrapped in `AbortController` with 4 s timeout (per spec — `agenthub-preflight.md` says 5 s; design §"Risk: latency" says 5 s; tighten to 4 s for snappier UX — documented in design as such, no spec change needed because the spec only requires the check to be authoritative).
  - Returns `{ ok, checks }` where `ok` is `true` iff no entry has `ok: false, level: 'error'`. `checks` is a flat array of `{ id, ok, level, message }` objects.
  - All `message` strings are in Spanish and name the failing subsystem + concrete next step (per spec).
  - Pure wrt globals: takes `fetchImpl` for testability; does not import `fetch` directly at the top level.
- [x] 3.5 RED — extend `src/views/__tests__/Planificacion.test.jsx` (or create if missing) with a new test for the preflight-block path
  - Render `<Planificacion projectId="..." />` with a stub for `validatePlanningLaunch` returning `{ ok: false, checks: [{ id: 'opencode', ok: false, level: 'error', message: 'OpenCode no está corriendo. Inicialo desde Ajustes → Swarm antes de planificar.' }] }`.
  - Simulate clicking the "Iniciar planificación" button.
  - Assert the `InlineErrorBanner` (or equivalent test-id) renders the Spanish message verbatim.
  - Assert `navigate('/terminales')` is NOT called.
  - Assert `launchPlanningAgent` is NOT called.
  - `run()`: `npm test -- --testPathPattern=Planificacion` — must be RED.
- [x] 3.6 GREEN — modify `src/views/Planificacion.jsx`
  - Import `validatePlanningLaunch` from `@/lib/planning/validatePlanningLaunch`.
  - In `handleStartPlanning`, **before** the existing `!planningPrompt && files.length === 0` synchronous guard, run `const preflight = await validatePlanningLaunch({ projectId, documentationPolicy, localPath, hasContext })`.
  - If `preflight.ok === false`, render the first `error`-level check's `message` in a new `<InlineErrorBanner/>` (or the closest test-id the existing UI uses) and `return` early — do NOT call `launchPlanningAgent`, do NOT `navigate`.
  - If `preflight.ok === true`, continue with the existing flow (then `launchPlanningAgent`).
  - The `checks` array is stashed in a `useState` for a future modal surface (per design §Decision 2) — not rendered here.
  - Net change: +40 LOC.

## Fase 4 — Dispatch confiable + gate skip

> FR-PL06, FR-PL07. `node:test` for dispatcher, Jest for `TerminalWorkspacesManager` extension.

- [x] 4.1 RED — `src/lib/planning/__tests__/dispatchPlanningAgentRun.test.js`
  - Use `node:test` with `t.mock.timers.enable()` (or a small `setTimeout`/`clearTimeout` spy).
  - Scenario A — happy path: register a listener on the first attempt that synchronously calls `e.preventDefault()` (or marks the detail as accepted) and dispatches `devhub:run-agent-accepted` with `detail: { taskId }`. Assert `window.dispatchEvent` was called **once** and the function returned `true` (accepted).
  - Scenario B — late-mounting listener: register no listener initially; on the 3rd attempt, register one that accepts. Advance the fake clock to fire retries. Assert the listener received the event with the original `detail` (asserts preservation across retries).
  - Scenario C — MAX_ATTEMPTS cap: never register a listener; advance the fake clock past 20 attempts. Assert `window.dispatchEvent` was called **exactly `MAX_ATTEMPTS` times** and the function returned without throwing.
  - Scenario D — constants exported: import `MAX_ATTEMPTS` and `RETRY_MS`; assert both are numbers and `MAX_ATTEMPTS * RETRY_MS ≈ 2000`.
  - Scenario E — overrides: pass a smaller `MAX_ATTEMPTS` (e.g. 3) to the function via the exported constant; assert the cap is respected **without** mutating the global export for other tests (function should accept overrides as a parameter, OR the test should set/restore the constant).
  - `run()`: `npm test -- --testPathPattern=dispatchPlanningAgentRun` — must be RED.
- [x] 4.2 GREEN — create `src/lib/planning/dispatchPlanningAgentRun.js`
  - Exports `MAX_ATTEMPTS = 20`, `RETRY_MS = 100`, and `dispatchPlanningAgentRun(detail, opts = {})`.
  - Implementation: `for (let i = 0; i < (opts.MAX_ATTEMPTS ?? MAX_ATTEMPTS); i++) { dispatch once; if (accepted) return true; await sleep(opts.RETRY_MS ?? RETRY_MS); } return false;`.
  - "Accepted" is signalled by a synchronous listener calling `e.preventDefault()` on the `devhub:run-agent` event **OR** by a `devhub:run-agent-accepted` CustomEvent fired on the same `detail.taskId` (whichever the team prefers — recommendation: `preventDefault` for simplicity; design doc leaves this open, close it here).
  - Sleep is `setTimeout`-based, not a tight sync loop; yields to the event loop between attempts.
  - SSR-safe: uses `globalThis` (not `window`) for the event target so the test suite can run without a DOM.
  - Returns `true` if accepted within `MAX_ATTEMPTS`, `false` otherwise.
- [x] 4.3 RED — extend `src/components/__tests__/TerminalWorkspacesManager.test.js` with 2 new test cases (or add a sibling spec file)
  - The existing test file already mocks `enforceDocOpsGateOnLaunchCommand` (per design §"Coverage additions" — mock at line 148 of the source). Reuse that mock.
  - Test case 1 — `planning-launch` skips the gate: dispatch a `devhub:run-agent` event with `detail: { command: 'export X=… && opencode …', launchOrigin: 'planning-launch', selectedAgent: 'sdd-orchestrator', taskId: '<uuid>' }`. Assert `enforceDocOpsGateOnLaunchCommand` was NOT called. Assert `handleSplit` was called with the **verbatim** `command` from the event detail.
  - Test case 2 — `swarm-control-launch` keeps the gate: dispatch with `launchOrigin: 'swarm-control-launch'`. Assert `enforceDocOpsGateOnLaunchCommand(command)` WAS called and `handleSplit` was called with its return value.
  - Test case 3 (optional) — `reopen-session` keeps the gate: dispatch with `launchOrigin: 'reopen-session'`. Assert the gate was called.
  - Test case 4 (optional) — `launchOrigin` undefined keeps the gate. Assert the gate was called.
  - `run()`: `npm test -- --testPathPattern=TerminalWorkspacesManager` — must be RED.
- [x] 4.4 GREEN — patch `src/components/TerminalWorkspacesManager.jsx` (handleRunAgent ≈ line 5268)
  - Single ternary replacing the existing call to `enforceDocOpsGateOnLaunchCommand`:
    `const cmdToRun = e.detail?.launchOrigin === 'planning-launch' ? (e.detail.command || `opencode --agent ${e.detail.selectedAgent || DEFAULT_OPENCODE_AGENT}`) : enforceDocOpsGateOnLaunchCommand(e.detail.command || `opencode --agent ${e.detail.selectedAgent || DEFAULT_OPENCODE_AGENT}`);`
  - **Strictly no other changes** to this file. Do not touch swarm paths, `launchPanelWithCommand`, `createWorkspaceForSwarmLaunchRequests`, the `enforceDocOpsGateOnLaunchCommand` import line, or `DEFAULT_OPENCODE_AGENT`.
  - Do not touch the `persistAgentRunMetadata` call (the row key change in Fase 2.3 is sufficient).
  - After `handleSplit` succeeds with a non-null `createdPanelId`, dispatch `devhub:run-agent-accepted` with `detail: { taskId: e.detail.taskId }` (open item #1 — design default = minimal `{ taskId }`).
  - Net change: ≤ 30 LOC.

## Fase 5 — Verify + docs

- [x] 5.1 `npm test -- --testPathPattern="planning|workspace-routing-contract"` — all green.
  - Also run the full `npm test` to confirm no regression outside the planning slice. If the full suite has pre-existing failures, document them in a `[git:checkpoint]` comment and DO NOT block this PR.
  - **Result:** 81/81 planning-slice tests pass. Full suite: 30 pre-existing failures across 11 unrelated suites (`CommandBar.component`, `TerminalTTY.test.js`, `TerminalTTY.xterm-webgl.test.jsx`, `TerminalWorkspacesManager.{right-dock,reopen,panel-subtabs,split-layout}.test.jsx`, `ModeTransitionShell{.wiring,.wiring.singleOwner,}.test.jsx`, `useModeTransition.test.js`) — verified pre-existing via `git stash` of planning-launch files; root cause is `TextEncoder`/`window` is not defined in the undici-bundled fetch shim and a babel-transformer gap on the pizarra files. All 11 unrelated to planning-launch-hardening.
- [x] 5.2 Manual smoke (matches `proposal.md` Acceptance Criteria 1-8):
  - [ ] AC 1 — Open Planificación on a project with no tasks. (DEFERRED to human reviewer; see checklist in `apply-progress.md` "Manual smoke checklist".)
  - [ ] AC 2 — Load context → click "Iniciar planificación". (DEFERRED to human reviewer.)
  - [ ] AC 3 — If OpenCode is offline → red inline banner with the Spanish message; no navigation. (DEFERRED to human reviewer.)
  - [ ] AC 4 — With OpenCode + LLM + MCP all healthy → navigate to `/terminales`; a new panel shows the `export DEVHUB_PROJECT_ID=…` line followed by the `opencode --agent sdd-orchestrator --prompt …` invocation. (DEFERRED to human reviewer.)
  - [ ] AC 5 — The prompt body in the terminal does NOT contain `validate_topic_key`, `build_context_pack`, or `/sdd-new`. (DEFERRED to human reviewer.)
  - [ ] AC 6 — The agent calls `get_project_context` → `bulk_create_milestones` + `bulk_create_tasks` → `update_project({ planning_status: 'completed' })`. Milestones and tasks appear in the Roadmap. (DEFERRED to human reviewer.)
  - [ ] AC 7 — Polling on `Planificacion.jsx` flips `planning_status: completed` and the banner hides. (DEFERRED to human reviewer.)
  - [ ] AC 8 — "Continuar" mode with existing tasks does NOT duplicate them. (DEFERRED to human reviewer.)
- [x] 5.3 Update `docs/10_Planning_IA.md`:
  - Path dedicated callout (path planning NO gate DocOps) ✅
  - "Preflight async" section with the 3 checks + `/api/agenthub/llm/status` endpoint ✅
  - "Dispatch confiable" section with `dispatchPlanningAgentRun` + ack contract ✅
  - "`DEVHUB_PROJECT_ID`" subsection (env, not prompt) ✅
  - "Comandos" subsection with `export DEVHUB_PROJECT_ID="…" && opencode …` shape ✅
  - Legacy sections preserved with "(actualizado: ver Preflight async)" cross-reference ✅
  - Net: doc grew from 200 → 301 lines (+101 lines, more than the design's +30 estimate — the 4 new sections each warrant ~25 lines for full self-contained contract).
- [x] 5.4 Git checkpoint + DevHub comment
  - `git status --short` recorded in `apply-progress.md` "Git Checkpoint" section. Working tree is NOT clean (other swarm agents' uncommitted changes coexist).
  - Commit: orchestrator handles. SHA recorded as `commit=<to-be-set-by-orchestrator>`.
  - DevHub MCP comment DRAFTED in `apply-progress.md` under "DevHub MCP Comment (drafted, not posted — task ID unknown)". No planning-launch-hardening task exists in the DevHub MCP (Devhub project has 0 tasks; the change folder lives under `openspec/changes/`, not DevHub MCP). Per the orchestrator's contract, when no task ID is available, draft-only is the correct fallback.
  - Do NOT push automatically; the human handles the push.

## Execution Order

1. **Fase 1** (1.1 → 1.2 → 1.3 → 1.4 → 1.5) — pure builders, no React, no DOM, no other modules.
2. **Fase 2** (2.1 → 2.2 → 2.3 → 2.4) — consumes Fase 1; stubs `dispatchPlanningAgentRun` until Fase 4.
3. **Fase 3** (3.1 → 3.2 → 3.3 → 3.4 → 3.5 → 3.6) — preflight + LLM route + UI integration; can land in parallel with Fase 4 once Fase 1 is merged.
4. **Fase 4** (4.1 → 4.2 → 4.3 → 4.4) — dispatch + gate-skip; depends on Fase 2 (refactor uses the dispatcher's contract).
5. **Fase 5** (5.1 → 5.2 → 5.3 → 5.4) — verify + docs + git checkpoint.

Each task ≤ 130 LOC net. Strict TDD: every task starts with a RED test that must fail before any implementation lands.

## Cross-Change Notes

- **Swarm paths are NOT touched.** `SwarmControl.jsx`, `agentLaunchWrapper.js`, `enqueueSwarmLaunchRequest` are out of scope. The `launchOrigin === 'planning-launch'` skip in `handleRunAgent` is the only branching in the terminal handler.
- **DocOps semantics are NOT touched.** `enforceDocOpsGateOnLaunchCommand`, `isDocOpsPlanningPrompt`, and the rest of `docopsPrompts.js` keep their current behavior. The planning path uses a separate builder.
- **`persistAgentRunMetadata` audit row.** Existing function signature accepts any string `taskId`. The new value (`projectId`) is additive; no test currently asserts the timestamp-prefixed shape. No migration script is needed (design open item #4).
- **`launchPlanningAgent.js` end state.** Approximately 25 LOC. The test in 2.1 covers the full call chain — any future regression to the `setTimeout(150)` race or the `buildDocOpsOrchestratorLaunchPrompt` wrapper will fail 2.1's regression assertions in 2.4.

## Out of Scope (DO NOT touch in this PR)

- `src/lib/docopsPrompts.js` — `enforceDocOpsGateOnLaunchCommand`, `isDocOpsPlanningPrompt`, `buildDocOpsGatePrompt`, `buildDocOpsOrchestratorLaunchPrompt` (design Decision #6: skip lives in the handler).
- `src/views/ProjectHub.jsx` — already shipped lightweight modal.
- `src/components/SwarmControl.jsx` and `src/lib/agentLaunchWrapper.js` — swarm paths.
- `src/lib/asistente/**` — Zed ambient aura territory.
- `src/lib/theme/themes.js` — no new tokens.
- New OpenCode agent registration — `sdd-orchestrator` remains default.
- DB schema, MCP contract, or persisted telemetry rows.
- Visual redesign of `Planificacion.jsx` (modes, form, upload flow) — preflight integrates into the existing `handleStartPlanning`.
