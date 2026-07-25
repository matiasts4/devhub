# Prompt de continuación — Implementación auditoría detección de agentes + notificaciones

> Handoff generado 2026-07-24. Entregar este documento completo al agente que continuará el trabajo.

---

Eres un agente de código trabajando en el repo `D:\devhub` (Tauri/Electron + React + Node; rama actual `feature/electron-desktop-host`; Windows; tests con jest: `node ./node_modules/jest/bin/jest.js --runInBand <archivo>`; lint: `npx eslint <archivos>`). Lee primero `AGENTS.md` de la raíz del repo y cúmplelo (gate de git antes de completar tareas DevHub, comentarios `[git:checkpoint]`, no pushear salvo que se pida).

## Misión

Completar la implementación de las **15 tareas** derivadas de la auditoría del sistema de detección de estados de agentes (antigravity/agy, kimi, claude, opencode, grok) y del sistema de notificaciones. El contexto completo del diagnóstico está en:

**`docs/audits/2026-07-24-agent-detection-notifications-audit.md`** — léelo primero (debilidades W1–W9, N1–N9, recomendaciones P0/P1/P2).

Las 15 tareas ya existen en DevHub MCP (proyecto "Zed: Asistente y Agente DevHub", id `fd1d5538-6d55-499e-8928-8ee93aa64cc7`, títulos con prefijo `AGY-/NOTIF-/DETECT-/TEST-/OPENCODE-P0/P1/P2`). Al finalizar debes marcarlas completadas con comentario `[git:checkpoint]` (ver §Cierre).

## Estado heredado (qué ya está hecho)

### ✅ Frente A — Motor de detección: COMPLETADO (91/91 tests, bundle regenerado)

Cambios ya aplicados en el working tree:

- `src/lib/terminal/sessionAgentDetector.js`, `extractBottomViewport.js` (está en `src/lib/terminal/`, no en agentStateDetection/), `agentStateDetection/detector.js`, `stateMachine.js`, `manifests/antigravity.js`, tests y nuevo fixture `tests/fixtures/agent-screens/antigravity-working-spanish.txt`.
- `sidecar-backend/bundled/agentDetection.cjs` ya regenerado (si cambias archivos de detección, vuelve a correr `npm run build:sidecar-detection`).

**Notas de integración del Frente A (contratos que debes respetar):**

1. "Sin regla matched" ya NO publica `idle`: el detector devuelve `{state:'unknown', skipStateUpdate:true}` y es sticky (se mantiene el último estado publicado). **OpenCode** (sin regla idle) ahora depende solo del tick de quiescence → latencia de "finished" hasta 4000 ms tras el último output.
2. Quiescence: `session.lastActivityAt` se refresca con CUALQUIER chunk de salida; ventana por defecto `DEFAULT_AGENT_QUIESCENCE_MS=4000` (env `DEVHUB_AGENT_QUIESCENCE_MS`, override por sesión `session.detectionQuiescenceMs`).
3. Nuevos exports: `DEFAULT_AGENT_QUIESCENCE_MS` (sessionAgentDetector.js); `resolveDetectionSizing`, `DEFAULT_DETECTION_BUFFER_CHARS`, `MAX_DETECTION_VIEWPORT_LINES` (extractBottomViewport.js). Sizing por `session.termsize.{cols,rows}` con overrides `session.detectionViewportLines`/`detectionBufferChars`.

### ⚠️ Frente B — Servidor: PARCIAL (agente anterior llegó a su límite de pasos)

**Tu primer paso: `git status --short` y `git diff` para ver qué quedó editado**, evaluar si es consistente y completarlo. Sus 4 tareas:

1. **Detección de inicio agy por salida (W1, P0):** crear `src/lib/terminal/antigravityReadyMarker.js` (patrón de `kimiReadyMarker.js`/`opencodeReadyMarker.js`) con `detectAntigravityTuiReady(session, text)` (señales: "? for shortcuts", "accept-edits ·", prompt `antigravity>`, "esc to cancel"; ver fixtures `tests/fixtures/agent-screens/antigravity-*.txt`). Wirear en `ttyServer.js` junto a L1208-1231 (donde están los detectores kimi/opencode/grok pre-attach) y en `sidecar-backend/server.js` L354-374 (mirando cómo están wireados ahí los markers kimi/opencode; NO editar el bundle `.cjs`). Tests espejo de los ready markers existentes.
2. **Launcher swarm agy (W8, P0):** agregar caso `agy`/`antigravity` en `agentLaunchCommand.shared.js` (candidateBins ~L133, switch `buildAgentLaunchCommand` ~L343) y `agentLaunchWrapper.js`, siguiendo los casos kimi/opencode (binaries `agy`, `antigravity`). Extender tests agentLaunch\*.
3. **Frames agent-state con agentType + wasCancelled (N4/N5, P1):** los ~4 sitios de emisión en `ttyServer.js` (L1270, L2181, L2523, L2579) + 1 en sidecar `server.js` L380-383 hoy solo envían `{type, agentTuiState, at}`. Agregar `agentType` y `wasCancelled` (este último vive en el estado de sesión/detección — leer `sessionAgentDetector.js` L117-136; NOTA: el Frente A ya modificó ese archivo, usa la versión actual del working tree) solo cuando estén definidos. Considera extraer helper `buildAgentStateFrame(session, state, extra)` compartido + test de schema del frame.
4. **Limpieza de exit del lado servidor (W7/N7, P1):** (a) en `handleSessionExit` (ttyServer L1438-1483) y `finalizeSidecarSessionExit` (sidecar L201): si la sesión tiene `agentType`, emitir PRIMERO un frame final `agent-state` `{state:'idle', reason:'exit'}` y luego el frame `exit`. (b) Reaper de child-exit para lanzamientos tipeados: cuando el usuario tipeó `agy` en bash y el agente muere pero el shell sobrevive, limpiar `session.agentType`/`agentTuiState`/hook state y emitir frame final — heurística conservadora (prompt del shell de vuelta + sin señales del footer agy por ≥3s), documentada en comentarios, con tests sintéticos. Marcar en los call sites de `applyAgentTuiDetection` si el agente fue lanzado por comando tipeado vs initialCommand/wrapper (agregar flag si no existe). Mantener ambos runtimes (ttyServer y sidecar) en espejo.

## Tareas pendientes (sin empezar)

### Frente C — Hooks nativos de Antigravity + redundancia (P0 principal, BV 10)

Hechos externos verificados: Antigravity (terminal, CLI **e IDE**) soporta hooks en `~/.gemini/config/hooks.json` (global) y `.agents/hooks.json` (workspace). Eventos: `PreInvocation` (=started/working), `PostInvocation`, `PreToolUse`/`PostToolUse` (=working), `Stop` con payload stdin `{"conversationId","fullyIdle":bool,"terminationReason":"model_stop"|"NO_TOOL_CALL"|"max_steps_exceeded"|"error",...,"transcriptPath","workspacePaths","executionNum"}`. **Quirk: el payload NO incluye el nombre del evento** (pasarlo como arg CLI). Handler: `{"type":"command","command":"...","timeout":30}`; stdout `{"decision":"continue"}` fuerza continuar. Transcripts del IDE: `~/.gemini/antigravity-ide/brain/<conversationId>/.system_generated/logs/transcript.jsonl`.

