# Causa 3 — WebKitGTK: terminales montadas off-screen al entrar al proyecto

## Problema

`WorkspaceLayout` (`src/App.js`) monta `TerminalWorkspacesManager` (TWM) para **todo** el workspace del proyecto, no solo en la ruta `/terminales`. La capa de terminales usa `display: none` cuando no estás en Terminales, pero el componente React **sí se montaba** y ejecutaba:

- startup restore de sesiones OpenCode / PTY
- sincronización de layout con native VTE (Tauri)
- instanciación de xterm / addons WebGL

En **WebKitGTK empaquetado** (Tauri Linux), levantar GPU + WebSockets PTY en un contenedor oculto suele **crashear o matar la WebView** → pantalla **"This page couldn't load"** justo al entrar al proyecto (ruta default: dashboard).

El hub no sufría esto porque **no monta TWM**.

## Síntomas

- Tras arreglar puerto 3400 y SQLite, a veces **dashboard aún fallaba** al abrir proyecto
- Logs sidecar: sesiones PTY `p9364`, `p9365` creadas **sin** que el usuario hubiera abierto Terminales
- `DevHub.log`: actividad PTY/WS al entrar al workspace

## Cómo se detectó

1. Comparar flujo hub (OK) vs `WorkspaceLayout` (falla).
2. Ver en `App.js` que TWM vive dentro de `[data-terminal-container]` con `display: isTerminalRoute ? 'block' : 'none'`.
3. Confirmar en `TerminalWorkspacesManager.jsx` que startup restore corría sin gate de visibilidad (fix previo).

## Corrección (primera ola — dashboard)

**`TerminalWorkspacesManager.jsx`:**

- Early return **dormant** cuando `!isVisible`:

  ```jsx
  <div data-terminal-manager-dormant hidden aria-hidden="true" />
  ```

- `startup restore` y `notifyNativeLayoutSettled` gated con `isVisible`
- Comentario `ponytail:` explicando el techo WebKitGTK

**`next.config.js`:**

- Rewrites `beforeFiles`: `/hub` y `/project/:path*` → `/` para que rutas sin `#` sigan sirviendo el shell SPA (red de seguridad HashRouter)

## Limitación de la primera ola

El early return dormant está **después de todos los hooks** de TWM (~7000 líneas). Eso redujo el crash al entrar pero **no eliminó** el costo de montar el componente en rutas no-terminal → ver [04-swarm-y-terminales-tras-dashboard.md](./04-swarm-y-terminales-tras-dashboard.md).

## Archivos

- `src/components/TerminalWorkspacesManager.jsx`
- `src/App.js` (layout terminal container)
- `next.config.js`
