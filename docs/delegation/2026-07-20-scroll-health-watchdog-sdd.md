# SDD: scroll-health-watchdog — Fase 1: detección genérica de scroll muerto

**Fecha:** 2026-07-20
**Alcance de ESTE documento:** solo Fase 1 (detección + reporte, SIN recuperación automática).
Las fases 2-4 (escalera N0-N4, proactivo, agy en router) vendrán después, tras validar la
detección en uso real. NO las implementes aquí.

Repo: `D:/devhub`. NO hagas git commit/push. Cambios mínimos y quirúrgicos.

---

## 1. Contexto

El scroll de las terminales se rompe por causas diversas (cold start, Ctrl+R, cambio de panel,
overlays invisibles que interceptan eventos — p.ej. el modal del asistente Zed). Muchos casos se
han corregido uno a uno; lo que falta es una **red genérica** que detecte "el scroll no funciona"
**sin conocer la causa de antemano**, y que deje diagnóstico suficiente para identificar causas
nuevas. Esta fase construye SOLO esa detección + reporte.

**Principio rector: detectar por efecto, no por causa.**

## 2. El invariante

> Un wheel sobre el área de un panel de terminal debe producir, en ≤300ms, al menos UN efecto:
> (a) movimiento del scrollback (`viewportY`), (b) un write al PTY con SGR wheel, o
> (c) procesamiento por el handler de wheel existente. Si NINGUNO ocurre → "evento muerto".

**3 eventos muertos consecutivos → panel en estado `scroll-broken`.** Un wheel sano resetea el
contador. Al salir del estado → `scroll-recovered`.

### Excepciones legítimas (NO cuentan como fallo)

- Wheel hacia arriba con `viewportY === 0`, o hacia abajo estando ya en el fondo (shell).
- Panel inactivo u oculto.
- Interceptor VISIBLE y legítimo: si `document.elementFromPoint(x, y)` en las coords del wheel
  devuelve un elemento visible FUERA del área del terminal (modal real, popover abierto), el
  bloqueo es intencional → no cuenta (pero se registra en el snapshot).

## 3. Componente a crear: `src/components/terminal/utils/scrollHealthMonitor.js`

Factory `createScrollHealthMonitor(panelId, deps)` — pura, testeable con timers/fakes inyectados,
mismo patrón que `src/components/terminal/utils/panelActivityTracker.js` (inyección de
`now`/`setTimeout`/`clearTimeout`).

API mínima:

- `attach(container)` / `detach()` — añade/quita el listener `wheel` en **capture phase** sobre el
  contenedor del panel. CRÍTICO que sea capture: debe ver TODOS los wheel sobre el área del panel,
  **incluso los que un overlay se traga antes de que lleguen al handler existente**. No debe
  llamar `preventDefault` ni `stopPropagation` — solo observa.
- `onWheelHandlerProcessed()` — llamado por el router cuando su handler procesa un wheel (ver §4).
- `onPtyWheelWrite()` — llamado desde el choke point de escritura al PTY (ver §4).
- Internamente por cada wheel capturado:
  1. Snapshot: `{coords, deltaY, viewportYBefore, topElement}` — `viewportYBefore` vía
     `getTerminalViewportScrollOffset(term)` (existe en `TerminalTTY.helpers.js:1175-1179`) y
     `topElement` vía `document.elementFromPoint(clientX, clientY)` (describe tag/clases y si es
     visible: `offsetWidth/offsetHeight > 0` y computed `visibility`/`opacity`).
  2. Aplica excepciones (§2); si es excepción, no cuenta.
  3. `setTimeout(verify, 300)`: al disparar, compara `viewportY` actual vs before, y los contadores
     de `onWheelHandlerProcessed` / `onPtyWheelWrite` vs antes del wheel. Ningún efecto → evento
     muerto (contador++). 3 seguidos → `enterBroken()`.
- Estado: `healthy | broken`. Transiciones reportadas (§5).
- `dispose()` limpia listener y timers.

## 4. Wiring (puntos exactos)

1. **Creación del monitor por panel**: en el wiring de `useTerminalWheelRouter`
   (`src/components/terminal/hooks/useTerminalWheelRouter.js`), donde ya existen el contenedor
   (`viewportShellRef`) y `termRef`. El monitor necesita acceso al `term` actual — inyectar un
   getter. Ciclo de vida: crear con el panel, `dispose()` al desmontar.
2. **`onWheelHandlerProcessed`**: una llamada en `createTerminalWheelHandler`
   (`useTerminalWheelRouter.js:59-328`) cuando el handler efectivamente procesa el evento (cualquier
   path que no sea "return sin efecto").
3. **`onPtyWheelWrite`**: en `sendTerminalPasteInput` (`TerminalTTY.helpers.js:1127-1142`) cuando el
   payload contiene SGR wheel (secuencias `\x1b[<64` o `\x1b[<65`), y en el forward nativo
   (`forwardTerminalWheelToXterm`, `helpers.js:472-499`) cuando el re-dispatch tiene éxito.
   NOTA: no romper la pureza de helpers — pasar el callback por las opciones existentes o un
   registry simple por panel; elegir lo menos invasivo.
4. **NO** tocar la lógica de decisión del router: esta fase solo observa.

## 5. Reporte

Usar el canal existente `logTuiPointerDebug` (`src/components/terminal/utils/tuiPointerDebug.js`,
opt-in con `localStorage.devhubTuiPointerDebug=1`, POST a `/api/terminal/log`). Emitir:

- `scroll-broken` al entrar: incluir panelId y el snapshot del ÚLTIMO evento muerto + los 2
  anteriores si existen: `topElement` (+visible), `mouseTrackingMode`
  (`terminalHasActiveMouseReporting`, `TerminalTTY.helpers.js:428-442`), refs TUI
  (kimi/grok/opencode ready, `tuiSessionActive`), `wsReadyState`, buffer type (normal/alt),
  último path del handler si lo hubo.
- `scroll-recovered` al salir.
- Cada evento muerto individual a nivel debug con su snapshot (para causas nuevas).

## 6. Tests (obligatorios)

`src/components/terminal/utils/__tests__/scrollHealthMonitor.test.js`, con fake timers y
fake term/container/socket:

1. Wheel con scrollback que se mueve → sano, contador en 0.
2. Wheel con write PTY (SGR) → sano.
3. Wheel procesado por handler → sano.
4. Wheel sin ningún efecto ×3 → `scroll-broken`; wheel sano posterior → `scroll-recovered`.
5. Excepciones: wheel arriba con viewportY=0 no cuenta; wheel en panel inactivo no cuenta;
   interceptor visible legítimo no cuenta.
6. Overlay que se traga el evento (dispatch directo sobre otro elemento del contenedor en capture)
   → el monitor LO VE igualmente y lo cuenta si no hay efecto.
7. Reset del contador con wheel sano entre fallos.
8. `dispose()` deja de contar y limpia timers.

Verificación adicional:
- `npx jest src/components/terminal/utils` todo verde (nuevos + existentes).
- Manual: `localStorage.devhubTuiPointerDebug=1`, romper scroll con Ctrl+R y con un overlay
  encima del terminal → aparecen los reportes correctos; uso normal sin falsos positivos.

## 7. Entregable

Archivos creados/modificados, salida de jest, evidencia del manual (qué escenarios se probaron y
qué reportó el monitor), desviaciones y follow-ups. Recuerda: SIN recuperación automática — eso es
Fase 2 con otro documento.
