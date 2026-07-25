# Handoff: terminal-load-performance — instrucciones de desarrollo completas

**Fecha:** 2026-07-22
**Repo:** `D:/devhub` (Windows; shell = Git Bash; package manager = pnpm; tests = Jest)
**OpenSpec (ya creado, léelo primero):** `openspec/changes/terminal-load-performance/proposal.md`, `design.md`, `tasks.md`
**Rol del lector:** agente ejecutor de TODO el desarrollo (PR1→PR7). Otro agente (Kimi) revisará y mejorará después. No improvises alcance: si algo del brief no cuadra con el código real, documenta la desviación y decide lo mínimo razonable.

---

## 0. Reglas de oro

1. **NO hagas `git commit`/`git push` salvo que el humano lo pida explícitamente.** Trabaja en rama por PR (`tlp/pr1-instrumentation`, `tlp/pr2-dev-cold-start`, …), apiladas en orden.
2. **TDD donde haya tests del área.** RED → GREEN → REFACTOR. Cada PR cierra con sus suites verdes.
3. **Cambios mínimos y quirúrgicos.** Nada de refactors oportunistas, formateo masivo ni renombres fuera del scope del PR.
4. **Match de estilo del archivo** (comentarios en inglés, densidad y naming existentes).
5. **Kill-switches funcionando** en cada PR que introduzca comportamiento nuevo.
6. Tras cada PR: ejecuta las suites indicadas y reporta resultado exacto (comando + pass/fail). Si una suite ya estaba roja antes de tus cambios, dilo explícitamente y no la "arregles" fuera de scope.
7. **No inventes IDs de DevHub.** El registro de tareas en DevHub MCP lo hace el coordinador; tú no.
8. Marca en `openspec/changes/terminal-load-performance/tasks.md` los checkboxes completados a medida que avances, y crea/actualiza `apply-progress.md` del change con números reales.

## 1. Contexto y evidencia (ya investigado — no re-explores de cero)

Baseline medido (`data/logs/startup-perf/latest.json`, 2026-07-22, Electron/Windows, dev `:3100`):

- `xterm-core-import` = **16.1 s** (compile en frío de Turbopack de `@xterm/*` + chunks de la ruta terminal) — cuello dominante en dev.
- `terminales→first-panel-interactive` = 16.3 s; `interactive→ws-connected` = 63 ms; `ws→first-pty-byte` = 210 ms. **PTY/WS no son el problema en caliente.**
- El warm tier actual arranca a los 13.1 s (`project-ready`); el usuario navega a `/terminales` a los ~3.7 s → el warm llega tarde.

Síntomas de runtime (reportados por el operador):

1. Arranque de terminales lento en la primera carga.
2. Overlay "Conectando…" al cambiar de workspace/ventana y al volver de la pizarra — causado por **remontes reales** de `TerminalTTY` que resetean `hasConnectedOnce`.
3. **Scroll roto** en terminales con TUIs abiertas tras esas transiciones — hipótesis: resizes/SIGWINCH espurios + Ctrl+L forzado del servidor.

Hechos de código verificados (úsanos como punto de partida; verifica líneas antes de editar, pueden haber driftado):

**Backend / arranque**

- Electron: `ensureSidecar()` corre ANTES de `createMainWindow()`; polling serial 20×250 ms (`desktop/electron/main.js:157-184`, `desktop/electron/sidecar.js:98-103`).
- Probes de puerto sidecar secuenciales: port-file → 4000 → 4001 (`src/lib/devhub/sidecarRuntime.js:57-85`, `src/app/api/terminal/session/route.js:132-177`).
- `restoreSessions()` síncrono dentro del primer `ensureTTYServer()`: N × (`pty.spawn` + `saveSessions()` con `writeFileSync`) en serie (`src/lib/terminal/ttyServer.js:2444,1627-1823`, `src/lib/terminal/sessionStore.js:151-190`).
- Sidecar Windows: `resolveWindowsShell()` con `spawnSync('pwsh.exe', timeout 3000)` sin caché por spawn (`sidecar-backend/sessionSpawn.js:7-20`).
- Restore frontend: concurrencia 2 + 350 ms fijos (`src/lib/terminal/startupRestoreRunner.js:12-13,191-195`).

**Frontend / mount**

