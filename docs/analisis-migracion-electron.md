# Análisis exhaustivo: migrar DevHub a Electron

Fecha: 2026-07-18  
Contexto: Option A (optimizar Tauri+Next+Node) ya aterrizada. Este doc evalúa **Electron como host desktop**, no como rewrite del producto.

---

## 1. Por qué mirás Electron (y tenés razón en parte)

Hoy el **navegador nativo embebido en el dock** solo existe en **Linux** (WebKitGTK overlay en `native_browser.rs`). En Windows (y macOS) cada comando Rust responde `unsupported-platform` y la UI cae a **iframe**.

Eso no es “Windows roto”: es **no implementado a propósito**. Hubo un camino WebView2 HWND que se abandonó por thrash/clicks/z-order (Pack D = no en recovery). Electron brilla aquí porque `BrowserView` / `WebContentsView` es el patrón estándar de “Chrome hijo dentro de la ventana” en Windows.

---

## 2. Qué resuelve Electron con claridad

| Necesidad                                     | Hoy (Tauri)                 | Con Electron                                     |
| --------------------------------------------- | --------------------------- | ------------------------------------------------ |
| Browser en dock, Windows                      | iframe / ventana dedicada   | **Sí** — `WebContentsView` child, session propia |
| Bypass `X-Frame-Options`                      | No (iframe)                 | **Sí**                                           |
| Cookies/perfil separados del SPA              | Solo Linux nativo           | **Sí** (partition)                               |
| Multi-terminales (12 paneles, swarm, Pizarra) | Ya funciona (web + sidecar) | **Igual** — no depende del shell                 |
| node-pty / sidecar                            | Ya Node                     | **Igual o más natural** (mismo runtime)          |
| Voz / tray / diálogos                         | Tauri invoke                | Rehacer en `ipcMain`                             |

**Lo que Electron NO resuelve solo:** cold path de xterm, peso de Next standalone, jank WebGL multi-panel. Eso sigue siendo Option A / UI.

---

## 3. Multi-terminales: ¿se mantienen?

**Sí.** El stack es shell-agnostic:

```
UI (React/xterm) → HTTP /api/terminal/session → sidecar node-pty → WebSocket /tty
```

Tauri no mete bytes PTY por IPC. Migrar el host **no obliga** a tocar TWM / TerminalTTY / swarm grid, salvo bridges menores (clipboard imagen, sniff `__TAURI__` para WebGL en Linux).

---

## 4. Browser: ¿lo “resolvemos” de verdad?

**En Windows: sí, es el motivo más sólido para Electron.**

- Mapeo natural: `nativeBrowserBridge.js` → `ipcRenderer` → main crea/posiciona `WebContentsView` sobre el rect del dock.
- Linux: podéis **mantener WebKitGTK vía Tauri** _o_ unificar todo en Chromium embebido (más simple, pierde el backend GTK actual).
- Riesgo real (histórico Pack D): z-order al resize del dock, clicks “tragados”, thrash al show/hide. Electron lo hace mejor que HWND manual, **pero** hay que QA dock + Pizarra + splits igual de duro.

No confundir: el **SPA principal** en Tauri Windows ya usa WebView2. El hueco es el **segundo** web contents _dentro_ del panel.

---

## 5. Qué cambiaría (superficie)

| Capa                            | Qué pasa                               | Tamaño               |
| ------------------------------- | -------------------------------------- | -------------------- |
| Next + APIs + SQLite + MCP      | Se queda                               | —                    |
| Sidecar + node-pty + tty        | Se queda (spawn desde `main`)          | Pequeño              |
| Terminales / swarm / Pizarra UI | Se queda                               | Pequeño (sniffs)     |
| `src-tauri/**` shell            | Se reemplaza por Electron main/preload | Grande               |
| ~23 invokes + ~14 bridges JS    | Adaptadores Electron                   | Medio                |
| Native browser                  | Reimplementar con WebContentsView      | **Grande / crítico** |
| Voice (Python)                  | Re-bind spawn/events                   | Medio                |
| Packaging NSIS/deb              | electron-builder + mismos resources    | Medio                |
| `standalone.zip`                | Se mantiene; otra ruta de extract      | Pequeño              |

Acoplamiento Tauri concentrado: titlebar, dialogs, notify, clipboard, voice, native browser, multi-window, sidecar spawn, tray/single-instance.

---

## 6. Peso del instalador y “¿más rápido?”

|             | Tauri hoy (aprox.)                            | Electron típico                                    |
| ----------- | --------------------------------------------- | -------------------------------------------------- |
| Runtime UI  | WebView2 del sistema (Win) / WK / WebKitGTK   | **Chromium completo** embebido (~80–150 MB+)       |
| NSIS DevHub | ~63 MB (baseline Option A)                    | Esperable **~120–200 MB+** con Next zip + Chromium |
| Zip Next    | ~443 MB hoy; ~200 MB unpacked tras prune junk | Igual (independiente del shell)                    |

