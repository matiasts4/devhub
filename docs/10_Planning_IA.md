---
Fecha de Modificación: 12 de junio de 2026
Changelog:
  - 2026-03-28 v1: Creación del documento. Describe el flujo completo de Planning IA implementado en DevHub.
  - 2026-05-15 v2: Se corrige el cierre de planning y se alinea la integración con Swarm/Git al boundary vigente.
  - 2026-06-12 v3: Hardening de launch — path planning dedicado, preflight async, dispatch confiable, contrato de env `DEVHUB_PROJECT_ID`. La planificación **NO** pasa por el gate DocOps: usa sus propios builders (`buildPlanningLaunchPrompt` + `buildPlanningLaunchCommand`) y un dispatcher con ack (`dispatchPlanningAgentRun`). Se agregan las secciones "Preflight async", "Dispatch confiable", `DEVHUB_PROJECT_ID` y "Comandos" (ver abajo).
---

# 11 Planning IA — Flujo de Planificación Automática

Este documento describe la funcionalidad de **Planning IA**, el núcleo estratégico de DevHub: la capacidad de transformar un proyecto recién creado en un plan exhaustivo de 40-60+ tareas organizadas en hitos, usando el MCP y un agente IA como Antigravity.

---

## ¿Por qué Planning IA?

El cuello de botella más costoso en cualquier proyecto de software no es la ejecución — es la **planificación inicial**. DevHub resuelve esto permitiendo al usuario cargar todo el contexto de su proyecto (specs, wireframes, READMEs, user stories) y delegarle al agente la generación del plan completo, con la exhaustividad que llevaría días de trabajo manual.

---

## Componentes Implementados

### Base de Datos

| Elemento                        | Descripción                                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `projects.planning_prompt`      | Texto libre con el contexto detallado del proyecto                                                     |
| `projects.planning_status`      | `none` · `pending` · `completed`                                                                       |
| `projects.documentation_policy` | `personal` · `shared_legacy` · `archive_only` — clasifica cómo se maneja la documentación del proyecto |
| `project_files`                 | Tabla de archivos de contexto (ver `03_Esquema_BaseDatos.md`)                                          |

### API Routes (Next.js)

| Endpoint                   | Método                       | Descripción                                             |
| -------------------------- | ---------------------------- | ------------------------------------------------------- |
| `/api/projects/[id]/files` | `POST`                       | Sube archivos de contexto como texto a Supabase         |
| `/api/projects/[id]/files` | `GET`                        | Lista archivos guardados (sin contenido, solo metadata) |
| `/api/projects/[id]/files` | `DELETE` (query `?file_id=`) | Elimina un archivo del contexto                         |

### MCP Server (`devhub-mcp/server.js`)

| Tool                                                           | Descripción                                                                      |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `get_project_context({ project_id })`                          | Devuelve `planning_prompt` + todos los `project_files` con su contenido completo |
| `update_project({ project_id, planning_status: "completed" })` | Marca `planning_status = 'completed'`                                            |

### Frontend

| Componente             | Ruta                    | Descripción                                                                            |
| ---------------------- | ----------------------- | -------------------------------------------------------------------------------------- |
| `ProjectHub.jsx`       | `/hub`                  | Modal mejorado con toggle Planning IA, textarea de prompt, dropzone de archivos        |
| `PlanningMode.jsx`     | `/project/:id/planning` | Página completa de onboarding con upload, prompt, generación de contexto y copy prompt |
| `WorkspaceSidebar.jsx` | —                       | Item "Planning IA" con dot púrpura pulsante cuando `planning_status = 'pending'`       |

---

## Flujo Completo Paso a Paso

### Paso 1 — Crear Proyecto con Contexto

Al hacer clic en **"Nuevo Proyecto"** en el Hub, el modal ahora incluye:

- **Toggle** "Planning IA automático" (encendido por defecto)
- **Textarea** de prompt de contexto (describe el proyecto en detalle)
- **Dropzone** para arrastrar archivos `.txt`, `.md`, `.json`, `.py`, `.js`, etc.

Al confirmar:

- El proyecto se crea con `planning_status = 'pending'`
- Los archivos se suben a `project_files` vía API
- El usuario es redirigido a `/project/:id/planning`

### Paso 2 — PlanningMode (Onboarding)

La página `PlanningMode.jsx` muestra:

