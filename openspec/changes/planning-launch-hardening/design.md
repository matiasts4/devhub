# Design: Planning Launch Hardening

> Branch: `feature/terminal-renderer-xterm-webgl` (unchanged). Change: `openspec/changes/planning-launch-hardening/`.

## Context

The planning-agent launch from `/project/:id/planificacion` is operationally broken: `launchPlanningAgent.js` (68 lines) wraps the kickoff in `buildDocOpsOrchestratorLaunchPrompt`, which mandates `validate_topic_key` / `build_context_pack` (the DocOps SDD gate), prefixes the body with `/sdd-new` (routing to the openspec orchestrator), injects a `telemetryId` whose close instruction becomes `update_task(status='completed')` against a `tasks.id` row that does not exist, and emits a shell command with no `DEVHUB_PROJECT_ID` export. The dispatched event reaches `TerminalWorkspacesManager.handleRunAgent` after a fragile `setTimeout(150ms)` race and is then re-wrapped by `enforceDocOpsGateOnLaunchCommand` a second time. There is no async preflight — `Planificacion.jsx:251-270` only checks `!planningPrompt && files.length === 0` synchronously. All six problems are confirmed in `explore.md`.

This change **hardens** the existing flow, not rewrites it. The new builders, preflight, dispatch retry, and gate-skip are additive modules; the page, swarm paths, and `docopsPrompts.js` semantics are untouched.

## Module Boundaries

New file tree (all paths are repo-relative):

```
src/lib/planning/
├── buildPlanningLaunchPrompt.js          NEW · pure, no I/O
├── buildPlanningLaunchCommand.js         NEW · calls shellQuotePrompt
├── validatePlanningLaunch.js             NEW · fetch 3 endpoints in parallel
├── dispatchPlanningAgentRun.js           NEW · retry loop, exports MAX_ATTEMPTS / RETRY_MS
├── launchPlanningAgent.js                MOD  · <40 LOC, no DocOps, no setTimeout race
└── __tests__/
    ├── buildPlanningLaunchPrompt.test.js NEW · node:test
    ├── buildPlanningLaunchCommand.test.js NEW
    ├── validatePlanningLaunch.test.js     NEW · fetch mocked
    └── launchPlanningAgent.test.js       NEW · end-to-end with stubbed fetch + dispatch

src/app/api/agenthub/llm/status/
├── route.js                               NEW · mirrors opencode/status shape
└── __tests__/
    └── route.test.js                      NEW · Jest

src/components/
└── TerminalWorkspacesManager.jsx         MOD  · only handleRunAgent gate-skip (~10 LOC)
```

Dependency graph (acyclic):

```
Planificacion.jsx ──→ validatePlanningLaunch ──→ fetch(opencode/status, llm/status, mcp/status)
                  ──→ launchPlanningAgent    ──→ buildPlanningLaunchCommand
                                              ──→ buildPlanningLaunchPrompt
                                              ──→ buildPlanningKickoffPrompt (existing)
                                              ──→ dispatchPlanningAgentRun ──→ window 'devhub:run-agent'
                                              ──→ navigate('/terminales')
TerminalWorkspacesManager.jsx
  handleRunAgent (listener) ──→ [if launchOrigin === 'planning-launch' skip gate] → handleSplit
```

## Key Design Decisions

