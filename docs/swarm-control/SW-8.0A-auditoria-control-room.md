# SW-8.0A — Auditoría de acoplamiento y textos en español del Control Room

Fecha: 2026-05-19
Tarea DevHub: `d16fa0ce-0801-45c7-9004-095aeba06dfe`

## Alcance

Auditoría del surface actual de `SwarmControl` / `Control Room` para detectar:

- copy visible en inglés o mezcla inglés/español;
- desacoples con el modelo actual de DevHub;
- riesgo de segunda fuente de verdad;
- duplicaciones innecesarias;
- tests que fijan copy en inglés;
- impacto para `SW-8.1A`, `SW-8.2A` y `SW-8.3A`.

No se aplicaron cambios funcionales. Se priorizó auditar y documentar.

## Archivos revisados

- `src/views/SwarmControl.jsx`
- `src/components/control-room/ControlRoomHeader.jsx`
- `src/components/control-room/AgentsClaimsPanel.jsx`
- `src/components/control-room/WorkspacesPanel.jsx`
- `src/components/control-room/RunsArtifactsPanel.jsx`
- `src/components/control-room/ApprovalsErrorsPanel.jsx`
- `src/components/control-room/DiagnosticOverlay.jsx`
- `src/components/control-room/utils.js`
- `src/lib/operations/swarmControl.js`
- `src/views/__tests__/SwarmControl.test.jsx`
- `src/lib/operations/__tests__/swarmControl.test.js`
- `tests/unit/swarmControl-view.test.js`
- `tests/unit/operations-swarm-control.test.js`
- `tests/e2e/04_swarm_control.spec.ts`
- `docs/user/02_SwarmControl_Explained.md`

## Hallazgos principales

### 1. El surface visible todavía está mayormente en inglés

La UI principal del Control Room usa copy en inglés en títulos, labels, estados vacíos, hints y acciones. Eso rompe consistencia con el resto de DevHub y con la intención explícita de llevar el surface a español.

### 2. Hay mezcla entre read-model y copy de UI

`src/lib/operations/swarmControl.js` no solo compone snapshot canónico: también fabrica strings de presentación como:

- `Workspace Control Room`
- `agent evidence`
- `workspace evidence`
- `run evidence`
- `artifact evidence`
- `approval evidence`
- `telegram snapshot`
- `process snapshot`
- `session stream snapshot`

Eso mete decisiones de idioma/presentación dentro del read-model y complica i18n, tests y evolución del contrato.

### 3. Existe riesgo real de segunda fuente de verdad en el encabezado

`SwarmControl.jsx` pasa `project?.name || header.workspace_label` a `ControlRoomHeader`.

Eso permite que el nombre del proyecto de routing/contexto pise el label derivado del snapshot. Si en `SW-8.1A` / `SW-8.2A` / `SW-8.3A` aparece una identidad más rica de Director/Team/Workspace, este fallback puede dejar la UI mostrando una identidad distinta a la verdad canónica del snapshot.

### 4. Naming inconsistente

Conviven varios nombres para la misma superficie:

- `SwarmControl`
- `Control Room`
- `Workspace Control Room`
- `Diagnostic overlay`

`DiagnosticOverlay` además no es un overlay real: es un panel colapsable. El naming actual confunde el modelo mental.

### 5. Hay duplicación menor pero clara en componentes

Los paneles de agentes, workspaces y runs repiten:

- `MetaRow`
- shell visual de cards
- patrones de empty state
- bloques de metadata similares

No es crítico para esta tarea, pero sí deuda de composición.

### 6. Los tests fijan fuerte el copy en inglés

Hay tests de vista y de operaciones que esperan strings visibles o semivisibles en inglés. Si se traduce UI sin estrategia, van a caer tests que en realidad están validando copy, no comportamiento.

## Textos en inglés encontrados y propuesta de traducción

### `src/views/SwarmControl.jsx`

| Texto actual                       | Propuesta                            |
| ---------------------------------- | ------------------------------------ |
| `Filter records`                   | `Filtrar registros`                  |
| `agent, workspace, run, evidence…` | `agente, workspace, run, evidencia…` |
| `Grid`                             | `Grilla`                             |
| `Stack`                            | `Apilado`                            |

### `src/components/control-room/ControlRoomHeader.jsx`

| Texto actual             | Propuesta                     |
| ------------------------ | ----------------------------- |
| `Control Room Header`    | `Encabezado del Control Room` |
| `Workspace Control Room` | `Control Room del workspace`  |
| `loading snapshot…`      | `cargando snapshot…`          |
| `Agents`                 | `Agentes`                     |
| `Queue`                  | `Cola`                        |
| `Authority`              | `Autoridad`                   |
| `Freshness`              | `Vigencia`                    |
| `agents active`          | `agentes activos`             |
| `queued`                 | `en cola`                     |
| `Evidence:`              | `Evidencia:`                  |

