# Proposal: Continuidad de Ejecución — Multi-Turn Autonomous Agent Execution

## Intent

El flujo actual de chat del bot de Telegram es **single-turn y síncrono**: un mensaje → una llamada a OpenCode → respuesta → fin. Esto impide tareas complejas que requieren múltiples iteraciones (SDD completo, debugging con correcciones, refactorización multi-paso). Además existe un **bug crítico de deadlock**: cuando OpenCode pide permisos (`permission.asked`), el callback `onApproval` nunca se pasa en `runOpenCodeHeadless()`, y el stream SSE se cuelga indefinidamente sin timeout. Los comandos `/pausar` y `/reanudar` solo tocan la DB — son dead code para el path headless.

## Scope

### In Scope

- **Multi-turn execution loop**: `sendMessage()` reutiliza la misma `opencode_session_id` para enviar mensajes secuenciales hasta que la tarea se complete naturalmente
- **Auto-approval de permisos**: aprobar automáticamente permisos no-destructivos; rechazar `sudo`, borrado de archivos base/sistema
- **Sin límite de tiempo**: las tareas corren hasta completarse naturalmente, sin timeout ni max iteraciones
- **Progreso informativo cada 10 min**: notificaciones Telegram sin interrumpir la ejecución; al cumplir 10 min se envía resumen de lo hecho hasta ahora
- **Notificaciones de inicio/fin**: Telegram al comenzar y terminar la tarea
- **Fix del deadlock de permisos**: pasar `onApproval` con auto-approve/reject logic
- **Reactivar `/pausar` y `/reanudar`**: que interactúen con sesiones OpenCode reales (cancelar/reanudar SSE loop)

### Out of Scope

- UI web para control multi-turn (SwarmControl queda para otro change)
- Costo/token tracking avanzado
- Soporte multi-usuario
- Cambiar el formato de eventos SSE de OpenCode
- Persistencia de traces más allá de lo ya implementado

## Capabilities

### New Capabilities

- `multi-turn-execution`: Loop de ejecución multi-turno con reutilización de sesión OpenCode, auto-approval de permisos, y notificaciones de progreso
- `session-control`: Control de ciclo de vida de sesiones (pausar, reanudar, cancelar) que interactúa con OpenCode headless

### Modified Capabilities

- Ninguna — las capacidades existentes (session-bridge, opencode SSE) se reutilizan sin cambiar sus contratos

## Approach

### 1. Nuevo servicio: `telegram-bot/services/executor.js`

Orquestador del loop multi-turno:

- Recibe prompt inicial, envía primer mensaje via `opencode.sendMessage()`
- Detecta cuando OpenCode queda `idle` y evalúa si la tarea terminó o necesita continuar
- Si necesita continuar: envía siguiente mensaje (feedback del agente) reutilizando la misma sesión
- Loop hasta: (a) agente indica que terminó, (b) usuario pausa/cancela

### 2. Auto-approval handler

- `onApproval` callback que analiza `props.action`/`props.tool`
- **Auto-aprobar**: lectura de archivos, escritura en proyecto, git operations, npm install, etc.
- **Auto-rechazar**: `sudo`, `rm -rf /`, borrado de archivos del sistema, acceso a `/etc`, `/root`
- Notificar al usuario por Telegram qué permisos se aprobaron/rechazaron

### 3. Progress notifications

- `setInterval` cada 10 min durante ejecución activa
- Envía resumen: herramientas ejecutadas, tiempo transcurrido, estado actual
- No interrumpe el loop — solo informa
- **NO hay timeout** — la tarea corre hasta completarse naturalmente, sin importar cuánto tarde

### 4. Sin timeout

- No se implementa timeout ni límite de iteraciones
- El agente trabaja hasta terminar la tarea, sea 5 minutos o 50
- El usuario puede cancelar manualmente con `/pausar` o enviando un nuevo mensaje

### 5. Fix `/pausar` y `/reanudar`

- `/pausar`: marca sesión como paused, cancela SSE reader, notifica a OpenCode
- `/reanudar`: reanuda el loop enviando un "continue" message a la misma sesión
- Estado persistido en DB (`session_status` table)

### 6. Integración con `chat.js`

- `runOpenCodeHeadless()` detecta si es tarea multi-turno (heuristic: longitud, keywords, o flag explícito)
- Si multi-turno: delega a `executor.startMultiTurn()`
- Si single-turn: comportamiento actual (compatibilidad)

## Affected Areas

| Area                                      | Impact   | Description                                       |
| ----------------------------------------- | -------- | ------------------------------------------------- |
| `telegram-bot/services/executor.js`       | New      | Multi-turn execution orchestrator                 |
| `telegram-bot/services/opencode.js`       | Modified | Add timeout, expose `onApproval` in `sendMessage` |
| `telegram-bot/commands/chat.js`           | Modified | Detect multi-turn, delegate to executor           |
| `telegram-bot/commands/pausar.js`         | Modified | Cancel active SSE loop, update session status     |
| `telegram-bot/commands/reanudar.js`       | Modified | Resume multi-turn loop with continue message      |
| `telegram-bot/lib/db-bridge.js`           | Modified | Add session status tracking (paused/resumed)      |
| `telegram-bot/services/session-bridge.js` | Modified | Track execution state per session                 |

## Risks

| Risk                                                | Likelihood | Mitigation                                                                                              |
| --------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------- |
| Loop infinito si el agente nunca indica "terminado" | Low        | El usuario puede cancelar manualmente con `/pausar`; el agente naturalmente llega a idle cuando termina |
| Auto-approve permite acción destructiva por error   | Low        | Lista deny-list estricta (sudo, rm sistema, etc.) + logging                                             |
| SSE reader se corrompe al pausar/reanudar           | Medium     | Crear nuevo reader al reanudar, no reutilizar el cancelado                                              |
| Telegram rate limits con notificaciones frecuentes  | Low        | Debounce de 10 min, máximo 1 msg por evento de permiso                                                  |
| Consumo excesivo de tokens/créditos                 | Medium     | Notificar al usuario al inicio; resúmenes cada 10 min para visibilidad                                  |

## Rollback Plan

1. Feature flag `TELEGRAM_MULTI_TURN=false` en `.env` para desactivar el loop multi-turno y volver al comportamiento single-turn actual
2. El servicio `executor.js` es nuevo — eliminarlo no afecta funcionalidad existente
3. Los cambios en `opencode.js` son aditivos (timeout como opción, `onApproval` como callback opcional)
4. `/pausar` y `/reanudar` mantienen su comportamiento actual de DB como fallback si no hay sesión activa
5. Git revert de archivos modificados; eliminar `executor.js`

## Dependencies

- OpenCode headless server ejecutándose (ya implementado)
- Session bridge funcional (ya implementado)
- SQLite con WAL mode (ya configurado)

## Success Criteria

- [ ] Tarea multi-turno ejecuta 3+ mensajes secuenciales en la misma sesión OpenCode
- [ ] Permisos no-destructivos se auto-aprueban sin intervención del usuario
- [ ] Permisos destructivos se auto-rechazan con notificación al usuario
- [ ] Timeout de 30 min aborta la sesión y notifica al usuario
- [ ] Notificaciones de progreso cada 10 min durante ejecución larga
- [ ] `/pausar` cancela la ejecución activa y notifica
- [ ] `/reanudar` reanuda la ejecución desde donde quedó
- [ ] No hay regresiones en el flujo single-turn actual
- [ ] No hay deadlocks por permisos no respondidos
