---
Fecha de Modificación: 15 de mayo de 2026
Estado: VIGENTE — snapshot derivado
Owner: DevHub
Relacionado:
  - docs/00_Guia_Maestra.md
  - docs/04_Protocolo_MCP_y_Agentes.md
  - docs/05_Roadmap_Fases.md
  - docs/20_DocOps_y_Contexto_Retrieval_First.md
  - docs/23_Swarm_Workspace_Intencion_y_Roadmap.md
  - docs/24_Politica_Git_y_Versionado_Agentes.md
Changelog:
  - 2026-05-15 v1: Snapshot inicial de continuidad operativa con precedencia explícita entre DevHub, Engram, docs canónicas y este archivo.
---

# PROJECT_CONTEXT

**Derived snapshot.** Este archivo es punto de entrada corto para retomar trabajo real. **No reemplaza canon**.

## Precedencia operativa

1. **DevHub tasks/comments/milestones** → estado vivo de ejecución, claims, progreso y próximos pasos.
2. **Engram** → decisiones, descubrimientos, bugs, learnings y continuidad entre sesiones.
3. **canonical docs / docs canónicas** → contrato, arquitectura, roadmap y reglas operativas.
4. **PROJECT_CONTEXT** → resumen derivado para arrancar rápido; si drift, se corrige contra 1-3.

Regla madre: **OpenCode/executor reality y comportamiento real del server mandan**. Si DevHub o docs quedan desalineados, hay que verificarlos y espejarlos.

## Leer primero

1. `docs/00_Guia_Maestra.md`
2. `docs/23_Swarm_Workspace_Intencion_y_Roadmap.md`
3. `docs/24_Politica_Git_y_Versionado_Agentes.md`
4. `docs/04_Protocolo_MCP_y_Agentes.md`
5. `docs/05_Roadmap_Fases.md`
6. `docs/20_DocOps_y_Contexto_Retrieval_First.md`

## Estado actual verificado

- **Dirección activa**: `Fase 13 — Swarm Workspace`.
- **Milestone DevHub**: `Fase 13 — Swarm Workspace: auditoría, refactor y orquestación robusta` (`planned`).
- **Tarea de continuidad activa**: `[CTX-08] Snapshot operativo PROJECT_CONTEXT y regla de continuidad` (`in_progress`).
- **Se completó recientemente**: `SW-0.1`, `SW-0.2`, `SW-1.1`, `SW-1.2`, `SW-1.3`.
- **Desfase conocido**: `get_project_context` del repo sigue viejo para trabajo activo (planning prompt desktop/Tauri, `planning_status=pending`), así que **no usarlo como snapshot principal** hasta realinearlo.

## Próximas tareas recomendadas

Orden sugerido actual:

1. `SW-2.1` — diseño de `agent_workspaces` y estrategia branch/worktree.
2. `SW-2.2` — tool `prepare_agent_workspace`.
3. `SW-3.1` — modelo `agent_runs` + `agent_artifacts`.
4. `SW-4.1` — diseño de Supervisor Loop.
5. `SW-6.1` — refactor Telegram como adapter externo.
6. `SW-7.1` — MCP Control Center verificable.
7. `SW-5.1` — UI Swarm Workspace Control Room.

Motivo: primero contrato de aislamiento + trazabilidad + supervisor; después adapters y UI.

## Regla de trabajo fuera de plan

Si aparece trabajo **fuera de plan** pero relevante:

1. **DevHub**: crear tarea o dejar comment en la tarea afectada con estado real y outcome.
2. **Engram**: guardar decisión, discovery o bugfix con `mem_save(project: 'devhub')`.
3. **Docs canónicas**: actualizar si cambió contrato, arquitectura, roadmap o policy.
4. **PROJECT_CONTEXT**: tocarlo sólo si cambió la dirección activa, el orden recomendado, un desfase importante o la regla operativa de continuidad.

Regla simple: trabajo invisible = deuda. Si pasó en repo/runtime, se debe **espejar** en DevHub + Engram; y en docs si afecta interpretación futura.

## Uso correcto de cada capa

- **DevHub MCP**: quién hace qué ahora, estado de tareas, comments, milestones, leases.
- **Engram**: por qué se decidió algo, qué bug apareció, qué se aprendió.
- **Docs canónicas**: cómo debe funcionar el sistema y cuál es la dirección aprobada.
- **PROJECT_CONTEXT**: dónde estamos hoy y qué leer/hacer antes de tocar código.

## Cuando actualizar este archivo

Actualizarlo si cambia alguna de estas:

- dirección activa del proyecto;
- orden recomendado de trabajo;
- lista de docs canónicas de entrada;
- desfase importante entre realidad y artifacts existentes.

Si no cambia eso, no inflar este archivo.
