# 06 — Terminal TUI Status Detection & Workspace Switch Stability

## Resumen

Dos bugs interrelacionados que afectaban la experiencia de uso de DevHub con agentes TUI (OpenCode, Kimi, Grok, Claude, Codex):

1. **Estado de TUI siempre en "running"** — los badges de estado mostraban "running" constantemente, incluso cuando el agente estaba idle.
2. **Terminales en negro al cambiar/cerrar workspace** — al cambiar de workspace o cerrar uno, las terminales del workspace destino se quedaban en negro hasta hacer resize manual.

---

## 01 — Estado de TUI siempre en "running"

### Síntoma

Todos los paneles de terminal mostraban el badge "running" (verde pulsante) apenas se abría la TUI, sin importar si el agente estaba trabajando o esperando input.

### Causa raíz

El modelo anterior usaba **polling HTTP** (6s) contra una ventana de actividad de 3s + regex de texto sobre el output del PTY + lookup en la DB del agenthub (solo OpenCode). Cuatro causas compuestas:

| RC  | Descripción                                                                                      | Archivo                                                     |
| --- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| RC1 | Routing partida: el WS leía el sidecar, el poll leía el store local → 404                        | `src/app/api/terminal/sessions/[terminalId]/route.js`       |
| RC2 | Regex `thinking\|working\|busy\|running` no matchea footers reales de OpenCode/Grok/Claude/Codex | `src/lib/terminal/agentTuiMetadata.js:111`                  |
| RC3 | Aliasing temporal: poll 6s vs ventana 3s → gaps >3s leen IDLE                                    | `usePanelAgentStatus.js:10`, `panelStatusHelpers.js:38`     |
| RC4 | Endpoint agenthub solo conoce OpenCode → 404 para Kimi/Grok                                      | `src/app/api/agenthub/sessions/[sessionId]/status/route.js` |

### Solución

Reemplazar polling por **modelo event-driven** sobre el WebSocket ya abierto al PTY:

- **`panelActivityStore.js`** (nuevo) — store module-level keyed by `panelId`, compatible con `useSyncExternalStore`.
- **`panelActivityTracker.js`** (nuevo) — factory que traduce frames WS en transiciones `running`↔`idle`:
  - **Ready gate**: frames antes de `onReady` se ignoran (replay del historial no cuenta como actividad).
  - **Bootstrap condicional**: `onReady` solo seedea `running` si `reattached === true` AND `lastActivityAgeMs ≤ 2000`.
  - **Redraw detection**: strippéa ANSI y compara texto visible — si es idéntico al anterior (TUI redibujando idle), no resetea el debounce.
  - **Noise filter**: chunks <50 bytes y pure ANSI cursor-control no cuentan.
  - **Debounce 2s**: sin output sustancial por 2s → `idle`.

### Archivos cambiados

| Archivo                                                 | Acción                                          |
| ------------------------------------------------------- | ----------------------------------------------- |
| `src/components/terminal/utils/panelActivityStore.js`   | Nuevo                                           |
| `src/components/terminal/utils/panelActivityTracker.js` | Nuevo                                           |
| `src/components/TerminalTTY.jsx`                        | Tracker cableado en WS onopen/onmessage/onclose |
| `src/hooks/usePanelAgentStatus.js`                      | `useSyncExternalStore` consume señal viva       |
| `src/components/terminal/utils/panelStatusHelpers.js`   | `derivePanelStatus` con lane `liveActivity`     |
| `sidecar-backend/server.js`                             | +1 línea: `lastActivityAgeMs` en frame `ready`  |

---

## 02 — Terminales en negro al cambiar/cerrar workspace

### Síntoma

Al cambiar de workspace (ws2→ws3) o cerrar un workspace, una o más terminales del workspace destino se quedaban completamente en negro. Un resize manual las recuperaba. Grok era especialmente propenso a esto.

### Causa raíz

`fitTerminalViewport` no-op cuando cols/rows no cambian → `stabilizeTerminalRenderer` hace `clearTextureAtlas()` pero NO repaint → `refreshTerminalViewport` llama `term.refresh()` pero no recrea el bitmap del canvas. Solo `forceTerminalViewportRepaint` (1-cell nudge: resize N→N-1→N) fuerza al canvas a redibujar.

El handler de `workspace-window-switch` ya llamaba `forceTerminalViewportRepaint`, pero **todos los demás caminos** no:

1. **`useLayoutEffect` de workspace-show** — rAF callbacks no repintaban.
2. **Tres freeze paths** en `syncTerminalViewportOnWorkspaceShow` (Kimi TUI, single-WebGL, DOM-TUI para Grok) — retornaban early sin repintar.
3. **Handler `handleLayoutSettled`** — burst genérico y handlers específicos (swarm-launch, workspace-created, panel-split, panel-relaunch, panel-group-layout, pizarra-mode) llamaban `refreshTerminalViewport` pero no `forceTerminalViewportRepaint`.
4. **Catchup de hidden output** — al descartar buffer (TUI activa), no repintaba el canvas.