### `src/components/control-room/AgentsClaimsPanel.jsx`

| Texto actual                                                            | Propuesta                                                                       |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `Agents & claims`                                                       | `Agentes y claims`                                                              |
| `Claimed tasks, lease windows, workspace links, and durable authority.` | `Tareas tomadas, ventanas de lease, vínculo con workspace y autoridad durable.` |
| `No durable agents in snapshot.`                                        | `No hay agentes durables en el snapshot.`                                       |
| `No claimed task`                                                       | `Sin tarea tomada`                                                              |
| `Lease`                                                                 | `Lease`                                                                         |
| `Workspace`                                                             | `Workspace`                                                                     |
| `Run`                                                                   | `Run`                                                                           |
| `Authority`                                                             | `Autoridad`                                                                     |

### `src/components/control-room/WorkspacesPanel.jsx`

| Texto actual                                               | Propuesta                                                     |
| ---------------------------------------------------------- | ------------------------------------------------------------- |
| `Workspaces`                                               | `Workspaces`                                                  |
| `Durable workspace identity, branch, and latest evidence.` | `Identidad durable del workspace, branch y última evidencia.` |
| `No durable workspaces in snapshot.`                       | `No hay workspaces durables en el snapshot.`                  |
| `Branch`                                                   | `Branch`                                                      |
| `Agent`                                                    | `Agente`                                                      |
| `Task`                                                     | `Tarea`                                                       |
| `Authority`                                                | `Autoridad`                                                   |

### `src/components/control-room/RunsArtifactsPanel.jsx`

| Texto actual                                         | Propuesta                                                            |
| ---------------------------------------------------- | -------------------------------------------------------------------- |
| `Runs & artifacts`                                   | `Runs y artefactos`                                                  |
| `Latest run outcome and attached evidence timeline.` | `Último resultado del run y línea de tiempo de evidencia adjunta.`   |
| `No durable runs in snapshot.`                       | `No hay runs durables en el snapshot.`                               |
| `Workspace`                                          | `Workspace`                                                          |
| `Authority`                                          | `Autoridad`                                                          |
| `Risky outcome pending approval`                     | `Resultado riesgoso pendiente de aprobación`                         |
| `Outcome unapplied until approval evidence exists`   | `El resultado no se aplica hasta que exista evidencia de aprobación` |
| `No evidence`                                        | `Sin evidencia`                                                      |

### `src/components/control-room/ApprovalsErrorsPanel.jsx`

| Texto actual                                                      | Propuesta                                                                          |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `Approvals & errors`                                              | `Aprobaciones y errores`                                                           |
| `Pending gates and explicit evidence gaps. No mutation controls.` | `Gates pendientes y faltantes explícitos de evidencia. Sin controles de mutación.` |
| `Approvals`                                                       | `Aprobaciones`                                                                     |
| `No approval checkpoints in snapshot.`                            | `No hay checkpoints de aprobación en el snapshot.`                                 |
| `Errors`                                                          | `Errores`                                                                          |
| `No explicit errors in snapshot.`                                 | `No hay errores explícitos en el snapshot.`                                        |
| `Unknown error`                                                   | `Error desconocido`                                                                |
| `unknown source`                                                  | `origen desconocido`                                                               |

### `src/components/control-room/DiagnosticOverlay.jsx`

| Texto actual                                                                             | Propuesta                                                                                                           |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `Diagnostic overlay`                                                                     | `Panel diagnóstico`                                                                                                 |
| `Adapter and process diagnostics remain secondary to the durable control-room snapshot.` | `Los diagnósticos de adaptadores y procesos siguen siendo secundarios frente al snapshot durable del Control Room.` |
| `Collapse`                                                                               | `Contraer`                                                                                                          |
| `Expand`                                                                                 | `Expandir`                                                                                                          |
| `Session stream`                                                                         | `Flujo de sesión`                                                                                                   |
| `Process`                                                                                | `Proceso`                                                                                                           |

### `src/components/control-room/utils.js`

| Texto actual      | Propuesta            |
| ----------------- | -------------------- |
| `unknown`         | `desconocido`        |
| `No evidence`     | `Sin evidencia`      |
| `Missing source:` | `Fuente faltante:`   |
| `Live activity:`  | `Actividad en vivo:` |

### `src/lib/operations/swarmControl.js`

