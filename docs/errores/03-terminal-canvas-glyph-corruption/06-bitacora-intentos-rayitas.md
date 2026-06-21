# 06 — Bitácora viva: intentos contra las rayitas (2026-06-21)

**Estado:** 🔴 ABIERTO — el usuario confirma que el bug persiste tras iteraciones 1–3.  
**Síntoma:** bandas horizontales / filas desplazadas en TUIs OpenCode/Kimi (rosa dot-matrix, footer corrido) al cambiar workspace, foco entre paneles, o alt-tab fuera y volver.  
**Runtime afectado:** Tauri/WebKitGTK en Linux (`.deb` o `tauri:dev`).

---

## Cómo leer esta bitácora

| Columna         | Significado                                |
| --------------- | ------------------------------------------ |
| **Hipótesis**   | Qué creíamos que causaba el bug            |
| **Cambio**      | Qué tocamos (archivos concretos)           |
| **Resultado**   | Confirmado por usuario / tests / pendiente |
| **Aprendizaje** | Qué descartamos o qué quedó pendiente      |

Cada iteración es **quirúrgica** (no revert global). Si una fila dice ❌, esa hipótesis quedó descartada o insuficiente.

---

## Diagnóstico acumulado (2026-06-21 tarde)

1. **Las capturas muestran desplazamiento horizontal fila a fila**, no solo “costuras” finas entre celdas → apunta a **corrupción de viewport/buffer** al reactivar la terminal, no solo CSS.
2. En git, el fix histórico para costuras DOM fue **usar canvas en todos los splits** (`eea5c55`, Jun-09). Forzar DOM en WebKitGTK nos dejó en la ruta más frágil.
3. Ya existía `shouldFreezeSingleWebglViewportOnWorkspaceShow` para WebGL en tab switch, pero **no había equivalente para DOM + TUI activo** → cada alt-tab corría `fitAndResize` dos veces.
4. `lineHeight: 1.1` y `letterSpacing: -0.5` (defaults en `TerminalThemeSync`) producen alturas de celda fraccionarias en DOM.
5. `.xterm-rows { width: 100% }` en modo DOM estira la grilla más allá del ancho natural de celdas.

---

## Iteraciones

### Iteración 1 — Atlas canvas + fillSlack (`38453a6`)

|                 |                                                                                                                       |
| --------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Hipótesis**   | Regresión en `38453a6`: filas `fillSlack:true`, atlas sin clear en repaint inactivo, skip reactivate en splits canvas |
| **Cambio**      | `TerminalTTY.jsx`: filas `fillSlack:false`, restaurar `clearAtlas` en repaint, no skip en canvas split                |
| **Resultado**   | ❌ Usuario: mismo bug                                                                                                 |
| **Aprendizaje** | Necesario pero no suficiente; en WebKitGTK el renderer operativo puede ser DOM, no canvas                             |

Detalle: [05-regression-git-forensics-38453a6.md](./05-regression-git-forensics-38453a6.md)

---

### Iteración 2 — Cerrar fuga canvas en WebKitGTK

|                 |                                                                                                          |
| --------------- | -------------------------------------------------------------------------------------------------------- |
| **Hipótesis**   | Splits seguían en `xterm-canvas` aunque single-panel ya era DOM                                          |
| **Cambio**      | `terminalRendererCapabilities.js`: `avoidGpuFallback`; `terminalRendererPreferences.js`: demote `canvas` |
| **Resultado**   | ❌ Usuario: mismo bug                                                                                    |
| **Aprendizaje** | Confirma que **ya estábamos en DOM**; las rayitas no vienen del atlas canvas                             |

---

### Iteración 3 — Quitar overrides CSS DOM (Jun-07/09)

|                 |                                                                                                                   |
| --------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Hipótesis**   | `geometricPrecision`, `overflow:hidden` en rows, `inline-block` spans añadidos en Jun-09                          |
| **Cambio**      | `globals.css`: eliminados esos overrides                                                                          |
| **Resultado**   | ❌ Usuario: mismo bug                                                                                             |
| **Aprendizaje** | CSS era un factor pero no el único; el síntoma de **filas corridas horizontalmente** encaja más con resize/reflow |