### Solución

Añadir `forceTerminalViewportRepaint` en todos los caminos:

- `useLayoutEffect` rAF callbacks (primer y segundo rAF)
- Tres freeze paths (Kimi, single-WebGL, DOM-TUI)
- Burst genérico de `handleLayoutSettled`
- Handlers específicos: swarm-launch, workspace-created, panel-split, panel-relaunch, panel-group-layout, pizarra-mode
- Catchup de hidden output (ambos paths: descartar y escribir)

### Archivos cambiados

| Archivo                          | Cambio                                                                                              |
| -------------------------------- | --------------------------------------------------------------------------------------------------- |
| `src/components/TerminalTTY.jsx` | `forceTerminalViewportRepaint` en ~12 puntos del flujo de workspace-show + layout-settled + catchup |

---

## Lecciones aprendidas

- `term.refresh(0, rows-1)` **no** recrea el bitmap del canvas — solo marca rows como dirty. Si el contexto WebGL/Canvas se perdió mientras el panel estaba oculto, refresh no revive el canvas.
- `forceTerminalViewportRepaint` (1-cell nudge) es la **única** forma confiable de forzar un repaint real cuando las dimensiones no cambian.
- `shouldReleaseWebglRendererOnLayoutHide` retorna `false` cuando `isWorkspaceShellVisible` es true — el WebGL no se libera en workspace switch, pero el context puede degradarse. El repaint forzado es necesario.
- `shouldDiscardHiddenOutputCatchup` descarta el buffer para TUIs activas (`tuiSessionActive=true`) — confía en que el SIGWINCH del `nudgeTerminalPtyResize` forzará a la TUI a redibujar. Pero el canvas xterm也需要 repaint forzado.
- El modelo event-driven para status de TUI es superior al polling: cero aliasing, agent-agnostic, sin dependencia de DB ni regex de texto.

---

## 03 — Follow-up: terminales todavía en negro al cambiar/cerrar workspace

### Síntoma (recurrencia)

Tras el fix de la sección 02 todavía se reportaban negros:

- **croc**: líneas negras al cambiar de workspace.
- **OpenCode**: al cerrar un workspace y caer en otro, la terminal destino se iba a negro.
- **kimi / grok**: al cambiar a un workspace que los contenía, a veces se iba a negro completamente (no se recuperaba hasta resize manual).

### Causa raíz

El fix de 02 añadió `forceTerminalViewportRepaint` en ~12 puntos, pero quedaron **gaps**. La causa raíz confirmada por síntoma ("solo un resize manual lo recupera" + "todas las terminales del workspace destino"):

