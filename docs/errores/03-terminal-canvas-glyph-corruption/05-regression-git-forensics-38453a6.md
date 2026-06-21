# 05 — Git forensics: qué commit reintrodujo las rayitas

**Fecha análisis:** 2026-06-21  
**Síntoma:** líneas horizontales en OpenCode/Kimi (canvas splits), footer corrido tras cambiar workspace/ventana.

---

## Metodología

```bash
# Historial terminal desde merge xterm-webgl
git log --oneline ea0f2b0..HEAD -- src/components/TerminalTTY.jsx

# Diff acumulado (1410 líneas netas en TTY)
git diff ea0f2b0..HEAD --stat -- src/components/TerminalTTY.jsx

# Commit sospechoso (split rendering)
git show 38453a6 -- src/components/TerminalTTY.jsx

# Blame fillSlack filas
git blame -L 533,538 src/components/TerminalTTY.jsx
```

---

## Timeline relevante (no revertir — entender)

| Commit         | Fecha      | Qué hizo                                                                        | Relación con rayitas                                                     |
| -------------- | ---------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `ea0f2b0`      | Jun-09     | Merge `feature/terminal-renderer-xterm-webgl` — default webgl, canvas en splits | Introdujo canvas como renderer split; antes no había rayitas en DOM puro |
| `76097c7`      | Jun-09     | Viewport propose: cols `fillSlack:true`, **rows `fillSlack:false`**             | Comportamiento estable pre-regresión                                     |
| `a1a2e48`      | Jun-?      | Freeze single-panel WebGL on workspace switch                                   | OK para 1 panel; splits siguen en canvas                                 |
| `38453a6`      | **Jun-15** | **`fix(terminal,pizarra): sync workspace views and stabilize split rendering`** | **Regresión principal** — ver abajo                                      |
| `abb31a4`      | Jun-17     | Preserve layout across window switches (TWM)                                    | Más superficies vivas al cambiar ventana → más presión sobre canvas      |
| `12435b1`      | Jun-?      | Kimi runtime integration                                                        | No tocó lógica viewport; sí más TUIs en splits                           |
| (packaging 05) | Jun-21     | Tauri Linux → DOM default; TWM unmount                                          | Splits **siguen** en `xterm-canvas` → rayitas persisten                  |

---

## Regresión #1 — `38453a6` filas `fillSlack: true`

**Antes (`76097c7`):**

```javascript
const rows = proposeTerminalAxisDimension({
  available: availH,
  cellSize: cellH,
  minValue: 1,
  fillSlack: false, // algoritmo clip-vs-slack
});
```

**Después (`38453a6`):**

```javascript
fillSlack: true,  // siempre +1 fila si hay slack vertical
```

**Efecto:** el grid lógico gana una fila extra cuya altura **no cabe entera** en el contenedor. Con `overflow:hidden` en el viewport canvas, la última fila se **recorta** → banda horizontal / “rayita” en la parte inferior y footer Ink desalineado.

**Blame:**

```text
38453a66 (2026-06-15) fillSlack: true,  ← filas
76097c7c (2026-06-09) resto de proposeTerminalViewportDimensions
```

**Fix (2026-06-21):** revertir solo filas a `fillSlack: false`; mantener cols en `true`.

---

## Regresión #2 — `38453a6` dejó de limpiar atlas canvas en repaint inactivo

En `scheduleInactiveViewportRepaint` el commit cambió:

|                             | Antes                          | Después (38453a6)             |
| --------------------------- | ------------------------------ | ----------------------------- |
| `fitTerminalViewport`       | `clearAtlas: splitCanvasClear` | `clearAtlas: false`           |
| `stabilizeTerminalRenderer` | siempre con `splitCanvasClear` | **solo si** `geometryChanged` |

Al volver a un workspace **sin cambio de cols/rows**, el atlas canvas quedaba **stale** mientras el PTY seguía escribiendo frames TUI → rayitas horizontales en todo el transcripto.

**Fix (2026-06-21):** restaurar `clearAtlas: splitCanvasClear` en fit + `stabilizeTerminalRenderer` siempre con `splitCanvasClear` en ese path.

---

## Regresión #3 — `38453a6` + `shouldSkipReactivateViewportOnPanelActivation`

Commit añadió skip de recovery cuando GPU attached y grid ya coincide con contenedor.

En splits canvas (`xterm-canvas`, 2+ paneles):

- `hadGpuRenderer === true` → `clearAtlas === false`
- dims unchanged → **skip reactivate** → no refresh atlas al cambiar foco entre Avery/Cameron

