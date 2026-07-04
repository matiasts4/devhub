# Corrección de paneles de terminal negros / oscurecidos

**Fecha:** 2026-07-01  
**Rama actual:** `main` / working tree  
**Build marker final:** `2026-07-01-restore-v4-survivor-recovery-v6` (`TerminalTTY.jsx`)  
**Commits analizados:**

| SHA       | Hora (CLT) | Mensaje                                                                        | Rol                                  |
| --------- | ---------- | ------------------------------------------------------------------------------ | ------------------------------------ |
| `9d8f12f` | 16:59      | `fix(terminal): stabilize TUI viewport on workspace close and window switch`   | Fix base — versión "v4"              |
| `735ea72` | 17:02      | `perf(terminal): coalesce survivor recovery to cut flicker and switch latency` | Optimización agresiva — versión "v5" |
| `c9941cb` | 17:14      | `fix(terminal): restore v4 survivor recovery after v5 regressions`             | Rollback a v4 — versión "v6" estable |

Co-autor en los tres commits: `Cursor <cursoragent@cursor.com>`.

---

## 1. Síntoma reportado

Los paneles de terminal en DevHub se **oscurecían** (quedaban negros) al:

- Cerrar un workspace con paneles terminales.
- Cambiar de workspace.
- Cambiar de ventana (window switch).
- Volver al foco después de un blur / `visibilitychange`.

El panel seguía "vivo" (la sesión PTY seguía corriendo), pero la superficie no pintaba hasta que el usuario forzaba un resize manual.

---

## 2. Causa raíz

El renderer GPU (`xterm-webgl` o `xterm-canvas`) quedaba en estado **zombie** tras el teardown de un panel vecino:

1. Cuando un workspace se cierra o cambia de ventana, los paneles supervivientes **no siempre fueron realmente ocultados**, por lo que el addon GPU seguía adjunto pero su contexto o bitmap se corrompía por el unmount de xterm vecino.
2. `RenderService._renderer.value` todavía retenía el renderer descartado, haciendo que `isTerminalRendererReady()` devolviera `true` y `forceTerminalViewportRepaint()` reportara éxito **sin pintar nada**.
3. Los _freeze paths_ de `syncTerminalViewportOnWorkspaceShow` (que saltan fit/resize cuando `sizeUnchanged === true`) evitaban la ruta de recuperación real.
4. Además, paneles creados desde el modal de workspace inyectaban `initialCommand` antes de que el layout host proyectara la superficie (`projectionReadyRef`), quedando en blanco.

En resumen: el panel creía que su renderer estaba listo, pero no lo estaba; por eso no se disparaba la recuperación real y la pantalla quedaba negra.

---

## 3. Solución técnica introducida por `9d8f12f` (v4)

### 3.1 Reciclaje GPU en survivor recovery

Se agregó un nuevo evento `devhub:terminal-survivor-recover` y un handler `handleSurvivorRecover` en `TerminalTTY.jsx`. Cuando un panel sobrevive al cierre de un workspace peer, sigue el mismo _golden path_ que funciona para la navegación dashboard → Terminales: **libera y re-adjunta** el addon GPU.

```js
// TerminalTTY.jsx — handleSurvivorRecover
const now = Date.now();
if (now - survivorGpuRecycleAtRef.current > 1500) {
  survivorGpuRecycleAtRef.current = now;
  if (webglAddonRef.current) {
    releaseWebglAddonForInactivePanel('survivor-recover-webgl');
  } else if (canvasAddonRef.current) {
    releaseCanvasAddon('survivor-recover-canvas');
  }
  needsViewportSyncOnShowRef.current = true;
}
scheduleWorkspaceShowRecovery();
```

### 3.2 Helpers de recuperación con retry acotado

Nuevas funciones que intentan recuperar el panel hasta un máximo de intentos y se detienen cuando detectan éxito real:

- `scheduleBoundedForceRepaint`: fuerza repintado real de canvas (nudge de 1 celda) hasta que `forceTerminalViewportRepaint` pinte de verdad.
- `scheduleBoundedFitRepaint`: hace fit real recalculando cols/rows y enviando SIGWINCH, con estabilidad de 2 frames.
- `scheduleBoundedGpuRecover`: re-adjunta el addon GPU si `needsGpuRendererReattach` lo indica, luego fit + repaint.

