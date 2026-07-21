# SDD: agent-hooks-authority — Detección de estado de agentes por hooks de lifecycle

**Fecha:** 2026-07-20
**Estado:** IMPLEMENTADO (Fases 0-4) — corregido y revisado el mismo día; ver addendum al final
**Sucesor de:** `openspec/changes/tui-status-herdr-parity/` (screen detection, ya aplicado)

---

## 1. Contexto y problema

DevHub muestra un badge por panel de terminal con el estado del agente (Running / Inactivo /
Blocked). Hoy la detección es por **screen scraping**: manifests de reglas evaluados contra el
stream PTY (`src/lib/terminal/agentStateDetection/`), con tick de 500ms y anti-flicker
(implementado en el fix del 2026-07-20, ver `docs/delegation/2026-07-20-agent-status-detection-fix.md`).

**Problema residual confirmado por el usuario:** el badge parpadea a "Inactivo" durante lapsos
cortos mientras el agente (especialmente Kimi Code) sigue trabajando. Causa raíz: los TUIs
basados en Ink redibujan por diffs — el footer con el chrome de "working" (`esc interrupt`,
spinner) solo se re-emite cuando cambia. Durante streaming largo, las últimas 40 líneas del
stream son transcript sin footer → ninguna regla running matchea → fallback `unknown→idle` →
parpadeo. Ninguna regla de pantalla puede arreglar esto de forma fiable.

**Solución (patrón herdr, verificado en `.research/herdr`):** hooks de lifecycle que el propio
agente ejecuta en cada evento (prompt enviado, tool call, permiso, stop) y que reportan el
estado real a DevHub con **autoridad sobre la detección de pantalla**. herdr lo usa para 15
agentes; para kimi/opencode/claude tiene autoridad total (`src/detect/mod.rs:244-255`).

### Objetivo

Implementar el canal hook→DevHub con autoridad de estado para **kimi, claude y opencode**,
manteniendo la detección por pantalla como fallback cuando el hook no está instalado o no
reporta. grok y codex quedan fuera (grok no tiene hook asset ni en herdr; codex solo `notify`).

### No-objetivos

- No tocar el pipeline de screen detection existente (queda como fallback intacto).
- No soportar grok/codex por hooks.
- No hacer UI nueva compleja: un toggle en Ajustes es suficiente.

---

## 2. Arquitectura

```
[agente TUI: kimi/claude/opencode]
   │ evento lifecycle (UserPromptSubmit, PreToolUse, Stop, PermissionRequest…)
   │ ejecuta hook script instalado por DevHub
   ▼
hook script (sh / ps1 / js plugin)
   │ POST http://127.0.0.1:<port>/agent-hook  (JSON, <1s timeout, fallo silencioso)
   │ {terminalId, token, source, agent, state, event, agentSessionId?, seq, ts}
   ▼
Endpoint /agent-hook  ── sidecar-backend/server.js  (transporte sidecar)
                     └─ src/app/api/terminal/agent-hook/route.js → ttyServer (transporte in-process)
   │ valida token + allowlist de estados
   ▼
session.hookState = { state, at, source, agentSessionId? }
   ▼
Autoridad en sessionAgentDetector: si hookState fresco (< HOOK_AUTHORITY_TTL_MS) y es de un
agente con autoridad → la screen detection NO publica; el hook es la única fuente.
   ▼
Mismo broadcast WS {type:'agent-state', agentTuiState, at} → cliente SIN CAMBIOS
```

**Clave de diseño:** el hook publica a través del mismo `AgentStateMachine` y el mismo frame
WS `agent-state` que ya consume el cliente (`useTerminalV2Session.js:667-673` →
`panelSemanticStateStore` → `derivePanelStatus`). Cero cambios de UI.

---

## 3. Spec detallada por componente

### 3.1 Variables de entorno inyectadas al spawn del PTY

Inyectar en **ambos** puntos de spawn:

- `sidecar-backend/sessionSpawn.js` → `buildSidecarSpawnConfig()` (el objeto `spawnEnv`, ~línea 77).
- `src/lib/terminal/ttyServer.js` → los 3 `pty.spawn(...)` (líneas ~942, ~1287, ~1882) — extraer
  a un helper compartido para no repetir.

Crear `src/lib/terminal/agentHooks/hookEnv.js` (ESM, dual CJS-compatible como el resto de
`src/lib/terminal/`) que devuelva:

