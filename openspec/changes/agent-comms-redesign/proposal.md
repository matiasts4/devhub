# Proposal: Agent Communication Redesign

## Intent

Reemplazar el bus de comunicación inter-agente roto (HTTP+HMAC `_devhub_tell_director` + `echo` a log compartido que el Director nunca lee) por un bus durable SQLite + JSONL proyectado que workers, director y CLI consumen desde una única fuente de verdad. Eliminar la falla observada en `launch-e743667a` donde el auditor llamó `_devhub_tell_director` dos veces y ninguno de los mensajes llegó al director.

## Scope

### In Scope

- Migración nueva en `data/devhub.db` con 4 tablas: `team_chat`, `team_events`, `team_inbox`, `agent_presence` (esta última se ADOPTA del schema existente, no se duplica).
- Helpers bash en `src/lib/agentLaunchWrapper.js`: `_devhub_chat`, `_devhub_event`, `_devhub_presence`, `_devhub_inbox_check` — escriben directo a SQLite vía `better-sqlite3` (sin HTTP, sin HMAC).
- Proyección JSONL en `/tmp/devhub-mission-<mission_id>/` que el director tmux `tail -F` consume en vivo.
- Renombrar el bootstrap lock de `/tmp/devhub-bootstrap-<mission>-<role>.lock` a `/tmp/devhub-injection-<launch>-<role>.lock` con state machine explícito (`pending|injecting|injected|failed`).
- CLI: extender `devhub chat` (send|list|watch), `devhub events tail`, `devhub status` con vista de presence.
- Eliminar `_devhub_tell_director` (HTTP+HMAC) y todo su plumbing de `agentLaunchWrapper.js` y del endpoint `/api/agenthub/events`. Workers dejan de `echo`-ar al log compartido.
- Migrar consumidores que hoy leen `pending_deliveries` en `operations-health` para que lean `team_inbox` (con shim de compatibilidad por una release).
- Reusar `agent_presence` existente con un UPSERT enriquecido (`idle|busy|waiting|done|failed`) que el wrapper emite en transiciones observables.

### Out of Scope

- Reescribir `teamTell` (JS API que hoy va por `mission_messages`/`message_deliveries`); coexiste como supervisor path, no se fusiona.
- UI Control Room para el nuevo bus (queda para un change posterior tipo `control-room-bus-integration`).
- Adapters Codex/Claude runtime, multi-tenant o multi-misión concurrente.
- Refactor de `agentLaunchCommand.js` o el `auto-restart` loop.
- Renombrar columnas existentes de `agent_presence` (solo se agrega columna `presence_context` y se amplía enum).

## Approach

**4 stores + helpers + director consumer + CLI, una sola PR (~800 líneas).**

| Componente        | Línea                                                  | Mecanismo                                                           |
| ----------------- | ------------------------------------------------------ | ------------------------------------------------------------------- |
| `team_chat`       | INSERT directo desde bash                              | kind ∈ {chat,report,alert,ack}, handle-based (`--to <role>\|all`)   |
| `team_events`     | INSERT directo desde bash                              | kind ∈ {task_completed, handoff_ready, alert, ...} con payload JSON |
| `team_inbox`      | INSERT por director, UPSERT consume on bootstrap       | durable director→worker                                             |
| `agent_presence`  | UPSERT en transiciones + heartbeat                     | state machine observable                                            |
| Helpers bash      | better-sqlite3 CLI one-liner                           | sin curl, sin HMAC                                                  |
| JSONL projection  | trigger SQLite → `tail -F` del director                | `/tmp/devhub-mission-<id>/{chat,events,presence}.jsonl`             |
| Director consumer | `tail -F` + dedupe por `ts+kind+from`                  | pegado a tmux pane director                                         |
| CLI               | `devhub chat send/list/watch`, `events tail`, `status` | sub-comandos nuevos                                                 |

**Diagrama de flujo:**

