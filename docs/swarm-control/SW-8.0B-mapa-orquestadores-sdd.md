---
title: SW-8.0B — Mapa de capacidades de orquestadores SDD y perfiles de agente
task_id: 85bf8331-8326-4164-8ffe-aa9a5c13d710
status: draft
updated_at: 2026-05-19
owner: DevHub
---

# SW-8.0B — Mapa de capacidades de orquestadores SDD y perfiles de agente

## Resumen ejecutivo

DevHub **no** debe duplicar el orquestador SDD de OpenCode como supervisor persistente. La documentación vigente del repo ya fija otra frontera: **DevHub Director** debe ser el control plane durable y OpenCode/SDD debe entrar como **runtime package + workflow phases + execution profiles** reutilizables.

Hallazgo clave del código actual: hoy AgentHub expone un runtime real muy acotado. En UI, los nombres desconocidos y alias genéricos (`build`, `plan`, `qa`) terminan normalizados a **`sdd-orchestrator`** (`src/lib/agenthubSubagentState.js`). O sea: hoy ya existe una especialización fuerte hacia SDD, pero **no** existe todavía un registry canónico de perfiles durables en DevHub.

## Fuentes inspeccionadas

- `AGENTS.md`
- `docs/04_Protocolo_MCP_y_Agentes.md`
- `docs/08_Enjambre_Agentes_y_Orquestacion.md`
- `docs/09_Prompts_Maestros_Agentes.md`
- `docs/21_Implementacion_OpenCode_Headless.md`
- `docs/23_Swarm_Workspace_Intencion_y_Roadmap.md`
- `docs/24_Politica_Git_y_Versionado_Agentes.md`
- `docs/user/05_AgentHub.md`
- `openspec/config.yaml`
- `openspec/specs/swarm-process-lifecycle/spec.md`
- `openspec/specs/swarm-concurrency-limits/spec.md`
- `sdd/opencode-integration/exploration.md`
- `opencode.json`
- `.opencode/opencode.json`
- `src/views/AgentHub.jsx`
- `src/app/api/agenthub/headless/route.js`
- `src/app/api/agenthub/sessions/[sessionId]/status/route.js`
- `src/lib/swarm/processManager.js`
- `src/lib/agenthubSubagentState.js`
- `src/lib/slashSkills.js`

## 1. Cómo funciona hoy el SDD Orchestrator / runtime OpenCode

### 1.1 Flujo actual de dispatch

1. El usuario usa slash commands SDD (`/sdd-explore`, `/sdd-propose`, `/sdd-spec`, `/sdd-design`, `/sdd-tasks`, `/sdd-apply`, `/sdd-verify`, `/sdd-archive`).
2. AgentHub detecta `<execute_opencode agent="...">...`.
3. `dispatchOpenCode()` en `src/views/AgentHub.jsx` manda `POST /api/agenthub/headless` con:
   - `agent`
   - `prompt`
   - `project_id`
   - `model` solo si viene como `provider/model`
4. El backend `src/app/api/agenthub/headless/route.js`:
   - aplica límite de concurrencia;
   - garantiza `opencode serve` mediante `processManager.ensure()`;
   - crea o reutiliza sesión OpenCode;
   - manda el prompt a `POST /session/:id/message`;
   - consume SSE desde `/event`;
   - persiste trazas en DB local;
   - actualiza estado final `completed | error | aborted`.
5. El frontend hace polling de `/api/agenthub/sessions/{sessionId}/status` hasta estado terminal.

### 1.2 Qué hace realmente `sdd-orchestrator` hoy

No aparece como supervisor durable de Swarm. Aparece como **perfil/ruta de ejecución especializada** para subagentes SDD.

Pruebas concretas:

- `docs/23_Swarm_Workspace_Intencion_y_Roadmap.md` y `docs/04_Protocolo_MCP_y_Agentes.md` dicen explícitamente que el supervisor persistente **no** debe ser el orquestador SDD actual.
- `src/lib/agenthubSubagentState.js` normaliza nombres desconocidos a `sdd-orchestrator`.
- `src/lib/slashSkills.js` registra fases `/sdd-*` como comandos de AgentHub.
- `docs/user/05_AgentHub.md` aclara que `/sdd-*` son **workflow phases/capabilities**, no el supervisor durable.