**Peso mayor: OK si lo aceptás.**  
**Más rápido: no es automático.**

- Startup frío Electron suele ser **peor o igual** que Tauri (carga Chromium).
- Donde sí puede sentirse más rápido: **browser dock en Windows** (iframe → Chromium real), DevTools, sitios que rompen iframe.
- Terminales: mismo xterm + mismo sidecar → **mismo TTI** salvo que unifiques procesos y reduzcas hops (opción aparte).

Si el dolor #1 es cold Terminales (~13 s import xterm en sample), Electron **no** es el atajo. Si el dolor #1 es **browser usable en Windows**, Electron **sí** es candidato fuerte.

---

## 7. Beneficios vs costos

### Beneficios

1. Browser nativo **Windows-first** (y macOS) sin pelear WebView2 HWND en Rust.
2. Un solo mundo JS en desktop (main + preload + renderer); bridges más idiomáticos.
3. Ecosystem maduro: `BrowserView`/`WebContentsView`, partitions, `webContents.session`.
4. Sidecar/node-pty: spawn trivial desde main (sin `externalBin` Tauri).
5. Robustez percibida en “app con browser embebido” (VS Code, Slack, etc. validan el patrón).

### Costos / riesgos

1. Reescribir shell Tauri (tray, single-instance, recovery de ventanas, extract zip).
2. Instaler más gordo; updates más pesados.
3. Perder el overlay WebKitGTK Linux (o mantener dos backends).
4. RAM típica más alta (Chromium).
5. Pack D history: embed browser + dock resize sigue siendo QA de producto, no “gratis”.
6. Dual maintain temporal si coexisten Tauri y Electron.

---

## 8. Estimación de tiempo (equipo 1–2 personas, producto usable)

Supuestos: se **conserva** Next + sidecar + multi-terminal; se **reemplaza** el host; browser dock es P0 en Windows.

| Fase                      | Alcance                                                                                                        | Calendario      |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------- |
| **E0 — Spike**            | Main mínimo: carga UI (dev URL o file), spawn sidecar, 1 terminal OK, 1 `WebContentsView` en rect fijo         | **1–2 semanas** |
| **E1 — Shell parity**     | Tray, single-instance, titlebar, dialogs, notify, clipboard, extract `standalone.zip`, NSIS smoke              | **2–3 semanas** |
| **E2 — Browser dock**     | Bridge completo (open/load/resize/focus/visibility/close), partitions, Pizarra + right dock, QA z-order/clicks | **3–5 semanas** |
| **E3 — Voice + ventanas** | Voice IPC, `WebviewWindow` → `BrowserWindow` extras, Linux smoke                                               | **2–3 semanas** |
| **E4 — Hardening**        | Updates, crash recovery, perf cold, regresión swarm/multi-split, docs empaquetado                              | **2–3 semanas** |

**Total realista a “Electron es el host principal en Windows”:** **~10–16 semanas** (2.5–4 meses).  
**MVP “demo browser + terminales”:** **~3–5 semanas**.  
**Paridad total con Tauri Linux+voz+Pizarra:** hacia el **techo** del rango.

No incluye portar APIs Next ni reescribir TWM.

---

## 9. Alternativas más baratas (si el único dolor es browser Windows)

Antes de 3–4 meses de Electron, comparar:

| Alternativa                                       | Esfuerzo                        | Resultado                           |
| ------------------------------------------------- | ------------------------------- | ----------------------------------- |
| **A1. WebView2 child de nuevo (Pack D)** en Tauri | 3–6 semanas, alto riesgo thrash | Browser nativo sin cambiar shell    |
| **A2. Solo `WebviewWindow` dedicada** (ya existe) | Días                            | Browser “nativo” pero no en el dock |
| **A3. Electron solo para browser helper**         | Raro / frágil                   | No recomendado                      |
| **E. Electron host completo**                     | 10–16 semanas                   | Browser dock + unifica runtime      |

Si Pack D volvió a doler (HWND), Electron es la vía “pagar el rewrite del shell a cambio de un embed estable”.

---

## 10. Veredicto

- **Multi-terminales:** se conservan; no son el motivo de migrar.
- **Browser Windows:** **sí** es el argumento fuerte de Electron; el GTK Linux **no** se porta a Windows — por eso iframe hoy.
- **Peso:** sube; aceptable si priorizás browser.
- **Velocidad global app:** no esperes milagro en cold Terminales; sí mejor UX de browser.
- **Option A sigue válida** para zip/xterm/pool; Electron es **otro eje** (host + browser), no un sustituto de A.

**Recomendación operativa:**

1. Terminar de materializar Option A (`npm run build` con prune).
2. Spike E0 de 1–2 semanas **solo** si el browser dock en Windows es P0 de producto.
3. No migrar “porque Electron es más robusto” en abstracto — migrar porque **necesitás WebContents hijo en Windows** y rechazás reabrir Pack D en Tauri.
