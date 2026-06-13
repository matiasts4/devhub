# Proposal: Planning Launch Hardening

## Why

El launch del agente de planificación desde `/project/:id/planificacion` se traba antes de crear hitos o tareas porque el flujo quedó acoplado al gate DocOps/SDD. `launchPlanningAgent.js` envuelve el kickoff con `buildDocOpsOrchestratorLaunchPrompt` (`launchPlanningAgent.js:45-52`, `docopsPrompts.js:165-183`), que exige `validate_topic_key` y `build_context_pack` y concatena un `/sdd-new` que desvía al orquestador en vez de operar el kanban vía MCP (`docopsPrompts.js:182`). El `taskId` `planning-${Date.now()}` no es una fila real de `tasks`, así que la instrucción de cierre del gate (`update_task(status='completed')`, `docopsPrompts.js:120-122`) contradice el cierre real del flujo (`update_project({ planning_status: 'completed' })`, `planningPrompts.js:21-22`) y el agente puede dejar `planning_status: pending` para siempre. El comando shell no exporta `DEVHUB_PROJECT_ID` (`launchPlanningAgent.js:58-60` vs `agentLaunchWrapper.js:57`), hay una race frágil con `setTimeout(150ms)` (`launchPlanningAgent.js:42-67`) y `enforceDocOpsGateOnLaunchCommand` se aplica dos veces — una en el builder y otra en `handleRunAgent` (`TerminalWorkspacesManager.jsx:5268-5270`). Tampoco hay preflight async: la UI confía en un guard sincrónico y un toast genérico (`Planificacion.jsx:251-270`). Endurecer el launch es prerequisito para que el módulo de planificación entregue valor; los seis problemas están confirmados en `explore.md` con evidencia file:line.

## What Changes

- **FR-PL01** — Nuevo `src/lib/planning/buildPlanningLaunchPrompt.js` que envuelve `buildPlanningKickoffPrompt` con un envelope `[DevHub Planning Agent]` + secuencia MCP obligatoria. Reemplaza la llamada a `buildDocOpsOrchestratorLaunchPrompt` (`launchPlanningAgent.js:45-52`) y elimina el prefijo `/sdd-new` y los tokens `validate_topic_key` / `build_context_pack` del path planning.
- **FR-PL02** — Mismo builder fija el cierre único `update_project({ planning_id, planning_status: "completed" })` y elimina la inyección de `telemetryId` que producía `update_task` fantasma (`launchPlanningAgent.js:27,49`).
- **FR-PL03** — Nuevo `src/lib/planning/buildPlanningLaunchCommand.js` que prepende `export DEVHUB_PROJECT_ID="<uuid>"` al comando `opencode --agent ... --prompt ...`. Reemplaza la construcción manual en `launchPlanningAgent.js:58-60` que dependía de que el agente parseara el UUID del prompt.
- **FR-PL04** — Nuevo `src/lib/planning/validatePlanningLaunch.js` con preflight async en paralelo (OpenCode + LLM + MCP + contexto) y surface de resultado `{ ok, checks[] }`. Tests con `fetch` mockeado (`node:test`).
- **FR-PL05** — `src/views/Planificacion.jsx` consume `validatePlanningLaunch` en `handleStartPlanning` y bloquea el launch cuando `ok === false`, mostrando el primer error (y opcionalmente un modal con la matriz completa). Reemplaza el guard sincrónico `!planningPrompt && files.length === 0` (`Planificacion.jsx:252-255`).
- **FR-PL06** — Nuevo `src/lib/planning/dispatchPlanningAgentRun.js` con retry-queue (`MAX_ATTEMPTS=20, RETRY_MS=100`) que dispara `devhub:run-agent` hasta que el listener de `TerminalWorkspacesManager` lo consuma. Reemplaza el `setTimeout(150)` frágil (`launchPlanningAgent.js:44-67`).
- **FR-PL07** — `src/components/TerminalWorkspacesManager.jsx` en `handleRunAgent` (~5260) salta `enforceDocOpsGateOnLaunchCommand` cuando `launchOrigin === 'planning-launch'`. Cambio mínimo (≤30 LOC), sin tocar swarm (`launchOrigin === 'swarm-control-launch'`) ni `launchPanelWithCommand` / `createWorkspaceForSwarmLaunchRequests`.
- **FR-PL08** — Tests TDD obligatorios (`strict_tdd: true` en `openspec/config.yaml`):
  - `src/lib/planning/__tests__/buildPlanningLaunchPrompt.test.js` — incluye `get_project_context`, `bulk_create_*`, `update_project`; **NO** incluye `validate_topic_key`, `build_context_pack`, `/sdd-new`.
  - `src/lib/planning/__tests__/buildPlanningLaunchCommand.test.js` — incluye `export DEVHUB_PROJECT_ID="<uuid>"` y el prompt quoted con `shellQuotePrompt`.
  - `src/lib/planning/__tests__/validatePlanningLaunch.test.js` — `fetch` mockeado: falla si `opencode/status` `running=false`, si `mcp/status` no expone `get_project_context`, si `llm/status` `ready=false`; pasa con snapshot healthy.
  - `src/lib/planning/__tests__/launchPlanningAgent.test.js` — orquesta `buildPlanningLaunchCommand` + `dispatchPlanningAgentRun` con event listener registrado.
  - `src/app/api/agenthub/llm/status/__tests__/route.test.js` — devuelve `ready: true` cuando al menos un provider está `enabled`; `ready: false` con `reason` cuando ninguno.
  - Extender `src/components/__tests__/TerminalWorkspacesManager.test.js` — `handleRunAgent` con `launchOrigin: 'planning-launch'` no invoca `enforceDocOpsGateOnLaunchCommand` (mockear el módulo y assert call count).