### 1.3 Capacidades OpenCode realmente visibles en este repo

Capacidades confirmadas:

- `opencode serve` como servidor headless local.
- `POST /session`, `POST /session/:id/message`, `GET /event`, `GET /session/status`.
- streaming SSE con trazas `tool`, `text`, `reasoning`, `subtask`.
- soporte de `require.approval` documentado en `docs/21_Implementacion_OpenCode_Headless.md`.
- singleton process manager con PID file, adopción de proceso previo, shutdown y cleanup.
- enforcement de concurrencia en `headless/route.js`.

Capacidades **no** encontradas como verdad canónica de perfiles:

- no hay registry durable de perfiles de agente dentro de DevHub;
- no hay catálogo canónico repo-local de permisos por perfil;
- no hay separación durable entre profile, capability, workflow phase y runtime role en el modelo actual de UI/API;
- el root `opencode.json` solo referencia instrucciones (`.plyrium-forge/opencode-role.md`), no un mapa de perfiles DevHub.

## 2. Convenciones existentes que sí conviene reusar

### 2.1 Fases / workflow SDD

Reusar como `workflow_phase`:

- `sdd-explore`
- `sdd-propose`
- `sdd-spec`
- `sdd-design`
- `sdd-tasks`
- `sdd-apply`
- `sdd-verify`
- `sdd-archive`

### 2.2 Contrato operativo DevHub MCP

Reusar como contrato mínimo entre supervisor y ejecutor:

- `register_agent`
- `heartbeat_agent`
- `get_execution_queue`
- `claim_next_task`
- `add_task_comment`
- `update_task`
- `update_agent_status`
- `unregister_agent`

### 2.3 Convenciones Git/documentación ya fijadas

Reusar, no rediseñar:

- branch `task/<task-id>-<slug>`
- checkpoint gate antes de `completed` / `qa-ready`
- comentarios `[git:start]`, `[git:checkpoint]`, `[git:blocked]`, `[git:qa-ready]`, `[git:qa]`
- Git/files/tests fuera del MCP general y dentro del ejecutor

## 3. Qué NO duplicar

### 3.1 No duplicar supervisor durable en OpenCode

La decisión ya está tomada en docs 04 y 23: el supervisor durable vive en DevHub.

### 3.2 No duplicar Git/workspace lifecycle dentro del MCP general

`docs/24_Politica_Git_y_Versionado_Agentes.md` fija que Git, filesystem, tests, diffs y push viven en la capability del ejecutor.

### 3.3 No duplicar catálogo de perfiles en tres lugares

No conviene tener:

1. docs narrativas,
2. config OpenCode,
3. DB DevHub,

cada una con roles distintos. La fuente canónica debe quedar en DevHub, y OpenCode debe ser adapter/runtime package.

### 3.4 No mezclar conceptos distintos

Mantener separadas estas 4 capas:

- `workflow phase`
- `execution profile/package`
- `skill/capability`
- `runtime role`

## 4. Matriz propuesta de perfiles

