# Correcciones: agent-hooks-authority (revisión post-implementación)

Repo: `D:/devhub`. Implementaste el SDD `docs/delegation/2026-07-20-agent-hooks-authority-sdd.md`.
La revisión encontró 2 bugs críticos y varias desviaciones. **Corrige TODO lo listado abajo, en
orden de prioridad. NO hagas git commit/push.** Cambios mínimos; no refactorices lo que ya está bien.
Los tests actuales (71) deben seguir verdes y debes AÑADIR tests que cubran los bugs corregidos
(varios bugs pasaron porque los tests eran demasiado débiles — ver P2-4).

---

## P0 — CRÍTICO: la vía ttyServer (in-process) está muerta

### P0-1. Token hook que nunca coincide (todos los reports → 403)

`ttyServer.js:813` llama `buildSessionHookEnv({ session: { id: terminalId, hookToken: options.hookToken } })`,
pero **ninguno** de los 3 call sites pasa `options.hookToken` (`ttyServer.js:929-935` createSession,
`:1296-1308` respawn, `:1888-1894` WS connect). `hookEnv.js:22-24` genera un token aleatorio en un
objeto desechable → el PTY recibe un token que no está guardado en ningún sitio. Además:
- `createSession` luego asigna OTRO token a la sesión real (`ttyServer.js:989`).
- El literal de sesión del path WS (`:1923-1955`) no tiene `hookToken` en absoluto →
  `handleHookReport.js:33` 403 permanente.

**Fix:** genera el token UNA VEZ por sesión y úsalo en ambos lados:
- En `createSession` y en el literal WS: crea `session.hookToken = generateSessionHookToken()` ANTES
  del spawn, y pásalo a `buildSessionSpawnConfig({ …, hookToken: session.hookToken })`.
- En el respawn: pasa el `session.hookToken` existente (ya sobrevive; solo se limpia `hookState` en `:1336`).
- Añade `hookToken`/`hookState: null` al literal de sesión del path WS.
- Verifica con un test o script que el `DEVHUB_HOOK_TOKEN` del env === `session.hookToken` en los 3 paths.

### P0-2. La route Next importa una función no exportada (500 siempre)

`src/app/api/terminal/agent-hook/route.js:3` importa `getOrInitSessions` de
`@/lib/terminal/ttyServer`, pero `ttyServer.js:607` la declara como `function` sin exportar.
Webpack la resuelve `undefined` → TypeError → 500 en todo POST.

**Fix:** exporta `getOrInitSessions` (y confirma que `broadcastSessionPayload` también está
exportada — sí lo está, `:1204`) o usa un accessor ya exportado. Añade un test de la route
(mock del mapa de sesiones) que habría cazado esto.

---

## P1 — ALTO: installer route y comandos instalados

### P1-1. Route installer sin guardas + assets que no resuelven en build

`src/app/api/terminal/agent-hooks/installer/route.js`:
- **Sin guarda de loopback/auth.** Si Next escucha en 0.0.0.0, cualquier peer de red puede
  reescribir `~/.kimi-code/config.toml` / `~/.claude/settings.json` y plantar un plugin JS en
  opencode. Añade una guarda: rechazar si `request.headers.get('host')` no es
  localhost/127.0.0.1 (y documenta por qué es suficiente aquí).
- **Resolución de assets rota bajo Next build:** `installer.js:231`/`:252` usan
  `path.resolve(__dirname, '../../../../scripts/agent-hooks')` — en `.next/server` no existe.
  Usa el patrón del repo `findPathUpwards(process.cwd(), …)` (ver `ttyServer.js:240-246`).
  Y haz que `copyHookScripts` FALLE RUIDOSAMENTE si no encuentra los assets (hoy falla en
  silencio con `fs.existsSync` y deja configs apuntando a scripts inexistentes, `:238-239`).

### P1-2. Comando instalado sin wrapper de shell ni quoting

`installer.js:70`/`:115` escriben `"<path> <state> <event> <agent>"` crudo. Copia el enfoque de
herdr (`research: .research/herdr/src/integration/command.rs:7-27`):
- POSIX: `bash '<path>' <state> <event> <agent>` con single-quote escaping, y `chmod +x` tras
  `copyFileSync` (herdr `make_executable`).
- Windows: `powershell -NoProfile -ExecutionPolicy Bypass -File "<path>" <state> <event> <agent>`.
- Decide sh vs ps1 según plataforma/shell (mira `resolveWindowsShell` en `sessionSpawn.js`).
- Test: el comando instalado contiene el wrapper y quoting correcto por plataforma.

### P1-3. Check de versión kimi ≥ 0.14.0 ausente

`execSync` está importado en `installer.js:4` y nunca se usa. Implementa el check del spec 3.5:
`kimi --version` (best-effort, timeout corto, no bloquear la instalación — solo WARN claro si es
menor o indetectable). Test con execSync mockeado.

