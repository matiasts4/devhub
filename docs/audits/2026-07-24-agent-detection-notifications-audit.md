# Auditoría: detección de estados de agentes + sistema de notificaciones

**Fecha:** 2026-07-24 · **Alcance:** `D:\devhub` (rama `feature/electron-desktop-host`) + investigación de sistemas open-source equivalentes.

**Resumen ejecutivo:** Antigravity es ciudadano de segunda clase en **todas** las capas de detección: no tiene soporte en el launcher del swarm, no tiene marcador de inicio por salida, no tiene hooks instalables y no tiene tracking de proceso. Todo depende de _screen-scraping_ del footer de una sola versión de la UI de agy, y los dos mecanismos compensatorios (manejo de `\r` y quiescence) están respectivamente **muertos** y **provocando falsos "terminó"**. El hallazgo más importante de la investigación externa: **Antigravity (IDE incluido) tiene un sistema de hooks oficial** (`~/.gemini/config/hooks.json` con `PreInvocation` y `Stop`/`fullyIdle`) que convertiría inicio/fin en eventos deterministas en lugar de inferencia por PTY.

---

## 1. Arquitectura actual de detección de estados

### 1.1 Motor compartido (portado de herdr)

| Componente           | Archivo                                                                                           | Rol                                                                                                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Motor de reglas      | `src/lib/terminal/agentStateDetection/ruleEngine.js`                                              | `evaluateManifest()` (L310) evalúa reglas sobre regiones de pantalla (`bottom_lines(N)`, `osc_title`, `whole_recent`). Matchers `contains`/`regex`/`lineRegex` con gates `all/any/not`. |
| Manifests por agente | `src/lib/terminal/agentStateDetection/manifests/{kimi,claude,codex,opencode,grok,antigravity}.js` | Reglas declarativas → `{state: idle\|running\|blocked, priority, visibleIdle/visibleWorking/visibleBlocker}`.                                                                           |
| Fachada              | `src/lib/terminal/agentStateDetection/detector.js`                                                | `detectAgentState()` (L102). **Crítico:** "ninguna regla matcheó" → fallback `idle` (L121-124, `IDLE_FALLBACK_DETECTION`). Alias `antigravity`→`agy` (L29-45).                          |
| Máquina anti-flicker | `src/lib/terminal/agentStateDetection/stateMachine.js`                                            | `AgentStateMachine.publish()` (L92): retiene `running→idle` hasta 6 confirmaciones o 4 s; re-publica señales estables cada 800 ms.                                                      |
| Ingesta por sesión   | `src/lib/terminal/sessionAgentDetector.js`                                                        | Buffer de 8 KB, viewport de 40 líneas inferiores, guards de _hook authority_ y _quiescence_. `tickAgentDetection()` cada 500 ms. `notifyUserInput()` (Enter ⇒ `running` instantáneo).   |
| Identidad de agente  | `src/lib/terminal/agentTuiMetadata.shared.js`                                                     | `detectAgentTypeFromCommand()` regexes; agy: `/\b(?:agy                                                                                                                                 | antigravity)\b/i` (L21). |

### 1.2 Dos runtimes paralelos (casi espejos)

1. **Web/dev server:** `src/lib/terminal/ttyServer.js` (~2700 líneas). Output → `ingestAgentDetectionFromFilteredOutput` (L1233) → frame WS `agent-state` (L1267-1285). Input → `detectSessionModeFromInput` (L638). Tick loop 500 ms (L2572-2594). Detección de TUI pre-adjuntado (tmux/swarm) por salida: `detectKimiTuiReady` (L1208), `detectOpenCodeTuiReady` (L1215), `detectGrokSessionFromOutput` (L1225) — **no existe equivalente antigravity**.
2. **Sidecar desktop:** `sidecar-backend/server.js` (~850 líneas) + bundle `sidecar-backend/bundled/agentDetection.cjs`. Misma pipeline; ready markers solo para kimi/opencode (L354-374).