| Perfil            | Propósito                                          | Puede hacer                                                                              | NO puede hacer                                                               | ¿Crea subagentes?                      | Permisos clave                                                   | Provider / app sugerido             |
| ----------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------- | ----------------------------------- |
| Director global   | Coordinación durable del proyecto/supervisor Swarm | priorizar, despachar, pausar, pedir approval, leer estado durable                        | editar código, Git directo, mergear, ser source of truth efímera             | Sí, vía dispatch controlado            | planning, approvals, queue, workspace/run visibility             | DevHub Web + DevHub MCP             |
| SDD Orchestrator  | Orquestación especializada de workflows SDD        | encadenar explore/spec/design/tasks/apply/verify/archive, lanzar perfiles especializados | ser control plane durable, tocar main, reemplazar leases/runs de DevHub      | Sí                                     | dispatch especializado, lectura de artifacts, selección de phase | AgentHub / OpenCode headless        |
| Explorer          | Investigación read-only                            | leer código/docs, comparar enfoques, generar findings                                    | editar archivos, Git, completar tareas de código                             | No por defecto                         | search, graph, docs, memory                                      | OpenCode / skill SDD explore        |
| Security Reviewer | Revisión de seguridad                              | revisar diffs, auth, secrets, threat model, hardening advice                             | definir producto, scope creep, mergear a main                                | Opcional, no por defecto               | diff review, security checks, comments                           | OpenCode + security skills          |
| QA                | Validación funcional/técnica                       | correr tests focalizados, verificar acceptance, emitir veredicto                         | agregar features, cambiar alcance, mergear sin aprobación                    | No                                     | test runner, diff review, evidence, comments                     | OpenCode headless / runner          |
| Coder             | Ejecución de cambios                               | editar archivos, correr lint/tests focalizados, operar branch de tarea, producir commits | mergear a protegidas, redefinir alcance solo                                 | No por defecto                         | filesystem, Git, checks, DevHub updates                          | OpenCode / IDE ejecutor             |
| Writer            | Documentación operativa/técnica                    | actualizar docs, changelog, spec, proposal, resumenes                                    | alterar arquitectura/código productivo sin aprobación                        | No                                     | docs-only, comments, specs                                       | DevHub/AgentHub docs profile        |
| DevOps            | Operación técnica                                  | scripts, health checks, observabilidad, config runtime, despliegue acotado               | cambiar dominio funcional sin aprobación, usar DevHub MCP como shell general | Sí, si hay diagnósticos/smoke acotados | infra/runtime/ops                                                | executor especializado + DevHub MCP |

## 5. Límites recomendados por perfil

### Director global

- **Authority scope:** portfolio / project / team routing.
- **Side effects:** ninguno sobre código o Git.
- **Truth source:** DevHub DB y artifacts durables.

### SDD Orchestrator

- **Authority scope:** feature/change workflow.
- **Side effects:** solo disparar ejecuciones especializadas.
- **Truth source:** lee artifacts y reporta; no owns runtime durable state.

### Explorer

- **Authority scope:** research.
- **Side effects:** none.
- **Truth source:** findings + engram + proposal/spec inputs.

### Security Reviewer / QA

- **Authority scope:** review/validation.
- **Side effects:** comments + verdicts + evidence.
- **Truth source:** diff + docs + run artifacts + checks.

### Coder / DevOps / Writer

- **Authority scope:** execution.
- **Side effects:** según capability del ejecutor.
- **Truth source:** artifacts de ejecución + comentarios operativos + checkpoint Git.

## 6. Recomendación concreta para SW-8.1A

### 6.1 Modelo durable mínimo

Crear un modelo canónico en DevHub con estas entidades mínimas:

#### `agent_profile`

- `profile_key`
- `display_name`
- `runtime_role`
- `provider`
- `app`
- `runtime_package`
- `authority_scope`
- `can_spawn_subagents`
- `can_edit_files`
- `can_use_git`
- `can_run_tests`
- `can_request_approval`
- `can_merge_protected`
- `default_workflow_phases[]`
- `default_skills[]`
- `prohibited_actions[]`
- `evidence_contract`
- `status`

#### `workflow_phase`

- `phase_key`
- `kind` (`explore|propose|spec|design|tasks|apply|verify|archive|custom`)
- `default_profile_key`
- `requires_artifacts[]`
- `writes_artifact`

#### `profile_capability_binding`

- `profile_key`
- `capability_key`
- `permission_level`
- `approval_required`

### 6.2 Regla estructural importante

`runtime_role` **no** debe ser igual a `profile_key`.

Ejemplo correcto:

- profile `sdd-orchestrator`
- runtime_role `planner`
- workflow phases `sdd-explore`, `sdd-spec`, `sdd-design`, `sdd-tasks`

Eso evita mezclar identidad de perfil con función operativa.

## 7. Recomendación concreta para SW-8.2A

### 7.1 Registry canónico de capabilities

Implementar un registry durable en DevHub para que OpenCode sea solo un consumidor/adaptador.

Campos mínimos de `capability`:

- `capability_key`
- `kind` (`mcp`, `git`, `filesystem`, `tests`, `docs`, `security-review`, `sdd-phase`, `approval`, `ops`)
- `surface`
- `allowed_tools[]`
- `requires_permissions[]`
- `approval_required_for[]`
- `side_effect_class` (`none`, `read_only`, `repo_write`, `git_write`, `runtime_ops`)
- `owner_system` (`devhub`, `opencode`, `external`)
- `default_runtime`
- `output_contract`
- `evidence_contract`

