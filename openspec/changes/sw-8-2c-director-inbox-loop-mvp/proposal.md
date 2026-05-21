# Proposal: SW-8.2C Director Inbox Loop MVP

## Intent

Resolver drift: notas viejas empujaban SW-8.2C hacia runtime resolution, pero el repo ya tiene SW-8.2B durable-first (`mission_messages` + `message_deliveries`) y una seam read-side usable. El slice seguro ahora es darle al Director un inbox/poll loop compacto sobre `mission_control`, sin abrir lifecycle, bindings ni rediseño UI.

## Scope

### In Scope

- Definir un snapshot durable-first para Director con `recent_messages` bounded, `pending_deliveries`, `presence` y un `watermark`/`snapshot_at` apto para polling sin churn.
- Mantener `GET /api/agenthub/operations/health` y el POST del composer local sobre el mismo contrato de proyección.
- Congelar tests determinísticos de orden, límites, no-op refresh y ausencia de runtime truth leakage.

### Out of Scope

- `team_messages`, tablas nuevas, MCP/tools nuevos, resolver de bindings, terminal/session lifecycle, SSE/live feed, provider expansion.
- SW-8.2D binding/lifecycle, SW-8.3A grid/panel redesign, SW-8.4A terminal/session lifecycle.

## Capabilities

### New Capabilities

- `director-mission-inbox`: inbox/poll loop compacto del Director sobre el mission kernel existente.

### Modified Capabilities

- `swarm-observability`: el snapshot health SHALL transportar `mission_control` bounded y pollable sin logs/runtime truth.

## Approach

Reusar `getSwarmMissionDirectorSnapshot()` como selector canónico. El cambio agrega semántica de inbox bounded y watermark derivado SOLO de filas durables (`mission_messages`, `message_deliveries`, `agent_presence`, `swarm_missions`). `route.js` expone esa proyección; `swarmControl` solo normaliza/consume; UI queda mínima o nula porque `MissionKernelPanel` ya lee `recent_messages`, deliveries y presence.

## Affected Areas

| Area                                                           | Impact    | Description                                                         |
| -------------------------------------------------------------- | --------- | ------------------------------------------------------------------- |
| `openspec/changes/sw-8-2c-director-inbox-loop-mvp/proposal.md` | New       | Propuesta del slice MVP                                             |
| `src/lib/db/localDb.js`                                        | Modified  | Selector `getSwarmMissionDirectorSnapshot()` con bounds + watermark |
| `src/lib/db/localDb.test.js`                                   | Modified  | Contratos RED/GREEN del snapshot Director                           |
| `src/app/api/agenthub/operations/health/route.js`              | Modified  | GET/POST devuelven mismo contrato pollable                          |
| `tests/agenthub/api/operations-health.test.js`                 | Modified  | Snapshot health + composer loop                                     |
| `src/lib/operations/swarmControl.js`                           | Reference | Normalización existente debe seguir compatible                      |

## Risks

| Risk                                            | Likelihood | Mitigation                                                  |
| ----------------------------------------------- | ---------- | ----------------------------------------------------------- |
| Reabrir drift con notas viejas de SW-8.2C       | Med        | Explicitar reinterpretación en specs/design                 |
| Snapshot crece sin bound y vuelve flaky el poll | High       | Límites y orden newest-first fijos                          |
| Se cuele runtime/session truth                  | High       | Watermark solo desde durable rows; sin SSE/logs/session ids |

## Rollback Plan

Revertir la proyección bounded/watermark y volver al snapshot actual; no hay schema nuevo ni migración durable para deshacer.

## Dependencies

- `openspec/changes/sw-8-1c-swarm-mission-kernel/specs/swarm-mission-kernel/spec.md`
- SW-8.2B `team_tell` durable ya verificado en `src/lib/swarm/teamTell.js`
- Seam read-side existente: `src/app/api/agenthub/operations/health/route.js`, `src/lib/operations/swarmControl.js`, `src/components/control-room/MissionKernelPanel.jsx`

## Success Criteria

- [ ] Director recibe `mission_control` con `recent_messages` bounded, deliveries pendientes, presence TTL y watermark durable.
- [ ] GET health y POST composer devuelven el mismo contrato compacto y determinístico.
- [ ] El slice no agrega tablas, bindings, session lifecycle ni runtime truth nueva.