| RC   | Descripción                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Archivo                                                            |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| RC0  | **Carrera async de reattach del renderer GPU.** Al ocultar el shell del workspace (`visibility:hidden` → `isWorkspaceShellVisible=false`), `shouldRelease{Webgl,Canvas}RendererOnLayoutHide` libera el addon GPU. Al volver, el `useLayoutEffect` de layout-show dispara su force-repaint en el primer rAF **antes** de que el reattach async (`tryReattach{Canvas,Webgl}Addon`) complete → `isTerminalRendererReady` retorna false (`_renderer.value` vacío) → `forceTerminalViewportRepaint` bails (test `skips when the renderer is not ready`) → todas las terminales destino quedan negras hasta un resize manual (que ya encuentra el renderer reattached). El window-switch dentro de un workspace NO libera el renderer (shell stays visible) → por eso funciona.                                                                                                                                                                                                                                                             | `src/components/TerminalTTY.jsx` (layout-show rAF)                 |
| RC0b | **Cerrar workspace no-activo va por el burst, single-attempt.** `notifyNativeWorkspaceSurfaceSync('workspace-switch')` **no** emite `terminal-layout-settled` para xterm (sólo sincroniza VTE nativo) → al cerrar el workspace activo, el repaint depende sólo del layout-show useLayoutEffect (cubierto por RC0). Pero al cerrar un workspace **no-activo**, se emite `workspace-removed`/`panel-closed` → `handleLayoutSettled` burst, cuyo force-repaint era **un solo intento por fase** (gated en `isTerminalRendererReady`) → si el renderer no estaba ready en esos ~3 frames (`workspace-removed` tiene `extraDelaysMs=[]`), quedaba negro.                                                                                                                                                                                                                                                                                                                                                                                   | `src/components/TerminalTTY.jsx` (handleLayoutSettled burst)       |
| RC0c | **Cerrar workspace ACTIVO no despacha ningún `terminal-layout-settled` para xterm.** `removeWorkspace` saltaba el burst cuando `activeWsWillChange` ("el effect de activeWsId ya emite workspace-switch") — pero ese effect sólo emite sync VTE **nativo** (`notifyNativeWorkspaceSurfaceSync`), no un evento browser para xterm. Así que los paneles destino xterm quedaban **sólo** a merced del layout-show useLayoutEffect (que tiene RC0). Si esa transición false→true perdía la carrera del reattach async (o `isFullscreenBrowser` quedaba stale tras cerrar un workspace con browser), **nada** repaintaba → negro al cerrar y caer en otro workspace. El switch de tab normal no tiene este problema porque su transición false→true sí dispara el layout-effect de forma confiable.                                                                                                                                                                                                                                        | `src/components/TerminalWorkspacesManager.jsx` (`removeWorkspace`) |
| RC1  | Fallback final de `syncTerminalViewportOnWorkspaceShow` solo llamaba `refreshTerminalViewport` (no `forceTerminalViewportRepaint`). Era el único punto terminal-ready del archivo sin el 1-cell nudge. La recuperación zero-size y el path general no recreaban el bitmap.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `src/components/TerminalTTY.jsx` (~L3771)                          |
| RC2  | La rama `isWorkspaceSwitch` de `handleLayoutSettled` no repaintaba paneles visibles — delegaba en el `useLayoutEffect` (que tiene RC0).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `src/components/TerminalTTY.jsx` (~L6486)                          |
| RC0d | **Bordes negros (gutters): TUI pinta a cols stale, sin SIGWINCH.** Síntoma distinto al "panel totalmente negro": el TUI (grok, OpenCode, kimi) sí pinta pero a un ancho **menor** que el panel, dejando una franja negra a la derecha (y a veces arriba/abajo). Causa: al volver de un switch, para TUIs DOM con `sizeUnchanged=true`, `syncTerminalViewportOnWorkspaceShow` toma el freeze path (`shouldFreezeDomViewportOnWorkspaceShow`) que llama `nudgeTerminalPtyResize` **sin `force`** → como `lastPtySizeRef` coincide con las cols (stale), `nudgeTerminalPtyResize` bails (guard `!force && lastPtySizeRef === cols`) → **cero SIGWINCH** → el TUI nunca redibuja al ancho del container. El `scheduleBoundedForceRepaint` (nudge 1-cell) **no** arregla esto: sólo repinta el bitmap xterm a las cols **actuales** (stale), sin recalcular ni notificar al PTY. Por eso "al hacer resize se corrige" (fit real + SIGWINCH) "pero vuelve a suceder" (en el próximo switch el fit del show baila o se freeza sin SIGWINCH). | `src/components/TerminalTTY.jsx` (layout-show rAF + freeze path)   |

### Solución

- **RC0 / RC0b / RC2 (clave)**: helper reutilizable `scheduleBoundedForceRepaint(maxAttempts)` que reintenta `forceTerminalViewportRepaint` a través de rAFs hasta que retorna `true` (o el container tenga `rect>0`), con guards de dispose/hide. Usado en: el rAF del layout-show useLayoutEffect (workspace tab switch / cerrar workspace activo), la rama `isWorkspaceSwitch` de `handleLayoutSettled`, y el burst de `handleLayoutSettled` (cerrar workspace no-activo / panel-closed). Así, cuando el reattach async finalmente puebla `_renderer.value`, el siguiente intento del retry hace el nudge 1-cell = equivalente al resize manual. Sin SIGWINCH al PTY.
- **RC0c (clave — reusar la lógica del switch para el close)**: en `removeWorkspace`, al cerrar el workspace **activo**, despachar un burst `WORKSPACE_SWITCH` para los paneles destino (`targetPanelIds` del workspace a aterrizar) en vez de saltarlo. Esto reusa exactamente la rama `isWorkspaceSwitch` de `handleLayoutSettled` (sync + `scheduleBoundedForceRepaint`), que es la lógica que ya funciona al cambiar de workspace. Las fases raf/delay del burst disparan **después** del re-render (cuando `isVisibleInLayout` ya es true) y reintentan el repaint hasta que el renderer esté ready. `fitTerminalViewport` es no-op en containers parked (dims sin cambio) → sin refit/flash/SIGWINCH. `notifyNative=false` en este caso porque el effect de `activeWsId` ya emite el sync VTE nativo (evita doble sync nativa). Cerrar workspace **no-activo** sigue yendo por `WORKSPACE_REMOVED` (sin cambio).
- **RC1**: emparejar `refreshTerminalViewport` + `forceTerminalViewportRepaint` en el fallback final de `syncTerminalViewportOnWorkspaceShow`.
- **RC0d (clave — bordes negros / gutters)**: nuevo helper `scheduleBoundedFitRepaint(maxAttempts)` que reintenta un **fit real** (`fitTerminalViewport` con PTY notify, NO `skipPtyNotify`) a través de rAFs hasta que las cols/rows del terminal coincidan con la capacidad real del container (`proposeTerminalViewportDimensions`). Esto es el **equivalente automático al resize manual** (lo único que el usuario confirma que limpia los gutters): recalcula cols del container, resizea el term, y manda SIGWINCH al PTY **sólo cuando las cols cambian** → el TUI redibuja al ancho correcto. `fitTerminalViewport` baila hasta que `isTerminalRendererReady` (reattach async) y mientras el container esté zero-sized en la transición, por eso el retry across frames es necesario; una vez que el terminal settlea al tamaño del container, el retry es no-op y para (sin spam de SIGWINCH). Usado en: el rAF del layout-show useLayoutEffect (switch de tab / cerrar workspace activo), la rama `isWorkspaceSwitch` de `handleLayoutSettled`, y el burst de `handleLayoutSettled` (cerrar workspace no-activo / panel-closed). **Salta kimi live** (`isKimiTuiLive`) porque su path usa `skipPtyNotify` por diseño (evitar disruptar el re-render loop de Ink); mandarle SIGWINCH podría empeorar el "kimi se crashea a veces".