### 7.2 Adapter esperado

SW-8.2A debería resolver este flujo:

1. DevHub selecciona `profile_key` + `workflow_phase`.
2. DevHub resuelve capabilities y permisos.
3. DevHub decide runtime package (`AgentHub/OpenCode`, otro ejecutor, etc.).
4. Recién ahí arma el payload hacia OpenCode (`agent`, `prompt`, `model`, `artifacts refs`).

## 8. Hallazgos finos del código que impactan el diseño

### 8.1 Hoy el mapa real de subagentes está subnormalizado

`src/lib/agenthubSubagentState.js`:

- vacío -> `sdd-orchestrator`
- `build` -> `sdd-orchestrator`
- `plan` -> `sdd-orchestrator`
- `qa` -> `sdd-orchestrator`
- cualquier nombre no válido -> `sdd-orchestrator`

Conclusión: hoy el sistema todavía **no expresa bien perfiles distintos**. Eso justifica SW-8.1A y SW-8.2A.

### 8.2 `opencode.json` no sirve como registry de perfiles

`/opencode.json` solo contiene:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "instructions": [".plyrium-forge/opencode-role.md"]
}
```

Eso apenas fija una instrucción base. No modela permisos, límites, roles runtime ni catálogo durable de perfiles.

### 8.3 `.opencode/opencode.json` hoy solo enchufa DevHub MCP

El archivo conecta el MCP local `devhub` a `devhub-mcp/server.js`, pero tampoco define perfiles.

### 8.4 El root prompt actual está sesgado a un Director externo

`.plyrium-forge/opencode-role.md` describe un **Director** tipo Plyrium con `team-tell`, `team-spawn`, worktrees `.plyrium-forge/worktrees/` y control de escritorio. Eso sirve como antecedente conceptual, pero **no** debe tomarse como contrato canónico del swarm durable de DevHub.

## 9. Riesgos de duplicación

1. **Crítico:** duplicar supervisor durable en OpenCode/AgentHub y en DevHub.
2. **Crítico:** volver a meter Git/worktree/merge dentro del DevHub MCP general.
3. **Alto:** tener dos catálogos de perfiles incompatibles: uno en docs/UI y otro en runtime.
4. **Alto:** usar logs/SSE/terminal como source of truth en vez de `agent_workspaces`, `agent_runs`, `agent_artifacts`, `evidence_ref`.
5. **Alto:** tratar slash commands SDD como identidad de agente en vez de phases.
6. **Medio:** otorgar permisos amplios a `sdd-orchestrator` cuando debería ser un profile especializado y no un superuser.
7. **Medio:** modelar `qa` y `security` como simples aliases del mismo perfil generalista.

## 10. Decisión recomendada

### Adoptar esta frontera

- **DevHub Director** = supervisor durable, global, con ownership de queue, leases, workspaces, runs, artifacts, approvals y recovery.
- **SDD Orchestrator** = perfil avanzado de planificación/feature workflow; puede despachar subagentes pero no reemplaza al control plane durable.
- **Explorer / Security Reviewer / QA / Coder / Writer / DevOps** = perfiles explícitos con permisos acotados y capabilities declarativas.
- **OpenCode** = runtime package / execution adapter.
- **Slash commands `/sdd-*`** = workflow phases, no perfiles durables.

## 11. Siguiente paso recomendado

### Para SW-8.1A

Diseñar el esquema durable de `agent_profile`, `workflow_phase`, `capability` y bindings, sin tocar todavía la UI final.

### Para SW-8.2A

Implementar el registry canónico en DevHub y un adapter que traduzca `profile + phase + capability set` hacia payloads de OpenCode/AgentHub.

## 12. Estado Git al cerrar esta investigación

Este reporte agrega un archivo nuevo en el repo. Como la tarea pidió explícitamente **no hacer commits**, el estado operativo correcto es:

- no marcar `completed` con checkpoint Git final si no existe commit local trazable;
- dejar la evidencia en working tree y reportar `git status --short` al cierre.