| Texto actual              | Propuesta                     |
| ------------------------- | ----------------------------- |
| `Workspace Control Room`  | `Control Room del workspace`  |
| `Server OK`               | `Servidor OK`                 |
| `Server off`              | `Servidor apagado`            |
| `Server sin datos`        | `Servidor sin datos`          |
| `Server degradado`        | `Servidor degradado`          |
| `agent evidence`          | `evidencia de agente`         |
| `workspace evidence`      | `evidencia de workspace`      |
| `run evidence`            | `evidencia de run`            |
| `artifact evidence`       | `evidencia de artefacto`      |
| `approval evidence`       | `evidencia de aprobación`     |
| `telegram snapshot`       | `snapshot de Telegram`        |
| `process snapshot`        | `snapshot de proceso`         |
| `session stream snapshot` | `snapshot de flujo de sesión` |
| `supervisor snapshot`     | `snapshot de supervisor`      |

## Duplicaciones y desacoples detectados

### Riesgo de segunda fuente de verdad

1. `buildSnapshotInput({ snapshotInput, fetchedInput, project })` permite que, sin snapshot durable, el render parta solo de `{ project }`.
2. `ControlRoomHeader` recibe `project?.name || header.workspace_label`.
3. `header.workspace_label` ya se deriva en `composeControlRoomSnapshot()`.

Conclusión: hay dos fuentes posibles para la identidad mostrada arriba del panel.

### Acoplamiento modelo + presentación

`composeControlRoomSnapshot()` normaliza estado, pero también define copy de UI. Eso vuelve más costoso:

- internacionalizar;
- testear semántica sin pinchar copy;
- reutilizar el snapshot en surfaces futuras.

### Duplicación de composición

- `MetaRow` repetido en tres paneles.
- cards con shell visual repetido.
- mismos patrones de metadata/empty state repetidos.

No urge corregirlo en `SW-8.0A`, pero sí conviene capturarlo como deuda técnica chica.

## Tests que todavía esperan inglés

### `src/views/__tests__/SwarmControl.test.jsx`

Fija textos como:

- `Workspace Control Room`
- `Agents & claims`
- `Runs & artifacts`
- `Approvals & errors`
- `Diagnostic overlay`
- `Risky outcome pending approval`
- `Outcome unapplied until approval evidence exists`
- `Missing source: approval evidence`
- `Missing source: telegram snapshot`
- `Live activity: running`
- `Live activity: idle`
- `Stack`

### `src/lib/operations/__tests__/swarmControl.test.js`

Fija valores internos derivados por el helper:

- `Workspace Control Room`
- `approval evidence`
- `telegram snapshot`
- `mcp snapshot`
- `process snapshot`
- `session stream snapshot`
- `supervisor snapshot`

### Tests auxiliares heredados

- `tests/unit/swarmControl-view.test.js`
- `tests/unit/operations-swarm-control.test.js`

Acá la mezcla es menor, pero todavía hay labels como `Server OK` y `Server degradado` que muestran inconsistencia de idioma en el modelo legacy.

## Riesgos para SW-8.1A / SW-8.2A / SW-8.3A

### SW-8.1A — modelo durable Director/Team/Agent Profile

Riesgo alto: si la identidad visible sigue resolviéndose por `project.name` además del snapshot, el Director/Team Profile puede quedar visualmente desacoplado del modelo durable.

### SW-8.2A — agent registry/profiles

Riesgo medio-alto: los paneles hoy ya mezclan `agent_id`, hints live, estado supervisor y labels de presentación. Si se agregan perfiles enriquecidos sin separar modelo/copy, el surface va a crecer sobre una base frágil.

### SW-8.3A — Team Control Room UI grid + Director panel

Riesgo alto: el naming actual (`SwarmControl`, `Control Room`, `Workspace Control Room`) no escala bien a una grilla de equipos + Director panel. Conviene definir taxonomía antes de expandir la UI.

## Cambios hechos en esta tarea

- Se creó este reporte: `docs/swarm-control/SW-8.0A-auditoria-control-room.md`.
- No se modificó código productivo.
- No se modificaron tests.

## Recomendación concreta

Para la siguiente iteración segura:

1. Traducir solo copy visible de `src/views/SwarmControl.jsx` y `src/components/control-room/*`.
2. Ajustar tests de vista afectados por ese copy.
3. Dejar para una tarea separada la limpieza estructural de `swarmControl.js` para sacar strings de presentación del read-model.
4. Definir una taxonomía única para la superficie (`SwarmControl` vs `Control Room` vs `Director/Team Control Room`) antes de `SW-8.3A`.

## Estado de verificación

- Tests ejecutados: no
- Motivo: no hubo cambios de código ni de tests