1. **Prompt de contexto** — editable, con contador de caracteres
2. **Dropzone adicional** — para subir más archivos o eliminar existentes
3. Botón **"Guardar + Generar Prompt"** — persiste el contexto en Supabase
4. **Prompt de Agente auto-generado** — texto completo listo para enviar a Antigravity, incluye:
   - Nombre y descripción del proyecto
   - `project_id` explícito
   - `user_id` para los MCP tools
   - Lista de archivos subidos
   - Instrucción de mínimo 40 tareas
   - Instrucción de cerrar el planning con `update_project({ planning_status: "completed" })`
5. **Botón "Copiar Prompt"** — copia al clipboard con toast de confirmación
6. **Contador en tiempo real** — polling cada 5s de milestones y tareas creados

### Paso 3 — Ejecución del Planning por el Agente

El usuario pega el prompt en el chat con **Antigravity** (u otro agente MCP-compatible). El agente debe:

```
1. get_project_context({ project_id: "..." })
   → Lee planning_prompt + documentación policy + contenido de TODOS los archivos

2. Analizar el contexto y definir la arquitectura del plan

3. create_milestone() × 5-8 hitos, por ejemplo:
   - "Fase 0: Setup y Entorno de Desarrollo"
   - "Fase 1: Arquitectura y Base de Datos"
   - "Fase 2: Backend / API Core"
   - "Fase 3: Frontend — Pantallas Principales"
   - "Fase 4: Integraciones y Servicios Externos"
   - "Fase 5: Testing y QA"
   - "Fase 6: DevOps, Deploy y Monitoreo"
   - "Fase 7: Post-Launch y Mantenimiento"

4. create_task() × 40-60+ tareas distribuidas en los hitos:
   - Setup inicial (configuración repo, linters, CI, variables de entorno)
   - Esquema DB completo (tablas, RLS, índices, migraciones)
   - Cada endpoint de la API
   - Cada pantalla/componente del frontend
   - Integraciones por servicio (auth, pagos, emails, storage)
   - Tests unitarios, de integración, E2E
   - Pipeline CI/CD
   - Documentación técnica y README
   - Performance y caching
   - Seguridad y pen-testing básico

5. update_project({ project_id: "...", planning_status: "completed" })
    → Marca planning_status = 'completed'
```

Antes de generar o transformar documentación, el agente debe revisar `documentation_policy` en el contexto del proyecto y respetar el gate de clasificación:

- `personal` / `DevHub` → aplicar el flujo DevHub de documentación y planning.
- `shared_legacy` → preservar la documentación legacy y no transformarla por defecto.
- `archive_only` → archivar primero la documentación legacy y recién después crear documentación nueva en formato DevHub.

Si la policy falta o es ambigua, el agente debe preguntarle al usuario antes de seguir. Los proyectos compartidos no se fuerzan al formato DevHub por defecto.
Los docs legacy importados se archivan, no se sobrescriben.

> [!IMPORTANT]
> **El plan NO debe ser superficial.** Si el proyecto es un e-commerce, las tareas deben cubrir: auth, catálogo, carrito, checkout, pagos (Stripe), emails transaccionales, panel de admin, gestión de inventario, reportes, SEO, rendimiento de imágenes, seguridad PCI, etc. Cada área = múltiples tareas.

### Paso 4 — Resultado Final

Cuando `update_project({ planning_status: "completed" })` se ejecuta:

- `planning_status` → `completed`
- El sidebar cambia el dot de pulsante a estático
- El usuario puede navegar a **Roadmap** → ver hitos con fechas
- El usuario puede navegar a **Tareas** → ver Kanban completo
- El Dashboard muestra progreso real basado en tareas/hitos

---

## Path dedicado de launch (actualizado: ver "Preflight async" y "Dispatch confiable")

> [!IMPORTANT]
> **El path planning NO pasa por el gate DocOps** — usa su propio builder dedicado (`buildPlanningLaunchPrompt` + `buildPlanningLaunchCommand`) y un dispatcher con ack (`dispatchPlanningAgentRun`). El gate `enforceDocOpsGateOnLaunchCommand` se sigue aplicando a los demás orígenes (`swarm-control-launch`, `reopen-session`, undefined). El skip vive en `TerminalWorkspacesManager.handleRunAgent` y se activa cuando `e.detail.launchOrigin === 'planning-launch'`.

> Las menciones previas al "gate DocOps" en este documento quedaron obsoletas tras `planning-launch-hardening` (Fase 5, 2026-06-12) y se conservan solo por trazabilidad — ver **Preflight async**, **Dispatch confiable** y **Comandos** abajo para el flujo vigente.

---

## Preflight async (NUEVO — planning-launch-hardening Fase 3)

