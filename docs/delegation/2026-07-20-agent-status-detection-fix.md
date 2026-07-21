# Tarea: arreglar la detección de estado de agentes (running/idle/blocked) en DevHub

Repo: `D:/devhub` (Next.js + sidecar terminal, Windows, shell = Git Bash). Trabaja directamente
sobre el repo. **NO hagas git commit/push** — solo deja los cambios en el working tree.
Haz cambios mínimos y quirúrgicos; no refactorices código ajeno a la tarea.

## Problema

El badge de los paneles de terminal que indica si un agente (kimi, claude, codex, opencode,
grok) está "Running", "Inactivo" o "Blocked" funciona mal: un Kimi Code CLI trabajando se
muestra como Inactivo casi siempre. El diagnóstico completo ya está hecho (verificado contra
el código); tu trabajo es implementar el fix descrito abajo.

## Diagnóstico (causas raíz, ya confirmadas)

El badge se decide en `derivePanelStatus` (`src/components/terminal/utils/panelStatusHelpers.js:106-195`)
con jerarquía: semantic `agentTuiState` fresco (TTL 10s) → liveActivity → apiStatus (DB) → output PTY reciente.

1. **MANIFEST KIMI DESACTUALIZADO**: `src/lib/terminal/agentStateDetection/manifests/kimi.js` solo
   tiene 3 reglas `running` (línea que es solo un emoji de luna, braille+`thinking...`, y
   estado de swarm `[N agents running]`). El chrome real del Kimi Code CLI actual NO matchea
   ninguna → `unknown` → fallback idle AUTORITATIVO en `detector.js:108-113` → semantic idle
   gana a todo lo demás → badge "Inactivo".
2. **CASCADA DE STALENESS DE 10s (el bug principal)**: un `running` estable NUNCA se republica.
   `src/lib/terminal/agentStateDetection/stateMachine.js:62-67` solo refresca BLOCKERS
   estables cada 800ms; en `:115` el timestamp se guarda también para working pero nadie lo
   lee. Resultado: aunque kimi se detecte running, a los 10s expira el TTL del cliente →
   kimi usa session id sintetizado → el poll a `/api/agenthub` da 404 → `liveActivity` 'running'
   no tiene rama en `derivePanelStatus` → cae a "output PTY reciente en panel de agente" → IDLE.
3. **REGEX ANCLADOS SOBRE ANSI CRUDO**: el buffer de detección conserva secuencias SGR/CSI de
   redraw (`ttyServer.js:1106-1116` solo strippea OSC 0/2 y capabilities). Un lineRegex
   `^\s*(🌕…)\s*$` no matchea si la línea empieza con `\x1b[2K\x1b[G` (`\s` no cubre ESC).
4. **INGEST SOLO EVENT-DRIVEN**: la state machine solo se re-evalúa cuando llega output PTY
   (`src/lib/terminal/sessionAgentDetector.js:34`). El proyecto de referencia herdr
   (clone en `.research/herdr`) re-evalúa cada 300ms con un tick; sin tick, el pending-idle
   cap de 700ms y cualquier refresh estable dependen de que siga llegando output.
5. **TRACKER CIEGO EN ENGINE V2**: `src/components/terminal/utils/panelActivityTracker.js:100`
   ignora frames `append`, pero `src/components/terminal/hooks/useTerminalV2Session.js:687`
   le manda `onFrame('append', payload.data)` con data en BASE64 → `liveActivity` queda casi
   siempre en 'idle' → alimenta la rama que degrada el badge a Inactivo.
6. **FALSO RUNNING RESIDUAL**: `src/app/api/agenthub/sessions/[sessionId]/status/route.js:100-127`
   devuelve `session.status || 'active'` y solo reconcilia contra el servidor real para
   OpenCode → una fila stale de la DB muestra RUNNING permanente.

Contexto adicional: el SDD original está en `openspec/changes/tui-status-herdr-parity/` y
`sdd/tui-status-herdr-parity/` (quedó "PASS WITH WARNINGS"). Los manifests están en paridad
1:1 con herdr (`.research/herdr`, verificado con `node scripts/compare-herdr-manifests.mjs`,
EXIT 0). La divergencia real con herdr es de motor: pantalla renderizada + tick 300ms +
hooks de lifecycle (los hooks **NO** están en scope de esta tarea).

## Plan de implementación (aprobado — ejecútalo completo, en orden)

### Fase 0 — Evidencia real del TUI de Kimi Code (fixtures)

