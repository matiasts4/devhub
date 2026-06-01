# Handoff: auditoria del flujo de comunicacion del swarm

Este documento resume por que hoy el swarm muestra estados inconsistentes entre workers, Director humano y pantalla del Director, y define un plan de trabajo para que otro agente implemente la correccion sin tener que reconstruir el diagnostico.

## Quick path

1. Tomar como fuente de verdad la UI del Director y el `director_feed` durable, no el texto del terminal.
2. Corregir primero la emision de eventos canonicos desde el runtime de cada worker.
3. Corregir despues el consumo real de `pending_deliveries` y la unificacion del heartbeat.

## Resultado esperado

Cuando un worker empieza, progresa, queda bloqueado, pide ayuda o termina, esos hechos deben reflejarse de forma consistente en:

- presencia durable;
- feed durable del Director;
- SSE hacia la UI;
- terminal del Director como espejo humano, no como unica fuente de verdad.

## Resumen ejecutivo

Hoy existen varios canales de comunicacion en paralelo, pero no convergen en una misma verdad operacional. El wrapper del agente manda heartbeats, puede poll-ear inbox, puede escribir texto al tmux del Director y puede emitir algunos eventos HTTP. Sin embargo, la pantalla del Director no consume el texto por tmux: consume `director_feed`, que se arma solo desde eventos durables canonicos y presencia durable. Como los workers hoy reportan sobre todo por `_devhub_tell_director`, los estados importantes pueden verse en el panel humano del Director pero no en la UI de Control Room.

Plyrium muestra un patron mas sano: presencia y eventos viven en un store durable dedicado, mientras que queue y chat viven en stores separados. El terminal acompana, pero no define el estado del sistema.

## Arquitectura actual

| Canal                                                               | Uso actual                     | Productor         | Consumidor real  | Problema                                   |
| ------------------------------------------------------------------- | ------------------------------ | ----------------- | ---------------- | ------------------------------------------ |
| `/api/agenthub/presence/heartbeat`                                  | liveness y estado de presencia | wrapper           | snapshot durable | el loop reporta `busy` fijo                |
| `POST /api/agenthub/operations/health` con `action=agent_heartbeat` | inbox de `pending_deliveries`  | wrapper           | wrapper mismo    | las entregas se loguean, no se consumen    |
| `_devhub_tell_director` por tmux                                    | status humano en tiempo real   | worker            | Director humano  | no alimenta la UI ni el `director_feed`    |
| `/api/agenthub/events`                                              | eventos durables estructurados | wrapper o runtime | `director_feed`  | casi no se emiten eventos canonicos utiles |
| SSE `director-feed`                                                 | refresh de UI                  | snapshot durable  | SwarmControl     | depende de hechos durables que hoy faltan  |

## Hallazgos prioritarios

### P0. La UI del Director y los workers no comparten la misma fuente de verdad

**Impacto**

- El Director humano puede ver mensajes en su terminal que la pantalla del Director nunca muestra.
- Un `coder` o `auditor` puede “terminar” desde el punto de vista humano sin que Control Room lo proyecte.

**Evidencia**

- El prompt de lanzamiento instruye a los workers a usar `_devhub_tell_director` para reportar status.
- El wrapper inyecta `_devhub_tell_director` y usa `tmux send-keys` con prefijo `STATUS_UPDATE:`.
- La UI del Director escucha `director-feed` por SSE.
- El `director_feed` durable solo proyecta `task_completed` y `handoff_ready`.

**Referencias**

- `src/app/api/agenthub/operations/health/route.js` lineas ~151-154
- `src/lib/agentLaunchWrapper.js` lineas ~255-283
- `src/app/api/agenthub/sessions/stream/route.js` lineas ~298-377
- `src/views/SwarmControl.jsx` lineas ~237-260
- `src/lib/db/swarmMissions.js` lineas ~34, ~916-1055

**Decision recomendada**

- El texto por tmux debe quedar como espejo humano.
- La verdad operacional debe salir de eventos durables emitidos por el runtime.
- No implementar parsing de `STATUS_UPDATE:` para “rescatar” la UI. Eso consolidaria el anti-patron equivocado.

### P0. Los workers no emiten automaticamente los eventos canonicos que la UI necesita

**Impacto**

- La UI no sabe cuando un worker completo una tarea u ofrecio handoff, salvo que algun actor externo emita esos eventos correctamente.

**Evidencia**

- `agentEvents.js` exige payload estructurado para `task_completed` y `handoff_ready`.
- El wrapper emite `process_exit`, pero no provee un helper canonico equivalente para `task_completed` o `handoff_ready`.
- El `director_feed` solo consume esos dos tipos de evento como entradas canonicas.

**Referencias**

- `src/lib/swarm/agentEvents.js` lineas ~5-87
- `src/app/api/agenthub/events/route.js` lineas ~43-93
- `src/lib/agentLaunchWrapper.js` lineas ~294-307
- `src/lib/db/swarmMissions.js` lineas ~34, ~924-927

**Decision recomendada**

