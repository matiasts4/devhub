# Prompt — Agente 5: Planning Launch (prompt + preflight + terminal wiring)

> Copia **todo este documento** como prompt inicial en tu sesión OpenCode.
> Lee primero [`00-shared-context.md`](00-shared-context.md).
>
> **Cambio SDD sugerido:** `openspec/changes/planning-launch-hardening/` (crear desde cero con SDD completo).

---

## Misión

Endurecer el **lanzamiento del agente de planificación** desde `/project/:id/planificacion` para que:

1. El agente use **DevHub MCP** (`get_project_context`, `bulk_create_milestones`, `bulk_create_tasks`, `update_project`) sin quedar bloqueado por el gate DocOps/SDD.
2. El comando en terminal tenga **contexto de entorno** (`DEVHUB_PROJECT_ID`) y **cierre correcto** (`planning_status: completed`).
3. La UI haga **preflight async** antes de lanzar (OpenCode + LLM + MCP).
4. El evento `devhub:run-agent` no se pierda por race al navegar a terminales.

**Contexto ya implementado (NO rehacer):**

| Pieza | Estado | Archivos |
|-------|--------|----------|
| Modal de creación liviano | ✅ | `src/views/ProjectHub.jsx` |
| Página Planificación | ✅ | `src/views/Planificacion.jsx` |
| Prompts por modo (initial/continue/replan) | ✅ | `src/lib/planning/planningPrompts.js` |
| Launch básico a terminales | ✅ (mejorable) | `src/lib/planning/launchPlanningAgent.js` |
| `get_project_context` con roadmap | ✅ | `devhub-mcp/tools/projects.js` |
| Routing + sidebar | ✅ | `src/App.js`, `src/components/WorkspaceSidebar.jsx` |

Tu trabajo es **hardening del launch**, no rediseñar la página Planificación desde cero.

---

## SDD obligatorio

Ejecutá el flujo completo en OpenCode:

```text
sdd-explore → sdd-propose → sdd-spec → sdd-design → sdd-tasks → sdd-apply → sdd-verify
```

Al terminar `sdd-verify`, dejá evidencia en `openspec/changes/planning-launch-hardening/apply-progress.md`.

---

## Diagnóstico — por qué el launch actual es mejorable

### Problema 1: DocOps gate bloquea planning operativo

`launchPlanningAgent.js` envuelve el kickoff con `buildDocOpsOrchestratorLaunchPrompt`, que exige:

- `validate_topic_key`
- `build_context_pack`
- **“Si no existe Context Pack válido, no avances con planificación”**

Eso aplica a **documentación SDD**, no a llenar el kanban vía MCP.

**Archivos:**

- `src/lib/planning/launchPlanningAgent.js`
- `src/lib/docopsPrompts.js` (`buildDocOpsOrchestratorLaunchPrompt`, `buildDocOpsGatePrompt`)

### Problema 2: Prefijo `/sdd-new` desvía al orquestador

`buildDocOpsOrchestratorLaunchPrompt` concatena `/sdd-new ${prompt}`. Planning DevHub ≠ abrir change en `openspec/`.

### Problema 3: Instrucción de cierre contradictoria

| Fuente | Dice |
|--------|------|
| `buildDocOpsGatePrompt` (con `telemetryId`) | `update_task(status='completed')` |
| `buildPlanningKickoffPrompt` | `update_project({ planning_status: 'completed' })` |

El `taskId` (`planning-{timestamp}`) **no existe** en la tabla `tasks` → el agente puede cerrar mal y dejar `planning_status: pending` forever.

### Problema 4: Sin `DEVHUB_PROJECT_ID`

Swarm usa `agentLaunchWrapper.buildAgentEnvExports({ projectId })`. Planning lanza `opencode` pelado; el agente depende de leer el UUID del texto del prompt.

**Referencia:** `src/lib/agentLaunchWrapper.js` líneas ~51-57.

### Problema 5: Race `setTimeout(150ms)`