### Archivos cambiados

| Archivo                                                                       | Cambio                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/TerminalTTY.jsx`                                              | Nuevo helper `scheduleBoundedForceRepaint` (retry bounded de force-repaint) usado en layout-show rAF, rama `isWorkspaceSwitch` y burst de `handleLayoutSettled`; `forceTerminalViewportRepaint` en el fallback final de `syncTerminalViewportOnWorkspaceShow`. Nuevo helper `scheduleBoundedFitRepaint` (retry bounded de fit real + SIGWINCH, salta kimi) usado en los mismos 3 puntos para arreglar los gutters/bordes negros |
| `src/components/TerminalWorkspacesManager.jsx`                                | `removeWorkspace`: al cerrar el workspace activo, despachar burst `WORKSPACE_SWITCH` para los paneles destino (reasignando la lógica del switch al close), con `notifyNative=false` para evitar doble sync VTE nativa                                                                                                                                                                                                           |
| `src/components/__tests__/TerminalWorkspacesManager.workspaceWindows.test.js` | Test de regresión RC0c: cerrar workspace activo despacha `workspace-switch` para los paneles destino (p4/p5), no para los cerrados                                                                                                                                                                                                                                                                                              |
| `src/components/__tests__/TerminalTTY.test.js`                                | Test RC0d: `fitTerminalViewport` resizea cols stale (40) al ancho real del container (80) y emite SIGWINCH con las cols nuevas (mecanismo que limpia los gutters)                                                                                                                                                                                                                                                               |

### Nota

- El modelo event-driven de status (sección 01) **no** es causa: `usePanelAgentStatus` solo lo consume `PanelStatusBadge` (badge separado del canvas xterm).
- **HMR no es confiable** para este componente (7k líneas, refs, WebSocket, xterm instances persistentes). Validar con reload completo del frontend (o rebuild Tauri), no solo hot-reload.
- **Kimi "se crashea a veces"** es un síntoma separado del negro por cerrar workspace; si persiste tras este fix, capturar logs de `forceTerminalViewportRepaint` / `scheduleBoundedForceRepaint` (motivo de bail, `canvasReleasedOnLayoutHideRef`, renderer reattached, `cols/rows`) al reproducir.

---

## 04 — Follow-up: terminales STILL en negro al ~5º switch (raíz real)

### Síntoma (recurrencia 3)

Tras el fix de la sección 03 el negro persistía: funciona varias veces y ~al 5º cambio de workspace algunos paneles se van a negro. Volver a switchear a un panel negro lo recupera. Manual resize también lo recupera.

### Causa raíz (verificada contra `xterm@5.3.0` `RenderService`)

El fix de 03 añadió retries de **force-repaint/fit**, pero el retry de force-repaint **nunca reatacha** — y esa era la pieza faltante. Mecanismo exacto:

- Al ocultar el workspace shell (`visibility:hidden` → `isWorkspaceShellVisible=false`), `shouldRelease{Webgl,Canvas}RendererOnLayoutHide` retorna `true` → `release*Addon` disposea el addon y deja `*AddonRef.current = null`.
- Pero xterm `RenderService._renderer` es un `MutableDisposable`; disposear el addon **NO limpia `RenderService._renderer.value`** — el slot sigue apuntando al renderer **disposed** (objeto truthy, cell dims cacheadas).
- `isTerminalRendererReady()` solo chequea `_renderer.value` truthy + cell dims ≠ 0 → retorna **`true`** aunque el renderer esté disposed.
- `forceTerminalViewportRepaint()` bails sólo si `!isTerminalRendererReady` → NO baila → hace el nudge 1-cell + `term.refresh()` sobre el renderer disposed → **no-op visual** → retorna **`true`** ("éxito").
- `scheduleBoundedForceRepaint` (retry bounded) paraba en su primer "éxito" (return true) → **nunca reatachaba** → panel negro.

El reattach SÍ ocurría a veces (en algunas ramas de `syncTerminalViewportOnWorkspaceShow` y los safety-net effects single-shot), pero bajo switching rápido el estado de los flags `webglReleasedOnLayoutHideRef` / `pendingWebglRecoveryRef` **diverge** del estado real del ref del addon (p.ej. `releaseWebglAddonForInactivePanel` retorna `false` sin setear flags si el reattach estaba in-flight; `handleWebglContextLoss` nullea el ref sin setear `webglReleasedOnLayoutHideRef`). Cuando divergen, alguna transición show cae en una rama que no reatacha (o cuyo reattach single-shot baila transientmente) → el renderer disposed queda en su lugar → negro. Volver a switchear dispara otra rama que sí reatacha → se recupera.

### Solución

Backbone de recuperación determinista: `scheduleBoundedGpuRecover` — retry async bounded que, en cada show, usa el **ref del addon** (`*AddonRef.current === null`) como fuente de verdad para "necesita reattach" (NO `isTerminalRendererReady`, que miente sobre el renderer disposed), reatacha (`tryReattach{Webgl,Canvas}Addon`) y luego force-repainta. Reintenta across rAFs hasta que el addon esté attachado Y el force-repaint pinte de verdad. Guardas de dispose/hide.

Cableado en los 4 puntos de show:

- `useLayoutEffect` de layout-show: rAF #1 (`workspace-show-layout`) y rAF #2 (`workspace-show-raf`, gated en `needsRafRecovery`).
- `handleLayoutSettled` rama `isWorkspaceSwitch` (cubre close-active, que despacha `workspace-switch`).
- `handleLayoutSettled` burst (cubre `workspace-removed` / `panel-closed`).

Por qué es robusto vs whack-a-mole anterior: no depende de qué rama de `syncTerminalViewportOnWorkspaceShow` corrió ni de cómo diverjan los flags — chequea el estado real del ref. `tryReattach*` es idempotente (baila si el addon ya está seteado), así que los llamados redundantes del backbone + las ramas existentes no chocan. Cubre también el caso `handleWebglContextLoss` (ref null sin flag de release).

Insight clave (para que nadie "simplifique" el backbone away): `isTerminalRendererReady` **no detecta un renderer disposed** — sólo el ref del addon lo hace. El helper puro `needsGpuRendererReattach` codifica esto y está testeado.

### Archivos cambiados

| Archivo                                        | Cambio                                                                                                                                                                                                                                                                                |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/TerminalTTY.jsx`               | Nuevo helper puro `needsGpuRendererReattach` (ref-based, no readiness-based). Nuevo backbone `scheduleBoundedGpuRecover` (retry async bounded de reattach + force-repaint). Cableado en los 4 puntos de show (layout-show rAF #1/#2, `handleLayoutSettled` isWorkspaceSwitch, burst). |
| `src/components/__tests__/TerminalTTY.test.js` | Test `needsGpuRendererReattach`: webgl/canvas mode + ref null → true (incluso si el slot tiene un renderer disposed); addon seteado → false; DOM/native → false.                                                                                                                      |

### Nota

- **No** se eliminó el release-on-hide (conserva la seguridad WebKitGTK y el ahorro de contextos WebGL). El backbone hace el reattach determinista sin cambiar cuándo se libera.
- **No** se tocaron las ramas existentes de `syncTerminalViewportOnWorkspaceShow` — el backbone es aditivo y las hace tolerantes a saltarse el reattach.
- Validar con reload completo del frontend (no HMR — ver nota sección 03). Reproducir: switch rápido entre 4+ workspaces ~10 veces; antes del fix ~al 5º salía algún panel negro; tras el fix no debería.

---

## 05 — Follow-up: franja negra a la derecha (Grok) y negro al cerrar workspace

### Síntoma residual (post-04)

Tras el backbone de reattach (sección 04), el black-screen total al switcher quedó resuelto, pero persistían 2 incidencias:

1. **Cerrar un workspace → 2 de 4 paneles sobrevivientes se ven negros.** Al cerrar (típicamente el activo) y aterrizar en otro workspace, algunos paneles quedaban negros aunque el renderer GPU ya estaba reatachado.
2. **Grok: franja negra grande a la derecha al switcher.** Al cambiar a un workspace con Grok, el contenido del terminal no llenaba el ancho del panel, dejando un vacío negro a la derecha. (La franja fina inferior es Tmux — fuera de scope.)

### Causa raíz

Ambos comparten raíz: **el fit no espera a que el container se estabilice, y el backbone no hace fit real**.

- **`scheduleBoundedFitRepaint` paraba demasiado pronto.** Hacía "settled" en cuanto `proposed.cols === term.cols`. En un switch, el PanelGroup/xterm canvas se está asentando un frame o dos después del primer fit, así que el container reporta un ancho **angosto transitorio**; el fit resizea el term a ese ancho angosto, `proposed === term` → settled → para. Cuando el container se ensancha al ancho final, ya nadie re-fittea → cols stale → franja negra derecha (síntoma Grok/DOM-TUI, ya documentado como RC0d pero sin el matiz de "settled en ancho transitorio").
- **`scheduleBoundedGpuRecover` (backbone) sólo force-repainteaba a las cols actuales.** `forceTerminalViewportRepaint` nudgea el bitmap de xterm a las cols/rows ACTUALES — nunca las recomputa del container. Tras una transición hide/show (close/switch), las cols pueden quedar stale (0 o angostas) aunque el renderer esté vivo, así que el panel seguía negro (síntoma "negro al cerrar").

### Solución

Dos fixes puntuales, aditivos:

1. **`scheduleBoundedFitRepaint`: requerir dims estables across 2 frames antes de parar.** Se trackea `lastProposed`; sólo se detiene cuando `settled && stable` (las dims propuestas del container son idénticas al frame anterior). Así se atrapa el ancho final del container tras el asentamiento del layout. Costo: un fit no-op extra; ceiling comentado en el código.

2. **`scheduleBoundedGpuRecover`: añadir un `fitTerminalViewport` real antes del force-repaint.** El backbone ahora hace reattach (si hace falta) → **fit real** (recomputa cols del container + SIGWINCH al PTY para que el TUI redibuje a ancho completo) → force-repaint. Skip kimi live (su path usa `skipPtyNotify` intencionalmente). SIGWINCH sólo se envía cuando las cols cambian, así que es no-op una vez asentado — sin spam ni disruptión del TUI.

### Archivos cambiados

| Archivo                          | Cambio                                                                                                                                                                                                   |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/TerminalTTY.jsx` | `scheduleBoundedFitRepaint`: stability check (2 frames) antes de parar. `scheduleBoundedGpuRecover`: añade `fitTerminalViewport` real (skip kimi) antes del force-repaint; deps `[] → [initialCommand]`. |

### Nota

- El backbone fit y el `scheduleBoundedFitRepaint` stability son complementarios: el backbone garantiza ≥1 fit + reattach + repaint en el path determinista; el stability check atrapa el ensanchamiento tardío del container. Redundancia idempotente (no-op cuando cols matchean).
- Validar con reload completo: (a) switcher a workspace con Grok → no franja negra derecha; (b) cerrar el workspace activo con 4+ abiertos → los paneles del workspace destino no se ven negros.

---

## 06 — Follow-up: negro al cerrar workspace (Grok mini + destino crasheado)

### Síntoma residual (post-05)

Tras la estabilidad de 2 frames en `scheduleBoundedFitRepaint` y el fit en el backbone GPU, persistían:

1. **Cerrar workspace activo → paneles del destino en negro** (p.ej. 2 de 4).
2. **Grok: TUI dibujada en esquina minúscula** con vasto vacío negro a la derecha (cols stale angostas).

### Causa raíz

Tres bugs compuestos:

| Bug                                  | Descripción                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **DOM freeze sin chequeo de dims**   | `shouldFreezeDomViewportOnWorkspaceShow` congelaba el viewport (solo `nudgeTerminalPtyResize` + force-repaint, **sin fit real**) cuando `lastPtySizeRef === term.cols`, aunque el **container** ya pedía más cols. Grok quedaba en grid angosto → logo minúsculo + gutter negro. `shouldFreezeDomViewportOnAppResume` ya chequeaba `proposedDimsMatch`; workspace-show no. |
| **Backbone paraba demasiado pronto** | `scheduleBoundedGpuRecover` paraba cuando `forceTerminalViewportRepaint()` devolvía true a cols **actuales** (angostas), sin gate `settled && stable`.                                                                                                                                                                                                                     |
| **Burst prematuro en close**         | `removeWorkspace` disparaba `syncPanelLifecycleLayout` **antes** del commit de React (`isVisibleInLayout` aún false). Fase `immediate` hacía early-return sin recovery. `WORKSPACE_REMOVED` tenía `raf: false` y `delayMs: []`.                                                                                                                                            |

### Solución

1. **`shouldFreezeDomViewportOnWorkspaceShow`**: param `proposedDimsMatch` — no congelar si container ≠ term grid.
2. **`syncTerminalViewportOnWorkspaceShow`**: `proposedDims` antes del freeze check.
3. **`scheduleBoundedGpuRecover`**: gate `settled && stable` (2 frames) + GPU reattached antes de parar.
4. **`handleLayoutSettled` workspace-switch**: si panel hidden, arrancar bounded recover/fit (cada tick re-chequea visibility).
5. **`removeWorkspace`**: double-rAF defer burst; `targetPanelIds` del active window; `WORKSPACE_REMOVED` burst con raf + delays.

### Archivos cambiados

| Archivo                                        | Cambio                                                      |
| ---------------------------------------------- | ----------------------------------------------------------- |
| `src/components/TerminalTTY.jsx`               | freeze DOM + backbone settled+stable + hidden-path recovery |
| `src/components/TerminalWorkspacesManager.jsx` | double-rAF defer; active-window panel IDs                   |
| `src/lib/terminal/terminalLifecycleSync.js`    | `WORKSPACE_REMOVED` phases alineados con switch             |

---

## 07 — Follow-up: ~2 de 4 paneles negros al cerrar workspace (burst cancel)

### Síntoma

Al cerrar cualquier workspace, ~la mitad de los paneles sobrevivientes (p.ej. 2 de 4 en split) quedaban negros. No era aleatorio: las fases del lifecycle burst se cancelaban entre sí.

### Causa raíz

`handleLayoutSettled` llama `layoutSettleBurstCleanupRef.current?.()` al inicio de **cada** fase (`immediate`, `raf`, `delay-80`, …). Para `workspace-removed`, el handler caía al path genérico que crea un `scheduleTerminalViewportSyncBurst` anidado. La fase siguiente cancelaba los timers de la anterior → la mitad de los paneles nunca recibían el recovery retrasado.

Además, `removeWorkspace` solo sincronizaba paneles del workspace activo destino, no **todos** los sobrevivientes.

### Solución

1. **`isWorkspaceCloseRecoverReason`** — unifica `workspace-switch` + `workspace-removed`.
2. **Rama dedicada** en `handleLayoutSettled`: recovery completo (sync + bounded GPU/fit) por fase, **sin** burst anidado que se auto-cancele.
3. **`survivorPanelIds`** — al cerrar, dispatch a todos los paneles de todos los workspaces restantes (marca `needsViewportSyncOnShow` en ocultos).

### Archivos

| Archivo                         | Cambio                                                       |
| ------------------------------- | ------------------------------------------------------------ |
| `TerminalTTY.jsx`               | `isWorkspaceCloseRecoverReason`, rama dedicada close-recover |
| `TerminalWorkspacesManager.jsx` | `survivorPanelIds` en `removeWorkspace`                      |

---

## 08 — Follow-up: reutilizar golden path route hide/show en workspace close

### Insight del usuario

Dashboard → Terminales → Dashboard funciona perfecto. Workspace switch/close dentro de terminales rompe paneles.

### Por qué route return funciona

1. `isVisible={isTerminalRoute}` en App → al salir de terminales **todos** los paneles del WS activo pasan `isVisibleInLayout` false→true.
2. Eso dispara el `useLayoutEffect` layout-show con reason **`workspace-show-layout`** (freeze branches correctos, double-rAF, bounded GPU/fit, inactive split repaint).
3. Hide/release GPU es **ordenado**; no hay unmount violento de otros WS en pantalla.

### Por qué workspace close fallaba

1. Paneles sobrevivientes **visibles** no togglean `isVisibleInLayout` → nunca corrían layout-show.
2. Recovery usaba `layout-settled-workspace-removed-*` (freeze branches distintos).
3. Unmount del WS cerrado **dispose WebGL** → context loss en split siblings; `handleWebglContextLoss` solo recuperaba el panel **activo**.

### Solución

1. **`scheduleWorkspaceShowRecovery()`** — extrae el pipeline golden de layout-show; lo usan layout-show, close-recover y survivor event.
2. **`dispatchTerminalSurvivorRecover`** — tras close, delays 100/300/600ms replay route-like recovery en todos los survivor panels.
3. **`handleWebglContextLoss`** — bounded GPU/fit + inactive repaint para **todos** los paneles visibles, no solo el activo.
4. Close-recover branch llama `scheduleWorkspaceShowRecovery()` + `reactivateTerminalViewport`.

---

## 09 — Follow-up: negro al cambiar ventana V1/V2/V3

### Síntoma

Workspace switch mejoró; **window switch** (sub-ventanas dentro del mismo WS) seguía yendo a negro.

### Causa

`handleLayoutSettled` tenía un branch **dedicated** `workspace-window-switch` (sync + force-repaint only) que hacía `return` **antes** de `isWorkspaceCloseRecover` → `scheduleWorkspaceShowRecovery()`. Recovery incompleto vs route return.

El effect `activeWindowIds` disparaba el burst **sincronamente** sin double-rAF ni `dispatchTerminalSurvivorRecover`.

### Fix

1. Eliminar branch débil `workspace-window-switch`; cae en `isWorkspaceCloseRecover` → golden path.
2. Effect `activeWindowIds`: double-rAF + lifecycle burst + survivor recover @ 100/300/600ms (mismo patrón que workspace close).

---

## 10 — Follow-up: negro al abrir/splitear/cerrar terminal en otro workspace

### Síntoma residual (post-09)

Al abrir una nueva terminal, dividir o cerrar un panel en un workspace, los paneles de **otro workspace** (u otra ventana V1/V2/V3) quedaban negros al volver a ellos. Un resize manual los recuperaba.

### Causa

El fix de la sección 09 (Option B) mantiene los addons GPU (Canvas/WebGL) attachados mientras el workspace está `opacity:0`. El reveal al volver usa `performSoftGpuVisibilityReveal` (`refresh` + nudge 1-cell **sin** `clear()`) o incluso salta por completo (`shouldSkipGpuVisibilityReveal`) cuando las dimensiones no cambiaron y no hay recovery pendiente.

Eso funciona para un tab switch limpio, pero falla cuando mientras el panel estaba oculto ocurrió un evento de **layout churn** (`panel-split`, `panel-closed`, `panel-group-layout`, `workspace-removed`, etc.) en otro workspace. `scheduleTerminalLifecycleSync` filtra esos eventos por `panelIds` del workspace activo, así que el panel oculto nunca recibe el `layout-settled` y no sabe que debe correr el recovery. El compositor/GPU puede descartar el backing store del canvas oculto aunque el addon siga attachado. Al volver, el soft reveal no recrea el bitmap → negro hasta un resize manual.

### Fix v1 (insuficiente)

Se agregó `layoutChurnedWhileHiddenRef` y se marcó en `handleLayoutSettled`/`handleSurvivorRecover` cuando el evento llegaba a un panel oculto. No funcionó en el caso real porque los eventos de otro workspace no llegan al panel oculto (filtrado por `panelIds`).

### Fix v2 (generación global)

1. **`src/components/terminal/nativeLayoutSync.js`**: contador monotónico `terminalLayoutSettledGeneration` que se incrementa en cada `dispatchTerminalLayoutSettled`. Exportado como `getTerminalLayoutSettledGeneration()`.
2. **`src/components/TerminalTTY.jsx`**:
   - Nuevo ref `layoutHiddenGenerationRef`.
   - Cuando el panel se oculta, guarda `getTerminalLayoutSettledGeneration()`.
   - Al revelar, compara la generación guardada contra la generación actual. Si creció, significa que hubo layout churn en cualquier workspace mientras este panel estaba oculto.
   - Combinado con `layoutChurnedWhileHiddenRef` (eventos que sí llegaron al panel oculto), decide `hadLayoutChurn`.
   - Si `hadLayoutChurn` es true, descarta el camino soft/skip.
   - Para **shells normales**: ejecuta `syncTerminalViewportOnWorkspaceShow('workspace-show-layout-churn-recover', { clearAtlas: true })` + `scheduleBoundedGpuRecover`. El reason evade freeze/skip y fuerza fit real + `forceTerminalViewportRepaint`.
   - Para **TUIs (OpenCode/Grok/etc.)**: `clearAtlas: true` destruye el canvas porque el TUI no repinta hasta recibir SIGWINCH/input. Se usa un path TUI-safe: `fitTerminalViewport(..., { clearAtlas: false, skipPtyNotify: true })` + `stabilizeTerminalRenderer({ clearAtlas: false })` + `refreshTerminalViewport` + `forceTerminalViewportRepaint` + `nudgeTerminalPtyResize({ force: true })`. Esto fuerza al TUI a repintar con sus dimensiones actuales.
   - Si no hubo churn: mantiene el reveal soft actual (sin parpadeo).

### Archivos cambiados

| Archivo                                                      | Cambio                                                                                              |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `src/components/terminal/nativeLayoutSync.js`                | `terminalLayoutSettledGeneration`, `getTerminalLayoutSettledGeneration()`                           |
| `src/components/TerminalTTY.jsx`                             | `layoutHiddenGenerationRef`, snapshot en hide, comparación en reveal, churn path, recovery TUI-safe |
| `src/components/TerminalWorkspacesManager.jsx`               | build marker bump                                                                                   |
| `src/components/terminal/__tests__/nativeLayoutSync.test.js` | test de la generación monotónica                                                                    |

### Resultado

Verificado en runtime (2026-07-02): tras splitear/cerrar terminales en otro workspace, los paneles de shell normales y los TUIs (OpenCode, Grok) vuelven visibles sin quedarse en negro. Los tab switches limpios siguen usando el soft reveal sin parpadeo.