- Mount storm: `workspaces.map` monta TODOS los workspaces/paneles a la vez; stagger = 0 (`src/components/workspace/WorkspaceRenderAssembly.jsx:900-1041`, `src/components/terminal/TerminalTTY.helpers.js:70`).
- Connect espera fit: `waitForVisibleDimensions` hasta ~640 ms (`src/components/terminal/hooks/useTerminalViewportSync.js:105-123`) + defer forzoso hasta 1800 ms (`TerminalTTY.helpers.js:66` `TERMINAL_CONNECT_DEFER_MAX_MS`, `TerminalTTY.jsx:706-724`).
- Pizarra: entrar/salir con shared view = unmount/remount real (directo ↔ singleton portal) (`renderWorkspacePanel.jsx:642-693`, `SharedTerminalSurface.jsx:163-329`, `SurfacePortal.jsx`).
- V2: `shouldMountTerminal` desmonta paneles v2 al cambiar de tab (`renderWorkspacePanel.jsx:424-425`); `hasConnectedOnce` resetea → overlay (`TerminalTTY.helpers.js:81-88`, `TerminalTTY.jsx:405`).
- V1 YA es keep-alive (opacity:0, WS abierto, WebGL retenido) — es el modelo a extender.
- Cada transición de `connectionState` re-renderiza el manager completo (`TerminalWorkspacesManager.jsx:350-363,815-832`).
- Churn: bursts multi-fase `[80,180,340]` / `[120,180,340,500]` (`useTerminalLayoutChurnRecovery.js:795-802`), bounded fit/GPU polling hasta 48 frames (`useTerminalWorkspaceShowRecovery.js:498-797`), `sendResize` doble fit en rAF (`useTerminalViewportSync.js:589-595`), Ctrl+L forzado 30 ms tras reattach en servidor (`ttyServer.js:2078-2084`).

**Estado de trabajos relacionados**

- `terminal-engine-v2`: **TERMINADO** (docs pendientes). Sus contratos (graveyard, snapshot/replay, subscribe) son infra landed: reutilízalos, no los recoordines.
- `startup-latency-reoptimization` (change previo): Fases 1–3 landed → `src/lib/terminal/startupPerfMarks.js`, `terminalWarmPolicy.js`, `terminalStatePrefetch.js` ya existen con tests. Extiende, no reemplaces.

## 2. SLOs (criterio de éxito del programa)

| Métrica                                      | Baseline                          | Objetivo                               |
| -------------------------------------------- | --------------------------------- | -------------------------------------- |
| Dev: `/terminales` → first-panel-interactive | ~16.3 s                           | ≤ 4 s                                  |
| Dev: xterm import tras boot                  | 16.1 s                            | ≤ 2 s                                  |
| Salir de pizarra → terminal usable           | remount + overlay                 | ≤ 150 ms, sin overlay, sin reconnect   |
| Cambiar tab workspace (v2)                   | remount + overlay                 | ≤ 100 ms, sin overlay, sin reconnect   |
| Scroll roto en TUIs en transiciones          | intermitente                      | 0 en matriz QA ×20                     |
| Resize al PTY sin delta real de cols/rows    | ocurre                            | 0                                      |
| Packaged: launch → ventana visible           | sidecar serial (~6.5 s peor caso) | ventana inmediata, sidecar en paralelo |
| WebKitGTK packaged crash rate                | ~0                                | se mantiene ~0                         |

---

## 3. PR1 — Instrumentación (cero cambio de comportamiento)

**Rama:** `tlp/pr1-instrumentation`

### 3.1 Extender `src/lib/terminal/startupPerfMarks.js`

Patrón actual: objetos congelados `MARKS`/`MEASURES` (prefijo `dh:`), arrays `localMarks`/`localMeasures`, `mark(name)`/`measure(name,start,end)` (ya gated por `isStartupPerfEnabled()`), flags "once", `buildStartupPerfReport(reason)` arma `summary`+marks+measures, `persistStartupPerfSnapshot` POSTea a `/api/terminal/perf`, `resetStartupPerfForTests()`, `getPerfSnapshot()`.

Añade:

a) **Marcas repetibles** (NO "once"; `measure()` ya toma la ocurrencia más reciente):