Patrón actual en `launchPlanningAgent.js`, `BannerIA.jsx`, `Tareas.jsx`:

```js
navigate('/terminales');
setTimeout(() => dispatchEvent('devhub:run-agent'), 150);
```

Si `TerminalWorkspacesManager` monta tarde, el evento se pierde.

**Handler:** `src/components/TerminalWorkspacesManager.jsx` ~5260 (`handleRunAgent`).

### Problema 6: Doble `enforceDocOpsGateOnLaunchCommand`

Se aplica en `launchPlanningAgent.js` y otra vez en `handleRunAgent`.

---

## Qué es “Preflight async (OpenCode + LLM + MCP)”

**Definición:** antes de `launchPlanningAgent()`, la UI ejecuta checks **asíncronos** (Promises / `fetch`) y **bloquea el launch** si el entorno no está listo, mostrando mensajes accionables.

No es un paso SDD del agente planificador — es **validación de infraestructura** en el cliente (y opcionalmente un endpoint server-side para LLM).

### Check 1 — OpenCode (proceso)

```http
GET /api/agenthub/opencode/status
```

**Respuesta relevante** (`src/app/api/agenthub/opencode/status/route.js`):

```json
{
  "process": { "running": true, "healthy": true, "status": "healthy" },
  "concurrency": { "active": 0, "max": 5, "atLimit": false },
  "queue": { "length": 0 }
}
```

**Criterio PASS:** `process.running === true` y `process.healthy !== false`.

**FAIL UX:** toast + link mental a Ajustes / arrancar OpenCode. Mensaje ejemplo: *“OpenCode no está corriendo. Inicialo desde Ajustes → Swarm antes de planificar.”*

**Opcional WARN:** `concurrency.atLimit === true` → avisar cola llena, permitir launch con confirmación.

### Check 2 — LLM (proveedor configurado)

OpenCode necesita un proveedor con API key/modelo. Config en disco:

- `data/llm-providers-config.json`
- Lectura server-side: `src/lib/llmProviderConfig.js` (`getLlmProviderConfig` / `getLlmProviderConfigSync`)

**El browser NO debe leer ese archivo directamente.**

**Implementación recomendada:**

1. Crear `GET /api/agenthub/llm/status` (o extender config existente) que devuelva:

```json
{
  "ready": true,
  "provider": "minimax",
  "reason": null
}
```

2. `ready === true` si al menos un provider en config tiene `enabled !== false` y campos mínimos (p. ej. `ANTHROPIC_BASE_URL` o equivalente del provider activo).

**FAIL UX:** *“No hay proveedor LLM configurado. Andá a Ajustes → LLM.”*

**Tests:** `tests/agenthub/api/llm-status.test.js` (o junto a opencode-status).

### Check 3 — MCP DevHub (herramientas de planning)

```http
GET /api/agenthub/mcp/status
```

Implementado en `src/app/api/agenthub/mcp/status/route.js` → `assembleMcpControlCenterSnapshot`.

**Criterio PASS:** snapshot incluye servidor/tool de planning, p. ej. presencia de `get_project_context` y `bulk_create_tasks` en el catálogo expuesto (inspeccionar forma real del JSON en `src/lib/mcp/control-center.js` antes de codificar el assert).

**FAIL UX:** *“DevHub MCP no está disponible en OpenCode. Revisá Conexiones MCP.”*

### Check 4 — Contexto de proyecto (ya parcial)

Ya existe en `Planificacion.jsx`:

```js
if (!planningPrompt.trim() && files.length === 0) { ... }
```

**Ampliar (WARN, no block):**

- `documentation_policy` definida (no `missing` en gate)
- `local_path` vacío → warn “el agente no podrá inspeccionar el repo local”

### API propuesta del módulo preflight

Crear `src/lib/planning/validatePlanningLaunch.js`:

```js
/**
 * @returns {Promise<{
 *   ok: boolean;
 *   checks: Array<{ id: string; ok: boolean; level: 'error'|'warn'; message: string }>;
 * }>}
 */
export async function validatePlanningLaunch({ projectId, documentationPolicy, localPath, hasContext })
```