### 1.3 Hooks de ciclo de vida (canal autoritativo)

`src/lib/terminal/agentHooks/`:

- `hookEnv.js` — token por sesión + `DEVHUB_HOOK_URL/TOKEN` inyectados al spawn del PTY.
- `handleHookReport.js` — valida `{terminalId, token, state}`; TTL 120 s; publica sin anti-flicker.
- `installer.js` — escribe hooks en **kimi** (`~/.kimi-code/config.toml`), **claude** (`~/.claude/settings.json`), **opencode** (plugin). `resolveAgentConfigPath()` (L223) **lanza `Unsupported agent` para cualquier otro — antigravity no soportado**.
- Allowlist de autoridad: `sessionAgentDetector.js` L14 incluye `'agy','antigravity'` — **entradas muertas** (ningún instalador puede producir hooks agy; el comentario en L24 dice solo "kimi, claude, opencode" — tres fuentes en desacuerdo).

### 1.4 Mecanismo de detección por agente

| Agente                | Inicio                                              | Running/blocked/idle                     | Fin                                                             | Hooks                                |
| --------------------- | --------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------- | ------------------------------------ |
| **kimi**              | comando tipeado / initialCommand / banner en salida | manifest + hooks                         | hook `Stop`/`Interrupt`→idle; quiescence; exit PTY              | ✅                                   |
| **claude**            | comando tipeado / initialCommand                    | manifest (OSC title/progress) + hooks    | hook `Stop`→idle; exit PTY                                      | ✅                                   |
| **opencode**          | comando / footer en salida / `ses_` id              | manifest (sin regla idle) + plugin hooks | quiescence 2.5 s; exit PTY                                      | ✅                                   |
| **grok**              | salida (ready marker)                               | solo manifest                            | quiescence; exit PTY                                            | ❌                                   |
| **antigravity (agy)** | **solo comando tipeado o initialCommand**           | solo manifest (screen scraping)          | quiescence 2.5 s; footer idle; exit PTY (solo si agy ES el PTY) | ❌ (en allowlist pero no instalable) |

---

## 2. Antigravity: cómo funciona hoy, paso a paso, y sus fallas

### 2.1 Detección de inicio

1. El usuario tipea `agy`/`antigravity` en un panel shell (o el panel nace con `initialCommand`).
2. `detectSessionModeFromInput` → regex → `applyAgentTuiDetection` setea `mode='tui'`, `agentType='agy'`, `agentSessionId='agy-<sessionId>'` sintético.
3. Desde ahí, cada chunk de salida pasa por el manifest y cada Enter dispara `running`.

**No hay detector de inicio por salida** (sin ready marker, sin rama tmux/pre-attach). `git grep antigravity` en `agentLaunchWrapper.js` / `agentLaunchCommand.shared.js` → **cero resultados**: el launcher del swarm no tiene caso agy.

### 2.2 Detección de running / fin

Reglas del manifest (`manifests/antigravity.js`):

- `permission_prompt` (pri 300, bottom 8): "requesting permission for:", `[y/n]` → **blocked**.
- `working_footer_esc_cancel` (pri 210, bottom 8): literal "esc to cancel"/"esc to interrupt" → **running**.
- `idle_prompt_footer` (pri 200, bottom 3): "? for shortcuts", `^antigravity>`, `>` → **idle (visibleIdle)**.
- `spinner_working` (pri 100): braille + verbo ASCII terminado en "-ing" → **running**.

Guards: `lastWorkingAt` solo se refresca cuando una regla produjo `visibleWorking` (L103-105) o con Enter. Tick 500 ms: si `running` y `now-lastWorkingAt > 2500` → fuerza `idle` (L228-245). "Terminó" = transición `running→idle`.

### 2.3 Debilidades concretas (evidencia en código)