- `dh:workspace-switch-start` / `dh:workspace-switch-end` → medida `dh:workspace-switch`
- `dh:pizarra-exit-start` / `dh:pizarra-exit-end` → medida `dh:pizarra-exit`
- API: `markWorkspaceSwitchStart/End()`, `markPizarraExitStart/End()`.

b) **Registro de contadores**:

- `incrementPerfCounter(name, detail?)` — acumula `count` por nombre + muestra FIFO de los últimos 10 `detail`. No-op si perf off.
- Nombres: `terminal-remount`, `terminal-resize-sent`, `terminal-scroll-jump`, y `terminal-resize-sent-redundant` (incrementado además cuando `detail.redundant === true`).
- `buildStartupPerfReport`: añade top-level `counters: { [name]: { count, samples } }` y en `summary`: `workspaceSwitchMs`, `pizarraExitMs`, `terminalRemounts`, `terminalResizeSent`, `terminalResizeSentRedundant`, `terminalScrollJumps`.
- `resetStartupPerfForTests()` limpia contadores. Exponer getter en `window.__DEVHUB_PERF__` (`exposePerfSnapshotOnWindow`).

### 3.2 Wiring de marcas de transición

- **Pizarra exit**: `src/components/terminal/SharedTerminalSurface.jsx` (~L324-329) despacha `devhub:terminal-layout-settled` con reason `pizarra-mode-exit`. Start al iniciar el re-target del portal hacia `workspace-dock`; end cuando el layout quedó settled. Solo exit, no enter.
- **Workspace switch**: localiza el punto de selección de tab (`TerminalWorkspacesManager.jsx` — `applyRightDockTabSelect` / `useWorkspaceWindowsController` — o el emisor central de `devhub:terminal-layout-settled` con reason de workspace switch; grep `terminal-layout-settled`). Start al iniciar el cambio, end al quedar settled. Si hay un emisor central, instruméntalo ahí y documenta la elección con un comentario.

### 3.3 Wiring de contadores

- `terminal-remount`: en el efecto de boot de `useTerminalEngine.js` (~L494-1211), incrementa con `{ panelId, reused }` — `reused: true` si se reutilizó surface del graveyard v2, `false` si se creó un `Terminal` nuevo.
- `terminal-resize-sent`: en `sendResize` de `useTerminalViewportSync.js` (~L589-595), donde se envía el resize al PTY. `detail: { cols, rows, prevCols, prevRows, hidden, tuiActive, redundant }`; `redundant = cols===prevCols && rows===prevRows` (trackea últimas dims enviadas con un ref mínimo). `hidden`: reusa helpers de visibilidad existentes. `tuiActive`: existe detección de sesión TUI (debounce 160 ms en `useTerminalEngine.js:741-750`, `src/lib/terminal/sessionAgentDetector.js`); si no es accesible limpiamente, `tuiActive: null` + comentario TODO. **No fuerces acoplamiento.**
- `terminal-scroll-jump`: en el path de reveal de `useTerminalWorkspaceShowRecovery.js` (~L864-935), compara viewport Y del xterm antes/después del recovery; si cambió sin input de usuario, incrementa `{ panelId, from, to }`.
- **Backend durations**: en `ttyServer.js`, `ttyLog(event, data)` (~L166): (a) handler de conexión WS que spawnea sesión (`WS_CONN`, zona ~L1964/L2392-2437) → añade `durationMs` del spawn; (b) `restoreSessions()` (`RESTORE`, ~L1627-1823) → duración total y por sesión. Solo campos nuevos en logs existentes.

### 3.4 Tests + baseline

- Extiende `src/lib/terminal/__tests__/startupPerfMarks.test.js`: marcas repetibles (dos switches → medida usa las recientes), contadores (incremento, cap 10, reset, no-op con perf off), report incluye counters y nuevos campos.
- Ejecuta: `npx jest src/lib/terminal/__tests__/startupPerfMarks.test.js` (desde `D:/devhub`).
- **Baseline manual** (pídesela al humano si no puedes lanzar la app): 5 cold starts dev + 2 packaged + matriz de transiciones con TUI (contar resizes redundantes y remounts por transición) → `data/logs/startup-perf/tlp-baseline.json`.

**Salida:** baseline registrada; cero cambio de comportamiento; Jest verde.

---

