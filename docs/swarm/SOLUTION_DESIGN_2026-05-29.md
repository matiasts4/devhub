# Diseño de Solución - Swarm Status & Scroll Fixes

## Fecha: 2026-05-29

## Problemas Identificados

### 1. Status Incorrecto en Topología (VENCIDO / PROCESO HUÉRFANO)

**Síntomas:**

- Todos los agentes aparecen como "VENCIDO" o "PROCESO HUÉRFANO"
- Contador muestra "0 activos de 5 total"
- Los agentes están corriendo correctamente en tmux

**Root Cause:**

- `runtimeStatus.js classifyRegistry`: Agente con `activeRun` pero sin proceso detectado → `STALE_REGISTRY`
- `runtimeStatus.js classifyProcess`: Proceso sin terminal asociada → `ORPHANED_PROCESS`
- `swarmControl.js buildActiveRoster`: Aplica `globalRuntimeStatus` al Director forzando estado incorrecto

**Solución:**

1. ✅ `AgentTopologyGraph.jsx`: Añadir `'running'` a la lista de estados activos
2. ✅ `runtimeStatus.js classifyRegistry`: Si tiene `activeRun`, retornar `ACTIVE` en vez de `STALE_REGISTRY`
3. ✅ `runtimeStatus.js classifyProcess`: Eliminar check de `!hasTerminal` que forzaba `ORPHANED_PROCESS`
4. ✅ `swarmControl.js buildActiveRoster`: Simplificar `resolveRosterStatus` para respetar el estado real del agente

### 2. Scroll de Terminales se Va Arriba al Cambiar Workspace

**Síntomas:**

- Al cambiar entre workspaces (browser, editor, topology), las terminales de agentes pierden el scroll
- El viewport salta al primer prompt (arriba del todo)
- Requiere hacer mucho scroll manual para ver el contenido actual

**Root Cause:**

- `reactivateTerminalViewport` solo corre para el panel activo (gated por `autoFocus`)
- Cuando cambias de workspace, todos los paneles del workspace anterior reciben `isVisibleInLayout=false`
- Al volver, todos reciben `true`, pero solo el activo tiene `autoFocus=true`
- Los paneles inactivos no restauran su posición de scroll

**Solución:**

- Añadir `useEffect` en `TerminalTTY.jsx` que:
  1. Guarda la posición Y del viewport cuando `isVisibleInLayout` cambia a `false`
  2. Restaura la posición Y cuando `isVisibleInLayout` cambia a `true`
  3. Si no hay posición guardada, hace `scrollToBottom()`

### 3. Comunicación entre Agentes (Investigación Pendiente)

**Síntomas:**

- Director envía mensajes pero no recibe respuestas
- Coder no recibe instrucciones del Director
- Los mensajes aparecen en UI pero no se procesan automáticamente

**Hipótesis:**

- Los agentes hacen heartbeat (POST /health) pero no hacen polling de mensajes pendientes
- El sistema `teamTell` guarda mensajes en `pending_deliveries` pero no los inyecta en la sesión opencode del agente
- Necesitamos un mecanismo de polling o push para entregar mensajes a los agentes

**Solución Propuesta:**

1. Agregar en `agentLaunchWrapper.js` un loop de polling que:
   - Cada 30s consulte `GET /api/agenthub/swarm/{missionId}/message?status=pending`
   - Envíe nuevos mensajes a la sesión tmux del agente via `tmux send-keys`
   - Marque mensajes como entregados

2. Alternativa: WebSocket/SSE para push de mensajes en tiempo real

## Archivos Modificados

- `src/components/control-room/AgentTopologyGraph.jsx` - Fix conteo activos
- `src/lib/swarm/runtimeStatus.js` - Fix clasificación de estados
- `src/lib/operations/swarmControl.js` - Fix roster status
- `src/components/TerminalTTY.jsx` - Fix preservación de scroll
- `src/lib/agentLaunchWrapper.js` - (pendiente) Polling de mensajes

## Testing Plan

1. Rebuild y restart del servidor Tauri
2. Lanzar swarm
3. Verificar topología muestra "5 activos de 5"
4. Cambiar entre workspaces y verificar scroll se preserva
5. Enviar mensaje de Director a Coder y verificar llega

## Notas

- Los fixes de status son críticos para que el usuario pueda confiar en la topología
- El fix de scroll mejora significativamente la UX al operar con múltiples agentes
- La comunicación requiere más investigación y posiblemente cambios en el protocolo de mensajería
