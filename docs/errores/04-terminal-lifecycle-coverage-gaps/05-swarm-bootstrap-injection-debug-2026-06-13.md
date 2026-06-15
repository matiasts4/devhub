# Swarm bootstrap injection — registro de debug (2026-06-13)

> **Estado:** ABIERTO — corrupción visual G-04 persiste tras 8 iteraciones client-side.  
> **Síntoma reportado:** terminal “crashea” / se corrompe al inyectar el prompt de misión ZED (tmux paste del bootstrap).  
> **Severidad:** P2 (degradación visual WebGL; sin throw JS consistente en consola).  
> **Debug session:** `833db0` · logs NDJSON en `.cursor/debug-833db0.log` (instrumentación aún presente en código).

---

## Resumen ejecutivo

El path **lazy spawn ZED** (`spawnStrategy: lazy-on-demand`) lanza un panel, espera OpenCode TUI, postea `opencode-ready`, y el **wrapper bash** inyecta el prompt vía `tmux paste-buffer`. Ese paste genera **olas de PTY output** (2–3 ráfagas separadas ~10–15s) que corrompen el renderer **xterm-webgl** si el cliente hace fit/resize/clearAtlas/refresh o replay masivo del buffer.

**Lo que sí quedó probado con logs:**

| Hallazgo                                           | Evidencia                                                      |
| -------------------------------------------------- | -------------------------------------------------------------- |
| No hay throw C-02/C-03 durante el paste            | Cero entradas `refresh throw non-stale` ni `window.error`      |
| Los bursts `swarm-tui-ready` empeoraban la carrera | Removerlos eliminó ruido; no bastó para fix final              |
| El paste llega en **múltiples olas**               | Gap ~14s entre ola 1 y 2 en run `p7231`                        |
| Replay de **~74KB** en un `term.write()` corrompe  | Run 8: `bootstrap buffer flushed` 73834 bytes → issue persiste |
| Echo `[DEVHUB_BOOTSTRAP]` **no llega al PTY**      | Wrapper redirige a `DEVHUB_LOG_FILE`, no al pane               |

**Estado del código (sin commit al documentar):** lógica de **bootstrap viewport freeze** + buffer + discard + `nudgeTerminalPtyResize` en `TerminalTTY.jsx` (fix 8). Instrumentación debug `#region agent log` **no retirada**.

---

## Síntoma observable

- Prompt de misión ZED superpuesto / texto partido en el panel OpenCode.
- Overlay o fragmentos tipo `tmux send-keys` flotando (contenido del prompt largo mal renderizado).
- Footer OpenCode (`esc interrupt`) visible pero transcripto visualmente roto.
- Subagentes 0 en lazy spawn es **esperado** hasta provision; no es el bug principal.

Relacionado: **G-04** (nuevo en catálogo), hermano de G-01/G-03 en [01-crash-catalog.md](./01-crash-catalog.md).

---

## Flujo temporal (happy path + punto de fallo)

```text
1. TWM: swarm-launch → materializa panel ZED (lazy)
2. scheduleSwarmProjectionReadyBurst → shared-surface-projection-ready
3. wrapper-sent → burst swarm-wrapper-sent
4. OpenCode arranca en tmux
5. TerminalTTY: detecta footer TUI → notifyOpencodeReady (POST /api/terminal/opencode-ready)
6. Wrapper: poll /tmp/devhub-opencode-ready-<tmux> → _devhub_bootstrap_prompt
7. tmux load-buffer + paste-buffer + send-keys C-m  ← PTY flood al cliente
8. [FALLO] xterm-webgl atlas / layout corrupto
```

**Server-side (wrapper):** `_devhub_bootstrap_prompt` escribe logs a `$DEVHUB_LOG_FILE`, no al pane. El cliente **no puede** detectar bootstrap por regex `[DEVHUB_BOOTSTRAP]` en PTY output (hipótesis H-C basada en logs vacíos).

---

## Instrumentación de debug (sesión 833db0)

| Constante / path | Valor                                         |
| ---------------- | --------------------------------------------- |
| Session ID       | `833db0`                                      |
| Log NDJSON       | `.cursor/debug-833db0.log`                    |
| Endpoint ingest  | `http://127.0.0.1:7419/ingest/...` (solo dev) |

**Puntos instrumentados en `TerminalTTY.jsx`:**