**Fix (2026-06-21):**

- Nunca skip en canvas split (`visibleTerminalPanelCount > 1`)
- `clearAtlas: true` forzado en activación de panel canvas split

---

## Lo que NO fue la causa (descartado con diff)

| Cambio                                        | Por qué no explica rayitas solas              |
| --------------------------------------------- | --------------------------------------------- |
| `shouldAvoidWebglOnThisRuntime` (Tauri → DOM) | Solo afecta panel único; splits siguen canvas |
| `canvasReleasedOnLayoutHideRef` (Jun-21)      | Parche incompleto; no revertía 38453a6        |
| TWM dormant / unmount (incidente 05)          | Reduce crash WebView; no arregla atlas split  |
| Kimi marker (`12435b1`)                       | Integración agente; no cambia propose/fit     |

---

## Comandos para re-verificar tras fix

```bash
node --experimental-vm-modules node_modules/jest/bin/jest.js \
  src/components/__tests__/TerminalTTY.test.js \
  -t 'proposeTerminalViewportDimensions|shouldSkipReactivate'

# Manual: 2 paneles OpenCode, cambiar workspace tab, cambiar foco Avery↔Cameron
tail -f data/logs/terminal-debug.log | rg 'canvas-|layout-recover|reactivate'
```

---

## Archivos del fix dirigido (sin revert global)

- `src/components/TerminalTTY.jsx` — fillSlack filas, scheduleInactiveViewportRepaint, shouldSkipReactivate + panel activation
- `src/components/__tests__/TerminalTTY.test.js` — test canvas split no skip

Ver también: [04-rayitas-workspace-switch-2026-06-21.md](./04-rayitas-workspace-switch-2026-06-21.md)

---

## Iteración 2 (2026-06-21): cerrar la fuga de canvas en WebKitGTK

**Síntoma:** tras la iteración 1, el usuario reporta "mismo problema". Las rayitas
siguen. La iteración 1 ajustó el _comportamiento_ del atlas canvas (clearAtlas,
fillSlack, skip), pero **no eliminó la superficie canvas** en este runtime.

**Hallazgo clave (revisión de flujo de modos):**

En WebKitGTK (Tauri/Linux empaquetado) ya decidimos evitar GPU. Pero la decisión
solo estaba aplicada a medias:

1. `resolveRequestedRenderer` degradaba `xterm-webgl → xterm` (solo panel único).
2. `resolveOperationalRendererMode` **seguía** devolviendo `xterm-canvas` para
   splits (≥2 paneles) cuando el modo pedido/efectivo era `xterm-webgl`.
3. `demoteWebglForTauriLinux` **no** degradaba la preferencia literal `'canvas'`.

Resultado: aunque el panel único era DOM, los splits (Avery + Cameron, swarm grid)
seguían montando `xterm-addon-canvas` → atlas de glifos corrupto = rayitas. La causa
no era _cómo_ limpiábamos el atlas, sino que **el atlas canvas existía en absoluto**
sobre un motor (WebKitGTK) donde ya sabíamos que se corrompe.

**Fix (corregir, no restaurar):**

- `resolveOperationalRendererMode({ ..., avoidGpuFallback })`: cuando el runtime
  evita GPU, **nunca** devuelve `xterm-canvas`; todos los paneles quedan en DOM
  (`xterm`). Otras plataformas (macOS/Win) conservan canvas para splits.
- `TerminalTTY.jsx`: pasa `avoidGpuFallback: shouldAvoidWebglOnThisRuntime()`.
- `demoteWebglForTauriLinux`: ahora también degrada `'canvas' → 'xterm'` en este
  runtime, por si una preferencia guardada apunta a canvas directo.

**Por qué esto sí cierra el caso en WebKitGTK:** el renderer DOM no usa atlas de
glifos GPU/2D-canvas, así que no hay costuras posibles entre filas. Es la misma
ruta estable que ya usábamos para panel único; ahora es uniforme.

**Verificación:**

```bash
npm test -- src/components/__tests__/terminalRendererCapabilities.test.js \
  -t 'resolveOperationalRendererMode'
```

> ⚠️ Si el `.deb` instalado es anterior a este cambio, las rayitas persisten porque
> el binario en ejecución aún monta canvas. Hay que reconstruir/reinstalar o probar
> con `pnpm run tauri:dev`. Para confirmar el renderer activo, revisar el log y
> buscar `operationalRendererMode` — debe decir `xterm`, no `xterm-canvas`.

**Archivos:**

