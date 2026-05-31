# Handoff SDD — Operator View / Director General

## Estado actual

Se avanzó la planificación de los puntos 1 a 5 del roadmap en modo de planning, sin implementación de código.

Quedó cerrada la descomposición en 5 cambios SDD separados para evitar mezclar fundación, UI y coordinación swarm en un solo paquete:

1. `operator-action-contract`
2. `operator-execution-timeline`
3. `operator-observer-chat-sidebar`
4. `operator-limited-actions`
5. `director-general-swarm-bridge`

## Decisiones ya tomadas

- La vista Operador debe vivir dentro de DevHub, no como producto aparte.
- El MVP de la vista Operador debe ir en el right dock existente, como un nuevo tab, no como canvas ni ventana separada.
- La vista debe ser tipo chat lateral: input abajo, respuestas del agente, acciones ejecutadas, estados y progreso visible.
- El canvas libre queda fuera del MVP.
- Voz queda fuera del MVP.
- Director General va después de contrato de acciones, timeline, vista Observador y modo Operador limitado.
- Director General debe envolver `swarm-director`; no debe reemplazarlo ni duplicarlo.

## Exploración relevante ya hecha

Se relevó la UI actual y la recomendación concreta fue usar `WorkspaceRightDock` como contenedor MVP de la vista Operador.

Hallazgo principal:

- Contenedor recomendado: `src/components/workspace/WorkspaceRightDock.jsx`
- Estado del dock: `src/components/workspace/rightDockState.js`
- Patrones reutilizables:
  - `src/components/chat/AgentTracePanel.jsx`
  - `src/components/chat/ChatInput.jsx`
  - `src/components/control-room/EvidenceTimelinePanel.jsx`
  - `src/components/control-room/ActiveProcessesPanel.jsx`
  - `src/components/control-room/utils.js`

## Artifacts creados

Se crearon las proposals de OpenSpec para los 5 cambios:

- `openspec/changes/operator-action-contract/proposal.md`
- `openspec/changes/operator-execution-timeline/proposal.md`
- `openspec/changes/operator-observer-chat-sidebar/proposal.md`
- `openspec/changes/operator-limited-actions/proposal.md`
- `openspec/changes/director-general-swarm-bridge/proposal.md`

## Qué falta

Todavía no se hicieron estas fases:

- `sdd-spec`
- `sdd-design`
- `sdd-tasks`

Tampoco se generó implementación (`sdd-apply`) ni verificación (`sdd-verify`).

## Orden recomendado para continuar

1. `operator-action-contract` -> `sdd-spec`
2. `operator-execution-timeline` -> `sdd-spec`
3. `operator-observer-chat-sidebar` -> `sdd-spec`
4. `operator-limited-actions` -> `sdd-spec`
5. `director-general-swarm-bridge` -> `sdd-spec`
6. Repetir el mismo orden para `sdd-design`
7. Repetir el mismo orden para `sdd-tasks`

## Riesgos / notas para el siguiente agente

- La persistencia hybrid quedó incompleta: en esta corrida se escribieron los artifacts en OpenSpec, pero varios subagentes reportaron que no tenían `mem_save` disponible para duplicar en Engram.
- DevHub sí está SDD-initialized y `openspec/config.yaml` sigue marcando `strict_tdd: true`, pero eso afecta sobre todo a `apply`/`verify`, no a proposal/spec/design/tasks.
- La vista Observador no debe degenerar en “chat bonito” solamente: tiene que mostrar transcript, timeline y feedback operativo real.
- No empezar por canvas, voz, ni swarm total.

## Prompt listo para el próximo agente

```text
Continuá el planning SDD de DevHub para la iniciativa Operator View / Director General.

Contexto ya resuelto:
- Ya existe el handoff en docs/Operator_View_SDD_Handoff_2026-05-30.md
- Ya existen estas proposals:
  - openspec/changes/operator-action-contract/proposal.md
  - openspec/changes/operator-execution-timeline/proposal.md
  - openspec/changes/operator-observer-chat-sidebar/proposal.md
  - openspec/changes/operator-limited-actions/proposal.md
  - openspec/changes/director-general-swarm-bridge/proposal.md
- La vista Operador MVP debe ir en WorkspaceRightDock como tab lateral tipo chat operativo.
- No implementar código todavía. Solo continuar planning.

Objetivo:
- Completar spec, design y tasks de estos 5 cambios, en ese orden.
- Mantenerlos separados y coherentes.
- Hacerlos entregables para equipo: claros, secuenciados y delegables.

Orden de trabajo:
1. operator-action-contract
2. operator-execution-timeline
3. operator-observer-chat-sidebar
4. operator-limited-actions
5. director-general-swarm-bridge

Reglas importantes:
- No mezclar canvas ni voz en el MVP.
- Director General envuelve swarm-director; no lo reemplaza.
- La vista Operador debe incluir transcript, acciones ejecutadas, estado/progreso visible y composer inferior.
- La timeline operativa debe existir antes de habilitar acciones de operador.
- El modo Operador es limitado y allowlisted antes de cualquier coordinación swarm.

Entregables esperados en esta continuación:
- spec.md para cada cambio
- design.md para cada cambio
- tasks.md para cada cambio
- un breve resumen final con dependencias, riesgos y orden recomendado de ejecución
```