# TERM-01 — Evidence pack y protocolo de terminal renderer

**Estado:** implementado para baseline xterm + protocolo manual reproducible.
**Fecha:** 2026-05-15 (revisión: 2026-06-07 — default baseline actualizado a xterm-webgl, soft roll-out).
**Scope:** TERM-01 únicamente. No inicia TERM-02.

## Decisión

- **xterm-webgl is the default renderer** desde 2026-06-07 para fresh users y nuevos paneles sin preferencia almacenada. El flip del default respeta el soft roll-out: stored `vte-experimental` se preserva; no se sobreescribe la preferencia del usuario en primer load.
- **xterm (DOM) remains the baseline** estable y queda como **fallback** explícito para cualquier investigación posterior, incluyendo escenarios donde xterm-webgl no está disponible (WebView sin WebGL, addon registration failure, context lost).
- **vte-experimental (GTK/VTE)** queda como **opt-in** para Linux/Tauri operators que prefieran el runtime nativo; no es el default.
- La rama `checkpoint/terminal-experiments-2026-05-14` queda como **reference material only**: útil para specs e ideas, NO para merge directo en esta tarea.

## Qué entrega TERM-01

1. Protocolo reproducible para comparar **dev web**, **tauri dev** e **installed app**.
2. Diagnósticos livianos en cliente/servidor para resize, repaint, reactivación y reconnect.
3. Criterio operativo para juntar evidencia sin meter ruido ni tocar arquitectura nativa.

## Antes de probar

**Close all DevHub instances first.**

Motivo: el renderer y el servidor PTY usan puertos/estado local y procesos previos pueden dejar sockets viejos, sesiones restauradas o logs mezclados. Si arrancás con instancias previas abiertas, la evidencia queda contaminada y no sabés si el bug viene del renderer actual o de estado residual.

### Limpieza recomendada

1. Cerrá TODAS las ventanas de DevHub (browser, `tauri dev`, app instalada).
2. Matá procesos viejos si quedaron colgados.
3. Si querés evidencia limpia, borrá o renombrá `data/logs/terminal-debug.log` antes de arrancar una nueva pasada.

## Protocolo reproducible

### A. dev web

```bash
npm run dev
```

Abrí `http://localhost:3100`.

### B. tauri dev

```bash
npm run tauri:dev
```

### C. installed app / manual protocol

No build en esta tarea. Usar la app ya instalada/manual si existe en tu máquina. La comparación esperada es contra la misma secuencia visual del protocolo A/B.

## Escenarios mínimos a registrar

En cada entorno:

1. Abrí un panel terminal nuevo.
2. Esperá prompt visible sin tocar resize manual.
3. Ejecutá output liviano y luego output pesado/TUI si ya lo venís usando.
4. Abrí/cerrá editor o browser panel al costado.
5. Cambiá foco de ventana, volvé, y verificá repaint.
6. Hacé un resize del panel y de la ventana.
7. Si el terminal queda blanco/cortado, probá reconectar desde el botón del panel.

## Qué mirar visualmente

- prompt visible apenas abre;
- contenido no desaparece al volver desde blur/visibility;
- resize recalcula columnas/filas sin artefactos horizontales;
- panel con TUI no queda invisible hasta resize manual;
- reconnect no duplica overlays ni deja el panel muerto;
- editor/browser vecinos no rompen el repaint de la terminal.

## Logs y señales para inspeccionar

Archivo principal:

- `data/logs/terminal-debug.log`

Señales relevantes nuevas:

- `viewport diagnostic` desde cliente;
- `TTY_DIAG` desde servidor;
- `fit-resize`, `fit-skipped`, `resize-observer`, `visibility-visible`, `window-focus`, `pageshow`, `reactivate-settled` como razones de diagnóstico;
- `client-resize` del lado servidor para correlacionar cols/rows/mode/socketCount;
- `PTY_EXIT`, `WS_CONN`, `WS_CLOSE`, `EBADF` si el problema deriva en reconexión o PTY inválido.

## Cómo leer la evidencia

### Si el problema es de layout/render

Vas a ver típicamente:

- `fit-skipped` o `zeroSized: true` antes del repaint correcto;
- luego `fit-resize`/`reactivate-settled` con dimensiones válidas;
- server recibiendo `client-resize` coherente con cols/rows.

### Si el problema es de sesión/transporte

Vas a ver típicamente:

- `WS_CLOSE`, `error`, `EBADF`, `PTY_EXIT`, o socketCount raro;
- reconnect necesario para recuperar;
- cols/rows bien, pero proceso o socket inestable.

## Conclusión TERM-01

- No hay cambio de renderer.
- No se evalúa embedding nativo en esta tarea.
- Queda documentado que **xterm sigue siendo baseline/fallback**, y cualquier rama experimental futura debe probar valor con evidence pack comparable antes de tocar el camino estable.