`Planificacion.jsx` → en `handleStartPlanning`:

```js
const preflight = await validatePlanningLaunch({...});
if (!preflight.ok) {
  // mostrar primer error; opcional modal con lista de checks
  return;
}
// saveContext + launchPlanningAgent
```

**Tests:** `src/lib/planning/__tests__/validatePlanningLaunch.test.js` con `fetch` mockeado.

---

## Requisitos funcionales (implementar)

| ID | Requisito | Prioridad |
|----|-----------|-----------|
| FR-PL01 | Prompt de planning **sin** DocOps gate ni `/sdd-new` | **P0** |
| FR-PL02 | Cierre único: `update_project({ planning_status: 'completed' })` — sin `update_task` fantasma | **P0** |
| FR-PL03 | Comando con `export DEVHUB_PROJECT_ID="<uuid>"` antes de `opencode` | **P0** |
| FR-PL04 | `validatePlanningLaunch` async con checks OpenCode + LLM + MCP | **P1** |
| FR-PL05 | UI bloquea launch si preflight `ok === false` | **P1** |
| FR-PL06 | Launch confiable sin `setTimeout(150)` frágil | **P1** |
| FR-PL07 | Una sola aplicación de gate/envelope (no doble rewrite) | **P2** |
| FR-PL08 | Tests unitarios launch + preflight | **P1** |
| FR-PL09 | Actualizar `docs/10_Planning_IA.md` (flujo viejo obsoleto) | **P2** |

---

## Diseño técnico — FR-PL01 a FR-PL03

### Nuevo builder de prompt (NO reutilizar DocOps orchestrator)

Crear `src/lib/planning/buildPlanningLaunchPrompt.js`:

```js
import { buildPlanningKickoffPrompt } from './planningPrompts.js';

export function buildPlanningLaunchPrompt({
  mode,
  projectId,
  projectName,
  documentationPolicy,
  hasExistingWork,
}) {
  const kickoff = buildPlanningKickoffPrompt(mode, { projectId, projectName, hasExistingWork });

  return [
    '[DevHub Planning Agent]',
    `project_id: ${projectId}`,
    documentationPolicy ? `documentation_policy: ${documentationPolicy}` : null,
    '',
    'Objetivo: generar hitos y tareas en DevHub vía MCP. NO abras un change SDD salvo que el usuario lo pida.',
    'NO uses validate_topic_key ni build_context_pack para este flujo.',
    'Secuencia obligatoria:',
    `1. get_project_context({ project_id: "${projectId}" })`,
    '2. bulk_create_milestones + bulk_create_tasks',
    `3. update_project({ project_id: "${projectId}", planning_status: "completed" })`,
    '',
    kickoff,
  ].filter(Boolean).join('\n');
}
```

### Nuevo builder de comando shell

Crear `src/lib/planning/buildPlanningLaunchCommand.js`:

```js
import { shellQuotePrompt } from '@/lib/docopsPrompts.js';
import { buildPlanningLaunchPrompt } from './buildPlanningLaunchPrompt.js';

export function buildPlanningLaunchCommand(opts) {
  const prompt = buildPlanningLaunchPrompt(opts);
  const agent = opts.agent || 'sdd-orchestrator';
  // NO llamar enforceDocOpsGateOnLaunchCommand aquí
  return `export DEVHUB_PROJECT_ID="${opts.projectId}" && opencode --agent ${agent} --prompt ${shellQuotePrompt(prompt)}`;
}
```

### Refactor `launchPlanningAgent.js`

- Usar `buildPlanningLaunchCommand`
- **Eliminar** `buildDocOpsOrchestratorLaunchPrompt` y `enforceDocOpsGateOnLaunchCommand` del path planning
- Mantener `launchOrigin: 'planning-launch'` para telemetría
- **No** pasar `telemetryId` que implique cerrar task en DB

---

## Diseño técnico — FR-PL06 (launch confiable)