```js
{
  DEVHUB_HOOK_ENV: '1',
  DEVHUB_TERMINAL_ID: session.id,
  DEVHUB_HOOK_URL: hookUrl,      // sidecar: http://127.0.0.1:<sidecarPort>/agent-hook
                                 // ttyServer: http://127.0.0.1:<nextPort>/api/terminal/agent-hook
  DEVHUB_HOOK_TOKEN: token,      // aleatorio por sesión, guardado en session.hookToken
}
```

- El **token por sesión** es obligatorio: el endpoint rechaza reports sin token válido (un
  proceso local cualquiera no debe poder falsear estados). `crypto.randomBytes(16).hex`.
- El hook script debe no-op si `DEVHUB_HOOK_ENV !== '1'` (igual que herdr con `HERDR_ENV`).

### 3.2 Endpoint `/agent-hook`

**Payload (JSON, cap 4KB):**

```json
{
  "terminalId": "…",
  "token": "…",
  "source": "devhub:kimi",
  "agent": "kimi",
  "state": "working | blocked | idle | session",
  "event": "PreToolUse",
  "agentSessionId": "opcional",
  "seq": 123456789,
  "ts": 1234567890123
}
```

**Comportamiento:**

1. Rechazar (400) si falta `terminalId`/`token`/`state`, si `state` no está en la allowlist,
   o si el payload excede 4KB.
2. Buscar sesión por `terminalId`; rechazar (404) si no existe o el token no coincide (403).
3. Mapear `working → running` (vocabulario interno DevHub). `session` solo registra
   `agentSessionId` (útil para reconciliar con agenthub; no cambia estado).
4. Fijar `session.agentType = agent` si no estaba (el hook confirma identidad).
5. `session.hookState = { state, at: Date.now(), source }`.
6. Publicar vía `session.agentStateMachine.publish({state, visibleWorking: state==='running',
   visibleBlocker: state==='blocked', visibleIdle: state==='idle'}, now)` — **bypass del
   pending-idle hold para eventos hook de tipo Stop/Interrupt** (el hook es verdad; no hay
   flicker que filtrar). Implementación: pasar un flag o llamar a un método `publishHook(...)`
   nuevo en `AgentStateMachine` que no aplique `shouldHoldWorkingToIdle`.
7. Broadcast WS `agent-state` igual que el tick existente (reusar bloques de
   `ttyServer.js:2349-2379` y `sidecar-backend/server.js:730-757`).
8. Responder 204. Todo fallo del hook es silencioso para el agente (el TUI no debe romperse
   nunca por DevHub).

**Dos implementaciones del endpoint** (misma lógica, helper compartido):

- `sidecar-backend/server.js`: ruta POST `/agent-hook` (mira cómo están hechas las rutas GET
  existentes, p.ej. `/sessions/:id` ~línea 476). El sidecar ya escucha en `127.0.0.1`.
- `src/app/api/terminal/agent-hook/route.js` (nuevo): para sesiones servidas por el ttyServer
  in-process. Sigue el patrón de `src/app/api/terminal/sessions/[terminalId]/route.js` para
  acceder al mapa de sesiones del ttyServer. Lógica compartida en
  `src/lib/terminal/agentHooks/handleHookReport.js` (dual ESM/CJS; el sidecar la consume vía
  bundle — ver 3.6).

### 3.3 Autoridad hook vs pantalla

En `src/lib/terminal/sessionAgentDetector.js`:

```js
export const HOOK_AUTHORITY_TTL_MS = 120000; // 2 min

export function hasFreshHookAuthority(session, now = Date.now()) {
  return Boolean(
    session.hookState &&
    typeof session.hookState.at === 'number' &&
    now - session.hookState.at < HOOK_AUTHORITY_TTL_MS
  );
}
```

- En `ingestAgentDetectionFromFilteredOutput` y en `tickAgentDetection`: si
  `hasFreshHookAuthority(session)` → **no publicar** resultados de screen detection (early
  return con el estado actual). La pantalla solo alimenta cuando no hay hook fresco.
- Limpiar `session.hookState` cuando el PTY muere / respawn (mismo lugar donde se limpia
  `agentType`, `ttyServer.js:~1308` y equivalente sidecar).
- `HOOK_AUTHORITY_TTL_MS` configurable por env `DEVHUB_HOOK_AUTHORITY_TTL_MS`.

**Por qué TTL de 2 min y no autoridad pegajosa:** si el hook deja de reportar (agente
actualizado, config borrada, evento no cubierto), la detección por pantalla retoma el control
sola. herdr usa autoridad pegajosa porque controla todos los eventos; nosotros empezamos con
TTL y podemos endurecerlo después.