- `src/components/terminal/terminalRendererCapabilities.js` — `avoidGpuFallback`
- `src/components/terminal/terminalRendererPreferences.js` — degradar `canvas`
- `src/components/TerminalTTY.jsx` — pasar flag de runtime
- `src/components/__tests__/terminalRendererCapabilities.test.js` — test del flag

---

## Iteración 3 (2026-06-21): la causa REAL — overrides CSS del renderer DOM

**Síntoma:** tras cerrar el canvas (iteración 2) las rayitas **siguen idénticas**.
Eso prueba que el panel ya renderiza en DOM y que las líneas **no son** del atlas
canvas: vienen de la capa de vista (CSS) sobre el renderer DOM de xterm.

**Forense por `git blame` de `src/app/globals.css` (solo zona `.xterm`):**

Entre el **7 y el 9 de junio** commits automáticos "Enjambre AI" inyectaron una pila
de overrides al renderer DOM para pelear "lateral bands / seam curtains":

| Commit                | Fecha  | Regla añadida                                                                                               | Efecto real                                                                                                                |
| --------------------- | ------ | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `f399426d`            | Jun-09 | `text-rendering: geometricPrecision !important`                                                             | glifos en sub-pixel sin snapping → **costura entre filas**                                                                 |
| `f399426d`            | Jun-09 | `.xterm-row { overflow: hidden }`                                                                           | recorta glifo en el borde de cada fila → **línea horizontal**                                                              |
| `eea5c55b`/`f399426d` | Jun-09 | `.xterm-row > span { display:inline-block; vertical-align:top; line-height:inherit; margin-right:-0.04em }` | con `lineHeight:1.1` (fraccionario) cada celda tiene caja de altura fraccionaria → filas no embaldosan parejo → **bandas** |
| `76097c7c`            | Jun-09 | `.xterm-rows { width:100%; min-width:100% }`                                                                | estira grilla (afecta columnas, no filas) — se conserva                                                                    |

Antes de junio el renderer DOM **no tenía** ninguno de estos overrides. Esa es la
regresión que el usuario describía como "antes no las teníamos". Los hacks se
añadieron para esconder costuras del canvas/webgl, pero se aplicaron también al
selector `[data-operational-renderer='xterm']`, contaminando la ruta DOM que es la
única activa en WebKitGTK.

**Fix (corregir, no restaurar):**

- Quitar `text-rendering: geometricPrecision !important` (volver a snapping nativo).
- Quitar `.xterm-row { overflow:hidden; white-space:pre }` (deja de recortar glifos).
- Quitar `.xterm-row > span { display:inline-block; ... margin-right:-0.04em }`
  (deja que xterm posicione filas/celdas con su layout nativo).
- Se conserva `background-color`, tamaños del contenedor/viewport y `font-smoothing`
  (no causan líneas horizontales).

**Por qué esto sí:** el renderer DOM de xterm ya posiciona filas con precisión; los
overrides fraccionarios eran la fuente del descuadre. Canvas/WebGL ocultan estas
filas con `visibility:hidden`, así que el cambio solo toca la ruta DOM (la de Linux).

**Archivos:**

- `src/app/globals.css` — eliminados los overrides DOM de Jun-07/09

Ver [06-bitacora-intentos-rayitas.md](./06-bitacora-intentos-rayitas.md) para la bitácora completa.

---

## Iteración 4 (2026-06-21): congelar viewport DOM en TUI + métricas enteras

**Síntoma:** iteraciones 1–3 no cerraron el bug. Capturas muestran **filas desplazadas
horizontalmente** (no solo costuras finas) → corrupción por `fitAndResize` al alt-tab.

**Hallazgo:** existía `shouldFreezeSingleWebglViewportOnWorkspaceShow` para WebGL, pero
**nada equivalente para DOM + TUI activo**. Cada `window-focus` / `visibility-visible`
corría `fitAndResize` dos veces + `scrollToBottom`, corrompiendo alternate-screen Ink.

**Fix:**

- `shouldFreezeDomViewportOnAppResume` / `shouldFreezeDomViewportOnWorkspaceShow`
- `reactivateTerminalViewport`: si TUI+grid OK → PTY nudge + refresh, sin resize
- `shouldSkipReactivateViewportOnPanelActivation`: skip también en DOM+TUI
- `TerminalThemeSync`: `lineHeight:1`, `letterSpacing:0` en WebKitGTK
- `globals.css`: quitar `width:100%` en `.xterm-rows` para modo DOM

**Resultado:** ⏳ pendiente verificación usuario

**Archivos:** `TerminalTTY.jsx`, `TerminalThemeSync.js`, `globals.css`, tests