- `refreshTerminalViewport` — throws no-stale (H-A)
- `handleLayoutSettled` — bursts swarm (H-A, H-D)
- `notifyOpencodeReady` — freeze start (H-L)
- `writeTerminalOutput` — large writes, buffer, discard, recover (H-I, H-P, H-Q, H-O)
- `fitAndResize` / `syncTerminalViewportOnWorkspaceShow` / `sendResize` — skip durante freeze (H-L)
- `window.error` por panel (H-E)

**Limpiar logs antes de cada run:** borrar `.cursor/debug-833db0.log` (no mezclar sesiones).

---

## Hipótesis — matriz de evidencia

| ID      | Hipótesis                                                     | Resultado                        | Evidencia clave                              |
| ------- | ------------------------------------------------------------- | -------------------------------- | -------------------------------------------- |
| **H-A** | `refresh`/`clearAtlas` durante burst sin renderer → C-02      | **RECHAZADA**                    | Sin logs `refresh throw non-stale`           |
| **H-B** | Eventos lifecycle `wrapper-sent` / `tui-ready` no disparan    | **RECHAZADA**                    | L17/L23 en runs tempranos                    |
| **H-C** | Bootstrap complete no detectado en PTY                        | **CONFIRMADA (causa detección)** | Wrapper log → file; no marker en PTY         |
| **H-D** | `clearAtlas: true` hardcodeado en branch swarm con TUI activa | **CONFIRMADA**                   | `shouldClearAtlas:false` insuficiente solo   |
| **H-E** | Error React no capturado                                      | **RECHAZADA**                    | Sin `window.error`                           |
| **H-F** | `fit`/`resize` durante `swarm-tui-ready`                      | **PARCIAL**                      | Gentle sync no bastó; remover burst sí ayudó |
| **H-G** | Catchup hidden output fuerza `clearAtlas:true` con TUI        | **RECHAZADA**                    | `catchupPending:false` en logs               |
| **H-H** | `refresh` repetido (10×) con TUI activa                       | **PARCIAL**                      | Contribuye; no única causa                   |
| **H-I** | Flood PTY multi-KB durante paste                              | **CONFIRMADA**                   | Olas 2–4KB × N en logs                       |
| **H-J** | cols/rows incorrectos al paste (G-03)                         | **INCONCLUSO**                   | cols 233×51 estables en opencode-ready       |
| **H-K** | Carrera: `opencode-ready` API + bursts cliente                | **CONFIRMADA**                   | Remover `swarm-tui-ready` burst necesario    |
| **H-L** | Viewport churn (fit/resize/projection) durante paste          | **CONFIRMADA**                   | Freeze skip logs en fitAndResize             |
| **H-M** | `projection-ready` con `clearAtlas:true` y TUI activa         | **PARCIAL**                      | Fix projection `clearAtlas:false` si TUI     |
| **H-O** | `bootstrap-complete` sync **entre olas**                      | **CONFIRMADA**                   | Recover L11 antes de ola 2 (run 7)           |
| **H-P** | Writes incrementales a WebGL durante paste                    | **PARCIAL**                      | Buffer ayuda; flush único empeora            |
| **H-Q** | **Replay 73KB** en un `term.write()`                          | **CONFIRMADA**                   | Run 8 L28: 73834 bytes flush → corrupto      |

---

## Iteraciones de fix (post-fix-N)

### Fix 1 — `clearAtlas` condicional en branch swarm

**Cambio:** `shouldClearGpuAtlasOnWorkspaceShow` + `clearAtlas:false` si `tuiSessionActive`.  
**Resultado:** Insuficiente. Corrupción persiste con TUI activa.

### Fix 2 — Post-TUI gentle sync + catchup path

**Cambio:** Skip fit en `swarm-tui-ready`; catchup con `clearAtlas:false` si TUI.  
**Resultado:** Insuficiente. Logs muestran gentle sync ×5 aún con refresh.

### Fix 3 — Eliminar burst `swarm-tui-ready` tras `notifyOpencodeReady`

**Cambio:** No schedule `scheduleTerminalLifecycleSync(SWARM_TUI_READY)` — evita carrera con server bootstrap.  
**Resultado:** Mejor timing; corrupción persiste en paste.

### Fix 4 — Bootstrap viewport freeze (20s)