No hay capturas reales en el repo; obtén los strings reales del footer del Kimi Code CLI:

- **Fuente 1 (canónica en repo)**: `src/lib/terminal/kimiReadyMarker.js:16-28` lista el chrome
  real conocido: `welcome to kimi`, `kimi code cli vN`, `mcp / status`, `ctrl+p commands`,
  `esc interrupt`, `session_<hex>`, `k2 code`, `thinking` + `/NN% (`.
- **Fuente 2**: el binario local `C:/Users/PC/.kimi-code/bin/kimi.exe` (~129MB) contiene el JS
  del TUI embebido; extráelo con `grep -a -o -E '[ -~]{N}'` sobre patrones como
  `interrupt`, `commands`, `thinking`, spinner glyphs, `% (`. Usa timeouts generosos y acota
  el output (`sort -u | head`). Cuidado: ese archivo está FUERA del repo — solo léelo, no lo modifiques.
- **Fuente 3**: `.research/herdr` (proyecto Rust de referencia) tiene manifests en
  `src/detect/manifests/*.toml` por si necesitas comparar.

Con esa evidencia crea 3 fixtures de bottom-viewport realistas:

- `tests/fixtures/agent-screens/kimi-working-footer.txt` (trabajando: spinner + `esc interrupt` + `thinking /NN% (`)
- `tests/fixtures/agent-screens/kimi-idle-prompt.txt` (prompt esperando input: hints `ctrl+p commands`, sin `esc interrupt`)
- `tests/fixtures/agent-screens/kimi-blocked-approval.txt` (panel de permiso: `↵ confirm` / approve-reject)

Documenta en el header de cada fixture la fuente y la versión de kimi validada.
Valida con `node scripts/explain-agent-detection.mjs` (ya existe; mira su uso).

### Fase 1 — Fix de la cascada de staleness (P0, el más importante)

**1.1** `src/lib/terminal/agentStateDetection/stateMachine.js`: en `stableVisibleSignalRefreshDue`
(`:62-67`) la condición pasa de solo-blocker a blocker O working estable:
`(next.visibleBlocker && this.lastVisibleBlocker) || (next.visibleWorking && this.lastVisibleWorking)`.
Con eso un running visible estable se republica cada `STABLE_VISIBLE_SIGNAL_REFRESH_MS` (800ms).

**1.2** Tick server-side (réplica del loop de herdr): nuevo `tickAgentDetection(session, now)` en
`src/lib/terminal/sessionAgentDetector.js`:

- Cachea el último resultado de detección en `session.lastDetection` dentro de
  `ingestAgentDetectionFromFilteredOutput`.
- En el tick: si el buffer no cambió y el estado publicado no es running/blocked, no hacer
  nada (skip como `should_skip_idle_screen_scan` de herdr). Si hay estado running/blocked
  o pending-idle, llamar `session.agentStateMachine.publish(session.lastDetection, now)`
  para que el refresh estable y el pending-idle cap (700ms) se disparen por tiempo.
- Si el proceso PTY ya no existe → forzar publish idle (equivalente a `process_exited` de herdr).
- Devolver `{published, agentTuiState, agentTuiStateAt}` igual que ingest.

Wiring: intervalo (default 500ms, configurable con env `AGENT_DETECTION_TICK_MS`) en
`src/lib/terminal/ttyServer.js` iterando sesiones con `agentType`, llamando el tick y
broadcasteando el frame `agent-state` cuando publique (reusar el bloque de broadcast de
`ttyServer.js:1190-1208`). Mismo patrón en `sidecar-backend/server.js` (ver `:361-369`).
Limpiar el intervalo en el shutdown del server.

**1.3** Rebuild del bundle CJS del sidecar (los módulos compartidos cambian):
`node scripts/build-sidecar-agent-detection.mjs`. Verifica que
`sidecar-backend/bundled/agentDetection.cjs` queda regenerado.

### Fase 2 — Reglas kimi para el TUI actual (P0)

Edita `src/lib/terminal/agentStateDetection/manifests/kimi.js` basándote SOLO en la evidencia
de Fase 0 (no inventes patrones):

- Nueva regla running para el footer de trabajo (p.ej. `working_footer_esc_interrupt`,
  prioridad ~110, región `bottom_lines(5)`, `contains: ['esc interrupt']`), validando contra
  el fixture idle que NO matchea ahí (si matchea en idle, refina con `not` o combinación).
- Nueva regla running para progreso (p.ej. `thinking_progress_working`, prioridad ~105,
  lineRegex con `thinking` + `/\s*[\d.]+%\s*\(` — patrón ya usado en `kimiReadyMarker.js:26`).