Antes de lanzar el agente, la página `Planificacion.jsx` ejecuta un **preflight asíncrono** que verifica tres dependencias en paralelo. Si alguna falla con `level: 'error'`, la planificación se bloquea y se renderiza un banner inline con el mensaje en español; no se navega a `/terminales` ni se llama a `launchPlanningAgent`.

| Check      | Endpoint                                  | Bloquea si                                                                                                |
| ---------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `opencode` | `GET /api/agenthub/opencode/status`       | `process.running === false` o `process.healthy === false`                                                 |
| `llm`      | `GET /api/agenthub/llm/status` (NUEVO)    | `ready === false`. El endpoint devuelve `{ ready, provider, reason }` y nunca expone `apiKey` ni `secret`. |
| `mcp`      | `GET /api/agenthub/mcp/status`            | La unión de herramientas reportadas no incluye `get_project_context` **o** `bulk_create_tasks`.            |

Cada check corre con `AbortController` y un timeout de 4 s. La implementación vive en `src/lib/planning/validatePlanningLaunch.js` y es pura respecto al DOM (recibe `fetchImpl` por parámetro para testabilidad). Los helpers `shouldBlockOnPreflight` y `firstPreflightError` extraen la decisión de UI como funciones puras testeables.

**Nuevo endpoint `GET /api/agenthub/llm/status`** (`src/app/api/agenthub/llm/status/route.js`):

- Lee `data/llm-providers-config.json` vía el reader existente (`getLlmProviderConfig`).
- Devuelve `{ ready, provider, reason }` con `reason` en español (p. ej. `"Proveedor openai falta campo apiKey"` o el genérico `"No hay proveedor LLM habilitado. Configurá uno en Ajustes."` cuando la lista está vacía).
- HTTP 200 siempre; el campo `ready` carries el estado.
- No expone `apiKey`, `secret`, ni ningún campo de credenciales.

---

## Dispatch confiable (NUEVO — planning-launch-hardening Fase 4)

El lanzamiento del agente usa un dispatcher con **retry-queue + ack** para tolerar el caso donde el listener (`TerminalWorkspacesManager`) aún no se montó cuando el evento `devhub:run-agent` se dispara tras la navegación a `/terminales`.

```
launchPlanningAgent(navigate, opts)
  ├── buildPlanningLaunchPrompt(opts)   → prompt (Fase 1 builder)
  ├── buildPlanningLaunchCommand(opts)  → comando shell (Fase 1 builder)
  └── dispatchPlanningAgentRun(detail)  → retry hasta MAX_ATTEMPTS=20 × RETRY_MS=100 ≈ 2 s
       ├── dispatchEvent('devhub:run-agent', { detail })
       ├── escucha 'devhub:run-agent-accepted' con detail.taskId matching
       └── si MAX_ATTEMPTS: console.warn en español y resuelve { accepted: false }
```

**Contrato de ack:** cuando `TerminalWorkspacesManager.handleRunAgent` completa `handleSplit` con un `createdPanelId` no nulo, dispara `devhub:run-agent-accepted` con `detail: { taskId: e.detail.taskId }`. El dispatcher para el loop en cuanto recibe el ack matching. Si la rama se llama con `launchOrigin !== 'planning-launch'`, el gate DocOps sigue corriendo (no se introdujo una ruta "planning-sin-gate" alternativa para otros launchOrigins).

**Skip del gate DocOps:** vive en `handleRunAgent` como un único ternario:

```js
const cmdToRun = e.detail?.launchOrigin === 'planning-launch'
  ? (e.detail.command || `opencode --agent ${e.detail.selectedAgent || DEFAULT_OPENCODE_AGENT}`)
  : enforceDocOpsGateOnLaunchCommand(e.detail.command || `opencode --agent ${e.detail.selectedAgent || DEFAULT_OPENCODE_AGENT}`);
```

`persistAgentRunMetadata` recibe `taskId: projectId` (ya no `planning-${Date.now()}`); el row key de auditoría deriva del UUID del proyecto. El close sigue siendo el literal `update_project({ project_id, planning_status: "completed" })` — `update_task` no se inyecta.

---

## `DEVHUB_PROJECT_ID` (NUEVO — env-var contract)

El agente `sdd-orchestrator` recibe el UUID del proyecto **desde la variable de entorno `DEVHUB_PROJECT_ID`**, NO desde el texto del prompt. Esto evita:

- Errores de copy-paste con UUIDs mal copiados en el prompt.
- Tokens del proyecto visibles en logs de terminal compartidos.
- Conflictos cuando el mismo workspace de terminales reusa el prompt para varios proyectos.