### 3.4 Hook scripts (assets propios, no depender de herdr en runtime)

Crear `scripts/agent-hooks/`:

**`devhub-agent-state.sh`** (para kimi y claude; Git Bash/Linux/macOS):

```sh
#!/bin/sh
# installed by DevHub — managed block, do not edit (version marker DEVHUB_HOOKS_VERSION=1)
# usage: devhub-agent-state.sh <state> [event]
set -eu
[ "${DEVHUB_HOOK_ENV:-}" = "1" ] || exit 0
[ -n "${DEVHUB_HOOK_URL:-}" ] && [ -n "${DEVHUB_TERMINAL_ID:-}" ] && [ -n "${DEVHUB_HOOK_TOKEN:-}" ] || exit 0
state="${1:-}"; event="${2:-}"
case "$state" in working|blocked|idle|session) ;; *) exit 0 ;; esac
# leer stdin JSON del agente (session_id si viene) sin romper nunca
input="$(cat 2>/dev/null || true)"
agent_session_id="$(printf '%s' "$input" | sed -n 's/.*"session_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
payload="$(printf '{"terminalId":"%s","token":"%s","source":"devhub:%s","agent":"%s","state":"%s","event":"%s","agentSessionId":"%s","seq":%s,"ts":%s}' \
  "$DEVHUB_TERMINAL_ID" "$DEVHUB_HOOK_TOKEN" "${DEVHUB_AGENT_NAME:-unknown}" "${DEVHUB_AGENT_NAME:-unknown}" "$state" "$event" "$agent_session_id" "$(date +%s%N 2>/dev/null || echo 0)" "$(date +%s000)")"
curl -s -m 1 -o /dev/null -X POST -H 'Content-Type: application/json' --data "$payload" "$DEVHUB_HOOK_URL" 2>/dev/null || true
exit 0
```

**`devhub-agent-state.ps1`** — equivalente para PowerShell (Windows nativo), usando
`Invoke-RestMethod -TimeoutSec 1` dentro de try/catch, mismos guards y payload. herdr tiene
referencia `.ps1` en `.research/herdr/src/integration/assets/kimi/herdr-agent-state.ps1`.

**`devhub-opencode-plugin.js`** — plugin JS para opencode (su sistema de hooks es un plugin
Node, no comandos shell). Referencia directa:
`.research/herdr/src/integration/assets/opencode/herdr-agent-state.js` (versión 8). Adaptar:
en vez de socket Unix, `fetch(process.env.DEVHUB_HOOK_URL, {method:'POST', …})` con
`AbortSignal.timeout(1000)`; **conservar la lógica de childSessions** (los eventos de
subagentes con parentID no deben pisar el estado del panel) y el mapeo
`session.status {idle|busy|retry}` → idle/working. Eventos a cubrir (del plugin herdr):
session idle/busy, permission asked/resolved, session error.

### 3.5 Installers (managed block, idempotente, con backup)

Crear `src/lib/terminal/agentHooks/installer.js` + CLI `scripts/install-agent-hooks.mjs`
(uso: `node scripts/install-agent-hooks.mjs --agent kimi|claude|opencode [--uninstall]`).

Reglas comunes:

- Backup del config original a `<config>.devhub-bak` antes de tocarlo (una sola vez).
- Bloque managed delimitado por marcadores (`# >>> devhub hooks (v1) >>>` / `# <<< devhub hooks <<<`
  en TOML; clave `"devhub"` en JSON) — instalar = reemplazar solo ese bloque; desinstalar =
  quitarlo y dejar el resto intacto. Idempotente.
- Copiar el script a un path estable sin espacios problemáticos (p.ej. junto al config del
  agente: `~/.kimi-code/hooks/devhub-agent-state.sh`).
- Imprimir diff/resumen de lo que cambió. Nunca fallar de forma destructiva.

**kimi** — config `~/.kimi-code/config.toml`. Formato verificado (herdr
`config_edit.rs:760-767`):

```toml
[[hooks]]
event = "UserPromptSubmit"
command = "/c/Users/PC/.kimi-code/hooks/devhub-agent-state.sh working UserPromptSubmit"
timeout = 10
```

Eventos→estado (de `KIMI_HOOK_EVENTS`, `src/integration/mod.rs:65-75` de herdr):

| event | state |
|---|---|
| SessionStart | session |
| UserPromptSubmit | working |
| PreToolUse | working |
| SubagentStart | working |
| PreCompact | working |
| PermissionRequest | blocked |
| PermissionResult | working |
| Stop | idle |
| Interrupt | idle |

