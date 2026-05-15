---
Fecha de Modificación: 15 de mayo de 2026
Changelog:
  - 2026-03-27 v1: Creación del Índice Maestro y Reglas de la Wiki.
  - 2026-03-28 v2: Añadido documento 09_Prompts_Maestros_Agentes.md al índice.
  - 2026-03-28 v3: Añadidos docs 10_Nuevas_Features_UX_y_Analitica.md y 10_Planning_IA.md. Actualizado índice completo.
  - 2026-03-28 v4: Añadidos documentos 12 al 17 correspondientes a las Fases 4-9 del plan exhaustivo. Cada tarea del plan queda documentada con especificación técnica completa en su doc de fase.
  - 2026-05-14 v5: Añadida intención canónica de Swarm Workspace y nota de auditoría sobre Swarm/Telegram/MCP UI.
  - 2026-05-14 v6: Alineadas capas de Swarm Workspace para separar fases SDD, skills, perfiles de ejecución, roles runtime y supervisor durable.
  - 2026-05-15 v7: Añadida política canónica de Git/versionado para agentes y resumen del flujo operativo vigente.
  - 2026-05-15 v8: Añadido `PROJECT_CONTEXT.md` como snapshot derivado de entrada para continuidad operativa.
---

# 00 Guía Maestra

Este archivo es el **Mapa del Tesoro** del proyecto DevHub. Cualquier Agente IA o Desarrollador Humano debe acceder a este documento primero para entender las reglas de la base de conocimiento y encontrar la documentación correcta.

> **Entrada rápida recomendada:** después de esta guía, leer `docs/PROJECT_CONTEXT.md` para un snapshot operativo corto del estado actual y próximos pasos, y luego bajar al canon correspondiente.

## 📌 Reglas de Estructura y Nomenclatura

1. **Índice Numérico**: Todos los archivos comienzan con un número secuencial de dos dígitos (ej. `01_...`, `02_...`) para mantener el orden estricto en el explorador de archivos.
2. **Cronología y Trazabilidad**: Cada documento debe tener un encabezado YAML con la fecha de la última modificación y un `Changelog` con el registro de versiones.
3. **Formato**: Markdown estricto (`.md`) con jerarquía limpia (`#`, `##`, listas y tablas).
4. **Actualización Viva**: Si una funcionalidad se completa, **debe marcarse como completada** en el roadmap y verificarse en su directorio de QA.
5. **Estado de Múltiples Agentes**: Debido a que actuaremos con **múltiples agentes en simultáneo**, toda tarea en curso debe tener trazabilidad explícita. La cronología operativa canónica vive en **DevHub comments + estado de tarea/agente**; `06_QA_y_Verificacion.md` puede seguir usándose como apoyo humano mientras Swarm Workspace termina de formalizar artifacts y supervisor loop.
6. **Regla de Documentación para Agentes**: Cada tarea del plan tiene su especificación técnica completa en el documento de su fase (ver sección 6 del índice). Un Worker Agent **DEBE leer el documento de su fase** antes de comenzar a implementar, ya que contiene el schema SQL exacto, la firma de las tools, el algoritmo esperado y los criterios de éxito.

### Nota de alineación — capas de Swarm Workspace

Para trabajo nuevo de Swarm, leer siempre `23_Swarm_Workspace_Intencion_y_Roadmap.md` junto con `04_Protocolo_MCP_y_Agentes.md`.

Regla de lectura:

- fases SDD (`sdd-explore`, `sdd-apply`, `sdd-verify`, etc.) = **workflow phase**;
- perfiles/subagents OpenCode = **subagent/execution profile/package**;
- skills = **skill/capability**;
- Swarm DevHub = define **canonical runtime role** y **runtime state**;
- el supervisor/control plane persistente pertenece a DevHub, no al orchestrator SDD de OpenCode.

---

## 📂 Directorio de la Wiki

### 1. Documentación Core

- [01 Requerimientos y Alcance](./01_Requerimientos_y_Alcance.md)
- [02 Arquitectura del Sistema](./02_Arquitectura_Sistema.md)
- [03 Esquema Base de Datos](./03_Esquema_BaseDatos.md)

### 2. Gestión y Progreso

- [PROJECT_CONTEXT](./PROJECT_CONTEXT.md): snapshot derivado y operativo para retomar trabajo real sin reemplazar el canon.
- [04 Protocolo MCP y Agentes](./04_Protocolo_MCP_y_Agentes.md)
- [05 Roadmap y Fases](./05_Roadmap_Fases.md)
- [06 Control de Calidad y Verificación (QA)](./06_QA_y_Verificacion.md)

### 3. Correcciones y Mejoras

- [07 Plan de Correcciones y Mejoras](./07_Plan_Correcciones_y_Mejoras.md)

### 4. Arquitectura de Enjambre y Agentes IA

- [08 Orquestación de Enjambre y Memoria Git](./08_Enjambre_Agentes_y_Orquestacion.md): Reglas del Swarm, Anti-Colisión y Flujo Tripartito.
- [09 Prompts Maestros de Agentes (Worker & QA)](./09_Prompts_Maestros_Agentes.md): System Prompts canónicos listos para copiar-pegar al instanciar los agentes operativos del Enjambre.
- [23 Swarm Workspace — Intención y Roadmap](./23_Swarm_Workspace_Intencion_y_Roadmap.md): dirección canónica para refactorizar Swarm, Telegram, MCP UI, workspaces y coordinación multi-agente.
- [24 Política de Git y Versionado para Agentes](./24_Politica_Git_y_Versionado_Agentes.md): política vigente de ramas, commits, pushes, comentarios operativos y gates de merge.

### 5. Planificación IA