**W1 — Sin detección de inicio para agy pre-adjuntado/tmux (P0).** `ttyServer.js` L1208-1231 detecta kimi/opencode/grok desde la salida; agy no tiene rama. Un panel swarm/tmux con antigravity nunca entra en detección → badge oculto, cero eventos.

**W2 — Sin hooks pese al allowlist (P0).** `installer.js` L247 throw; no hay assets agy en `scripts/agent-hooks/`. Detección 100% screen-scraping, a diferencia de kimi/claude/opencode.

**W3 — Señales de working/idle son strings exactos de UNA versión de la UI (P0 fragilidad).** Portadas de herdr `2026.06.24.1`. Cualquier release de agy que cambie el footer rompe running e idle simultáneamente, sin canal de respaldo.

**W4 — Quiescence circular puede voltear running→idle en plena generación (P0).** Si el footer sale del viewport durante streaming (diffs empujan líneas), a los 2.5 s el tick publica `idle` **mientras el agente sigue trabajando** → notificación falsa de "completó su respuesta". El diseño `IDLE_FALLBACK` (desconocido→idle en vez de `unknown`) lo amplifica.

**W5 — Matemática de regiones asume footer dentro de bottom 3-8 líneas de un viewport de 40 líneas sobre un buffer de 8 KB.** Un redraw completo de alt-screen 120×36 con ANSI supera 8 KB → el buffer guarda un **frame parcial** y `bottom_lines(N)` se mide desde una rebanada intermedia. Las líneas soft-wrapped cuentan como una.

**W6 — El manejo de `\r` del commit `3133f987` es código muerto en la ruta real.** Ingesta hace `stripAnsi()` **primero** (L93), y `stripAnsi` borra todos los `\r` (`stripAnsi.js` L9). Las líneas sobrescritas por CR (spinner/footer) se **concatenan** antes de que `processCarriageReturns()` pueda correr. Las reglas `lineRegex` ancladas (`^\s*(antigravity|>)\s*$`, `[y/n]`) fallan sobre líneas fusionadas. Idéntico en el bundle del sidecar.

**W7 — Tras salir agy (lanzado tipeado), el panel queda "agy" para siempre.** Nada limpia `session.agentType` cuando el proceso hijo muere pero bash sobrevive. Consecuencias: cada Enter posterior en bash dispara `running` espurio; el manifest sigue evaluando salida de bash contra reglas agy (una línea PS2 `>` de bash matchea la regla idle).

**W8 — Sin tracking a nivel proceso.** OpenCode tiene `openCodeProcesses.js` y sniffing de `ses_`; para agy `AGENT_SESSION_PATTERNS.agy = null`. Las 12 reglas diagnósticas de RESUME-SWARM-01 son solo-OpenCode.

**W9 — Drift de versión del manifest + regex de spinner frágil a locale.** Gerundios no-ingleses ("Leyendo", "Analizando") no matchean `[a-z]\w*ing\b`.

---

## 3. Sistema de notificaciones

### 3.1 Pipeline

```
WS agent-state → panelSemanticStateStore.setPanelSemanticState
  → agentNotificationBridge.handleAgentStateTransition (utils/agentNotificationBridge.js L17)
      guards: prev===next skip; MIN_RUNNING_DURATION_MS=3000; cooldown 10 s por panel+tipo
  → playNotificationSound(severity)                       ← sonido directo #1
  → dispatchOperationalNotification({dedupe_key: `agent:done:${panelId}:${now}`, desktop+in_app})
      → localStorage 'devhub:operational-events' (retención 7d/200)
      → window event 'devhub:operational-event'
      → desktop: Electron IPC notify_show / plugin-notification Tauri
```

Consumidores: `NotificationToastStack.jsx` (toasts, **reproduce sonido otra vez** y **dispara una segunda notificación OS** vía web Notification cuando `document.hidden`), `NotificationCenter.jsx` (campana/badge), `notificationManager.js` (fachada). Preferencias: toasts/nativo/sonido/telegram, quiet hours, severidad mínima (`notificationPreferences.js`).