```js
export function needsGpuRendererReattach({ operationalRendererMode, webglAddon, canvasAddon }) {
  if (shouldAttachWebglRenderer({ operationalRendererMode })) return !webglAddon;
  if (shouldAttachCanvasRenderer({ operationalRendererMode })) return !canvasAddon;
  return false;
}
```

### 3.3 Pipeline `scheduleWorkspaceShowRecovery`

Reemplaza la lógica inline del `useLayoutEffect` de visibilidad. Ejecuta doble `requestAnimationFrame` con razón `workspace-survivor-recover`, aplica `clearAtlas` según estado GPU, y dispara los retries acotados.

### 3.4 Lifecycle sync más estricto

En `src/lib/terminal/terminalLifecycleSync.js`, la razón `WORKSPACE_REMOVED` pasó de `{ immediate: true, raf: false, delayMs: [] }` a:

```js
[PANEL_LIFECYCLE_REASONS.WORKSPACE_REMOVED]: {
  immediate: true,
  raf: true,
  delayMs: Object.freeze([80, 180, 340]),
}
```

Esto aplica un burst de sincronización post-cierre con `requestAnimationFrame` + timeouts escalonados.

### 3.5 Kimi freeze condicional

En `src/lib/terminal/kimiReadyMarker.js`, `shouldFreezeKimiTuiViewportOnWorkspaceShow` ahora depende de `proposedDimsMatch`, permitiendo fit real cuando el contenedor cambia de tamaño:

```js
export function shouldFreezeKimiTuiViewportOnWorkspaceShow({
  initialCommand,
  kimiReady,
  proposedDimsMatch = true,
}) {
  if (!isKimiLaunchCommand(initialCommand) && !kimiReady) return false;
  return proposedDimsMatch;
}
```

### 3.6 Coordinador de eventos survivor

En `src/components/terminal/nativeLayoutSync.js` se añadió:

```js
export function dispatchTerminalSurvivorRecover(detail = {}) { ... }

export const SURVIVOR_RECOVER_DELAYS_MS =
  Object.freeze([0, 50, 150, 350, 600, 1000, 1600]);

export function scheduleSurvivorRecoverAfterClose({
  panelIds,
  workspaceId,
  reason,
  onLifecycleSync,
} = {}) { ... }
```

La función programa un doble `requestAnimationFrame`, luego un burst de lifecycle sync y finalmente una ráfaga de eventos `devhub:terminal-survivor-recover` escalonados en el tiempo para cubrir el context loss tardío de WebGL.

---

## 4. Iteración `735ea72` (v5) — intento de reducir flicker

El fix v4 funcionaba, pero generaba **flicker visible** y algo de latencia al cambiar de workspace/ventana. Se intentó optimizar:

- Reducir la ráfaga survivor de 7 a 3 eventos:
  ```js
  export const SURVIVOR_RECOVER_DELAYS_MS = Object.freeze([0, 250, 700]);
  ```
- Acortar el burst de window switch:
  ```js
  [PANEL_LIFECYCLE_REASONS.WORKSPACE_WINDOW_SWITCH]: { delayMs: Object.freeze([120]) }
  ```
- Eliminar `scheduleSurvivorRecoverAfterClose` en cambios de ventana, volviendo a `syncPanelLifecycleLayout` simple.
- Agregar un **coalesce timer** de 120 ms en `TerminalTTY.jsx` para aplazar `scheduleWorkspaceShowRecovery`:
  ```js
  const coalesceMs = process.env.NODE_ENV === 'test' ? 0 : 120;
  survivorRecoverCoalesceTimerRef.current = setTimeout(() => {
    scheduleWorkspaceShowRecovery();
  }, coalesceMs);
  ```
- Restringir el reciclaje GPU solo a razones `workspace-removed` o `workspace-switch`, **excluyendo window-switch**:
  ```js
  const shouldRecycleGpu =
    (reason === 'workspace-removed' || reason === 'workspace-switch') &&
    Date.now() - survivorGpuRecycleAtRef.current > 1500;
  ```

