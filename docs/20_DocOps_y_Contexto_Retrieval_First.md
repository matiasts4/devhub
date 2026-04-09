# 20. DocOps y Contexto Retrieval-First

## Objetivo

Definir un modelo estable para que la documentacion del proyecto evolucione con agentes en el largo plazo, sin obsolescencia caotica, sin inflar contexto, y con trazabilidad clara de que cambio, por que cambio, y que version reemplazo a cual.

Este documento formaliza el Camino A (implementacion incremental sobre DevHub actual).

## Problema que resolvemos

- La documentacion tiende a duplicarse o reescribirse sin lineage explicito.
- El agente recibe demasiado contexto de golpe y pierde foco.
- Versiones historicas sin criterio generan ruido y costo de memoria.
- No siempre se entiende que fue primero y que fue despues.

## Principios de diseno

1. Canonico + Evidencia

- Canonico: una version vigente por tema.
- Evidencia: historial de decisiones, diffs, fuentes y validaciones.

2. Retrieval-First

- Nunca inyectar contexto completo por defecto.
- Recuperar solo bloques minimos relevantes por objetivo actual.

3. Lineage deterministico

- Cada actualizacion documenta: reemplazo, razon, fuentes, timestamp, agente.

4. Operacion por contratos

- Mismos formatos para agentes, orquestador y herramientas MCP.

### 4.1 Orquestador preservado

- DocOps no reemplaza el orquestador actual.
- Los gates MCP agregan validacion, registro y cronologia encima del flujo existente.
- El orquestador debe respetar `documentation_policy` antes de planificar o reescribir docs.

5. Promocion controlada

- Un borrador no pisa canonico sin pasar validacion minima.

## Inventario MCP actual (base real disponible)

Fuente: devhub-mcp/server.js

### Ya disponible

- Proyectos: list_projects, get_project, update_project
- Tareas: list_tasks, create_task, update_task, delete_task, add_task_comment
- Dependencias: create_task_dependency, get_task_dependencies, get_next_task
- Hitos: list_milestones, create_milestone, update_milestone
- Dashboard: get_dashboard
- Planning: get_project_context, mark_planning_done
- Swarm: register_agent, heartbeat_agent, unregister_agent, update_agent_status
- Memoria: save_memory, recall_memory, recall_memory_semantic
- Git/Files: git_branch, git_commit, git_diff_review, explore_files, read_file, write_file, mkdir_p

### Gap funcional para DocOps largo plazo

- No hay entidad explicita de documento canonico por tema.
- No hay relacion de reemplazo entre versiones documentales.
- No hay tools MCP dedicadas a ciclo de vida documental.

### Telemetria operativa viva

- Los agentes activos se reflejan via `agent_registry`.
- `last_heartbeat` y `status` son la fuente de verdad operativa para la UI.
- La interfaz se alimenta con realtime para evitar recargas pesadas o contexto LLM extra.
- La vista debe mantenerse ligera: nada de dumps ni historiales completos para mostrar actividad.

### Presupuesto compartido

- `max_tokens_context`, `max_expansions` y `expansion_step_tokens` se definen una sola vez y se reutilizan en prompts y UI.
- La policy no se reescribe por pantalla: solo se presenta o consume.

## Modelo DocOps propuesto

### 1) Entidades

#### Doc Topic

- topic_key: identificador estable, ej. bridge-space/arquitectura
- project_id
- owner
- tags
- status

#### Doc Version

- topic_key
- version_number
- status: draft | active | superseded | archived
- replaces_version_id (nullable)
- summary
- content
- source_refs (array)
- changed_by_agent
- changed_at
- confidence_score (0-1)

#### Doc Evidence

- topic_key
- evidence_type: decision | qa | benchmark | incident | task_link
- reference_id (task/milestone/memory)
- note
- created_at

## 2) Contrato de contexto (Context Pack)

Todo agente de documentacion debe recibir un paquete pequeno y estructurado:

```yaml
objective: 'Actualizar roadmap de BridgeSpace'
topic_key: 'bridge-space/roadmap'
current_canonical:
  version: 12
  summary: 'Roadmap validado Q2'
constraints:
  - 'No modificar milestones cerrados'
  - 'Mantener compatibilidad con docs de arquitectura'
retrieved_evidence:
  - type: 'task'
    id: '...'
    reason: 'Cambio de prioridad'
  - type: 'memory'
    id: '...'
    reason: 'Decision previa'
open_questions:
  - 'Impacto en fase 4'
budget:
  max_tokens_context: 2500
```

Regla: si falta informacion, el agente pide retrieval adicional; no rellena con suposiciones.
La policy de presupuesto ya quedó centralizada y debe consumirse desde prompts y MCP.