**Cambio:** `fitAndResize`, `syncTerminalViewportOnWorkspaceShow`, `sendResize`, projection-ready skip durante freeze.  
**Resultado:** `fitAndResize skipped` en logs; paste aún corrompe.

### Fix 5 — Extender freeze en cada large write; quiet 5s → luego 16s

**Cambio:** `extendSwarmBootstrapViewportFreeze` en cada chunk ≥2KB.  
**Resultado:** Ola 2 protegida; unfreeze intermedio entre olas (5s quiet demasiado corto).

### Fix 6 — Sin `bootstrap-complete` layout burst; recover diferido

**Cambio:** Unfreeze ya no dispara `scheduleTerminalLifecycleSync`; recover solo scroll (sin refresh inicial).  
**Resultado:** Recover intermedio (L11) **entre olas** — confirmado H-O.

### Fix 7 — Buffer writes ≥2KB durante freeze; quiet 16s

**Cambio:** No `term.write` para chunks grandes mientras freeze; flush al final del quiet period.  
**Resultado:** Buffer acumula ~74KB; **flush único corrompe** (H-Q).

### Fix 8 — Buffer ALL output durante freeze; discard + nudge (actual)

**Cambio:**

- Todo output durante freeze → buffer (no solo ≥2KB).
- Al quiet: **descartar** buffer (no replay).
- `nudgeTerminalPtyResize` antes de lift freeze.
- Recover: solo `scrollTerminalToBottom`.

**Constantes exportadas:**

```javascript
SWARM_BOOTSTRAP_VIEWPORT_FREEZE_MS = 20000;
SWARM_BOOTSTRAP_UNFREEZE_QUIET_MS = 16000;
SWARM_BOOTSTRAP_RECOVER_DELAY_MS = 2000;
SWARM_BOOTSTRAP_LARGE_WRITE_BYTES = 2048;
```

**Estado al documentar:** usuario reporta issue **aún reproducible**; fix 8 pendiente de verificación con logs `bootstrap buffer discarded (no replay)`.

---

## Evidencia por run (launch IDs de logs)

| Run | Panel               | Launch          | Hallazgo principal                                        |
| --- | ------------------- | --------------- | --------------------------------------------------------- |
| 1–3 | p9080, p9079, p7231 | varios          | Bursts hasta `swarm-tui-ready`; sin bootstrap PTY marker  |
| 4   | p7352               | launch-ec2e363a | Freeze activo; 2ª ola con `freezeActive:false` (quiet 5s) |
| 5–6 | p7490, p7231        | varios          | Recover intermedio entre olas                             |
| 7   | p7491               | launch-f8235e97 | Buffer + flush 73834 B                                    |
| 8   | p7231               | launch-8a41a26f | Buffer OK; flush 73KB → H-Q                               |

**Patrón de olas PTY (run 8, panel p7231):**

| Tiempo rel. | Evento                               |
| ----------- | ------------------------------------ |
| +0s         | opencode-ready + freeze              |
| +2s         | Ola 1 — chunks ~2.5–4KB bufferizados |
| +16s        | Quiet → (fix 7) flush 73KB           |
| +17–27s     | Ola 2 — más chunks bufferizados      |

Gap entre olas ~14s → `SWARM_BOOTSTRAP_UNFREEZE_QUIET_MS` debe ser **≥ gap entre olas** o no unfreezar hasta fin real del paste.

---

## Archivos tocados en esta línea de trabajo

### Debug session (working tree al documentar)

| Archivo                          | Cambio                                                                                    |
| -------------------------------- | ----------------------------------------------------------------------------------------- |
| `src/components/TerminalTTY.jsx` | Freeze, buffer, discard, nudge, swarm branch, projection branch, catchup, exports helpers |
| `jest.config.js`                 | Ajuste menor (ver diff)                                                                   |

### Trabajo relacionado (sesiones previas, puede estar en rama/commits)

| Archivo                                        | Tema                                                          |
| ---------------------------------------------- | ------------------------------------------------------------- |
| `src/components/TerminalWorkspacesManager.jsx` | lazy spawn, `scheduleSwarmProjectionReadyBurst`, wrapper-sent |
| `src/lib/terminal/terminalLifecycleSync.js`    | `SWARM_*` reasons, burst phases                               |
| `src/lib/agentLaunchWrapper.js`                | `_devhub_bootstrap_prompt`, chunked paste                     |
| `src/lib/bus/launchPaths.js`                   | `resolveSupervisorApiBaseUrl`                                 |
| `docs/prompts/swarm/zed-orchestrator-v1.md`    | Instrucciones ZED                                             |