---

## P2 — MEDIO: semántica de estados y uninstallers

### P2-1. Reports `session` no deben refrescar autoridad

`handleHookReport.js:46-53` escribe `session.hookState.at = now` también para `state:'session'`.
Un `SessionStart` aislado congela la screen detection 2 min sin publicar estado. Fix: para
`session`, registra `agentSessionId` pero NO toques `hookState` (o excluye `rawState==='session'`
en `hasFreshHookAuthority` — elige una y documéntala). Test: SessionStart solo → sin autoridad.

### P2-2. Broadcast solo cuando hay cambio publicado

`handleHookReport.js:82-88` broadcastea aunque `publishHook` devuelva `null` → spam de frames
`agent-state` idénticos en cada PreToolUse. Broadcast solo si `published !== null`. Test.

### P2-3. Uninstallers deben ser byte-fieles

- `removeKimiManagedBlock` (`installer.js:58`) hace `.trim()` global y colapsa `\n{3,}` en
  contenido del usuario. Reproducido: `"\n[a]\n\n\n\nx=1\n"` → `"[a]\n\nx=1\n"`. Fix: eliminar
  SOLO el bloque managed (líneas entre marcadores inclusive) y dejar el resto byte a byte.
  **Corrige también el test** (`agentHookInstaller.test.js:51`): la aserción
  `uninstalled.trim() === existing.trim()` enmascara el bug — exige igualdad exacta salvo el
  bloque, e incluye el caso con leading blank lines y 3+ newlines consecutivos.
- `removeClaudeHooks` (`installer.js:149-156`): no elimines arrays de eventos ni el objeto
  `hooks` que estaban vacíos ANTES de instalar (hoy `{hooks:{PreToolUse:[]}}` → `{}`).
  Solo elimina lo que el install añadió. Test del caso.

### P2-4. Cap 4KB en el endpoint del sidecar

El sidecar usa `express.json()` default (100KB) sin check por ruta (`server.js:460`, `:596-605`).
Añade el rechazo >4KB del spec 3.2 (el Next route ya lo tiene — mismo criterio). Test/manual curl.

---

## P3 — MENOR (rápidos, hazlos todos)

1. `tickAgentDetection` (`sessionAgentDetector.js:113`): la autoridad hook se evalúa ANTES del
   forced-idle por PTY muerto (`:124`). Invierte: PTY muerto → forced idle siempre, aunque haya
   hookState fresco (y limpia hookState ahí mismo).
2. Allowlist de agentes con autoridad: `hasFreshHookAuthority` (o el handler) solo debe otorgar
   autoridad a `kimi|claude|opencode` (spec §2). Otro `source` válido con token → acepta el
   estado pero sin autoridad sobre pantalla.
3. Tras expirar el TTL de autoridad, `tickAgentDetection` puede republicar un `lastDetection`
   anterior a la autoridad (`:152-153`) → un flicker transitorio. Al expirar, invalida
   `session.lastDetection` (o re-evalúa desde el buffer actual en vez de republicar el cache).
4. `devhub-agent-state.sh:11-13`: `seq` y `ts` son idénticos (`date +%s000`). `seq` debe ser
   monótono fino: usa `date +%s%N` con fallback, como en el spec.
5. `hookEnv.js:26`: el fallback hardcodeado `http://127.0.0.1:4000/agent-hook` es una trampa —
   lanza error explícito si no hay `hookUrl` (los callers actuales siempre la pasan).
6. `installer.js`: no hagas `mkdir` silencioso del config dir del agente (`:271`, `:253`) —
   si no existe, aborta con mensaje "instala <agente> primero" como hace herdr.
7. CLI `install-agent-hooks.mjs`: imprime un resumen/diff de lo escrito (spec 3.5), no solo paths.

---

## Verificación final (obligatoria)

1. `npx jest src/lib/terminal src/app/api/terminal src/hooks src/components/terminal` — todo verde,
   incluidos los tests nuevos (mínimo: token-env-match en 3 paths, route sin 500, session-sin-autoridad,
   broadcast-solo-en-cambio, uninstall byte-fiel, wrapper de comando, version check).
2. `node scripts/build-sidecar-agent-detection.mjs` y confirma que el bundle contiene los cambios
   (grep `hasFreshHookAuthority` / `handleHookReport` en `sidecar-backend/bundled/agentDetection.cjs`).
3. Script o test de integración que pruebe el flujo feliz END-TO-END en ambos transports
   (sidecar y Next route): spawn env token == session token → POST working → 204 →
   `session.hookState` fijado → screen detection silenciada → POST idle → publica sin hold.
4. Reporta: qué corregiste por punto (P0-1…P3-7), tests añadidos, y cualquier desviación con
   justificación. NO commits.
