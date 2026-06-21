# Causa 4 — Swarm y Terminales tras arreglar dashboard

## Problema

Tras la primera ola (Causa 3), el usuario reportó:

- **Dashboard OK**
- **Terminales** → mismo "This page couldn't load"
- **Swarm Control** → mismo error
- Posiblemente otras rutas del sidebar

Dos mecanismos distintos, mismo síntoma visual.

### 4a — Terminales: `xterm-webgl` en WebKitGTK

Al navegar a `/project/:id/terminales`, `isVisible=true` y TWM montaba el grid completo con renderer por defecto **`xterm-webgl`**. WebKitGTK en `.deb` a menudo **crashea el proceso WebView** al registrar el addon WebGL, aunque `probeWebglSupport()` pase en un canvas off-screen aislado.

### 4b — Swarm (y rutas pesadas): TWM aún montado en memoria

Aunque `isVisible=false`, React **seguía montando** `TerminalWorkspacesManager` en dashboard, swarm, tareas, etc. (solo retornaba el div dormant tras ejecutar todos los hooks). Swarm Control añade:

- fetch a `/api/agenthub/operations/health`
- `EventSource` a `/api/agenthub/sessions/stream`
- árbol grande de control-room

La combinación memoria + hooks TWM + montaje Swarm podía tumbar WebKit.

**Nota:** Las APIs respondían 200 en curl; el fallo era **client-side / WebView**, no Next colgado.

## Síntomas

- Dashboard estable
- Click sidebar → Terminales o Swarm → pantalla WebKit error
- `curl` a `:3400` y `/api/agenthub/operations/health` → OK
- Logs pueden mostrar PTY solo al abrir Terminales (esperado post-fix parcial)

## Corrección (segunda ola)

### Montar TWM solo en ruta Terminales

**`src/App.js`:**

```jsx
{project && isTerminalRoute ? (
  <OperatorActionsDispatchProvider>
    <TerminalWorkspacesManager cwd={...} isVisible projectId={...} />
  </OperatorActionsDispatchProvider>
) : null}
```

Fuera de `/terminales`, TWM **no existe** en el árbol React → cero hooks, cero PTY, cero WebGL.

### Renderer seguro en Tauri Linux

**`src/components/terminal/terminalRendererPreferences.js`:**

- `shouldAvoidWebglOnThisRuntime()` — true si `window.__TAURI_INTERNALS__` + Linux
- `getRuntimeDefaultTerminalRendererMode()` → `'xterm'`
- `readTerminalRendererDefaultModeSetting` y `resolveRequestedRenderer` **demueven** `xterm-webgl` → `xterm`

Test: `terminalRendererPreferences.test.js` — `demotes xterm-webgl to xterm on packaged Tauri Linux`.

### Montaje diferido (paint first)

**TWM:** estado `heavySurfacesReady` — 2× `requestAnimationFrame` antes del grid; placeholder `data-terminal-manager-booting`.

**SwarmControl:** estado `surfaceReady` — mismo patrón; SSE y `loadSnapshot` gated hasta `surfaceReady`.

## Diagnóstico diferencial rápido

| Pregunta | Terminales (4a) | Swarm (4b) |
|----------|-----------------|------------|
| ¿Ruta? | `/terminales` | `/swarm` |
| ¿TWM montado? | Sí, visible | No (post-fix) |
| ¿WebGL en logs? | Sí / crash GPU | No |
| ¿API health OK? | Sí | Sí |
| Fix clave | DOM renderer + defer | Unmount TWM + defer Swarm |

## Archivos

- `src/App.js`
- `src/components/TerminalWorkspacesManager.jsx`
- `src/components/terminal/terminalRendererPreferences.js`
- `src/views/SwarmControl.jsx`
- `src/components/__tests__/terminalRendererPreferences.test.js`