```
worker shell                  better-sqlite3               JSONL projection              director tmux
─────────────                 ──────────────               ────────────────              ──────────────
_devhub_chat "msg"  ───INSERT──▶ team_chat       ───trigger──▶ chat.jsonl     ───tail -F──▶ paste
_devhub_event task_done ──INSERT─▶ team_events   ───trigger──▶ events.jsonl   ───tail -F──▶ paste
_devhub_presence waiting ──UPSERT─▶ agent_presence──trigger──▶ presence.jsonl ───tail -F──▶ paste
                                    │
                                    └─ INSERT team_inbox (director writes, worker reads on bootstrap)
```

## Risks

| Risk                                                                        | Likelihood | Mitigation                                                                                                                        |
| --------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Lock contention en SQLite bajo multi-worker                                 | Med        | WAL mode habilitado en migración, `busy_timeout=5000`                                                                             |
| Director `tail -F` re-entrega mismo mensaje tras restart                    | Alta       | Dedupe por `(ts, from_role, body_hash)` en buffer del consumer                                                                    |
| Migración de `pending_deliveries` rompe consumers existentes                | Med        | Shim que lee de `team_inbox` con fallback a `pending_deliveries` por 1 release; tests de regresión en `operations-health.test.js` |
| Strict TDD infla el PR más allá de D2 (800 líneas)                          | Alta       | Tests agrupados: 1 spec file por tabla + 1 wrapper test compartido; abortar y reportar si pasa 1100                               |
| Bootstrap lock rename rompe launches en curso                               | Baja       | Mantener lectura de path viejo con warning; cleanup on next launch                                                                |
| Director tmux no se reconecta tras tail cerrar el pipe                      | Med        | `tail -F` (no `-f`) con `--retry`; systemd-style restart no necesario                                                             |
| Dependencia implícita de nombres estilo Plyrium (`team_chat`/`team_events`) | Baja       | Convenciones internas, copy usuario en inglés neutro ("team chat", "event log"); sin "Plyrium" en strings                         |

## Dependencies

- `better-sqlite3` ya en uso (esquema, swarmMissions, missions) — sin nueva dep npm.
- Triggers SQLite (`AFTER INSERT`) ya soportados por la versión embebida.
- `data/devhub.db` ya existe con migraciones versionadas (agregar `002_agent_comms_bus.sql`).
- Worker shell ya tiene `DEVHUB_MISSION_ID`, `DEVHUB_ROLE`, `DEVHUB_LAUNCH_ID` en env (ver `agentLaunchWrapper.js:131-135`).
- Director tmux ya provee `DEVHUB_DIRECTOR_SESSION` en env.
- CLI `devhub-cli/` ya tiene `inbox.js`, `events.js` como plantillas de sub-comando.

## Out of scope (explicit)

- Fusionar `mission_messages`+`message_deliveries` con `team_chat`+`team_inbox` (mismo dominio semántico, distinto contrato: supervisor API vs shell bus).
- Reemplazar HMAC `DEVHUB_AGENT_TOKEN` en otros endpoints (heartbeat, exit) — solo se elimina en la ruta `_devhub_tell_director`.
- Cambios en UI de pizarra o terminal.
- Re-introducir runtime externo (Plyrium, langgraph, etc.) — los tests `plyrium-parity-consolidation` siguen assertando rechazo.
- Soporte para multi-launch concurrente en misma mission_id.

## Open questions

Ninguna. Todas las decisiones de diseño ya están tomadas en el contexto del orchestrator (4 stores, naming, helpers, consumer director via `tail -F`, lock rename, single PR con strict TDD).

## Affected Areas