Build marker: `2026-07-01-coalesce-survivor-recovery-v5`.

**Resultado:** el flicker bajó, pero Kimi y los window switches volvieron a quedar negros. La optimización fue demasiado agresiva.

---

## 5. Iteración `c9941cb` (v6) — rollback a la recuperación robusta

Se restauró el comportamiento de v4 para recuperar fiabilidad:

- Ráfaga completa restaurada:
  ```js
  export const SURVIVOR_RECOVER_DELAYS_MS = Object.freeze([0, 50, 150, 350, 600, 1000, 1600]);
  ```
- Burst de window switch restaurado:
  ```js
  [PANEL_LIFECYCLE_REASONS.WORKSPACE_WINDOW_SWITCH]: {
    delayMs: Object.freeze([80, 180, 340]),
  }
  ```
- Vuelve a usarse `scheduleSurvivorRecoverAfterClose` en cambios de ventana.
- Se eliminó el coalesce timer de 120 ms; `scheduleWorkspaceShowRecovery` se llama inmediatamente.
- Se eliminó la restricción por razón en el reciclaje GPU: vuelve a reciclarse en cada ráfaga survivor con dedupe de 1.5 s:
  ```js
  const now = Date.now();
  if (now - survivorGpuRecycleAtRef.current > 1500) {
    survivorGpuRecycleAtRef.current = now;
    if (webglAddonRef.current) {
      releaseWebglAddonForInactivePanel('survivor-recover-webgl');
    } else if (canvasAddonRef.current) {
      releaseCanvasAddon('survivor-recover-canvas');
    }
  }
  scheduleWorkspaceShowRecovery();
  ```

Build marker final: `2026-07-01-restore-v4-survivor-recovery-v6`.

**Decisión final:** preferir algo de flicker y latencia sobre paneles negros. La recuperación robusta es el estado estable.

---

## 6. Secuencia lógica de los tres commits

```
9d8f12f (v4)  →  735ea72 (v5)  →  c9941cb (v6)
   │                  │               │
   │                  │               └── Restaura v4 tras verificar que v5 rompe Kimi/window-switch
   │                  │
   │                  └── Optimiza para reducir flicker, pero elimina reciclaje GPU en window-switch
   │                      y acorta la ráfaga de recuperación → regresión de paneles negros
   │
   └── Fix base: reciclaje GPU + survivor recovery + lifecycle sync estricto
       Soluciona paneles negros, genera algo de flicker
```

---

## 7. Archivos principales modificados