---

## Qué NO funcionó (anti-patterns confirmados)

1. **`clearAtlas: true` durante TUI OpenCode activa** — incluso un refresh puede degradar atlas.
2. **Bursts `swarm-tui-ready` tras `notifyOpencodeReady`** — compiten con server paste.
3. **`scheduleTerminalLifecycleSync(SWARM_BOOTSTRAP_COMPLETE)` entre olas** — fit/resize prematuro.
4. **`term.write(70KB+)` replay** — tan malo como writes incrementales.
5. **Detectar fin de bootstrap vía PTY regex** — logs van a archivo, no al websocket.
6. **Quiet period 1.5s / 5s** — menor que gap real entre olas (~14s).

---

## Próximos pasos recomendados (priorizados)

### P0 — Cliente

1. **Verificar fix 8** con log `bootstrap buffer discarded` + **sin** `buffer flushed`.
2. Si persiste: **no hacer nudge resize** post-discard (solo dejar PTY stream natural tras unfreeze).
3. Retirar instrumentación debug tras fix confirmado.
4. Tests unitarios para `isSwarmBootstrapViewportFrozen`, `extendSwarmBootstrapViewportFreeze`, discard path.

### P0 — Servidor / wrapper

1. **Señal de fin de bootstrap al cliente** — marker en PTY o evento WS (`bootstrap-complete`) en lugar de log file only.
2. **Retrasar paste** hasta viewport estable N ms post-opencode-ready (server-side debounce).
3. Evaluar **no paste literal** del prompt completo — usar API OpenCode si existe.

### P1 — Arquitectura

1. Aplicar constelación L1–L6 del [README](./README.md) al path completo **swarm-launch → bootstrap** (matriz fila Swarm bootstrap).
2. Unificar hook TWM vs `useSwarmLaunchController` (duplicación amplifica gaps).
3. Documentar en [baseline-metrics](../03-terminal-canvas-glyph-corruption/baseline-metrics.md) fila repro dedicada lazy ZED + bootstrap.

### P2 — Renderer

1. Probar **xterm-canvas** vs webgl en panel ZED lazy (split limit = 1 → canvas no aplica; webgl único).
2. Evaluar **release WebGL** durante bootstrap freeze (output a buffer, reattach post-discard).

---

## Comandos útiles

```bash
# Logs lifecycle estructurados
rg 'LIFECYCLE:|opencode-ready|fit-skip|swarm-' data/logs/terminal-debug.log | tail -80

# Debug session NDJSON
rg 'post-fix|bootstrap|freeze|buffer' .cursor/debug-833db0.log

# Wrapper bootstrap (servidor, no PTY)
rg 'DEVHUB_BOOTSTRAP' /tmp/devhub-swarm-*.log 2>/dev/null | tail -30

# tmux paste timing
rg 'launch-' data/logs/terminal-debug.log | tail -20
```

---

## Criterios de cierre (Definition of Done)

- [ ] Lazy launch ZED → OpenCode TUI legible **durante y después** del bootstrap paste.
- [ ] Sin texto superpuesto / overlay `tmux send-keys` / atlas corrupto.
- [ ] 0 throws C-02/C-03 en consola en 3 repros consecutivos.
- [ ] Log debug retirado; tests pasan para helpers freeze/discard.
- [ ] Fila baseline-metrics + G-04 marcado mitigado o fixed en catálogo.

---

## Referencias

- [01-crash-catalog.md](./01-crash-catalog.md) — G-04
- [02-coverage-matrix.md](./02-coverage-matrix.md) — fila swarm launch
- [03-remediation-plan.md](./03-remediation-plan.md) — fases L1–L6
- [03-terminal-canvas-glyph-corruption](../03-terminal-canvas-glyph-corruption/README.md) — G-01 familia
- [03-cambios-intentados.md](../03-terminal-canvas-glyph-corruption/03-cambios-intentados.md) — formato handoff hermano

---

_Documento generado tras debug mode session 833db0 (2026-06-13). Actualizar al confirmar fix o descartar fix 8._