1. **Instalador + bridge (W2):** extender `src/lib/terminal/agentHooks/installer.js` (hoy `throw Unsupported agent` L247) con caso agy: escribir/mergear `~/.gemini/config/hooks.json` **idempotente y no destructivo** (parsear, mergear entradas DevHub marcadas, backup antes de escribir, nunca clobber hooks de terceros; JSON corrupto → backup + fresh + warning). Crear bridge `scripts/agent-hooks/antigravity-bridge.mjs` (Node stdlib): recibe `<eventName>` como argv, lee payload JSON de stdin, mapea (`PreInvocation`→`working`, `Pre/PostToolUse`→`working`, `Stop`+`fullyIdle:true`→`idle`, `Stop`+`fullyIdle:false`→`working`, desconocido→exit 0), y POSTea `{token, state, agentType:'agy', conversationId, terminationReason, transcriptPath, workspacePaths, source:'antigravity-hook'}` al endpoint. Descubrimiento del endpoint: el hook corre en el env de Antigravity SIN las env vars de sesión → leer `~/.devhub/hook-bridge.json` (`{"url","token","updatedAt"}`) que DevHub mantiene vía nuevo helper exportado `writeHookBridgeConfig({url,token})` en `src/lib/terminal/agentHooks/bridgeConfig.js`. **FAIL-OPEN total**: cualquier error → exit 0 (nunca bloquear al agente); stdout vacío; stderr solo con DEBUG. Extender `handleHookReport.js` MÍNIMAMENTE para aceptar reportes del bridge (token compartido, sin terminalId, routing por conversationId/workspacePaths). Tests: merge del instalador (fresh/existente/re-install/corrupto) y mapping del bridge con servidor HTTP stub.
2. **Liveness del IDE host (P1):** nuevo `src/lib/terminal/ideHostLiveness.js` — `isAntigravityHostRunning(): Promise<{running,pids[]}>` cross-platform (Windows: `tasklist` CSV matcheando /antigravity|agy/i; mac/linux: `ps`), más `listAntigravityLanguageServers()`. Args fijos (sin inyección). Tests con exec inyectado (mock).
3. **Watcher de transcripts (P1):** nuevo `src/lib/terminal/antigravityTranscriptWatcher.js` — `watchAntigravityTranscript({conversationId|transcriptPath, onActivity, onIdle, idleMs=4000, pollMs=2000})` con polling por stat (fs.watch no es confiable), manejo de archivo-aún-no-existe, truncamiento/rotación, múltiples conversaciones, devuelve `unwatch()`. Patrón kimi-watch: quiescence sobre crecimiento del transcript = señal de "terminó". Tests con temp files + fake timers.
4. **Doc de diseño:** `docs/designs/AGY-HOOKS-01-design.md` (≤150 líneas): cómo los 3 canales (hooks > transcript quiescence > liveness > screen scraping) alimentan el path existente `handleHookReport` → estado de sesión; estrategia de mapeo conversationId→panel/terminal (matchear workspacePaths contra cwds conocidos; fallback: sesión virtual 'agy-ide' para agentes solo-IDE); payloads exactos.

### Frente D — Notificaciones cliente

Archivos: `src/components/terminal/utils/agentNotificationBridge.js`, `NotificationToastStack.jsx` (buscarlo), `src/lib/operations/events.js`, `useTerminalV2Session.js` (buscarlo; audit cita L679-747), `panelSemanticStateStore.js` (buscarlo). El Frente B agregará `agentType`/`wasCancelled` a los frames — consumir CON fallback cuando ausentes.

1. **Blocked desde cualquier estado (N6, P0):** bridge L40 hoy exige `prev==='running'`. Notificar CUALQUIER transición →`blocked` desde no-blocked (mantener cooldown 10s por panel+kind). Tests: idle→blocked, ausente→blocked, blocked→blocked no notifica.
2. **Deduplicar sonido (N1, P1):** hoy suena en bridge (L46/93) Y en ToastStack (L85-87). Un solo dueño: ToastStack (ya chequea prefs); quitar playback directo del bridge. Preservar mapeo severidad→sonido.
3. **Deduplicar desktop (N2, P1):** doble notificación OS (delivery.desktop Electron/Tauri + web Notification del renderer cuando `document.hidden`, ToastStack L51-64). Dejar la vía nativa Electron/Tauri; mantener web Notification SOLO como fallback cuando no hay bridge nativo (usar el mismo capability-check que shell.js/notify.js).
4. **dedupe_key estable (N3, P2):** quitar `${now}` de las keys (bridge L58/86/105) → key por panel+kind para que `occurrence_count` agregue (verificar semántica en events.js). Cooldown sigue throttling.
5. **Expiración de no-leídos (N8, P2):** en `src/lib/operations/events.js` (~L29-40) los unread nunca expiran y desalojan nuevos al llegar al cap 200. Aplicar retención 7d también a unread o arreglar orden de evicción por recencia. API estable; tests.
6. **Cleanup exit + campos nuevos del frame (N7/W7/N4/N5 cliente, P1):** en `useTerminalV2Session.js`: (a) pasar `payload.agentType`/`payload.wasCancelled` a `handleAgentStateTransition` (preferir payload.agentType sobre parsear initialCommand); (b) al llegar `exit`: llamar `clearPanelSemanticState(panelId)` + `resetAgentNotificationBridgeState(panelId)` (existe y nadie la llama); procesar el frame final `{state:'idle', reason:'exit'}` ANTES del cleanup para no perder la notificación de completado ni duplicarla. Tests simulando frames WS.

### Frente E — Cliente SSE de OpenCode (P2)