- [10 Nuevas Features UX y Analítica](./10_Nuevas_Features_UX_y_Analitica.md): Burndown chart, notificaciones toast, preferencias editor, analítica de swarm.
- [11 Planning IA — Flujo de Planificación Automática](./10_Planning_IA.md): Flujo completo de cómo un proyecto pasa de creación a plan exhaustivo (40-60+ tareas) usando el MCP.

### 6. Plan Exhaustivo — Fases 4 a 9 (Documentación por Tarea)

> Cada documento de esta sección contiene la especificación técnica completa de cada tarea de su fase: schema SQL, firma de tools del MCP, pseudocódigo de algoritmos, especificaciones de UI y criterios de éxito. Los Workers deben leer el documento de su fase antes de ejecutar.

| Doc                                                                                    | Fase / Milestone                           | Tareas cubiertas    | Due        |
| -------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------- | ---------- |
| [12 Priorización Inteligente](./12_Priorizacion_Inteligente_de_Tareas.md)              | Fase 4 — Motor de Scoring y Cola de Agente | PRIO-01 a PRIO-08   | 2026-04-25 |
| [13 Swarm Autónomo v2](./13_Swarm_Autonomo_v2.md)                                      | Fase 5 — Ejecución Real por LLM            | SWARM-01 a SWARM-07 | 2026-05-05 |
| [14 Testing y Deuda Técnica](./14_Testing_y_Deuda_Tecnica.md)                          | Fase 6 — Calidad, CI/CD y Limpieza         | QA-01 a QA-07       | 2026-05-15 |
| [15 Analítica y Memoria del Agente](./15_Analitica_y_Memoria_Agente.md)                | Fase 7 — Memoria RAG, Velocity, Predicción | MEMO-01 a MEMO-06   | 2026-05-28 |
| [16 Multi-Usuario y Colaboración](./16_Multi_Usuario_y_Colaboracion.md)                | Fase 8 — Roles, Realtime, Invitaciones     | TEAM-01 a TEAM-05   | 2026-06-10 |
| [17 Producción, Seguridad y Distribución](./17_Produccion_Seguridad_y_Distribucion.md) | Fase 9 — Launch, RLS, PWA, npm             | PROD-01 a PROD-07   | 2026-06-25 |

---

## ⭐ Flujo Maestro Histórico (snapshot 2026-03-28)

> **Nota 2026-05-14:** Este flujo debe leerse como visión histórica. Para trabajo nuevo de Swarm, la intención vigente es Swarm Workspace: ver [23_Swarm_Workspace_Intencion_y_Roadmap.md](./23_Swarm_Workspace_Intencion_y_Roadmap.md).

```
[Usuario Crea Proyecto]
       ↓
[Modal "Nuevo Proyecto" con Planning IA]
  - Prompt de contexto
  - Dropzone archivos (.txt, .md, .json, .py...)
       ↓
[Navega a /project/:id/planning]
       ↓
[PlanningMode.jsx — sube más archivos, refina prompt]
  - Botón "Guardar + Generar Prompt"
       ↓
[Usuario envía el prompt a Antigravity]
       ↓
[Antigravity usa MCP:]
  get_project_context() → lee archivos + prompt
  create_milestone() × N
  create_task() × 40-60+
  update_project(planning_status="completed")
       ↓
[Dashboard, Roadmap, Tareas — poblados automáticamente]
       ↓
[Cola de Agente — tareas ordenadas por priority_score]
  get_next_task() → tarea de mayor score
  Prompt Builder → context window completo
       ↓
[Swarm Control v2 — Workers de IA ejecutan autónomamente]
  capability del ejecutor → rama task/<id>-<slug>
  LLM API → ejecuta la tarea
  commit/push sobre branch de tarea
  qa_evaluate_branch() → QA automático
       ↓
[Merge a main — aprobado por QA IA o supervisión humana]
       ↓
[Memoria persistente]
  save_memory() → decisiones y aprendizajes del agente
  task_events → alimenta velocity y predicción de entrega
```

## ⭐ Flujo operativo vigente (resumen 2026-05-15)

```txt
[Usuario / Supervisor]
       ↓
[Planning IA]
  get_project_context()
  bulk_create_milestones() / bulk_create_tasks()
  update_project(planning_status="completed")
       ↓
[Cola DevHub]
  get_execution_queue() / claim_next_task()
       ↓
[Executor capability]
  branch task/<id>-<slug>
  código + docs
  commits semánticos
  push al branch de tarea
       ↓
[DevHub MCP]
  add_task_comment() para [git:start]/[git:checkpoint]/[git:qa-ready]
  update_task() / release_task()
       ↓
[QA + aprobación humana]
  revisión de branch/PR/artifacts
  merge por ruta aprobada del repo
       ↓
[Memoria / artifacts]
  comentarios, artifacts, decisiones y learnings persistidos
```

Regla simple: **Git vive en el ejecutor; DevHub MCP vive en el control plane.**

---

## 🗺️ Mapa de Dependencias entre Fases

```
Fase 4 (Priorización)  ─────────────────────────────────────┐
  PRIO-01 → PRIO-02 → PRIO-06                               │
                          ↓                                  │
Fase 5 (Swarm v2)    SWARM-01 → SWARM-02 ← SWARM-07        │
  Depende de: PRIO-06                                        │
                                                             │
Fase 6 (Testing)     QA-02 → QA-03 → QA-05                 │
  Paralela a Fase 5                                          │
                                                             ↓
Fase 7 (Memoria)     MEMO-01 → MEMO-02 → MEMO-06
  Depende de: SWARM-01 (agent_registry)

Fase 8 (Multi-user)  TEAM-01 → TEAM-02 → TEAM-03
  Depende de: MEMO-03 (task_events)

Fase 9 (Producción)  PROD-01 → PROD-02 → resto
  Depende de: Todas las fases anteriores completadas
```