- Si la evidencia lo justifica, regla idle explícita para el prompt en reposo.
- Sube `version` del manifest (p.ej. `2026.07.20.1`) y comenta en el header que estas reglas
  son extensiones DevHub sobre herdr `2026.06.10.1`. Verifica que
  `node scripts/compare-herdr-manifests.mjs` sigue EXIT 0 (el script solo exige que las reglas
  herdr existan; las extra no deben romperlo — compruébalo).
- Tests en `src/lib/terminal/agentStateDetection/__tests__/detector.test.js`: cada fixture de
  Fase 0 → estado esperado (working→running, idle→idle, blocked→blocked).

### Fase 3 — Strip ANSI antes de evaluar reglas (P1)

Sanitiza el buffer de detección antes de extraer el viewport: strip de SGR/CSI
(`\x1b\[[0-9;?]*[a-zA-Z]`), secuencias de erase, DCS/APC/PM y `\r`, conservando `\n`.
Crea un helper compartido `src/lib/terminal/stripAnsi.js` (ESM + compatible con el bundle CJS
del sidecar — mira cómo `agentTuiMetadata.shared.js` / `agentTuiMetadata.node.js` se bundlean)
y úsalo en `sessionAgentDetector.js` (y opcionalmente alinea `panelActivityTracker.js:19-21`
para reusar el mismo helper). Ojo: el strip debe aplicar al TEXTO evaluado, no al buffer que
se renderiza en el terminal del usuario.
Tests: una línea `\x1b[2K\x1b[G🌕` debe matchear la regla `moon_spinner_working`; fixture con
SGR reales del TUI.

### Fase 4 — Tracker funcional en engine v2 (P1)

En `src/components/terminal/hooks/useTerminalV2Session.js:686-704`: el tracker recibe
`onFrame('append', base64)` y lo ignora. Cambio mínimo: DESPUÉS de decodificar (el decoded se
calcula en `:689-694`), llamar `panelActivityTrackerRef.current?.onFrame('output', decoded)` en
lugar de pasar el frame append crudo. No cambies `panelActivityTracker.js`.
Actualiza/añade tests en `src/components/terminal/utils/__tests__/panelActivityTracker.test.js`
o el test del hook si existe harness.

### Fase 5 — apiStatus stale (P1, pequeño)

En `panelStatusHelpers.js` la rama apiStatus running (`:159-161`) solo debe aplicar si el dato
es reciente (≤30s). Mira qué timestamps expone la route
(`src/app/api/agenthub/sessions/[sessionId]/status/route.js`) y qué guarda el hook
`src/hooks/usePanelAgentStatus.js`; si no hay timestamp del servidor, usa el momento del poll
del cliente. Si el diff se complica, déjalo documentado como follow-up y sigue.

### Fase 6 — Tests y verificación

1. `npx jest` sobre: `src/lib/terminal/agentStateDetection/__tests__/`,
   `src/components/terminal/utils/__tests__/` (panelActivityTracker, panelStatusHelpers),
   `src/hooks/__tests__/usePanelAgentStatus.test.js` — todo verde, incluidos los tests nuevos.
2. `node scripts/explain-agent-detection.mjs` con los 3 fixtures kimi → estados correctos.
3. `node scripts/compare-herdr-manifests.mjs` → EXIT 0.
4. `node scripts/build-sidecar-agent-detection.mjs` → bundle regenerado sin errores.
5. Actualiza documentación: añade una nota en `openspec/changes/tui-status-herdr-parity/`
   (verify-report o un addendum) describiendo: refresh de working estable, tick server-side,
   reglas kimi extendidas, strip ANSI, fix tracker v2. Actualiza también
   `tests/fixtures/agent-screens/README.md` listando los nuevos fixtures.
6. Si puedes levantar la app, smoke manual con un panel kimi real: badge Running estable >60s
   mientras trabaja; Inactivo al terminar; Blocked en prompt de permiso; escribir en el prompt
   sin enviar → sigue Inactivo; mover el cursor encima → sigue Inactivo. Si no puedes levantar
   la app, dilo explícitamente en el reporte (no lo des por verificado).

## Entregable

Al terminar, reporta: lista de archivos modificados/creados con un resumen de cada cambio,
resultado de cada comando de verificación (pega los resúmenes de jest), cualquier desviación
del plan y por qué, y qué quedó como follow-up. Sé escueto y factual.