Otros emisores: `PresenceNotifier` (heartbeat watchdog swarm: 30 s stalled→blocked, 60 s→failed), `createAgentPresenceEvent`.

### 3.2 Debilidades

- **N1 — Doble sonido.** Bridge (L46/L93) + ToastStack (L85-87) sobre el mismo evento.
- **N2 — Doble notificación de escritorio.** `delivery.desktop:true` (Electron/Tauri) + web Notification del renderer cuando la ventana está oculta.
- **N3 — Dedupe anulado por diseño.** `dedupe_key` incluye `${now}` → cada evento es único; `occurrence_count` nunca agrega; el centro de notificaciones se llena de singletons.
- **N4 — Los frames `agent-state` no llevan `agentType`.** El cliente compensa con `payload.agentType || initialCommand` (`useTerminalV2Session.js` L687) — `payload.agentType` es **siempre undefined** → el título muestra el comando crudo o "Agente" genérico; el mapa de etiquetas (`'agy'→'Anti Gravity'`) casi nunca aplica.
- **N5 — `wasCancelled` se calcula en el servidor pero nunca se serializa.** Toda la rama de notificación de cancelación (bridge L78-90) está muerta en producción.
- **N6 — "Blocked" solo notifica si `prev==='running'`.** Con la detección flaky de agy (W4), un permission prompt suele llegar desde `idle` ⇒ **no se notifica justo cuando el agente necesita al usuario**.
- **N7 — Sin notificación al salir el agente.** `handleSessionExit` solo emite `{type:'exit'}`; el cliente nunca llama `clearPanelSemanticState`; los timers del bridge quedan colgados.
- **N8 — Los no-leídos nunca expiran** (`events.js` L31-34): spam acumulado hasta el cap de 200 desaloja eventos nuevos.

---

## 4. Tests: cobertura y huecos

**Existe:** buena cobertura de manifests (`detector.test.js` con 8 casos antigravity), `sessionAgentDetector.test.js`, `agentHooks*.test.js`, `agentNotificationBridge.test.js` (5 casos), fixtures en `tests/fixtures/agent-screens/`.

**Huecos:**

- Ningún test del bug de concatenación por `\r` (W6) — los fixtures ya vienen strippeados.
- Ningún test de inicio de antigravity ni del caso tmux/pre-attach (W1).
- Ningún test de integración del **schema del frame `agent-state`** (habría detectado N4/N5).
- Ningún test de blocked-desde-idle (N6), ausencia de notificación en exit (N7), doble sonido/desktop (N1/N2).
- El test de paridad sidecar↔ttyServer prometido en `tui-status-herdr-parity/design.md` L48 nunca se agregó.

**Divergencias docs↔código:** proposal de herdr-parity con criterios de éxito sin verificar; investigation-notes desactualizado (herdr tiene 20 manifests, DevHub 6); docstring del launchWrapper presenta el wrapper como agent-genérico pero agy está ausente de toda la capa swarm-launch.

---

## 5. Investigación externa: cómo lo resuelven otros (open source)

Jerarquía de confiabilidad en la que converge el ecosistema:

1. **Hooks/eventos nativos del agente** (eventos estructurados) — máxima confiabilidad.
2. **Transcripts/logs propios del agente** (watch de archivos) — confiable incluso para agentes embebidos en IDE.
3. **Supervisión de proceso** (spawn propio → exit code / PID) — confiable para inicio/fin de proceso, ciego al estado intra-sesión.
4. **Screen scraping del PTY** — lo menos confiable; todos lo usan solo como _fallback_.

### 5.1 Proyectos analizados