---

### Iteración 4 — Congelar viewport DOM en TUI + métricas enteras _(en curso)_

|                 |                                                                                                                                                                                                                                                                                                                                        |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hipótesis**   | Alt-tab / workspace switch dispara `fitAndResize`×2 sobre TUI Ink en alternate screen → buffer desincronizado fila a fila                                                                                                                                                                                                              |
| **Cambio**      | `TerminalTTY.jsx`: `shouldFreezeDomViewportOnAppResume`, `shouldFreezeDomViewportOnWorkspaceShow`; skip fit en reactivate si TUI+grid OK; PTY nudge en su lugar; no `scrollToBottom` en TUI. `TerminalThemeSync.js`: `lineHeight:1`, `letterSpacing:0` en WebKitGTK. `globals.css`: quitar `width:100%` en `.xterm-rows` solo para DOM |
| **Resultado**   | ⏳ Pendiente verificación usuario                                                                                                                                                                                                                                                                                                      |
| **Aprendizaje** | Paridad con la política que ya tenía WebGL single-panel (`shouldFreezeSingleWebglViewportOnWorkspaceShow`)                                                                                                                                                                                                                             |

---

## Archivos tocados por iteración (solo terminal/vista)

| Archivo                                                   | Iter 1 | Iter 2 | Iter 3 | Iter 4 |
| --------------------------------------------------------- | ------ | ------ | ------ | ------ |
| `src/components/TerminalTTY.jsx`                          | ✓      | ✓      |        | ✓      |
| `src/components/terminal/terminalRendererCapabilities.js` |        | ✓      |        |        |
| `src/components/terminal/terminalRendererPreferences.js`  |        | ✓      |        |        |
| `src/app/globals.css`                                     |        |        | ✓      | ✓      |
| `src/components/terminal/TerminalThemeSync.js`            |        |        |        | ✓      |

**No revisados** (83 archivos / 42k líneas del diff global): fuera de alcance salvo que iteración 4 falle.

---

## Cómo verificar cada iteración

```bash
# 1. Levantar con cambios cargados (no el .deb viejo)
cd /home/matias/ArxonLabs/devhub
pnpm run tauri:dev

# 2. Reproducir
#    - 2 paneles OpenCode/Kimi (Avery + Cameron)
#    - cambiar tab de workspace
#    - alt-tab fuera de DevHub y volver
#    - cambiar foco entre paneles

# 3. Log — buscar renderer y freeze DOM
tail -f data/logs/terminal-debug.log | rg 'operationalRendererMode|frozen-dom-tui|reactivate'
```

**Esperado tras iteración 4:**

- `operationalRendererMode: xterm` (DOM)
- En alt-tab con TUI activo: `reactivate-frozen-dom-tui` o `frozen-dom-tui` (no resize)
- Sin bandas horizontales en el arte dot-matrix

---

## Si iteración 4 también falla — cola de hipótesis

1. **Replay de output oculto** (`hiddenOutputCatchup`) escribiendo ANSI stale tras show → forzar discard siempre en TUI activo.
2. **`top/left/right/bottom: 0` en `.xterm-screen`** (Jun-09) → probar quitar anclaje absoluto en DOM.
3. **Re-habilitar canvas en splits** pero solo con atlas clear agresivo (volver a `eea5c55` + fixes iter 1) si WebKitGTK tolera canvas mejor que DOM corrupto por resize.
4. **Instrumentación runtime**: loguear `cols/rows` antes/después de cada `fitAndResize` en reproducción manual.

---

## Comandos forense útiles (scope acotado)

```bash
# Solo archivos terminal/vista — NO los 83 del diff global
git log --oneline ea0f2b0..HEAD -- \
  src/components/TerminalTTY.jsx \
  src/app/globals.css \
  src/components/terminal/TerminalThemeSync.js \
  src/components/terminal/terminalRendererCapabilities.js

git blame -L 1140,1250 src/app/globals.css   # zona .devhub-xterm
git show eea5c55 --stat                         # commit "restore canvas for DOM seams"
```