| Area                                              | Impact   | Description                                                             |
| ------------------------------------------------- | -------- | ----------------------------------------------------------------------- |
| `data/devhub.db` (migration 002)                  | New      | 3 tablas nuevas + 1 reutilizada, triggers JSONL, índices                |
| `src/lib/agentLaunchWrapper.js`                   | Modified | Reemplazar `_devhub_tell_director` por 4 helpers; rename bootstrap lock |
| `src/app/api/agenthub/events/route.js`            | Removed  | Endpoint ya no necesario, HTTP+HMAC va                                  |
| `src/app/api/agenthub/operations/health/route.js` | Modified | Shim: leer `team_inbox` con fallback `pending_deliveries`               |
| `src/lib/db/swarmMissions.js`                     | Modified | Exponer `getMissionBusSnapshot(missionId)` para CLI                     |
| `devhub-cli/commands/chat.js`                     | New      | send/list/watch                                                         |
| `devhub-cli/commands/events.js`                   | Modified | agregar subcomando `tail`                                               |
| `devhub-cli/commands/status.js`                   | Modified | mostrar presence por role                                               |
| `src/lib/__tests__/agentLaunchWrapper.test.js`    | Modified | cubrir 4 helpers, lock state machine, dedupe                            |
| `tests/agenthub/api/operations-health.test.js`    | Modified | shim compat `pending_deliveries`→`team_inbox`                           |

## Capabilities

> Contract with sdd-spec. Each becomes a `specs/<name>/spec.md` (new) or a delta spec (modified).

### New Capabilities

- `agent-comms-bus`: durable chat/events/inbox/presence bus in SQLite with JSONL projection
- `agent-bus-helpers`: shell helper contract (`_devhub_chat`, `_devhub_event`, `_devhub_presence`, `_devhub_inbox_check`)
- `bootstrap-injection-lock`: state machine and rename for the launch-time prompt-injection lock

### Modified Capabilities

- `agent-events`: endpoint `/api/agenthub/events` retired; agents no longer POST status updates here
- `team-chat-targeting`: shim layer to read `team_inbox` while keeping `pending_deliveries` fallback

## Rollback Plan

1. Revert migration `002_agent_comms_bus.sql` via nueva migration DOWN (DROP tables + triggers).
2. Revertir `src/lib/agentLaunchWrapper.js` al commit previo (mantiene `_devhub_tell_director`).
3. Revertir `devhub-cli/commands/chat.js` (delete file).
4. Reactivar endpoint `/api/agenthub/events` desde tag previo.
5. Workers vuelven a `echo` a `/tmp/devhub-swarm-*.log` (estado ya existente).
6. Validar con `npm test` que la suite completa pasa.

Riesgo de rollback bajo porque: (a) las tablas nuevas conviven con las viejas, (b) el shim `pending_deliveries`→`team_inbox` puede dejarse en modo legacy, (c) no hay migración de datos irreversible (los nuevos stores arrancan vacíos).

## Success Criteria

- [ ] Auditor que llama `_devhub_chat "task_done: <X>"` ve el mensaje pegado en el tmux del director en < 2s sin restart.
- [ ] Director que llama `_devhub_chat --to worker "new directive"` ve el mensaje en el JSONL del worker en < 1s y re-injectado en bootstrap si el worker estaba offline.
- [ ] `_devhub_event task_completed` aparece en `team_events` y se proyecta a `events.jsonl` que `devhub events tail` muestra.
- [ ] `_devhub_presence waiting` actualiza `agent_presence` y `devhub status` lo refleja sin re-leer el row completo.
- [ ] `pending_deliveries` consumers siguen funcionando via shim (1 release window).
- [ ] `_devhub_tell_director` y su endpoint `/api/agenthub/events` eliminados sin regresión en otros 4 endpoints firmados.
- [ ] Bootstrap lock en path nuevo `devhub-injection-<launch>-<role>.lock` con state visible; tests cubren `pending→injecting→injected` y `injected→failed`.
- [ ] Suite `npm test` y `devhub-mcp` 100% verde, incluyendo los nuevos `agentLaunchWrapper.test.js` (~80% coverage en helpers).
- [ ] Diff ≤ 800 líneas netas (D2 budget). Si supera, abortar y reportar.