Min version kimi 0.14.0 (chequear `kimi --version` en el installer; warn si menor).

**claude** — config `~/.claude/settings.json`, objeto `hooks`. Eventos→estado (de
`config_edit.rs:140-149` de herdr): SessionStart→session, UserPromptSubmit→working,
PreToolUse→working, PostToolUse→working, PostToolUseFailure→working, SubagentStop→working,
PermissionRequest→blocked, Stop→idle, SessionEnd→(ignorar o idle). Formato estándar Claude
Code hooks (`{"hooks":{"PreToolUse":[{"matcher":"*","hooks":[{"type":"command","command":"…"}]}]}}`)
— **verificar el shape exacto contra `ensure_simple_command_hook`/`ensure_hooks_object` en
`.research/herdr/src/integration/config_edit.rs` antes de escribir el merger**. Merge no
destructivo: añadir/quitar solo comandos que referencien nuestro script.

**opencode** — plugin en el directorio de plugins de opencode (ver `opencode_dir` y
`install_opencode` en `.research/herdr/src/integration/targets.rs` y `registry.rs`; en Linux
es `~/.config/opencode/plugins/`, en Windows el equivalente). Instalar =
copiar `devhub-opencode-plugin.js` ahí; desinstalar = borrarlo.

### 3.6 Bundle del sidecar

El sidecar consume módulos compartidos vía bundle CJS
(`scripts/build-sidecar-agent-detection.mjs` → `sidecar-backend/bundled/agentDetection.cjs`,
entry `src/lib/terminal/sidecarAgentDetectionEntry.js`). Añadir a ese entry las exportaciones
nuevas (`handleHookReport`, `hasFreshHookAuthority`, constantes) y **regenerar el bundle** como
parte de cada cambio. Si el endpoint del sidecar prefiere importar directo (CJS nativo),
documentar la elección — pero NO duplicar lógica.

---

## 4. Fases de implementación (en orden)

- **Fase 0 — Canal genérico (agent-agnostic):** `hookEnv.js`, token por sesión, ambos
  endpoints, `handleHookReport`, `hasFreshHookAuthority` + gating en ingest/tick, limpieza en
  exit/respawn, bundle regenerado. Tests unitarios + test manual con `curl` simulando un hook
  (payload de working/idle/blocked contra una sesión real y verificar el badge).
- **Fase 1 — kimi:** script sh + ps1, installer con managed block TOML, CLI, tests del merger
  (golden files: config vacío, config con contenido previo, reinstalación idempotente,
  uninstall). Smoke real: panel kimi → running al enviar prompt, blocked en permiso, idle en
  Stop, **sin parpadeos durante streaming largo** (este es el criterio estrella).
- **Fase 2 — claude:** merger settings.json + mismos scripts sh/ps1. Tests golden del merger.
- **Fase 3 — opencode:** plugin JS adaptado (con childSessions), installer por copia.
- **Fase 4 — UX y docs:** toggle en Ajustes (`src/views/Ajustes.jsx`) "Detección precisa de
  agentes (hooks)" por agente con estado instalado/no instalado (lee si el managed block
  existe); nota en `openspec/changes/` o addendum; actualizar `AGENTS.md` si cambia el flujo.

Cada fase es mergeable por separado. No avances a la siguiente sin la anterior verde.

---

## 5. Tests y verificación

1. **Unitarios (jest):**
   - `hookEnv`: vars correctas, token único por sesión.
   - `handleHookReport`: validaciones (400/403/404), mapeo working→running, `session` no cambia
     estado, bypass del hold para idle por hook.
   - `hasFreshHookAuthority` + gating: con hook fresco la screen detection NO publica; con hook
     expirado (>TTL) sí.
   - Mergers kimi/claude: golden files (instalar sobre config real de ejemplo, reinstalar,
     desinstalar → config original).
2. **Integración:** endpoint sidecar con `node-fetch`/curl contra sidecar levantado en test.
3. **Manual (obligatorio, reportar evidencia):**
   - kimi: prompt largo con streaming → badge Running **estable sin parpadeos** (≥2 min);
     permiso → Blocked inmediato; Stop → Inactivo inmediato (sin esperar hold de 700ms).
   - Repetir con claude y opencode si están instalados.
   - Hook desinstalado → vuelve el comportamiento de pantalla (fallback intacto).
4. **Regresión:** `npx jest src/lib/terminal src/components/terminal src/hooks` verde;
   `node scripts/compare-herdr-manifests.mjs` EXIT 0.