## 4. PR2 — Dev cold start (matar los 16 s)

**Rama:** `tlp/pr2-dev-cold-start` (sobre PR1)

1. **Prefetch en app-shell start** (`src/App.js:150-196`): dispara `import('@xterm/xterm')` + `@xterm/addon-fit` + `@xterm/addon-search` (NO webgl) al montar `App`, sin esperar `project-ready` ni idle. Respeta kill-switch `devhub_terminal_warm=off` (`src/lib/terminal/terminalWarmPolicy.js:22`). Mueve también el warm Tier1 del sidecar antes de `project-ready`. No llames `Terminal.open` off-route (contrato de tiers).
2. **Compile warm del dev server** (`desktop/electron/scripts/electron-up.cjs:390-410`): tras `waitFor('Next UI')` y antes de spawnear Electron, fire-and-forget de requests que fuercen a Turbopack a compilar `/api/terminal/session` y la página/chunk de terminales (timeout corto, sin bloquear).
3. **Caché Turbopack**: verifica persistencia de `.next/cache` entre arranques; si `clearStaleNextDevLock` (~L290-331) o flags la invalidan, corrígelo. Documenta en `apply-progress.md` si los 16 s son first-ever-run o recurrentes.
4. Tests: actualiza `terminalWarmPolicy.test.js` con el nuevo scheduling.
5. Medir: `xtermCoreImportMs` en cold start recurrente ≤ ~2 s; app-shell interactive sin regresión > 10 %.

**Salida:** import de xterm deja de dominar el arranque dev.

---

## 5. PR3 — Backend/prod cold start

**Rama:** `tlp/pr3-backend-cold-start` (sobre PR2)

1. **Electron paralelo** (`desktop/electron/main.js:157-184`): `ensureSidecar()` en paralelo con `createMainWindow()` — la ventana carga el SPA de inmediato; el frontend ya tolera sidecar-no-listo (warm/retry). Backoff más agresivo en `desktop/electron/sidecar.js:98-103`.
2. **Probes en paralelo** (`src/lib/devhub/sidecarRuntime.js:57-85` + `src/app/api/terminal/session/route.js:132-177`): race de port-file/4000/4001 con presupuesto único ~800 ms; fallback a ttyServer igual que hoy. Tests unitarios del race + fallback.
3. **Session store async** (`src/lib/terminal/sessionStore.js:151-190`): `saveSessions()` async, coalesced (flush ~250 ms + flush en shutdown), tmp+rename sigue atómico. Actualiza callers (`ttyServer.js:2027,1402,1474` y restore) para no asumir sync. Tests: coalescing, orden, atomicidad.
4. **Restore no bloqueante** (`ttyServer.js:1627-1823,2444`): spawns en paralelo (cap 4), un solo save al final, y NO bloquear la primera respuesta de `/api/terminal/session` (responder endpoint primero, restaurar en background).
5. **Memo de shell Windows** (`sidecar-backend/sessionSpawn.js:7-20`): cachea `resolveWindowsShell()` a nivel módulo.
6. **Cola de restore frontend** (`src/lib/terminal/startupRestoreRunner.js:12-13,191-195`): prioridad al workspace activo; diferir el resto a idle, en vez de concurrencia 2 + 350 ms fijos. Mantén el mutex y `shouldRunStartupRestoreThisPageLoad`.
7. Tests de todo lo anterior + smoke packaged.

**Salida:** primera respuesta del endpoint sin bloqueo por restore; ventana packaged inmediata.

---

## 6. PR4 — Mount storm

**Rama:** `tlp/pr4-mount-storm` (sobre PR3)

1. **Activate-then-keep-alive** (`WorkspaceRenderAssembly.jsx:900-1041` + `renderWorkspacePanel.jsx`): en el primer paint, monta xterm SOLO del workspace activo (y ventana visible). Workspaces inactivos: montan sus terminales en la primera activación y desde ahí quedan keep-alive (mismo modelo `opacity:0` de V1, `resolveWorkspaceShellVisibilityStyle`, `workspaceAnimProps.js:73-97`). Nunca unmount tras el primer mount.
2. **Sin defer de connect para paneles visibles**: elimina/bypassea el path `TERMINAL_CONNECT_DEFER_MAX_MS` (1800 ms) para paneles visibles (`TerminalTTY.helpers.js:66,839-849`, `TerminalTTY.jsx:706-724`): conecta en cuanto haya dimensiones no-degeneradas; el fit fino llega después vía resize. Paneles ocultos pueden conservar defer.
3. **`waitForVisibleDimensions` con early-exit** (`useTerminalViewportSync.js:105-123`): sale en el primer frame con dimensiones válidas en vez de agotar 40 intentos cuando ya son válidas.
4. Tests: paneles de workspace inactivo no abren WS hasta activarse; tras activarse quedan vivos; fit/resize correctos tras connect temprano. Suites existentes de workspace windows verdes.