- **FR-PL09** — `docs/10_Planning_IA.md` actualizado: describe el nuevo envelope, el preflight y el flujo correcto de cierre. Documenta explícitamente que el path planning **NO** pasa por el gate DocOps.

### New files
- `src/lib/planning/buildPlanningLaunchPrompt.js`
- `src/lib/planning/buildPlanningLaunchCommand.js`
- `src/lib/planning/validatePlanningLaunch.js`
- `src/lib/planning/dispatchPlanningAgentRun.js`
- `src/app/api/agenthub/llm/status/route.js`
- `src/lib/planning/__tests__/buildPlanningLaunchPrompt.test.js`
- `src/lib/planning/__tests__/buildPlanningLaunchCommand.test.js`
- `src/lib/planning/__tests__/validatePlanningLaunch.test.js`
- `src/lib/planning/__tests__/launchPlanningAgent.test.js`
- `src/app/api/agenthub/llm/status/__tests__/route.test.js`

### Modified files
- `src/lib/planning/launchPlanningAgent.js` — usa nuevos builders + dispatch (≤40 LOC net).
- `src/views/Planificacion.jsx` — integra `validatePlanningLaunch` en `handleStartPlanning` (≤40 LOC net).
- `src/components/TerminalWorkspacesManager.jsx` — solo el bloque `handleRunAgent` (~5260) con el skip de gate para `planning-launch` (≤30 LOC net).
- `docs/10_Planning_IA.md` — actualización narrativa del flujo.

## Impact

- **Affected specs** (delta specs in `openspec/changes/planning-launch-hardening/specs/`):
  - `planning-agent-launch` (NEW) — requirements para FR-PL01..03, FR-PL06, FR-PL07; el envelope planning, el comando con `DEVHUB_PROJECT_ID`, el dispatch confiable y el skip de gate único.
  - `agenthub-preflight` (NEW) — requirements para FR-PL04, FR-PL05; checks OpenCode / LLM / MCP, contrato de `/api/agenthub/llm/status`, contrato `validatePlanningLaunch({ projectId, ... }) → { ok, checks[] }`, UX de bloqueo.
  - `terminal-event-bus` (MODIFIED) — requirement nuevo: `dispatchPlanningAgentRun` reintenta hasta consumir el `devhub:run-agent`; semántica del skip de gate en `handleRunAgent` para `launchOrigin === 'planning-launch'`.
  - `swarm-control-launchpad` (MODIFIED, solo nota) — confirmar que `enforceDocOpsGateOnLaunchCommand` sigue aplicándose para swarm / reopen-session; el skip vive en el handler, no en la función.
- **Affected code** (ver `## What Changes` arriba).
- **New dependencies**: ninguna. Todo el trabajo usa `@/lib/docopsPrompts.js` (`shellQuotePrompt`) y APIs ya existentes.
- **Risks**:
  - **Race condition residual**: el retry de `dispatchPlanningAgentRun` consume el listener, pero si el usuario navega fuera de `/terminales` antes del primer ack, los reintentos siguen disparando el evento sin panel receptor. Mitigación: bound `MAX_ATTEMPTS=20` (~2s) y cleanup en `unmount` del componente que origina el launch.
  - **Telemetry id**: eliminar `taskId: planning-${timestamp}` rompe `persistAgentRunMetadata` y cualquier consumidor del `devhub_agent_runs` localStorage que filtre por ese prefijo. Mitigación: usar `projectId` como `taskId` para el run de planning, o persistir con `taskId=null` y derivar el row key de `projectId + launched_at`.
  - **TerminalWorkspacesManager blast radius**: el archivo tiene 6836 líneas y está en la rama activa `terminal-ux-redesign`. El cambio debe limitarse al bloque `handleRunAgent`; ningún test E2E existente cubre el path planning-launch, así que la cobertura nueva debe ser un unit test focal.
  - **Breaking `isDocOpsPlanningPrompt` matcher**: NO modificar `docopsPrompts.js:185-199`. El skip vive en el caller (`handleRunAgent`), no en la función de gate. Documentado en design.
  - **Env export shell-escape**: `export DEVHUB_PROJECT_ID="<uuid>"` debe resistir `projectId` con caracteres especiales (UUID v4 los tiene, pero el contrato debe validarlo con un regex en el builder antes de quote). Si el `projectId` no matchea el patrón UUID, abortar el launch con error claro.
  - **Single-PR budget (D2 = 800 LOC)**: el set completo de builders + tests + route nueva + docs puede pasar 800 LOC netas si cada test es verboso. Plan: chained PR — (1) builders + FR-PL01..03, (2) preflight + FR-PL04..05, (3) dispatch + skip + docs.