### Opción A (recomendada): cola con retry hasta listener

Crear `src/lib/planning/dispatchPlanningAgentRun.js`:

```js
const MAX_ATTEMPTS = 20;
const RETRY_MS = 100;

export function dispatchPlanningAgentRun(detail) {
  let attempts = 0;
  const tryDispatch = () => {
    attempts += 1;
    window.dispatchEvent(new CustomEvent('devhub:run-agent', { detail }));
    // TerminalWorkspacesManager podría ack con devhub:run-agent-accepted { taskId }
  };
  tryDispatch();
}
```

### Opción B: evento `devhub:terminal-ready`

1. `TerminalWorkspacesManager` emite `devhub:terminal-ready` cuando `handleRunAgent` listener está registrado y `isVisible`.
2. `launchPlanningAgent` escucha una vez y despacha.

**Elegir una opción en `design.md` y testear** con test RTL en `TerminalWorkspacesManager` o test de integración liviano.

**Archivos tocables:**

- `src/lib/planning/launchPlanningAgent.js`
- `src/lib/planning/dispatchPlanningAgentRun.js` (nuevo)
- `src/components/TerminalWorkspacesManager.jsx` (solo si Opción B o ack)

**NO tocar** lógica swarm (`launchOrigin === 'swarm-control-launch'`).

---

## Diseño técnico — FR-PL07 (sin doble gate)

En `handleRunAgent`, si `launchOrigin === 'planning-launch'`, **saltar** `enforceDocOpsGateOnLaunchCommand`:

```js
const cmdToRun =
  launchOrigin === 'planning-launch'
    ? command
    : enforceDocOpsGateOnLaunchCommand(command || ...);
```

---

## Archivos — límites del agente

### Podés crear

| Archivo | Propósito |
|---------|-----------|
| `src/lib/planning/buildPlanningLaunchPrompt.js` | Envelope planning puro |
| `src/lib/planning/buildPlanningLaunchCommand.js` | Shell command + env |
| `src/lib/planning/validatePlanningLaunch.js` | Preflight async |
| `src/lib/planning/dispatchPlanningAgentRun.js` | Retry dispatch |
| `src/lib/planning/__tests__/*.test.js` | Tests |
| `src/app/api/agenthub/llm/status/route.js` | LLM preflight API |
| `tests/agenthub/api/llm-status.test.js` | API test |
| `openspec/changes/planning-launch-hardening/**` | SDD artifacts |

### Podés modificar

| Archivo | Cambio |
|---------|--------|
| `src/lib/planning/launchPlanningAgent.js` | Usar nuevos builders + dispatch |
| `src/views/Planificacion.jsx` | Integrar preflight en `handleStartPlanning` |
| `src/components/TerminalWorkspacesManager.jsx` | Skip gate / terminal-ready (mínimo) |
| `docs/10_Planning_IA.md` | Alinear con flujo actual |

### NO modificar (salvo bug blocker)

- `src/views/ProjectHub.jsx` (modal ya está liviano)
- `devhub-mcp/tools/projects.js` (`get_project_context` ya extendido)
- Orquestación swarm / `SwarmControl.jsx`
- `src/lib/docopsPrompts.js` — **no cambiar semántica DocOps global**; planning debe evitar ese path

---

## Tareas SDD sugeridas (`tasks.md`)

```markdown
## Fase 0 — Explore
- [ ] Reproducir launch actual; capturar prompt final en terminal
- [ ] Confirmar que agente se traba en DocOps (log/evidencia)

## Fase 1 — Spec + Design (P0)
- [ ] FR-PL01: buildPlanningLaunchPrompt sin DocOps/SDD
- [ ] FR-PL02: cierre update_project only
- [ ] FR-PL03: DEVHUB_PROJECT_ID en comando
- [ ] Tests: buildPlanningLaunchCommand no contiene validate_topic_key ni /sdd-new

## Fase 2 — Preflight (P1)
- [ ] GET /api/agenthub/llm/status
- [ ] validatePlanningLaunch + tests con fetch mock
- [ ] Planificacion.jsx integra preflight + mensajes ES

## Fase 3 — Terminal wiring (P1)
- [ ] dispatchPlanningAgentRun o terminal-ready
- [ ] handleRunAgent skip gate para planning-launch
- [ ] Test: planning-launch no duplica enforceDocOpsGate

## Fase 4 — Verify + docs (P2)
- [ ] npm test -- --testPathPattern=planning
- [ ] Manual: crear proyecto → planificar → hitos/tareas en DB
- [ ] planning_status pending → completed
- [ ] Actualizar docs/10_Planning_IA.md
```