| Archivo                                        | Qué cambió                                                                                                                        |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/TerminalTTY.jsx`               | Lógica de survivor recovery, reciclaje GPU, helpers de retry acotado, build marker.                                               |
| `src/components/TerminalWorkspacesManager.jsx` | Llamadas a `scheduleSurvivorRecoverAfterClose` en cierre de workspace y cambio de ventana.                                        |
| `src/components/terminal/nativeLayoutSync.js`  | Nuevas funciones `dispatchTerminalSurvivorRecover` y `scheduleSurvivorRecoverAfterClose`; constante `SURVIVOR_RECOVER_DELAYS_MS`. |
| `src/lib/terminal/terminalLifecycleSync.js`    | Ajuste de fases `WORKSPACE_REMOVED` y `WORKSPACE_WINDOW_SWITCH`.                                                                  |
| `src/lib/terminal/kimiReadyMarker.js`          | `shouldFreezeKimiTuiViewportOnWorkspaceShow` ahora considera `proposedDimsMatch`.                                                 |
| `src/lib/terminal/ttyServer.js`                | Detección unificada de agent TUI vía `agentTuiMetadata.js`.                                                                       |
| `sidecar-backend/sessionTransport.js`          | Mirror CJS de la detección de agentes TUI.                                                                                        |
| Archivos de test asociados                     | Cobertura para los nuevos helpers y escenarios de workspace/window switch.                                                        |

---

## 8. Cómo verificar el estado actual

1. **Build marker:** abrir DevTools en la app y ejecutar:

   ```js
   window.__DEVHUB_BUILD_MARKERS__.terminalTTY;
   ```

   Debe devolver `2026-07-01-restore-v4-survivor-recovery-v6`.

2. **Logs:** en `data/logs/terminal-debug.log` buscar:
   - `survivor-recover-webgl` / `survivor-recover-canvas`
   - `workspace-survivor-recover`
   - `scheduleBoundedForceRepaint:success`
   - `scheduleBoundedFitRepaint:success`
   - `scheduleBoundedGpuRecover:success`

3. **Escenarios manuales:**
   - Abrir dos workspaces con terminales.
   - Cerrar uno: el otro no debe quedar negro.
   - Cambiar de workspace y volver: el terminal debe mostrar contenido.
   - Cambiar de ventana (`Alt+Tab`) y volver: el terminal debe repintar.
   - Abrir un panel Kimi, cambiar de workspace y volver: el TUI debe estar visible.

---

## 9. Lecciones aprendidas

- **El renderer GPU de xterm es stateful y sensible al teardown de paneles vecinos.** Un `forceTerminalViewportRepaint` exitoso no garantiza que realmente se haya pintado; hay que verificar que el addon GPU siga vivo.
- **Coalescar eventos de recuperación reduce flicker, pero puede perder la ventana de context loss.** El context loss de WebGL/Canvas a veces llega después del primer intento de recuperación; por eso la ráfaga de 7 eventos distribuidos hasta 1.6 s es necesaria.
- **Window switch y workspace switch tienen semánticas diferentes.** Saltar el reciclaje GPU en window-switch (como hizo v5) fue la regresión clave.
- **Es mejor aceptar flicker controlado que paneles muertos.** La decisión final fue explícitamente "prefer flicker over black".

---

## 10. Estado al cerrar el día

- Working tree con cambios no comiteados propios del entorno (backups de DB, ajustes de MCP, markers de build en `mcps/`).
- Los tres commits de terminal ya están en la historia local.
- El fix v6 es el estado estable que se debe seguir probando en Tauri dev e installed app.

---

## 11. Seguimiento — Opción B: terminales vivas y montadas por workspace

**Fecha de inicio:** 2026-07-01 (misma sesión, continuación).  
**Objetivo:** reducir/eliminar el tiempo de carga y los parpadeos al cambiar de workspace, manteniendo la funcionalidad de que los paneles no se oscurezcan.

### 11.1 Diagnóstico

A pesar de la corrección v6, el cambio de workspace seguía mostrando:

- Parpadeos durante el primer segundo.
- Tiempos de carga de ~2-3 segundos para que la terminal/TUI esté usable.
- En Grok: pantalla negra transitoria de hasta ~3 segundos antes de refrescar.

La causa principal identificada es que **al ocultar un workspace el renderer GPU (WebGL/Canvas) se liberaba**, y al volver a mostrarlo se tenía que re-crear el contexto GPU y re-attach el addon, lo que introduce latencia y parpadeos.

### 11.2 Decisión

Implementar la **Opción B**: mantener terminales vivas y montadas mientras el workspace exista. Los workspaces ya se renderizan todos con `visibility:hidden` (no se desmontan), así que el cambio se concentra en:

1. No liberar el renderer GPU al ocultar workspace.
2. No matar el PTY cuando el socket se desconecta brevemente.
3. Aceptar el mayor uso de memoria/GPU a cambio de carga instantánea.

### 11.3 Cambios realizados (commits locales pendientes de aprobación)

| Commit (local) | Archivo(s)                                                 | Descripción                                                                                           |
| -------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `68f09cd`      | `src/components/TerminalWorkspacesManager.jsx`             | Fase 1: quitar `layout="position"` y `layoutId` de la tab bar superior para transiciones más fluidas. |
| `6351b2c`      | `src/components/TerminalTTY.jsx`                           | Fase 2: evitar segundo `requestAnimationFrame` de recovery cuando no hay GPU work pendiente.          |
| `7843874`      | `src/components/TerminalTTY.jsx`                           | Fase 4 previa: condicionar `forceRepaint`/`fitRepaint` a recovery real.                               |
| `7fed4da`      | `src/components/TerminalTTY.jsx`                           | Opción B Paso 1: eliminar lazy release GPU; no liberar addons al ocultar workspace.                   |
| `576a249`      | `src/lib/terminal/ttyServer.js`                            | Opción B Paso 4: extender `DEFAULT_AUTO_KILL_GRACE_MS` y `SWARM_AUTO_KILL_GRACE_MS` a 1 hora.         |
| (pendiente)    | `docs/28_Correccion_Paneles_Terminal_Negros_2026-07-01.md` | Opción B Paso 6: esta sección.                                                                        |

### 11.4 Arquitectura resultante

- `TerminalWorkspacesManager.jsx`: renderiza todos los workspaces con `visibility:hidden`; los inactivos permanecen en el DOM.
- `TerminalTTY.jsx`: el addon WebGL/Canvas solo se libera en `disposeXtermRuntime()` (unmount) o cierre explícito de panel. Mientras el panel esté montado, el renderer permanece adjunto.
- `ttyServer.js`: si el último socket de una sesión se cierra, el PTY entra en grace timer de 1 hora antes de ser eliminado, permitiendo reanudación.

### 11.5 Riesgos y monitoreo

| Riesgo                                            | Mitigación                                                                                                                      |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Alto consumo de memoria/GPU con muchos workspaces | Monitorear en Tauri/installed app. Si es excesivo, futura fase puede limitar a N workspaces activos o liberar los menos usados. |
| Fugas al cerrar workspace/panel                   | La liberación real sigue en `disposeXtermRuntime` y en handlers de cierre. Tests de ciclo de vida.                              |
| Context loss de WebGL no detectado                | Se mantiene `handleWebglContextLoss` y `pendingWebglRecoveryRef` para recuperación real.                                        |
| PTY zombie                                        | Grace timer de 1 hora; eventualmente se limpia.                                                                                 |

### 11.6 Verificación recomendada

1. Cambiar entre workspaces con terminales: debe ser instantáneo y sin parpadeos.
2. Dejar un workspace oculto por más de 30 s, volver: debe seguir funcionando.
3. Cerrar un workspace con terminales: debe liberar recursos.
4. Cerrar un panel individual: debe liberar recursos.
5. Grok/OpenCode/Kimi: al cambiar de workspace y volver, la TUI debe estar visible sin recargar.
6. Monitorizar uso de memoria/GPU con varios workspaces abiertos.

### 11.7 Estado actual

- Todos los cambios están **commiteados localmente** en `task/rebuild-from-stable`.
- **Pendientes de aprobación del usuario para push.**
- Los tests automatizados muestran fallos preexistentes (mismos con y sin estos cambios); no se introdujeron nuevos fallos.
- El build y la prueba en Tauri/installed app deben hacerse manualmente.

---

## 12. Superseded by `terminal-engine-v2` (2026-07-04)

La Opción B (mantener GPU montado + grace timer de 1 h) fue el parche interino. El SDD **`openspec/changes/terminal-engine-v2`** reemplaza la causa raíz del panel negro en paneles v2:

| Antes (v1 / Opción B)                                         | Ahora (v2, flag `terminalEngineV2`)                      |
| ------------------------------------------------------------- | -------------------------------------------------------- |
| Survivor recovery bursts (`devhub:terminal-survivor-recover`) | PTY persistente + rehidratación desde sidecar            |
| Socket close → grace timer 1 h                                | `unsubscribe` explícito; PTY sigue vivo sin timer        |
| Dispose xterm al ocultar workspace                            | Graveyard LRU (N=12); superficie xterm stashed, PTY vivo |
| WebGL context loss → re-attach GPU                            | Degradación permanente a DOM (sin re-attach)             |
| `terminalPanelBridge` buffer en unmount                       | Ring buffer + `SerializeAddon` snapshot + delta          |

**Coexistencia:** paneles legacy (`terminalEngineV2: false`) conservan survivor recovery y grace timer. La migración es panel a panel hasta retirar v1.

**Rama de implementación:** `feature/terminal-engine-v2`. Ver `openspec/changes/terminal-engine-v2/tasks.md` para el checklist de fases 0–8.