- **Non-goals**:
  - No rediseñar `Planificacion.jsx` (la página, los modos, el form de contexto, el upload de archivos quedan igual).
  - No tocar `src/views/ProjectHub.jsx` (modal liviano ya cerrado).
  - No tocar swarm (`SwarmControl.jsx`, `agentLaunchWrapper.js` bus helpers, `enqueueSwarmLaunchRequest`).
  - No cambiar la semántica global de `docopsPrompts.js` — el path planning usa su propio builder.
  - No introducir nuevo agente OpenCode; sigue siendo `sdd-orchestrator` por defecto, configurable vía opts.

## Acceptance Criteria

1. Abrir Planificación en proyecto sin tareas.
2. Cargar contexto → **Iniciar planificación**.
3. Si OpenCode está apagado → **error claro**, no navega a terminales.
4. Con todo OK → panel terminal con comando que incluye `DEVHUB_PROJECT_ID`.
5. Prompt en terminal **no** contiene `validate_topic_key`, `build_context_pack`, ni `/sdd-new`.
6. Agente crea milestones/tasks (ver poll en UI o Roadmap).
7. Agente ejecuta `update_project` con `planning_status: completed`.
8. Modo **Continuar** con tareas existentes no duplica masivamente.

## Open Decisions

1. **Dispatch strategy** — **Recommend A**: retry-queue en `dispatchPlanningAgentRun` (`MAX_ATTEMPTS=20, RETRY_MS=100`). Es portable, sin acoplar `TerminalWorkspacesManager` (que está en otra rama activa) con un nuevo `devhub:terminal-ready`. La Opción B (evento ready) es más limpia arquitecturalmente pero requiere emitir desde el componente del terminal, ampliando el blast radius. Confirmar.
2. **Preflight UX** — ¿inline toast con el primer error (mínimo cambio en `Planificacion.jsx`) o modal bloqueante con la matriz de checks? El inline respeta la regla "PRs pequeños" pero el modal es más descubrible. Decisión: empezar con inline + log a la derecha; el modal es una mejora posterior si el feedback de QA lo pide.
3. **LLM status endpoint** — nuevo archivo en `src/app/api/agenthub/llm/status/route.js` (recomendado) vs extender el endpoint `config` existente. Recomiendo archivo nuevo: scope del preflight es claro, contrato `{ ready, provider, reason }` no encaja con el shape de config, y permite tests focalizados. Confirmar.
4. **Telemetry id** — ¿dropear `taskId`/`launchOrigin` totalmente o mantener `launchOrigin: 'planning-launch'` como audit log en `devhub_agent_runs`? Recomiendo **mantener `launchOrigin` para auditoría** (es la única señal que el skip de gate usa, y da trazabilidad) pero **dropear `taskId: planning-${timestamp}`** y derivar el row key de `projectId`. El `update_project({ planning_status: "completed" })` es suficiente para señalizar cierre al `Planificacion.jsx` poll. Confirmar.
5. **Test runner** — el archivo `src/lib/planning/__tests__/planningPrompts.test.js` ya usa `node:test` + `node:assert/strict` (no Jest). Recomiendo **mantener `node:test`** para los nuevos tests en `src/lib/planning/__tests__/` (mismo runner, mismo set de aserciones, mismo estilo) y usar Jest solo donde `next/jest` ya está configurado (route test, `TerminalWorkspacesManager.test.js`). Confirmar.

## Rollback Plan

1. Revertir el commit del builder nuevo (`buildPlanningLaunchPrompt.js`, `buildPlanningLaunchCommand.js`, `dispatchPlanningAgentRun.js`).
2. Restaurar `launchPlanningAgent.js` al `buildDocOpsOrchestratorLaunchPrompt` + `enforceDocOpsGateOnLaunchCommand` previo.
3. Revertir el skip en `handleRunAgent` (`launchOrigin === 'planning-launch'` ? command : enforceDocOpsGate...).
4. Mantener `/api/agenthub/llm/status` aunque no se consuma (no rompe nada; consumo opcional).
5. Revertir `Planificacion.jsx` al guard sincrónico. Si la página quedó a medio migrar, el build pasa pero `validatePlanningLaunch` queda como dead code — borrar en cleanup posterior.

Sin migraciones de schema; sin cambios en DB; sin cambios de contrato MCP. Rollback es código-only y cabe en un commit revert.
