# Proposal: SW-8.1C Swarm Mission Kernel

## Intent

Definir un kernel durable mínimo para coordinación de swarm en DevHub sin convertir terminales, SSE, sessionStore, OpenCode ni adapters de runtime en fuente de verdad.

## Scope

### In Scope

- Especificar las entidades canónicas `swarm_missions`, `mission_participants`, `mission_messages`, `message_deliveries` y `agent_presence`.
- Fijar naming, relaciones con `project/task/workspace/run`, retención, TTL, estados de delivery y snapshot compacto para Director.
- Congelar la frontera durable vs runtime-only y las referencias permitidas a `agent_workspaces`, `agent_runs`, `agent_artifacts` y `supervisor_approval_checkpoints`.

### Out of Scope

- UI final, terminal lifecycle, apertura de terminales, dispatch avanzado, delivery real OpenCode, adapter Codex/Claude, y cambios en `devhub-mcp/server.js`.
- Promover `agent_teams`/`team_members` del read-model UI a schema canónico.

## Capabilities

### New Capabilities

- `swarm-mission-kernel`: contrato durable mínimo para misión, participantes, mensajes, deliveries y presencia compacta.

### Modified Capabilities

- None.

## Approach

Tratar una mission como contexto durable de coordinación, no como reemplazo de workspace/run/supervisor. La mission referencia project/task/workspace/run/approval/evidence, pero no duplica ownership ni provenance. Los mensajes durables guardan intención resumida; los adapters/runtime resuelven entrega real, logs, SSE y terminales como estado efímero.

## Affected Areas

| Area                                                                               | Impact    | Description                          |
| ---------------------------------------------------------------------------------- | --------- | ------------------------------------ |
| `openspec/changes/sw-8-1c-swarm-mission-kernel/proposal.md`                        | New       | Propuesta mínima SW-8.1C             |
| `openspec/changes/sw-8-1c-swarm-mission-kernel/specs/swarm-mission-kernel/spec.md` | New       | Mini-spec durable del mission kernel |
| `src/lib/db/localDb.js`                                                            | Reference | Futuro schema durable                |
| `src/lib/operations/swarmControl.js`                                               | Reference | Read-model/UI actual no canónico     |

## Risks

| Risk                                         | Likelihood | Mitigation                                              |
| -------------------------------------------- | ---------- | ------------------------------------------------------- |
| Duplicar truth de workspace/run/artifact     | High       | Guardar solo refs y snapshots compactos                 |
| Mezclar perfil/runtime/provider en membresía | High       | Separar identidad de misión de identidad operativa      |
| Usar logs terminal/SSE como verdad durable   | High       | Persistir solo intención, receipt, TTL y `evidence_ref` |

## Rollback Plan

Descartar esta propuesta; SW-8.1C no introduce cambios runtime ni schema en esta fase.

## Dependencies

- `docs/swarm-control/SW-8.0B-mapa-orquestadores-sdd.md`
- `docs/swarm-control/SW-8.0C-terminales-proveedores-permisos.md`
- `docs/swarm-control/SW-8.1D-token-efficient-agents.md`
- SW-2.1, SW-3.1 y SW-4.1 ya congelados como contratos upstream.

## Success Criteria

- [ ] Mission kernel durable queda separado de runtime adapters y terminales.
- [ ] Relaciones con workspace/run/artifact/approval quedan definidas sin duplicación.
- [ ] Acceptance criteria y plan de tests dejan lista la implementación posterior.
