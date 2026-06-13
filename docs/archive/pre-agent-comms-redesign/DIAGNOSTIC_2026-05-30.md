# Diagnóstico Swarm - 2026-05-30

## Problemas Identificados

### 1. Status incorrecto en topología (VENCIDO/HUÉRFANO)

**Causa raíz:** El endpoint `POST /api/agenthub/operations/health` no tiene una acción `agent_heartbeat`.

- En el lanzamiento, `upsertAgentPresence()` se llama con `last_seen_at: now` (línea 1025 de route.js)
- Los agentes nunca vuelven a actualizar su presencia
- `deriveMissionAgentSupervisorState()` (línea 638) tiene un threshold de 5 minutos (línea 665-673)
- Después de 5 min sin heartbeat, todos los agentes → `stale` → "VENCIDO"

**Impacto:** Topology muestra "0 activos de 5 total" a pesar de que los agentes están corriendo en tmux.

### 2. No hay polling de mensajes pendientes

Los agentes hacen heartbeats (POST health) pero no leen `pending_deliveries` (GET health con `pending_deliveries`).

- Director envía kickoff → mensaje se guarda con `status: 'pending'`
- Agents nunca hacen polling para leer estos mensajes
- Coder nunca recibe instrucciones → se queda idle

### 3. Resize de terminales (scroll va arriba)

Al cambiar de workspace (browser/editor/topology), `isVisibleInLayout` cambia de `true` → `false` → `true`.

- xterm.js pierde el scroll position cuando el panel se oculta
- `reactivateTerminalViewport` solo funciona para el panel activo (gated por `autoFocus`)
- Los paneles inactivos no restauran su posición de scroll

### 4. Build error (resuelto)

`bridgeAgentRequest.js` importaba `buildAgentLaunchCommand` de `agentLaunchCommand.js`, que importaba `SessionPersistence.js` → `better-sqlite3` → `fs`.

- **Fix:** Crear `agentLaunchCommand.shared.js` sin dependencias de DB
- `bridgeAgentRequest.js` ahora importa desde `.shared`

## Solución Propuesta

### Fase 1: Heartbeat endpoint

Agregar acción `agent_heartbeat` al POST de health que:

1. Reciba `agent_id`, `mission_id`, `workspace_id`
2. Llame a `upsertAgentPresence()` con `last_seen_at: now`
3. Actualice `status_summary` si es necesario

### Fase 2: Polling de mensajes

Modificar `agentLaunchWrapper.js` para que:

1. Cada N segundos (ej: 10s), haga GET a `/api/agenthub/operations/health` con `pending_deliveries=true`
2. Procese mensajes pendientes y los envíe como input al agente
3. Envíe heartbeat POST cada 30-60 segundos

### Fase 3: Fix de scroll

En `TerminalTTY.jsx`:

1. Agregar ref para guardar scroll position antes de `isVisibleInLayout=false`
2. Restaurar scroll position cuando `isVisibleInLayout=true`
3. No depender de `autoFocus` para la restauración

## Archivos a modificar

- `src/app/api/agenthub/operations/health/route.js` — agregar heartbeat action
- `src/lib/agentLaunchWrapper.js` — agregar polling loop
- `src/components/workspace/TerminalTTY.jsx` — preservar scroll position

## Estado

- Build error: RESUELTO ✅
- Topología status: PENDIENTE (requiere heartbeat)
- Comunicación: PENDIENTE (requiere polling)
- Resize: PENDIENTE (requiere scroll preservation)