El comando generado por `buildPlanningLaunchCommand` siempre tiene la forma:

```sh
export DEVHUB_PROJECT_ID="<uuid>" && opencode --agent sdd-orchestrator --prompt '<prompt>'
```

El shell prompt es citado con `shellQuotePrompt` (single-quoted con escape de single-quote), por lo que backticks y comillas dobles del kickoff body se mapean a comillas simples en el payload para evitar sub-shells accidentales.

---

## Comandos (NUEVO — shell command shape)

La forma canónica del comando de launch es:

```sh
export DEVHUB_PROJECT_ID="<uuid>" && opencode --agent sdd-orchestrator --prompt '<prompt>'
```

Para invocar el agente manualmente desde un shell (modo "auto-lanzado" desde `Planificacion.jsx`):

```sh
export DEVHUB_PROJECT_ID="<uuid>" && opencode --agent sdd-orchestrator --prompt "$(cat /tmp/planning-prompt.txt)"
```

Para invocarlo a través del orquestador SDD (modo CI / batch):

```sh
export DEVHUB_PROJECT_ID="<uuid>" && opencode --agent sdd-orchestrator --prompt ...
```

El orquestador del DevHub lee `DEVHUB_PROJECT_ID` desde el env, no desde el texto del prompt. Si la variable está vacía o no es un UUID v4, `buildPlanningLaunchCommand` lanza `TypeError` antes de armar el comando.

> Las formas previas (`buildDocOpsOrchestratorLaunchPrompt` + `enforceDocOpsGateOnLaunchCommand` envueltas en `setTimeout(150)`) quedaron obsoletas tras `planning-launch-hardening` y se conservan solo por la rama archivada previa. Usar siempre el nuevo path.

---

| Extensión                       | Casos de uso típicos                                          |
| ------------------------------- | ------------------------------------------------------------- |
| `.md`                           | READMEs, specs funcionales, user stories, wireframes en texto |
| `.txt`                          | Notas libres, listas de requerimientos                        |
| `.json`                         | Esquemas de DB, configs, estructuras de datos                 |
| `.yaml` / `.yml`                | Configuraciones de servicios, OpenAPI specs                   |
| `.js` / `.ts` / `.jsx` / `.tsx` | Código de referencia, tipos TypeScript                        |
| `.py`                           | Scripts, modelos de datos en Python                           |
| `.csv`                          | Datasets de ejemplo, catálogos de productos                   |

**Límite:** 2MB por archivo · Los archivos se guardan como texto en Supabase (no binarios)

---

## Reglas para el Agente Planificador

1. **Exhaustividad obligatoria**: Mínimo 40 tareas, idealmente 50-60 en proyectos medianos/grandes.
2. **Sin redundancias**: Cada tarea debe ser única y accionable.
3. **Prioridades inteligentes**:
   - `critical` → Core del negocio, bloqueante
   - `high` → Features principales del MVP
   - `medium` → Mejoras importantes
   - `low` → Nice-to-haves, optimizaciones futuras
4. **Hitos con fecha**: Usar fechas razonables distribuidas a lo largo del tiempo de desarrollo estimado.
5. **Siempre cerrar** actualizando el proyecto con `update_project({ planning_status: "completed" })`.
6. **Si el contexto es insuficiente**: Crear tareas genéricas de investigación/definición como primeras tareas del primer milestone.

---

## Integración con Swarm Control

Una vez el planning está `completed`, el flujo natural continúa al **Swarm**:

```
Plan exhaustivo (40-60+ tareas en Supabase)
       ↓
Cola DevHub → get_execution_queue() / claim_next_task()
       ↓
Worker Agent → capability del ejecutor prepara branch task/<id>-<slug>
       ↓
Ejecuta la tarea → commits semánticos + push al branch de tarea
       ↓
DevHub MCP → add_task_comment() / update_task() / leases
       ↓
QA Agent → revisa branch/PR/artifacts → aprueba/rechaza
       ↓
Merge por ruta aprobada del repo (sin push directo a main desde el agente)
```

Ver [08 Orquestación de Enjambre](./08_Enjambre_Agentes_y_Orquestacion.md), [09 Prompts Maestros de Agentes](./09_Prompts_Maestros_Agentes.md), [23 Swarm Workspace](./23_Swarm_Workspace_Intencion_y_Roadmap.md) y [24 Política Git y Versionado](./24_Politica_Git_y_Versionado_Agentes.md) para el flujo vigente.