---

## 6. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Formato de hooks del agente cambia entre versiones | min-version check en installer (kimi ≥0.14.0); managed block versionado (DEVHUB_HOOKS_VERSION) |
| Hook reporta estado erróneo/atascado | TTL de autoridad 2 min → fallback a pantalla solo |
| Proceso local malicioso falsea estados | token por sesión + bind 127.0.0.1 (ya existente) |
| Romper el config del usuario | backup `.devhub-bak`, managed block, merger no destructivo con tests golden |
| Eventos de subagentes pisan estado del panel | conservar lógica `childSessions` del plugin herdr de opencode; para kimi, `SubagentStart` reporta working (correcto: el panel sí está trabajando) |
| Hook script lento bloquea el agente | `timeout = 10` en config kimi; curl `-m 1`; el script siempre `exit 0` |
| Windows sin Git Bash en el shell del PTY | variante `.ps1` + installer elige según shell resuelto (`resolveWindowsShell` en sessionSpawn.js) |

---

## 7. Referencias

- herdr clone: `.research/herdr/`
  - eventos kimi: `src/integration/mod.rs:65-75`
  - autoridad: `src/detect/mod.rs:244-255`
  - hook kimi sh/ps1: `src/integration/assets/kimi/`
  - plugin opencode: `src/integration/assets/opencode/herdr-agent-state.js`
  - mergers de config: `src/integration/config_edit.rs` (`build_kimi_config_with_hooks:741`,
    `kimi_hook_table:760`, claude `ensure_simple_command_hook`)
  - installers: `src/integration/targets.rs` (`install_kimi:230`)
- DevHub pipeline actual: `src/lib/terminal/sessionAgentDetector.js`,
  `agentStateDetection/stateMachine.js`, `ttyServer.js:2349-2379` (tick), `sidecar-backend/server.js:730-757`
- SDD previo (screen detection): `openspec/changes/tui-status-herdr-parity/`
- Fix staleness/tick: `docs/delegation/2026-07-20-agent-status-detection-fix.md`

## 8. Entregable del agente implementador

Reporte con: archivos creados/modificados por fase, salida de todos los comandos de
verificación, evidencia del smoke manual por agente (o declaración explícita de no poder
hacerlo), desviaciones de este documento con justificación, y follow-ups. **No hacer git
commit/push** — dejar todo en el working tree para revisión.

---

## Addendum: estado post-implementación (2026-07-20, revisión final)

Implementación completada por agente delegado + ronda de correcciones
(`docs/delegation/2026-07-20-agent-hooks-authority-fixes.md`, P0-P3 todos aplicados) +
pasada final de revisión. Verificado:

- Token hook consistente en los 3 spawn paths de ttyServer y en sidecar (tests dedicados).
- Route Next `/api/terminal/agent-hook` funcional (export de `getOrInitSessions` corregido).
- Route installer con guarda localhost; assets resueltos con `findPathUpwards(process.cwd())`.
- Comandos instalados con wrapper `bash '<path>'` / `powershell -File "<path>"` + chmod +x.
- `session` no otorga autoridad; broadcast solo en cambios; uninstallers byte-fieles (golden tests).
- Cap 4KB en ambos endpoints; tick dead-PTY antes que autoridad; allowlist kimi/claude/opencode.
- Suites hooks: 68/68 + installer 19/19 + e2e ambos transports verdes. `compare-herdr-manifests` EXIT 0.

Ajustes hechos en la revisión final (no por el agente):

1. `sessionAgentDetector.js`: el buffer de detección se sigue acumulando durante la autoridad
   hook (antes se descartaba), así al expirar el TTL la pantalla se re-evalúa fresca.
2. `ttyServer.js` / `sidecar-backend/server.js`: `.unref()` en el intervalo del tick para no
   mantener vivo el proceso/worker de jest.

Pendiente (fuera de código): smoke manual con la app real (instalar hook de kimi con
`node scripts/install-agent-hooks.mjs --agent kimi`, lanzar `kimi` en un panel y verificar
Running estable sin parpadeos, Blocked en permiso, Inactivo inmediato en Stop).

Fallos de tests preexistentes NO relacionados (existen en HEAD, archivos no tocados por este
trabajo): `sessionStore.test.js` (paths Windows), `agentTuiMetadata.test.js` (idle fallback),
`ttyServer.test.js` ×3 (spawn zsh/swarm/reconnect), `startupRestoreRunner.test.js` (concurrencia).