**Salida:** primer paint monta 1 workspace de terminales en vez de N.

---

## 7. PR5 — Keep-alive total (pizarra + v2 + overlay)

**Rama:** `tlp/pr5-total-keepalive` (sobre PR4). **El más grande y riesgoso; si crece >400 LOC, parte en 5a (v2 + overlay) y 5b (pizarra).**

1. **Pizarra sin remount**: unifica el render para que `TerminalTTY` viva siempre bajo el mismo padre React (shared surfaces provider) y entrar/salir de pizarra solo re-targetee el portal (`renderWorkspacePanel.jsx:642-693`, `SharedTerminalSurface.jsx:163-329`, `SurfacePortal.jsx`). Fallback aceptable si lo anterior es demasiado invasivo: mantener el render directo montado con `visibility:hidden` en modo pizarra y proyectar solo visualmente. Criterio de aceptación: salir de pizarra reutiliza el mismo xterm y el mismo WS, sin replay completo; contador `terminal-remount` (PR1) se mantiene en 0 en pizarra enter/exit ×20.
2. **V2 keep-alive**: `shouldMountTerminal` (`renderWorkspacePanel.jsx:424-425`) — paneles v2 quedan montados (ocultos) al cambiar de tab, igual que V1. El graveyard v2 queda como válvula de presión de memoria, no como camino normal.
3. **Overlay**: persiste `hasConnectedOnce` por panelId (graveyard/store del manager) para que sobreviva remontes accidentales; overlay full-screen solo en primer boot real del panel (`TerminalTTY.helpers.js:81-88`, `TerminalTTY.jsx:405`).
4. **WebGL**: no re-crear contexto GL en hide/show en ningún camino (V1 ya lo retiene — iguala los demás).
5. **Kill-switch + gate**: `localStorage.devhub_terminal_keepalive=off` restaura el comportamiento actual (unmount-on-hide); en Linux WebKitGTK, keep-alive total OFF por defecto (mismo criterio que Tier3 en `terminalWarmPolicy.js:64-67`).
6. **Re-render del manager**: aísla `panelConnectionStateById` para que una transición de un panel no re-renderice todo el `workspaces.map` (memo por fila de workspace o suscripción por panel) (`TerminalWorkspacesManager.jsx:350-363,815-832`).
7. Tests: `TerminalTTY`, `TerminalTTY.v2`, `TerminalTTY.xterm-webgl`, `PizarraPane.windowScopedAutofit` verdes + nuevos tests "no remount en pizarra" y "no overlay tras switch". QA manual: pizarra ↔ workspace ×20, tabs ×20, RSS antes/después (registrar en `apply-progress.md`).

**Salida:** transiciones ≤ 150 ms, sin overlay, sin reconnect; WebKitGTK sin regresión.

---

## 8. PR6 — Integridad de scroll en TUIs

**Rama:** `tlp/pr6-tui-scroll-integrity` (sobre PR5)