| # | Decision | Choice | 1-line rationale | Spec mapping |
|---|----------|--------|------------------|--------------|
| 1 | Dispatch reliability | **A — retry queue** in `dispatchPlanningAgentRun` (`MAX_ATTEMPTS=20, RETRY_MS=100`) | Portable, no coupling to `TerminalWorkspacesManager` mount timing; bounded wall-clock ≈ 2 s. | `terminal-event-bus/Dispatch retries` |
| 2 | Preflight UX surface | **Inline first-error banner** above the launch button in `Planificacion.jsx`; full matrix available via a `checks[]` array for a future modal. | Smallest blast radius; respects "PRs pequeños" rule. | `agenthub-preflight/Preflight returns actionable errors` |
| 3 | LLM status endpoint | **New route** at `src/app/api/agenthub/llm/status/route.js` mirroring `opencode/status` shape: `{ ready, provider, reason }` | Clean scope, testable in isolation, no coupling to general config endpoint. | `agenthub-preflight/LLM provider check` |
| 4 | Telemetry `taskId` | **Drop `taskId: planning-${timestamp}`** for the planning path. Keep `launchOrigin: 'planning-launch'` for audit (`persistAgentRunMetadata` accepts it; the skip-gate in `handleRunAgent` reads it). Use `projectId` as the audit row key. | Removes the ghost `tasks` row; `update_project(planning_status)` is the polling signal `Planificacion.jsx:155` already watches. | `planning-agent-launch/Close via update_project only` |
| 5 | Test runner | **`node:test` + `node:assert/strict`** for `src/lib/planning/__tests__/*` (matches existing `planningPrompts.test.js`); **Jest** for the new LLM route and the `TerminalWorkspacesManager` extension. | The only planning test in the repo already uses `node:test`; `next test` (Jest) runs both runners. | Conformance to `openspec/config.yaml` `strict_tdd: true` |
| 6 | Skip-gate site | **`handleRunAgent` in `TerminalWorkspacesManager.jsx`** — single `launchOrigin === 'planning-launch'` branch. Do NOT modify `enforceDocOpsGateOnLaunchCommand` or `isDocOpsPlanningPrompt`. | The handler already owns the `launchOrigin` tag; the gate function stays single-purpose for swarm/reopen. | `planning-agent-launch/Planning launch skips DocOps gate` |
| 7 | UUID validation in command builder | **`buildPlanningLaunchCommand` throws** on non-UUID `projectId` with a clear message; no command string returned. | Prevents `export DEVHUB_PROJECT_ID="not-a-uuid"` from ever entering the terminal. | `planning-agent-launch/Planning launch sets DEVHUB_PROJECT_ID env` |
| 8 | Stop condition for retry | **Receiver ack** via `window.addEventListener('devhub:run-agent-accepted', once)` in `dispatchPlanningAgentRun`; ack event `detail: { taskId }` (taskId is the dispatcher's input taskId — by default `projectId`). Fallback: `MAX_ATTEMPTS` exhausted. | Listener self-reports success — `dispatchPlanningAgentRun` does not need to know `TerminalWorkspacesManager` internals. | `terminal-event-bus/Dispatch retries until accepted` |

## Data Flow

```
[1] User clicks "Iniciar planificación" in Planificacion.jsx
        │
[2] handleStartPlanning() → validatePlanningLaunch({ projectId, documentationPolicy, localPath, hasContext })
        │                       │
        │                       ├─ fetch GET /api/agenthub/opencode/status
        │                       ├─ fetch GET /api/agenthub/llm/status
        │                       └─ fetch GET /api/agenthub/mcp/status
        │
[3]   { ok: boolean, checks: Check[] }   (Check = { id, ok, level, message })
        │
[4]   if (!ok) → render first error in inline banner; do NOT call launchPlanningAgent. return.
        │
[5]   launchPlanningAgent(navigate, { projectId, projectName, mode, documentationPolicy, hasExistingWork })
        │
[6]   ├─ buildPlanningLaunchPrompt({ mode, projectId, projectName, documentationPolicy, hasExistingWork })
        │      └─ wraps buildPlanningKickoffPrompt with `[DevHub Planning Agent]` + mandatory MCP sequence
        │
        ├─ buildPlanningLaunchCommand({ ... })
        │      └─ validates UUID v4 → export DEVHUB_PROJECT_ID="<uuid>" && opencode --agent sdd-orchestrator --prompt <shellQuotedPrompt>
        │
        ├─ navigate('/terminales')          // unchanged
        │
        └─ dispatchPlanningAgentRun({
              taskId: projectId,
              command,
              selectedAgent: 'sdd-orchestrator',
              launchOrigin: 'planning-launch',
              promptSummary: 'Planificación (<mode>)',
           })
              │
              └─ window.dispatchEvent(new CustomEvent('devhub:run-agent', { detail }))
                 on each retry, listens once for 'devhub:run-agent-accepted' { taskId }
                 stops on ack or MAX_ATTEMPTS=20 / RETRY_MS=100
        │
[7]   TerminalWorkspacesManager.handleRunAgent(e)
        │
        ├─ if launchOrigin === 'swarm-control-launch' → enqueueSwarmLaunchRequest; return  (unchanged)
        │
        ├─ if launchOrigin === 'planning-launch' →
        │     cmdToRun = command  (SKIP enforceDocOpsGateOnLaunchCommand)
        │  else →
        │     cmdToRun = enforceDocOpsGateOnLaunchCommand(command || `opencode --agent ${selectedAgent || DEFAULT_OPENCODE_AGENT}`)
        │
        ├─ handleSplit('horizontal', activePanelId, cmdToRun, cwd)
        │
        └─ if (taskId && createdPanelId) → persistAgentRunMetadata({ taskId: projectId, ..., launchOrigin }, createdPanelId, cmdToRun)
              └─ writes devhub_agent_runs[projectId] localStorage row
        │
[8]   OpenCode TUI starts, agent reads DEVHUB_PROJECT_ID from env, calls
       get_project_context → bulk_create_milestones + bulk_create_tasks → update_project({ planning_status: "completed" })
        │
[9]   Planificacion.jsx poll (15 s) observes planning_status === 'completed' → hides banner.
```

## File-Level Change Plan

| File | Action | ~LOC (net) | Notes |
|------|--------|-----------|-------|
| `src/lib/planning/buildPlanningLaunchPrompt.js` | Create | ~45 | Pure function. No I/O. First line `[DevHub Planning Agent]`. Listens for forbidden tokens (`validate_topic_key`, `build_context_pack`, `/sdd-new`) — unit tests assert absence. |
| `src/lib/planning/buildPlanningLaunchCommand.js` | Create | ~30 | Imports `shellQuotePrompt` from `docopsPrompts.js`. UUID v4 regex guard. Output: `export DEVHUB_PROJECT_ID="<uuid>" && opencode --agent sdd-orchestrator --prompt <quoted>`. |
| `src/lib/planning/validatePlanningLaunch.js` | Create | ~90 | `Promise.all` over 3 `fetch` calls with 5 s timeout each. Returns `{ ok, checks[] }`. Spanish messages, actionable next steps. Pure wrt globals (takes `fetchImpl` param for testability). |
| `src/lib/planning/dispatchPlanningAgentRun.js` | Create | ~45 | Exports `dispatchPlanningAgentRun`, `MAX_ATTEMPTS=20`, `RETRY_MS=100`. Listens for ack with `{ once: true }` on `window`. Returns boolean `accepted`. |
| `src/lib/planning/launchPlanningAgent.js` | Modify | -45 net (~25 final) | Removes `buildDocOpsOrchestratorLaunchPrompt`, `enforceDocOpsGateOnLaunchCommand`, `shellQuotePrompt` imports; removes `setTimeout(150)`; calls `buildPlanningLaunchCommand` + `dispatchPlanningAgentRun`. |
| `src/views/Planificacion.jsx` | Modify | +35 net | In `handleStartPlanning`: import `validatePlanningLaunch`; render first `level: 'error'` check `message` in a new `<InlineErrorBanner/>`; consume `result.checks` for a future modal trigger (not built in this change). |
| `src/components/TerminalWorkspacesManager.jsx` | Modify | +8 net | In `handleRunAgent` (~5268), single ternary: `launchOrigin === 'planning-launch' ? command : enforceDocOpsGateOnLaunchCommand(...)`. Dispatch `devhub:run-agent-accepted` after `handleSplit` succeeds. |
| `src/app/api/agenthub/llm/status/route.js` | Create | ~40 | `GET` handler. Reads `data/llm-providers-config.json` via `loadConfig()`; finds any provider with `enabled !== false`; returns `{ ready, provider, reason }` (Spanish `reason` strings). |
| `src/lib/planning/__tests__/buildPlanningLaunchPrompt.test.js` | Create | ~60 | `node:test`. Asserts presence of `[DevHub Planning Agent]`, `get_project_context`, `bulk_create_*`, `update_project`. Asserts ABSENCE of `validate_topic_key`, `build_context_pack`, `/sdd-new`. 3 modes covered. |
| `src/lib/planning/__tests__/buildPlanningLaunchCommand.test.js` | Create | ~50 | `node:test`. Asserts `export DEVHUB_PROJECT_ID="<uuid>"` prefix. Throws on non-UUID. UUID appears twice in command. |
| `src/lib/planning/__tests__/validatePlanningLaunch.test.js` | Create | ~120 | `node:test`. `fetch` mocked per scenario: opencode down (ok=false), mcp missing tool (ok=false), llm not ready (ok=false), all healthy (ok=true), concurrency at limit (warn level). |
| `src/lib/planning/__tests__/launchPlanningAgent.test.js` | Create | ~70 | `node:test`. Stubs `fetch` (for any preflight call — none expected here, only in `validatePlanningLaunch`), stub `window.dispatchEvent`, stub `window.addEventListener`, assert event detail has `command` containing `DEVHUB_PROJECT_ID`, `selectedAgent === 'sdd-orchestrator'`, `launchOrigin === 'planning-launch'`. |
| `src/app/api/agenthub/llm/status/__tests__/route.test.js` | Create | ~50 | Jest. Stubs `data/llm-providers-config.json` content; asserts shape for ready/!ready cases. |
| `src/components/__tests__/TerminalWorkspacesManager.test.js` | Modify | +30 net | Add test that registers a `devhub:run-agent` listener with `launchOrigin: 'planning-launch'`, mocks `enforceDocOpsGateOnLaunchCommand` to a spy, asserts the spy is NOT called for planning-launch but IS called for `swarm-control-launch` (existing path) and undefined. |
| `docs/10_Planning_IA.md` | Modify | +25 net | Update narrative: no DocOps gate on planning; new preflight flow; `DEVHUB_PROJECT_ID` env. |

**Total: 6 new modules + 5 new tests + 4 modifications ≈ 600 LOC net.** Chained-PR split (per `proposal.md` D2=800 budget):
- **PR 1** — builders: `buildPlanningLaunchPrompt`, `buildPlanningLaunchCommand`, `launchPlanningAgent` refactor, tests for those three, plus `docs/10_Planning_IA.md` update.
- **PR 2** — preflight: `validatePlanningLaunch`, `/api/agenthub/llm/status/route.js`, `Planificacion.jsx` integration, all 3 new tests.
- **PR 3** — dispatch + skip: `dispatchPlanningAgentRun`, `TerminalWorkspacesManager` gate-skip, ack emission, plus the `TerminalWorkspacesManager.test.js` extension.

## Error Surfaces

All UI strings Spanish. First failing `level: 'error'` check wins; `level: 'warn'` entries render as chips but do not block.

| Failure | Spanish message (rendered in inline banner) | Follow-up affordance |
|---------|-----------------------------------------------|----------------------|
| OpenCode down | "OpenCode no está corriendo. Inicialo desde **Ajustes → Swarm** antes de planificar." | Visual link to Ajustes; toast in console. |
| LLM no provider | "No hay proveedor LLM configurado. Andá a **Ajustes → LLM** y activá un proveedor." | Same. |
| MCP missing tool (`get_project_context`, `bulk_create_milestones`, `bulk_create_tasks`, `update_project`) | "DevHub MCP no expone las herramientas de planificación (`<missing>`). Revisá **Conexiones MCP** y reiniciá el server." | Names the missing tool. |
| MCP unreachable | "DevHub MCP no responde en el server OpenCode. Verificá que esté corriendo." | Generic but actionable. |
| OpenCode concurrency at limit | `level: 'warn'` chip: "OpenCode está al límite de concurrencia — el agente entrará en cola." | Does not block. |
| `localPath` empty | `level: 'warn'` chip: "El proyecto no tiene `local_path`: el agente no podrá inspeccionar el repo local." | Does not block. |
| `documentationPolicy === 'missing'` | `level: 'warn'` chip: "Política documental no definida — el agente usará `personal` por defecto." | Does not block. |
| No `projectId` from Planificacion (programmer error) | Thrown synchronously by `buildPlanningLaunchCommand`. `launchPlanningAgent` returns early; UI shows the same banner as a generic "ID de proyecto inválido." | Caught by `handleStartPlanning` try/catch. |

## Test Strategy

| Layer | What | How |
|-------|------|-----|
| Unit | `buildPlanningLaunchPrompt` for 3 modes | `node:test`. Presence/absence token asserts (positive + negative). |
| Unit | `buildPlanningLaunchCommand` UUID guard | `node:test`. Throws on bad UUID, valid command shape otherwise. |
| Unit | `validatePlanningLaunch` matrix | `node:test`. `fetchImpl` injected; per-check scenarios from `agenthub-preflight` spec. |
| Unit | `dispatchPlanningAgentRun` retry + ack | `node:test` with `node:test` fake timers (`t.mock.timers.enable()`). Asserts `MAX_ATTEMPTS` cap, ack short-circuit, constants exported. |
| Unit | `launchPlanningAgent` end-to-end (stubs) | `node:test`. Stubs `fetch`, `window.dispatchEvent`, `window.addEventListener`. Asserts event detail shape. |
| Unit | `/api/agenthub/llm/status` route | Jest. Mocks `data/llm-providers-config.json`; asserts `{ ready, provider, reason }`. |
| Unit | `handleRunAgent` gate-skip extension | Jest. Mocks `enforceDocOpsGateOnLaunchCommand` as `vi.fn`. Three scenarios from `planning-agent-launch` spec (planning-launch / swarm / reopen-session). |
| Integration | `launchPlanningAgent` happy path | `node:test`. Stubs fetch (no preflight here) + window; verifies the actual `command` string the panel would receive is exactly the expected export+opencode line. |
| Manual | 8 acceptance criteria from `proposal.md` (AC 1-8) | Run dev server, click through, observe terminal panel + DB. |

**Coverage additions to existing files:**
- `src/components/__tests__/TerminalWorkspacesManager.test.js` gets 2 new test cases; mock for `enforceDocOpsGateOnLaunchCommand` already exists at line 148.
- `src/lib/__tests__/agentLaunchWrapper.test.js` is NOT touched in this change (planning path no longer uses the wrapper).

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| **Race residual**: retry fires the event repeatedly; if the user navigates away from `/terminales` before the first ack, the loop continues for ~2 s firing into the void. | `MAX_ATTEMPTS=20` bounds wall-clock at ≈ 2 s. Component unmount cleanup is the dispatcher's own listener removal in a future iteration (out of scope here). |
| **`persistAgentRunMetadata` regresses** when `taskId: projectId` (not `planning-{ts}`) is passed. | Existing function signature accepts arbitrary string `taskId`; only the row key changes. No test currently asserts the timestamp-prefixed shape. |
| **6836-line file `TerminalWorkspacesManager.jsx` blast radius** (on active `terminal-ux-redesign` branch). | Change is one ternary in `handleRunAgent` (line 5268) + ack dispatch. <10 LOC. PR 3 stays under 80 LOC including the new test. |
| **Modifying `isDocOpsPlanningPrompt` matcher would cascade** to swarm and reopen paths. | Don't touch it. The skip lives in the handler. Unit test guards: planning-launch bypasses the function; swarm-control-launch still hits it. |
| **Shell-escape on `DEVHUB_PROJECT_ID`**: UUID v4 is safe; defensive regex guards against the rare case of a malformed id. | `buildPlanningLaunchCommand` throws on non-UUID before any string is built. |
| **800 LOC chained-PR budget**: combined new code is ≈ 600 LOC; per-PR split keeps each < 300. | Per-PR split in File-Level Change Plan. |
| **Preflight fetches add latency** to the click → launch UX. | `Promise.all` parallel; 5 s per-fetch timeout. Worst case ≈ 5 s for first launch; subsequent launches are < 100 ms if same OpenCode/MCP are still warm. |

## Out of Scope

- Redesigning `Planificacion.jsx` UX, mode selector, or upload flow. The preflight integrates into the existing `handleStartPlanning`; no visual redesign.
- Touching `src/views/ProjectHub.jsx` (lightweight modal already shipped).
- Swarm paths: `SwarmControl.jsx`, `agentLaunchWrapper.js` bus helpers, `enqueueSwarmLaunchRequest`. The skip-gate in `handleRunAgent` is scoped to `launchOrigin === 'planning-launch'`; swarm keeps the gate.
- `docopsPrompts.js` global semantics — unchanged. The planning path uses its own builder.
- New OpenCode agent registration — `sdd-orchestrator` remains the default; configurable via `opts.agent`.
- DB schema, MCP contract, or persisted telemetry DB rows.

## Open Items Left for Implementation

1. **Ack event detail shape** — implementer should pick: `{ taskId, panelId }` (richer) vs `{ taskId }` (minimal). Recommendation: minimal. The dispatcher doesn't need `panelId`; the test that asserts ack is enough. Decision deferred to `apply` phase.
2. **Preflight cache TTL** — currently no caching. If the user opens the page, sees the OpenCode error, fixes it, and clicks again, the preflight re-runs all 3 fetches. Acceptable for v1; if latency is reported, add a 5 s in-memory cache keyed by `projectId`.
3. **Persist ack listener cleanup** — `dispatchPlanningAgentRun` registers `addEventListener('devhub:run-agent-accepted', { once: true })`. The `{ once: true }` flag auto-removes on fire; if the listener is never reached within `MAX_ATTEMPTS`, the listener is GC'd by the page-unload lifecycle. No explicit cleanup needed in v1; document the assumption.
4. **Telemetry `taskId` migration** — existing localStorage rows keyed by `planning-{timestamp}` are orphaned by this change. Out of scope (no migration script); new rows are keyed by `projectId`.
5. **LLM provider "active" selection** — current route returns any enabled provider. Future: respect `DEVHUB_LLM_PROVIDER` env var or a per-project setting. Out of scope here.
6. **Retry `RETRY_MS` jitter** — current constant is fixed 100 ms. If 2 clicks happen in the same tick, they synchronize. Add ±20 ms jitter in v2 if telemetry shows retry collisions.