### 2.1 Gate de clasificación documental

Antes de transformar documentación, el agente debe clasificar el proyecto con `documentation_policy`.
Ese gate decide si el flujo es DevHub, legacy-preserve o archive-first:

- `personal` / `DevHub` → aplica el flujo DevHub de documentación y planning.
- `shared_legacy` → preserva la documentación legacy y no la transforma por defecto.
- `archive_only` → archiva primero la documentación legacy y luego crea docs DevHub nuevas.

Si la policy falta o es ambigua, el agente debe preguntar al usuario antes de seguir.
Los proyectos compartidos no se fuerzan al formato DevHub por defecto.
Los docs legacy importados se archivan, no se sobrescriben.
En `archive_only`, primero se archiva el material legado y recién después se genera la nueva documentación.

## 3) Pipeline operativo

1. Discover

- Buscar canonico vigente por topic_key.
- Recuperar evidencia minima relevante (3-7 items).

2. Draft

- Generar propuesta de version draft con diff semantico.

3. Verify

- Chequear consistencia contra tareas, hitos y decisiones recientes.

4. Promote

- Si pasa validacion, marcar draft como active y la anterior como superseded.

5. Record

- Guardar memoria estructurada de lo decidido (What/Why/Where/Learned).

## 4) Politica Retrieval-First (obligatoria)

Orden de recuperacion:

1. topic exacto
2. entidades vinculadas recientes (tareas/hitos)
3. memoria semantica
4. anexos grandes solo bajo demanda

Presupuesto:

- Maximo inicial: 2.5k tokens de contexto efectivo.
- Maximo por expansion: +1k tokens por solicitud justificada.
- Tope de iteraciones de expansion por ciclo: 2.
- Esta politica se esta endureciendo en runtime; hoy ya no debe quedar solo en texto de prompt.

### 4.1 Schema / metadata en proyectos

Cuando un documento describa `projects`, debe mencionar explícitamente estos campos:

- `planning_prompt`
- `planning_status`
- `project_type`
- `local_path`
- `documentation_policy`

## 5) Tools MCP nuevas recomendadas

### get_doc_topic

Input:

- project_id
- topic_key

Output:

- canonical_version
- latest_versions
- linked_evidence

### propose_doc_update

Input:

- project_id
- topic_key
- draft_content
- summary
- source_refs

Output:

- draft_version_id
- diff_preview

### verify_doc_update

Input:

- project_id
- topic_key
- draft_version_id

Output:

- checks
- consistency_score
- blockers

### promote_doc_version

Input:

- project_id
- topic_key
- draft_version_id

Output:

- new_active_version
- superseded_version
- lineage_record

### list_doc_lineage

Input:

- project_id
- topic_key

Output:

- ordered_versions
- replace_chain
- timestamps

## 6) Reglas de gobernanza

1. Una sola version active por topic_key.
2. Toda nueva active debe apuntar a una replaced version (salvo version inicial).
3. Ningun agente puede promover si verify_doc_update devuelve blockers.
4. Toda promocion escribe memoria con formato estructurado.
5. Toda lectura para agente se hace por Context Pack, no por dump total.

## 7) Fases de implementacion (Camino A)

### Fase A1 (baja friccion)

- Definir contratos (este documento).
- Estandarizar topic_key.
- Enforzar Context Pack en prompts/orquestador.
- Preservar el orquestador y sumar validacion/cronologia sin rehacer el flujo.

### Fase A2 (MCP DocOps)

- Implementar tools nuevas de ciclo de vida documental.
- Integrar verify + promote.
- Mantener la telemetria viva por `agent_registry` + realtime, sin costo alto de tokens.

### Fase A3 (UX y observabilidad)

- Vista de lineage por topic.
- Indicadores de frescura y confianza.
- Alertas de docs obsoletas.

## 8) KPIs

- % de topics con version activa y lineage valido.
- Tiempo medio para actualizar doc canonico ante cambio relevante.
- Tokens promedio de contexto por ciclo documental.
- Ratio de promociones bloqueadas por inconsistencia.

## 9) Riesgos y mitigaciones

- Riesgo: sobre-automatizar promociones.
  Mitigacion: gate verify obligatorio + blockers.

- Riesgo: explosion de topics.
  Mitigacion: convencion de namespace y revision mensual.

- Riesgo: drift entre doc y realidad tecnica.
  Mitigacion: enlace obligatorio a task/milestone/memory en cada version.

## 10) Decision de hoy

Se adopta Camino A como base, priorizando:

1. Contratos y proceso
2. Retrieval-first estricto
3. Trazabilidad de versiones

El camino B (comparativa con upstream) queda como optimizacion posterior, no prerequisito.