1. **Confirma causa raíz** con los contadores de PR1: cuántos `terminal-resize-sent` con `redundant: true` ocurren por transición (workspace switch, pizarra enter/exit) con TUI activa. Documenta en `apply-progress.md`.
2. **Guard de dimensiones**: envía resize al PTY SOLO si cols/rows cambiaron de verdad; si el fit post-transición produce las mismas dims, no enviar nada (ni SIGWINCH nudge). Aplica en `sendResize` (`useTerminalViewportSync.js:589-595`) y en los paths de churn (`useTerminalLayoutChurnRecovery.js`, `useTerminalWorkspaceShowRecovery.js`). El guard NO debe tragar resizes legítimos (redimensionado de ventana real sigue fluyendo).
3. **No fitear oculto**: suprime fit/resize de observers mientras el panel está layout-hidden; al revelarse, UN solo fit coalesced y resize solo si hay delta real.
4. **Preservar viewport**: captura la posición de scroll/viewport antes de cualquier repaint de transición y restáurala después; si el usuario estaba en el fondo, quédate en el fondo; si estaba leyendo scrollback, no lo arrastres.
5. **Quita el Ctrl+L forzado tras reattach** (`ttyServer.js:2078-2084`) — sustitúyelo por repaint local del xterm (sin mandar redibujado a la app). Sospechoso directo de la pérdida de scroll.
6. **Colapsa bursts**: con keep-alive, reduce los delays `[80,180,340]` / `[120,180,340,500]` y el bounded polling de 48 frames a un único fit+repaint coalesced al hacerse visible (`useTerminalLayoutChurnRecovery.js:795-802`, `useTerminalWorkspaceShowRecovery.js:498-797`).
7. Tests: switch workspace/pizarra con sesión TUI mockeada → assert: 0 resizes sin delta, posición de scroll preservada, no se envía Ctrl+L. QA manual: matriz ×20 con OpenCode/Grok TUI abiertos y scrollback leído a mitad.

**Salida:** 0 ocurrencias de scroll roto en la matriz; `terminal-resize-sent-redundant` en 0.

---

## 9. PR7 — Re-baseline y cierre

**Rama:** `tlp/pr7-rebaseline-closeout` (sobre PR6)

1. Re-baseline completa (5 dev + 2 packaged + matriz de transiciones) contra `tlp-baseline.json`; actualiza la tabla de SLOs en `apply-progress.md` con números reales y desviaciones justificadas.
2. Actualiza `AGENTS.md` y docs afectadas (modelo keep-alive, flags `devhub_terminal_keepalive`, cambios en convenciones de mount).
3. En la documentación pendiente de `terminal-engine-v2`, deja anotado su estado real (terminado) y la nueva relación graveyard↔keep-alive — solo lo que este trabajo toca.
4. Marca todos los checkboxes de `tasks.md`; redacta verify-report en el change.

---

## 10. Formato de reporte por PR (para la revisión posterior)

Al terminar cada PR, escribe en `openspec/changes/terminal-load-performance/apply-progress.md` (sección por PR):

- Archivos modificados + resumen de cambios por archivo.
- Decisiones y desviaciones de este brief (con file:line).
- Comandos de test ejecutados y resultado exacto (pass/fail; si algo ya estaba rojo antes, indícalo).
- Números de marcas/telemetría relevantes (antes/después cuando aplique).
- Riesgos abiertos o deudas para el revisor.

## 11. Mapa de archivos sensibles (no tocar fuera del scope indicado)

| Área             | Archivos                                                                                                                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Terminal core    | `src/components/TerminalTTY.jsx`, `src/components/terminal/TerminalTTY.helpers.js`                                                                                                        |
| Engine/hooks     | `src/components/terminal/hooks/useTerminalEngine.js`, `useTerminalViewportSync.js`, `useTerminalLayoutChurnRecovery.js`, `useTerminalWorkspaceShowRecovery.js`, `useTerminalV2Session.js` |
| Manager/render   | `src/components/TerminalWorkspacesManager.jsx`, `src/components/terminal/renderWorkspacePanel.jsx`, `src/components/workspace/WorkspaceRenderAssembly.jsx`                                |
| Pizarra surfaces | `src/components/terminal/SharedTerminalSurface.jsx`, `SurfacePortal.jsx`                                                                                                                  |
| Backend TTY      | `src/lib/terminal/ttyServer.js`, `sessionStore.js`, `sidecar-backend/server.js`, `sidecar-backend/sessionSpawn.js`                                                                        |
| Boot             | `desktop/electron/main.js`, `desktop/electron/sidecar.js`, `desktop/electron/scripts/electron-up.cjs`, `src/lib/devhub/sidecarRuntime.js`, `src/app/api/terminal/session/route.js`        |
| Perf/warm        | `src/lib/terminal/startupPerfMarks.js`, `terminalWarmPolicy.js`, `terminalStatePrefetch.js`, `startupRestoreRunner.js`                                                                    |