---

## Criterios de aceptación (manual)

1. Abrir Planificación en proyecto sin tareas.
2. Cargar contexto → **Iniciar planificación**.
3. Si OpenCode está apagado → **error claro**, no navega a terminales.
4. Con todo OK → panel terminal con comando que incluye `DEVHUB_PROJECT_ID`.
5. Prompt en terminal **no** contiene `validate_topic_key`, `build_context_pack`, ni `/sdd-new`.
6. Agente crea milestones/tasks (ver poll en UI o Roadmap).
7. Agente ejecuta `update_project` con `planning_status: completed`.
8. Modo **Continuar** con tareas existentes no duplica masivamente.

---

## Tests obligatorios

```bash
npm test -- --testPathPattern="planning|workspace-routing-contract"
```

Agregar al menos:

| Test | Assert |
|------|--------|
| `buildPlanningLaunchCommand` | incluye `DEVHUB_PROJECT_ID` |
| `buildPlanningLaunchPrompt` | incluye `get_project_context`, `bulk_create`, `update_project` |
| `buildPlanningLaunchPrompt` | NO incluye `validate_topic_key`, `/sdd-new` |
| `validatePlanningLaunch` | falla si opencode offline (mock) |
| `validatePlanningLaunch` | falla si mcp sin get_project_context (mock) |
| `handleRunAgent` planning-launch | no llama enforceDocOpsGate (unit o snapshot) |

---

## Git / DevHub MCP

Antes de marcar tareas `completed`:

```bash
git status --short
# checkpoint commit si hay cambios
```

Comentario DevHub: `[git:checkpoint] commit=<sha> checks=npm test planning`

---

## Referencias rápidas

| Tema | Ruta |
|------|------|
| Página Planificación | `src/views/Planificacion.jsx` |
| Kickoff por modo | `src/lib/planning/planningPrompts.js` |
| Launch actual | `src/lib/planning/launchPlanningAgent.js` |
| DocOps (evitar en planning) | `src/lib/docopsPrompts.js` |
| Env swarm (referencia) | `src/lib/agentLaunchWrapper.js` |
| Terminal handler | `src/components/TerminalWorkspacesManager.jsx` ~5260 |
| OpenCode status API | `src/app/api/agenthub/opencode/status/route.js` |
| MCP status API | `src/app/api/agenthub/mcp/status/route.js` |
| LLM config | `src/lib/llmProviderConfig.js`, `data/llm-providers-config.json` |
| MCP planning tools | `devhub-mcp/tools/projects.js`, `devhub-mcp/tools/tasks.js` |
| Doc flujo usuario | `docs/10_Planning_IA.md` (actualizar) |

---

## Prompt corto para pegar en OpenCode

```text
Sos el Agente 5 — Planning Launch Hardening en /home/matias/ArxonLabs/devhub.

Leé docs/delegation/00-shared-context.md y docs/delegation/05-agent-planning-launch.md.

Ejecutá SDD completo (explore → propose → spec → design → tasks → apply → verify) 
en openspec/changes/planning-launch-hardening/.

Objetivo: separar planning operativo (DevHub MCP) del gate DocOps/SDD, agregar preflight 
async (OpenCode + LLM + MCP), inyectar DEVHUB_PROJECT_ID, y arreglar el race del launch 
en terminales. TDD obligatorio. No toques swarm ni el modal de ProjectHub.
```
