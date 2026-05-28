---
title: SW-8.1E — Fase 14: boundary entre DevHub CLI, MCP público y runtime interno
status: draft
updated_at: 2026-05-22
owner: DevHub
related:
  - docs/04_Protocolo_MCP_y_Agentes.md
  - docs/23_Swarm_Workspace_Intencion_y_Roadmap.md
  - docs/swarm-control/SW-8.0B-mapa-orquestadores-sdd.md
  - docs/swarm-control/SW-8.1D-token-efficient-agents.md
---

# SW-8.1E — Fase 14: boundary entre DevHub CLI, MCP público y runtime interno

DevHub debe conservar la **verdad durable** del swarm. La CLI `devhub` debe resolver el **hot path operativo** con comandos compactos y baratos. El MCP público debe seguir existiendo como **contrato multi-cliente acotado**, pero no como bus interno de alta frecuencia ni como wrapper público de todo el plumbing de agentes.

## Quick path

1. Congelar esta frontera como decisión arquitectónica.
2. Reescribir la milestone/tareas de Fase 14 para reflejarla.
3. Extraer módulos compartidos de runtime antes de construir la CLI.
4. Podar el MCP público recién cuando exista paridad funcional y tests.

## Respuesta corta a la duda sobre la orquestación actual

- No encontré un artefacto de código llamado `S1` como nombre canónico del orquestador.
- El flujo real actual es **híbrido**, no MCP-puro:
  - **launch local swarm**: escribe directo en SQLite mediante módulos de dominio;
  - **cola / claim / lease**: usa DevHub MCP;
  - **estado terminal de sesiones headless**: se reconcilia contra OpenCode `/session/status`;
  - **UI/read-model**: consume snapshots y mirrors observacionales.
- `register_agent`, `heartbeat_agent`, `update_agent_status` y `unregister_agent` **no** son la verdad principal del swarm. Hoy viven más cerca de telemetría/compatibilidad visual que de control plane real.

## Dónde vive la verdad hoy

| Dominio                     | Fuente principal                                                                                                                       | Qué responde                                                |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| misión / director snapshot  | `swarm_missions`, `mission_participants`, `mission_messages`, `message_deliveries`, `agent_presence` vía `src/lib/db/swarmMissions.js` | quién participa, mensajes, presencia, snapshot del Director |
| cola / prioridad / leases   | `tasks` + lógica de cola en `devhub-mcp/server.js`                                                                                     | qué tarea está disponible, bloqueos, claims, renew/release  |
| workspace / run / artifacts | `agent_workspaces`, `agent_runs`, `agent_artifacts`, `supervisor_snapshots`, `supervisor_approval_checkpoints`                         | ownership, evidencias, approvals, recovery                  |
| sesiones headless           | `agent_hub_sessions` reconciliado con OpenCode `/session/status`                                                                       | si una sesión terminó, abortó o sigue viva                  |
| telemetría visual           | `agent_registry` + mirrors UI/localStorage                                                                                             | badges, hints y compatibilidad; **no** truth source         |

## Evidencia clave en código

| Archivo                                                     | Qué demuestra                                                                                                          |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `src/app/api/agenthub/operations/health/route.js`           | entrypoint real del launch local; crea misión/workspace/run/presence directo en DB y compone snapshot del Control Room |
| `src/lib/db/swarmMissions.js`                               | kernel durable del Director y snapshot de misión                                                                       |
| `src/lib/db/workspaces.js`                                  | preparación de lease de workspace y bindings runtime                                                                   |
| `src/lib/db/agentRuns.js`                                   | lifecycle durable de runs                                                                                              |
| `src/lib/db/supervisor.js`                                  | bloqueos, approvals, retry/recovery                                                                                    |
| `src/app/api/agenthub/sessions/[sessionId]/status/route.js` | aprende fin/estado de sesiones headless vía OpenCode `/session/status`                                                 |
| `src/app/api/agenthub/sessions/health/route.js`             | reconcilia sesiones stale entre DB y runtime OpenCode                                                                  |
| `src/lib/operations/swarmControl.js`                        | selector/read-model; no es autoridad                                                                                   |
| `src/lib/swarm/teamTell.js`                                 | delivery persist-first de mensajes de misión                                                                           |
| `src/components/TerminalWorkspacesManager.jsx`              | todavía hay bridges/mirrors de UI y escrituras visuales ligadas a `agent_registry`                                     |

## Decisión de boundary

### 1. MCP público: contrato portable y durable

Debe quedarse con lo que otras aplicaciones realmente necesitan consumir o invocar como contrato estable:

- proyectos, tareas, milestones, comentarios;
- `get_execution_queue`, `get_next_task`, `claim_next_task`, `renew_task_lease`, `release_task`;
- evidencias/snapshots bounded como `get_workspace_evidence`;
- approvals o `team_tell` **solo** si son parte del contrato multi-cliente y no simple plumbing interno.

No debe cargar:

- heartbeats internos de alta frecuencia;
- streaming de mensajes/logs finos;
- ownership visual de `agent_registry`;
- plumbing de launch local, bindings runtime o mirrors de panel.

### 2. DevHub CLI: operador hot-path

La CLI debe ser un adapter operativo, **stateless**, con salida compacta y semántica:

- `devhub status`
- `devhub queue`
- `devhub agents`
- `devhub swarm`
- `devhub task <id>`
- `devhub ws <id>`
- `devhub run <id>`
- `devhub heartbeat <agent>`
- `devhub update-status <agent> ...`
- `devhub claim`
- `devhub release`
- `devhub tell`

Reglas:

- salida corta y orientada a decisión;
- exit codes semánticos;
- sin copiar logs completos;
- preferir módulos compartidos/runtime DB antes que hoppear por MCP para cada lectura frecuente.

### 3. Runtime interno: plumbing efímero + compactación

Debe absorber lo que hoy mezcla control plane, session runtime y bridges visuales:

- launch local del swarm;
- resolution de bindings/sesiones OpenCode;
- polling/reconciliación de `/session/status`;
- message bus local / heartbeats de alta frecuencia;
- compactación de estado fino a snapshots útiles;
- bridges observer-only (`agent_registry`, localStorage, paneles temporales);
- CRUD low-level que sólo sirve al runtime interno.

## Propuesta de tools: mantener vs sacar del surface público

### Mantener en MCP público

- `get_execution_queue`
- `get_next_task`
- `claim_next_task`
- `renew_task_lease`
- `release_task`
- `update_task`
- `add_task_comment`
- `get_workspace_evidence`
- herramientas de proyectos/tareas/milestones/comentarios
- approvals bounded si clientes externos las necesitan

### Sacar del surface público o pasar a interno/admin-only

- `register_agent`
- `heartbeat_agent`
- `update_agent_status`
- `unregister_agent`
- ownership directo de `agent_registry`
- lifecycle runtime de sesiones OpenCode
- `create_agent_workspace` / `update_agent_workspace` / `create_agent_run` / `append_agent_artifact` cuando funcionen como plumbing interno y no como contrato externo

## Fase 14: slices recomendados

### Slice A — extraer core compartido

Primero mover lógica reusable fuera de `devhub-mcp/server.js` y de `src/app/api/agenthub/operations/health/route.js`:

- lectura compacta del director snapshot;
- cola/prioridad/lease helpers;
- resolvers de workspace/run/evidence;
- formateadores compactos para CLI.

### Slice B — CLI read path

Implementar primero las lecturas compactas:

- `status`
- `queue`
- `agents`
- `swarm`
- `task`
- `ws`
- `run`

Objetivo: bajar tokens y hops para operación diaria sin tocar todavía el contrato externo.

### Slice C — CLI bounded mutations

Agregar mutaciones cortas y seguras:

- `heartbeat`
- `update-status`
- `claim`
- `release`
- `tell`

Estas mutaciones deben escribir intención/snapshot resumido, no transcript crudo.

### Slice D — poda del MCP público

Con la CLI ya usable y tests verdes:

- mover tools de `agent_registry` a runtime interno o admin-only;
- dejar wrappers de compatibilidad temporales donde haga falta;
- documentar contrato público vs interno.

### Slice E — docs + compatibilidad

- tests de integración de la CLI;
- matriz `public MCP vs internal runtime`;
- guía de migración para consumers actuales.

## Diff recomendado sobre la milestone/tareas actuales

### Milestone Fase 14

Mantener la milestone, pero corregir su intención:

- **NO**: “la CLI reemplaza el control plane y el MCP queda sólo para CRUD de tareas/milestones”.
- **SÍ**: “la CLI absorbe el hot path operativo; el MCP público queda como contrato portable acotado; el runtime interno absorbe el plumbing de agentes”.

### Tarea a reescribir sí o sí

Reemplazar:

- `CLI-11: Reducir MCP server a CRUD de tareas/milestones`

Por algo equivalente a:

- `CLI-11: Separar MCP público mínimo del runtime interno del swarm`

### Ajustes recomendados sobre tareas existentes

- `CLI-4 agents` debe leer snapshot/presence/sessions con fallback de telemetría, no depender solo de `agent_registry`.
- `CLI-5 swarm` debe ser vista compuesta del Director, no mera agregación superficial.
- `CLI-10` debe extraer shared core tanto de `server.js` como de `operations/health/route.js`.
- agregar un task explícito de compatibilidad/deprecación si el pruning del MCP rompe consumers existentes.

## Riesgos si no hacemos esta separación

- MCP usado como bus interno de alta frecuencia;
- más tokens y más latencia para operadores/agentes;
- `agent_registry` sobreviviendo como pseudo-source-of-truth;
- más drift entre docs, UI y runtime real;
- CLI encima de arquitectura equivocada, en lugar de CLI encima de un core reusable.

## Checklist de aceptación

- [ ] El Director puede leer estado útil sin depender de logs completos.
- [ ] La CLI resuelve el hot path con snapshots compactos.
- [ ] El MCP público conserva proyectos/tareas/milestones/comentarios y primitives de ejecución bounded.
- [ ] `agent_registry` deja de presentarse como verdad canónica del swarm.
- [ ] El runtime interno absorbe polling, bindings y telemetría efímera.
- [ ] La poda del MCP ocurre después de la extracción de core y la paridad mínima de la CLI.

## Próximo paso recomendado

1. Aprobar este boundary.
2. Actualizar milestone/tareas de Fase 14 en DevHub.
3. Empezar por `CLI-10` (extracción de core compartido) antes de `CLI-1/CLI-2`.