OpenCode tiene API propia: `opencode serve` (puerto 4096) expone `GET /event` (SSE; primer evento `server.connected`; incluye `session.idle` emitido por el propio loop del agente) y `GET /session/status` (snapshot REST busy/idle). Crear `src/lib/opencode/opencodeSseClient.js` standalone (verificar dónde viven los helpers opencode existentes, p. ej. `openCodeProcesses.js`, y seguir convención): `createOpencodeStatusClient({baseUrl, fetchImpl, onEvent, onStatusChange, logger, reconnectDelayMs=3000, maxReconnectDelayMs=30000})` → `{start(), stop(), getSessionStatuses(), isConnected()}`. Parseo SSE manual (fetch + ReadableStream, stdlib; buscar primero si ya hay helper SSE en src/lib). Fallback: ≥3 fallos SSE consecutivos → polling `/session/status` cada 5s + retry SSE con backoff exponencial. `stop()` limpio con AbortControllers, sin estado mutable a nivel módulo, Node 18+ ESM. Tests con fetchImpl falso (stream SSE inyectado, fallback a polling con fake timers, secuencia de backoff, teardown sin callbacks post-stop). **Sin wiring** — solo módulo + receta de integración en comentario header.

## Integración final (después de los frentes)

1. **Wiring de Frente C y E en los servidores:** en el startup de `ttyServer.js` y `sidecar-backend/server.js`: llamar `writeHookBridgeConfig`, registrar el consumidor de reportes del bridge agy, iniciar/detener watchers de transcripts y liveness, instanciar el cliente SSE de opencode (preferencia: SSE/hooks > transcript > liveness > scraping). Hacerlo con edits pequeños y quirúrgicos.
2. **TEST-P2 — Suite de regresión:** (1) test de schema del frame agent-state; (2) bytes crudos con `\r` por la ruta real de ingesta (ya cubierto por Frente A — verificar); (3) blocked-desde-idle notifica; (4) cleanup en exit; (5) **paridad sidecar↔ttyServer** con el mismo fixture (prometido en `openspec/changes/tui-status-herdr-parity/design.md` L48, nunca agregado); (6) inicio agy tipeado y pre-attach.
3. **Suite completa:** `node ./node_modules/jest/bin/jest.js --runInBand` (todo el repo) + `npx eslint src --ext .js,.jsx,.ts,.tsx --max-warnings 30`. Todo verde antes de cerrar.
4. Si cambiaste archivos bajo `src/lib/terminal/agentStateDetection/`, `sessionAgentDetector.js`, `extractBottomViewport.js` o `stripAnsi.js`: `npm run build:sidecar-detection` y verificar el bundle regenerado.

## Cierre (obligatorio, según AGENTS.md)

1. `git status --short` → checkpoint commit(s) locales (NO push). Commits por unidad de trabajo si es limpio; uno solo si está muy entrelazado.
2. Actualizar las 15 tareas en DevHub MCP: `update_task` → `completed` + `add_task_comment` con `[git:checkpoint] commit=<sha>`, docs tocados y checks corridos. Las tareas están en el proyecto `fd1d5538-6d55-499e-8928-8ee93aa64cc7` (títulos prefijo `AGY-/NOTIF-/DETECT-/TEST-/OPENCODE-`).
   - **Cómo hablar con DevHub MCP desde cero:** no hay CLI en PATH; usar el patrón del script existente `scripts/devhub-create-audit-tasks.mjs` (spawnea `node devhub-mcp/server.js` por stdio JSON-RPC newline-delimited con env `DEVHUB_DB_PATH=D:\devhub\data\devhub.db` y `DEVHUB_MCP_DB_DRIVER=sqlite`; mensajes: `initialize` → `notifications/initialized` → `tools/call`). Tools útiles: `list_tasks`, `update_task`, `add_task_comment`. Catálogo completo: `devhub-mcp/README.md`.

## Reglas

- NO levantar dev servers, NO hacer push, NO commitear hasta la fase de cierre.
- Tests scoped por archivo durante el desarrollo; suite completa solo en integración.
- Si trabajas con subagentes en paralelo, asigna propiedad de archivos disjunta (ver frentes arriba) — `ttyServer.js`, `sessionAgentDetector.js`, `agentNotificationBridge.js` son los puntos calientes de conflicto.
- Lee siempre la versión actual del working tree (el Frente A ya cambió contratos; el Frente B puede estar parcial).
- Reporta al final: archivos cambiados por tarea, decisiones de diseño, tests corridos con conteos, SHAs de los checkpoints y estado de las 15 tareas DevHub.