- Agregar un helper de runtime tipo `_devhub_emit_event` o `_devhub_emit_status_event`.
- Ese helper debe poder emitir al menos:
  - `task_completed`
  - `handoff_ready`
  - opcionalmente `needs_help`, `task_progress`, `task_started` si se decide ampliar la proyeccion.

### P0. `pending_deliveries` se detecta pero no entra realmente al flujo del agente

**Impacto**

- La “bidireccionalidad” existe nominalmente, pero el worker no integra las entregas en su ciclo operativo.
- Las instrucciones pueden quedar registradas en un log temporal y nunca afectar el comportamiento del agente.

**Evidencia**

- El wrapper tiene un loop que hace `POST /api/agenthub/operations/health` con `action=agent_heartbeat`.
- Si encuentra `pending_deliveries`, cuenta items y los escribe a `/tmp/devhub-pending-deliveries.log`.
- No hay reinyeccion en el terminal, en el prompt del agente ni en un archivo de inbox operativo.

**Referencias**

- `src/lib/agentLaunchWrapper.js` lineas ~261-288
- `src/app/api/agenthub/operations/health/route.js` lineas ~2234-2277

**Decision recomendada**

- Reemplazar el log temporal por una integracion real.
- Opciones validas:
  - reinyeccion controlada al terminal del agente;
  - inbox file durable en el worktree del agente;
  - wrapper helper que entregue mensajes a una cola local consumida por el runtime.

### P0. El heartbeat de presencia miente sobre el estado real del worker

**Impacto**

- Todos los agentes parecen `busy` aunque no lo esten.
- La presencia sirve para liveness, pero no para observabilidad real.
- El Director no puede distinguir `idle`, `waiting`, `blocked` o `done` usando presencia.

**Evidencia**

- El heartbeat inicial del wrapper manda `state: 'busy'`.
- El heartbeat periodico tambien manda `state: 'busy'`.

**Referencias**

- `src/lib/agentLaunchWrapper.js` lineas ~173-212
- `src/lib/agentLaunchWrapper.js` lineas ~215-256

**Decision recomendada**

- Modelar una maquina minima de estados de runtime:
  - `booting`
  - `online`
  - `busy`
  - `waiting`
  - `idle`
  - `offline`
  - `crashed`
- El heartbeat no debe ser un valor fijo hardcodeado.

## Hallazgos de consistencia de contrato

### P1. Hay dos heartbeats con semanticas distintas

**Impacto**

- El prompt operativo y el runtime mezclan conceptos.
- Es facil que un agente o implementador lea el endpoint equivocado.

**Evidencia**

- Existe `/api/agenthub/presence/heartbeat` para presencia durable.
- Existe `POST /api/agenthub/operations/health` con `action=agent_heartbeat` para devolver `pending_deliveries`.
- El prompt habla del “heartbeat response” como si fuera un unico contrato.

**Referencias**

- `src/app/api/agenthub/presence/heartbeat/route.js`
- `src/app/api/agenthub/operations/health/route.js` lineas ~121-158 y ~2234-2277

**Decision recomendada**

- Unificar semanticamente ambos caminos o hacer explicita la separacion.
- Si se mantienen ambos, renombrar y documentar con claridad:
  - presencia = liveness/state
  - inbox sync = deliveries/instructions

### P1. Inconsistencia en el vocabulario de estados de presencia

**Impacto**

- Algunas capas aceptan estados que otras no consideran validos.
- Eso complica proyecciones y validaciones compartidas.

**Evidencia**

- `presence/heartbeat` acepta `booting` y `crashed`.
- El helper comun de swarm missions solo reconoce `online`, `busy`, `idle`, `waiting`, `offline`.

**Referencias**

- `src/app/api/agenthub/presence/heartbeat/route.js` lineas ~33-39
- `src/lib/db/swarmMissions.js` lineas ~29-31

**Decision recomendada**

- Unificar el enum de estados en una sola definicion reusable.
- Evitar que una ruta escriba estados que el dominio comun no reconoce.

### P1. `process_exit` existe, pero no tiene proyeccion util para el Director

**Impacto**

- El sistema puede saber que un proceso termino, pero la pantalla del Director no necesariamente lo refleja como salida, crash o cierre limpio.

**Evidencia**

- El wrapper emite `process_exit` al salir.
- El `director_feed` canonicamente solo proyecta `task_completed` y `handoff_ready`.

**Referencias**

- `src/lib/agentLaunchWrapper.js` lineas ~294-307
- `src/lib/swarm/agentEvents.js` lineas ~5-17
- `src/lib/db/swarmMissions.js` lineas ~34 y ~924-927

**Decision recomendada**

- Decidir si `process_exit` debe:
  - permanecer solo como telemetria, o
  - mapearse a un estado visible para el Director cuando no haya handoff previo.

## Hallazgos secundarios

### P2. El wrapper mezcla transporte humano y transporte de maquina en el mismo plano conceptual

**Impacto**

- Prompts y docs inducen a usar el canal equivocado para hechos de negocio.
- Se refuerza una arquitectura donde el terminal parece la fuente de verdad.