| Proyecto                                                                                               | Detección                                                                                                                                                                        | Notificación                                                                                | Lección                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **herdr** ([repo](https://github.com/ogulcancelik/herdr))                                              | Proceso + manifests TOML de pantalla + integraciones nativas opcionales por agente                                                                                               | Sidebar + API socket `wait agent-status`                                                    | Su CHANGELOG demuestra que el screen parsing exige mantenimiento constante; los hooks son el tier confiable. Es el proyecto que el owner conocía; DevHub ya portó su motor de manifests.                     |
| **Open Vibe Island** ([repo](https://github.com/Octane0411/open-vibe-island))                          | Inyección de hooks en 9 agentes (CLI bridge → Unix socket → reducer de estado) + discovery por transcripts + `ps`/`lsof` + liveness de la app host para agentes embebidos en IDE | Notch macOS + click-to-jump al terminal/IDE                                                 | **El blueprint más cercano a lo que DevHub necesita.** Resuelve el bug "agente de desktop invisible para ps" (su issue #510): atar liveness al proceso host, no al subproceso.                               |
| **OpenCode server** ([docs](https://opencode.ai/docs/server/))                                         | **Bus SSE propio** (`/event`, `session.idle`) + REST `/session/status` + plugins JS                                                                                              | El stream SSE es el canal                                                                   | Estándar oro: suscribirse en vez de inferir. DevHub debería consumir `/event` + `/session/status` para opencode en lugar de PTY.                                                                             |
| **Claude Code hooks** ([docs](https://code.claude.com/docs/en/hooks))                                  | Eventos nativos (SessionStart/Stop/Notification con `agent_completed`/`idle_prompt`); handlers `command`/**`http`** (POST directo a URL, sin binario bridge)                     | `terminalSequence` (OSC 9/99), HTTP POST, push a teléfono (Pushary)                         | Hooks HTTP = IPC push al backend de Tauri sin polling.                                                                                                                                                       |
| **vibe-kanban** ([repo](https://github.com/BloopAI/vibe-kanban))                                       | Spawnea agentes headless; parsea stream estructurado; timeout de inactividad                                                                                                     | Sonidos + in-app                                                                            | **Cuento cautionario:** issues documentados de "running para siempre" y "idle prematuro" por stop-hook/timeout ([#2783](https://github.com/BloopAI/vibe-kanban/issues/2783)) — la misma clase de bug que W4. |
| **tmux-agent-indicator** ([repo](https://github.com/accessd/tmux-agent-indicator))                     | Hooks de Claude primario + **fallback por detección de proceso**                                                                                                                 | Bordes de pane tmux + status bar; "done" persiste hasta que el usuario enfoca el pane (ack) | Modela el patrón por capas hooks→proceso y la semántica de ack.                                                                                                                                              |
| **agent-deck** ([repo](https://github.com/asheshgoplani/agent-deck))                                   | tmux propio + polling ~2 s + verificación por session IDs                                                                                                                        | Barra tmux; escalación a Telegram/Slack/Discord                                             | Polling a baja cadencia es UX aceptable; patrón conductor para push.                                                                                                                                         |
| **claude-squad** ([repo](https://github.com/smtg-ai/claude-squad))                                     | Panes tmux propios en worktrees                                                                                                                                                  | Solo TUI                                                                                    | Solo viable para agentes que él mismo spawnea.                                                                                                                                                               |
| **Crystal** ([repo](https://github.com/stravu/crystal), deprecado)                                     | Claude CLI headless con stream-json + ciclo de vida del proceso                                                                                                                  | Notificaciones desktop al terminar/esperar input                                            | Stack más cercano a Tauri; solo cubre agentes auto-lanzados.                                                                                                                                                 |
| **Aider** ([docs](https://aider.chat/docs/usage/notifications.html))                                   | Es el propio agente                                                                                                                                                              | `--notifications` nativas + `--notifications-command`                                       | Semántica correcta del trigger: notificar cuando "terminó **y está esperando input**", no cuando el proceso sale.                                                                                            |
| **Overmind** ([repo](https://github.com/leandronsp/overmind))                                          | Supervisor dueño del proceso + `subscribe` NDJSON                                                                                                                                | El stream NDJSON                                                                            | Quien spawnea posee el ciclo de vida; exponer stream para que las UIs nunca scrapeen.                                                                                                                        |
| **Vibe Island + kimi-watch** ([repo](https://github.com/ohimayio/vibe-island-kimi-setup))              | Hooks en `~/.kimi/config.toml` (la extensión VSCode comparte el CLI → los hooks disparan también dentro del IDE) **o** tail de `~/.kimi/logs/kimi.log` con **quiescence**        | `terminal-notifier` clickable                                                               | Valida la quiescence sobre log estructurado como fallback estándar de industria (mismo enfoque que DevHub implementó en `25b02d92`).                                                                         |
| **Kimi Code hooks** ([docs](https://www.kimi.com/code/docs/en/kimi-code-cli/customization/hooks.html)) | `[[hooks]]` nativos, payload byte-compatible con Claude; evento dedicado **`Interrupt`** (Stop NO dispara en Esc)                                                                | Comando del hook                                                                            | Un solo decode path sirve para Claude y Kimi; hay que modelar `Interrupt` aparte o quedan sesiones pegadas en "running".                                                                                     |

### 5.2 El hallazgo clave: Antigravity tiene hooks oficiales

Verificado por dos fuentes independientes ([MemPalace INVESTIGATION.md](https://github.com/MemPalace/mempalace/blob/develop/hooks/antigravity/INVESTIGATION.md) contra `antigravity.google/docs/hooks`, y [Mete Atamel](https://atamel.dev/posts/2026/07-16_where_agy_hooks/)):

- **Ubicaciones:** `.agents/hooks.json` (workspace) y `~/.gemini/config/hooks.json` (global). **Las 3 variantes de AGY los reconocen: agente de terminal, CLI e IDE.**
- **Eventos:** `PreInvocation` (antes de cada invocación del modelo = "empezó"), `PostInvocation`, `PreToolUse`/`PostToolUse` (= "trabajando"), **`Stop`** con payload `{"conversationId", "fullyIdle": true, "terminationReason": "NO_TOOL_CALL"|"model_stop"|"max_steps_exceeded"|"error", "transcriptPath": …}` (= "terminó").
- Handler `{"type":"command","command":...,"timeout":30}`; stdout `{"decision":"continue"}` puede forzar a seguir.
- **Quirks:** el payload no incluye el nombre del evento (pasarlo como arg CLI); solo 5 eventos.
- **Plugins:** `~/.gemini/config/plugins/<name>/` puede empaquetar `hooks.json` + MCP — un instalador puede shippar un plugin auto-registrado.
- Transcripts del IDE: `~/.gemini/antigravity-ide/brain/<conversationId>/.system_generated/logs/transcript.jsonl` (todo payload hook incluye `transcriptPath`).

### 5.3 Capas de redundancia para el IDE (cuando hooks no bastan)

1. **API del language server local + CSRF token** — null-g-mcp y antigravity-monitor leen la API local (127.0.0.1) del language server de Antigravity (binario Go) vía `ANTIGRAVITY_PORT`/`ANTIGRAVITY_CSRF_TOKEN` descubribles del proceso.
2. **CDP** — `--remote-debugging-port=9000` hace las sesiones descubribles (antigravity-link); requiere flag opt-in.
3. **UIA/OS automation** — antigravity-auto-retry cliquea retry/accept por Windows UIA; último recurso.
4. **Storage del IDE** — `state.vscdb` / `brain/<id>/` watchers de mtime + quiescence.

---

## 6. Recomendaciones priorizadas

### P0 — arreglan inicio/fin de antigravity

1. **Instalar hooks nativos de Antigravity (señal primaria).** Escribir `~/.gemini/config/hooks.json` (o plugin auto-registrado) con `PreInvocation`→"started", `PreToolUse`/`PostToolUse`→"working", `Stop` (gate `fullyIdle:true`)→"finished", apuntando a un bridge CLI → `POST /api/terminal/agent-hook` (endpoint ya existente). Fail-open si DevHub está caído. Extender `agentHooks/installer.js` con el caso `agy`. Convierte inicio/fin de inferencia probabilística en eventos deterministas — el mismo patrón que arregló Kimi-en-VSCode para Vibe Island.
2. **Arreglar el orden CR→stripAnsi (W6).** Colapsar `\r` (last-write-wins por línea) **antes** de `stripAnsi`, o hacer `stripAnsi` CR-aware. Hoy las reglas `lineRegex` ancladas fallan sobre líneas concatenadas.
3. **Cambiar el fallback "sin match" de `idle` a `unknown`** (al menos para agentes con manifest) y basar quiescence en **cualquier actividad de salida**, no solo en hits `visibleWorking` (W4). Elimina los falsos "terminó" en ~2.5 s.
4. **Detección de inicio por salida para agy** (W1): `detectAntigravityTuiReady` (p. ej. "? for shortcuts", "accept-edits ·", OSC title) + ready marker + rama en `ttyServer.js` L1208-1231 y sidecar L354-374, con soporte en `agentLaunchCommand.shared.js`/`agentLaunchWrapper.js` para el swarm.
5. **Notificar blocked desde cualquier estado previo** (N6): quitar el requisito `prev==='running'` para "requiere atención".

### P1 — calidad de detección y corrección de notificaciones

6. **Serializar `agentType` y `wasCancelled` en los frames `agent-state`** (N4/N5) + test de schema del frame.
7. **Deduplicar sonido y notificación de escritorio** (N1/N2): una sola vía para cada uno.
8. **Limpieza al salir** (N7, W7): frame final de estado, `clearPanelSemanticState` en exit, reset del bridge, y limpiar `agentType` cuando el proceso hijo muere aunque el shell sobreviva (reaper de proceso hijo o detección de retorno de prompt).
9. **Capas de redundancia para agy:** hook (primario) → watch de `brain/<id>/transcript.jsonl` + quiescence (secundario, patrón kimi-watch) → liveness del proceso host del IDE (terciario, patrón open-vibe-island #510). Un único reducer de estado que reconcilie señales contradictorias.
10. Reducir fragilidad del viewport (W5): consciencia del `termsize`, buffer mayor, y pruebas con redraws completos de alt-screen.

### P2 — consistencia y polish

11. `dedupe_key` estable (sin `${now}`) para que `occurrence_count` agregue (N3).
12. Regex de spinner robusto a locale o basado solo en braille (W9); proceso para trackear drift de manifests contra herdr upstream.
13. Gatear `notifyUserInput` para que no dispare tras la salida del agente (W7).
14. Expiración de eventos no-leídos (N8).
15. Completar los tests del §4, incluido el de paridad sidecar↔ttyServer prometido en `tui-status-herdr-parity/design.md`.

### Bonus — opencode

Para OpenCode, migrar de PTY scraping + plugin a consumir el **bus SSE propio** (`opencode serve` → `GET /event`, evento `session.idle`, REST `/session/status`): cero ambigüedad de parseo, emitido por el propio loop del agente.

---

## 7. Conclusión

El diagnóstico confirma la percepción del equipo: antigravity falla porque su detección depende enteramente de raspar texto de una sola generación de UI, con dos bugs activos (CR muerto, quiescence que dispara falsos finales) y sin ninguno de los canales autoritativos que sí tienen kimi/claude/opencode. La industria ya resolvió este problema exacto: hooks nativos + bridge + reducer + capas de redundancia (Open Vibe Island es el blueprint completo), y Antigravity expone oficialmente los eventos necesarios. La inversión principal es el instalador de hooks agy + endurecer los 3 bugs P0 del motor actual; todo lo demás es consistencia.
