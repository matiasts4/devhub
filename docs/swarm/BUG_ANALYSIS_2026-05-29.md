# Análisis de Bugs del Swarm - 2026-05-29

## 1. Comunicación Swarm (CRÍTICO)

**Problema:** Los agentes no se comunican entre sí.

**Flujo actual (ROTO):**

1. Director envía kickoff → mensaje guardado como `pending`
2. Agentes leen kickoff en primer health check
3. Architect/Auditor responden → mensajes guardados como `pending`
4. Director NUNCA hace polling de `pending_deliveries` → no lee respuestas
5. Coder NUNCA recibe instrucciones → se queda idle

**Raíz:** El endpoint GET /health sí incluye `pending_deliveries`, pero:

- Los agentes solo hacen POST /health (heartbeats)
- No hay mecanismo de polling de mensajes entrantes
- El Director no lee su inbox

**Solución propuesta:**

- Modificar `agentLaunchWrapper.js` para que después del heartbeat, haga un GET /health para obtener `pending_deliveries`
- Si hay mensajes pendientes para este agente, inyectarlos como prompts
- El Director debe hacer polling más frecuente

---

## 2. Resize de Terminales (ALTA)

**Problema:** Al cambiar de workspace (browser/editor/topología), las terminales de agentes se van arriba del todo (primer prompt).

**Raíz:**

- Cuando un panel de terminal se oculta y se muestra, xterm.js pierde la posición de scroll
- El evento `devhub:native-vte-workspace-sync` causa que los paneles se oculten/muestren
- No hay mecanismo para preservar/restaurar la posición de scroll

**Solución propuesta:**

- En `TerminalTTY.jsx`, agregar un listener para cuando el componente se vuelve visible
- Forzar `scrollToBottom()` cuando la terminal se muestra después de estar oculta
- Alternativamente: usar `IntersectionObserver` para detectar visibilidad

---

## 3. Topología - Status Incorrecto (ALTA)

**Problema:** Topología muestra "VENCIDO" y "PROCESO HUÉRFANO" para agentes activos. Muestra "0 activos de 5".

**Raíz:** `runtimeStatus.js` clasifica incorrectamente:

- `classifyProcess`: Si proceso no tiene terminal asociada → `ORPHANED_PROCESS`
- `classifyRegistry`: Si agente no tiene proceso pero tiene run activo → `STALE_REGISTRY`
- Los procesos opencode en tmux NO tienen su `sessionId` vinculado a `terminalSessions`
- `buildActiveRoster` aplica `globalRuntimeStatus` al Director
- `globalRuntimeStatus` es `ORPHANED_PROCESS` cuando hay procesos huérfanos
- `hasLiveAgentRegistryMismatch` detecta agentes con `supervisor_state=idle` pero actividad live

**Solución propuesta:**
**Opción A (rápida):** En `AgentTopologyGraph.jsx`, añadir `'running'` a la lista de status activos:

```js
const activeCount = roster.filter((member) =>
  [
    'active',
    'working',
    'lease_active',
    'online',
    'thinking',
    'asking_questions',
    'running',
  ].includes(member?.status)
).length;
```

**Opción B (completa):** Modificar `classifyRegistry` en `runtimeStatus.js`:

- Considerar que un agente con `status === 'running'` es ACTIVE, no STALE_REGISTRY
- Detectar procesos tmux por nombre de sesión o por PID

**Opción C (recomendada):** Combinar A + mejorar detección de procesos tmux en `runtimeStatus.js` para que `hasProcess` sea true cuando hay un proceso opencode en una sesión tmux con el mismo agent_id.

---

## Archivos involucrados

### Comunicación:

- `src/lib/agentLaunchWrapper.js` - Agregar polling de mensajes
- `src/app/api/agenthub/operations/health/route.js` - GET health con pending_deliveries

### Resize:

- `src/components/TerminalTTY.jsx` - Preservar/restaurar scroll
- `src/components/TerminalWorkspacesManager.jsx` - Evento workspace-sync

### Topología:

- `src/components/control-room/AgentTopologyGraph.jsx` - Status activos
- `src/lib/swarm/runtimeStatus.js` - Clasificación de procesos/registry
- `src/lib/operations/swarmControl.js` - buildActiveRoster

---

## Estado

- [ ] Implementar polling de mensajes
- [ ] Implementar preservación de scroll
- [ ] Corregir status en topología
- [ ] Testear en Tauri
- [ ] Documentar fixes en engram