**Decision recomendada**

- Separar en el prompt:
  - canal humano: `_devhub_tell_director`
  - canal de sistema: `_devhub_emit_event`, `_devhub_set_presence`, `_devhub_sync_inbox`

### P2. El polling de deliveries usa un camino de autenticacion diferente al heartbeat firmado

**Impacto**

- La superficie de integracion queda menos uniforme.
- Complica debugging y endurecimiento posterior.

**Evidencia**

- Heartbeat y `process_exit` firman la peticion.
- El polling de `agent_heartbeat` usa `X-Agent-Id`, pero no firma de la misma forma.

**Referencias**

- `src/lib/agentLaunchWrapper.js` lineas ~191-209, ~230-252, ~270-276, ~294-305

## Como lo resuelve Plyrium hoy

### Lo verificado localmente

- `.plyrium-forge/agents.db` contiene `agent_presence` y `agent_events`.
- `.plyrium-forge/ops.db` contiene `cards` y `card_history`.
- `.plyrium-forge/teams.db` contiene `teams`, `team_members` y `team_chat`.
- `.plyrium-forge/worktrees.json` mantiene manifiesto explicito de worktrees.

### Lectura arquitectonica util

Plyrium separa claramente:

- presencia y eventos de agentes;
- cola operativa;
- chat/equipo;
- manifiesto de worktrees.

El terminal ayuda al operador, pero la coordinacion no depende de parsear texto desde panes. Ese es el patron a copiar.

## Propuesta de trabajo para el agente implementador

### Slice 1. Emision canonica desde el runtime

**Objetivo**

Que cada worker pueda emitir hechos durables que alimenten `director_feed`.

**Cambios sugeridos**

- En `src/lib/agentLaunchWrapper.js`, agregar helper `_devhub_emit_event` firmado.
- Permitir emision de `task_completed` y `handoff_ready` con payload estructurado minimo.
- Ajustar el prompt de lanzamiento para que `_devhub_tell_director` sea adicional, no principal.

**Aceptacion**

- Un `task_completed` emitido desde un worker aparece en `agent_events`.
- El `director_feed` cambia de watermark.
- SwarmControl recibe SSE `director-feed` y refleja el cambio.

### Slice 2. Inbox operativo real

**Objetivo**

Que `pending_deliveries` entren en el flujo real del agente.

**Cambios sugeridos**

- Reemplazar el log temporal por un mecanismo consumible por el runtime.
- Definir ack o estrategia de deduplicacion si el mensaje se reinyecta mas de una vez.

**Aceptacion**

- Un mensaje dirigido al worker llega al runtime del worker y puede gatillar accion observable.

### Slice 3. Normalizacion de presencia

**Objetivo**

Que presencia represente estado real y no solo liveness.

**Cambios sugeridos**

- Unificar enum de estados.
- Hacer transiciones reales en el wrapper o en el runtime supervisor.
- El loop periodico debe reportar el estado actual, no `busy` fijo.

**Aceptacion**

- El Director puede distinguir workers en `busy`, `waiting`, `idle`, `offline`, `crashed`.

### Slice 4. Limpieza de contrato y docs

**Objetivo**

Eliminar ambiguedad para futuros agentes.

**Cambios sugeridos**

- Corregir el prompt de lanzamiento en `operations/health/route.js`.
- Documentar que el canal humano y el canal durable son distintos.
- Revisar si `process_exit` debe proyectarse o quedar solo como telemetria.

## Checklist de aceptacion final

- [ ] Los workers ya no dependen de `_devhub_tell_director` para que la UI del Director se actualice.
- [ ] `task_completed` y `handoff_ready` salen del runtime con payload valido.
- [ ] `pending_deliveries` ya no terminan solo en un archivo temporal.
- [ ] El heartbeat no reporta `busy` fijo todo el tiempo.
- [ ] Existe un solo vocabulario valido de estados de presencia.
- [ ] El prompt operativo no mezcla presencia con inbox.
- [ ] El Director humano puede seguir viendo texto por tmux, pero el sistema no depende de eso.

## Fuera de scope para este cambio

- Rehacer todo el swarm runtime.
- Leer `.plyrium-forge/*.db` como dependencia runtime de DevHub.
- Resolver problemas de rate limit, `QUEUED` del Director o crashes de OpenCode salvo cuando bloqueen la validacion de los slices anteriores.

## Archivos clave para empezar

- `src/lib/agentLaunchWrapper.js`
- `src/app/api/agenthub/operations/health/route.js`
- `src/app/api/agenthub/presence/heartbeat/route.js`
- `src/app/api/agenthub/events/route.js`
- `src/lib/swarm/agentEvents.js`
- `src/lib/db/swarmMissions.js`
- `src/app/api/agenthub/sessions/stream/route.js`
- `src/views/SwarmControl.jsx`

## Next step

Tomar primero el Slice 1 y el Slice 2 en una rama corta. Si esos dos no quedan bien resueltos, cualquier mejora visual en la pantalla del Director va a seguir siendo maquillaje encima de un flujo roto.
