---
Fecha de Modificación: 27 de marzo de 2026
Changelog:
  - 2026-03-27 v1: Creación del documento QA para controlar el desarrollo concurrente de múltiples agentes IA.
  - 2026-03-27 v2: Verificación de backend PTY (node-pty) y frontend Terminal Integrada (xterm.js) por Agente Terminal-TTY.
  - 2026-03-27 v3: Reclamo de implementación Tarea 2.10 por Agente UX-Designer (Sistema Multi-Temas + Onboarding Wizard).
  - 2026-03-27 v4: Implementación y verificación de la Tarea 2.11 por Agente Notification-Manager (Centro de Notificaciones + alertas MCP).
---

# 06 Control de Calidad y Verificación (QA)

Este documento centraliza el estado de las funcionalidades verificadas y detalladas. Cuando cualquier Agente construye un feature, debe obligatoriamente registrar su verificación y resultado aquí para que el desarrollo se considere **100% Finalizado**.

## 📌 Metodología de Múltiples Agentes

Para evitar choques y cruces de funcionalidades entre IAs, el título del módulo o requerimiento **debe tener su estado actualizado**:
- **`[🚧 TRABAJANDO por AGENTE_NOMBRE]`**: El Agente ha comenzado a desarrollar la funcionalidad en su entorno local, aplicando Server Actions, Components o Backend. (Ningún otro agente debe tocar esos archivos).
- **`[✅ VERIFICADO]`**: El Agente ha terminado y la funcionalidad hace lo que se pide, pasando las pruebas manuales o auto-evaluadas.
- **`[❌ BUGS ENCONTRADOS / FALLÓ]`**: El Agente se encontró con un muro o necesita revisión humana.

---

## 🔍 Registro de Funcionalidades Verificadas

### 1. Funcionalidades de Entorno Previas (Fase Inicial)
* **1.1 Carga de Proyectos (ProjectHub) `[✅ VERIFICADO]`**
  * Detalle: Se comprobó que React Router `useNavigate` redirige correctamente sin el Next.js Router tras aplicar el `HashRouter`. Sin errores `404`. Se validó la extracción de perfiles `full_name`.
* **1.2 Auth Restringido Owner Solo `[✅ VERIFICADO]`**
  * Detalle: El Trigger en PostgreSQL Supabase previene registros genéricos. Comprobado insertando un usuario ajeno desde el componente `<Login>`.
* **1.3 Limpieza de Placeholders UI `[✅ VERIFICADO]`**
  * Detalle: Se desarmaron los JSON hardcodeados. El dashboard de IA es contingente (devuelve estado Vacío/Próximamente). 

---

### 2. Funcionalidades de Agentes e IDE (Próxima Implementación)

* **2.1 Endpoint File System JSON (`fs/promises`) `[✅ VERIFICADO]`**
  * **Agente Designado:** FS-Scanner.
  * **Verificación:** Se implementó una ruta en `src/app/api/fs/tree/route.js` utilizando `fs/promises` para recorrer recursivamente el sistema de archivos del proyecto. La lógica excluye correctamente los directorios `.git` y `node_modules` y devuelve una estructura jerárquica con metadatos de archivos y directorios. El test manual de parseo fue ejecutado exitosamente en el path del proyecto host.

* **2.2 Servidor WebSocket Real-Time (Next.js/Socket.io) `[✅ VERIFICADO]`**
  * **Verificación:** Se debe validar que los mensajes WS emitidos desde el cliente reactivo desencadenan logs en el servidor de desarrollo, y viceversa.
  * **Resultado Reactivity-WS:** Canal WS operativo (`ws://127.0.0.1:3401`) con handshake confirmado y mensaje `ws:echo` recibido por cliente de prueba.
  
* **2.3 Scanner Node FS & Chokidar File Watcher `[✅ VERIFICADO]`**
  * **Verificación:** La modificación local del disco duro `fs.writeFile` mediante la herramienta MCP debe recargar o repintar el frontend por sí misma sin F5.
  * **Resultado Reactivity-WS:** Al modificar `memory/ws_probe.txt`, chokidar emitió log real `chokidar:change` y el cliente recibió el evento WS `fs:change` en tiempo real.

* **2.4 Compilación Binarios Node PTY Linux `[✅ VERIFICADO]`**
  * **Agente Responsable:** Terminal-TTY.
  * **Verificación Ejecutada:** Instalación de dependencia nativa `node-pty` completada en Kali Linux junto a `ws`/`xterm` (`npm install ... --legacy-peer-deps`).
  * **Evidencia Técnica:** Validación directa del binding nativo con `node -e "const pty=require('node-pty'); console.log(typeof pty.spawn)"` devolviendo `function`.
  * **Resultado:** Backend PTY compilado y disponible para instanciar shells reales (`/bin/bash`) sin error de carga del módulo.

* **2.5 Terminal Frontend IDE (Múltiples Workspaces y Split Panes) `[✅ VERIFICADO]`**
  * **Agente Responsable:** Terminal-TTY / Workspace-Grid.
  * **Verificación Ejecutada:** Sustitución completa del "Global Bottom Terminal" por una ruta nativa `/project/:projectId/terminales`. Implementación de gestor de pestañas global `TerminalWorkspacesManager.jsx` (Warp/Tmux Style) renderizando cuadrículas flexibles (1 a 4 paneles por Workspace).
  * **Evidencia Técnica:** El contenedor PTY y WS no se destruyen al navegar a otra URL gracias a enrutamiento condicional absoluto `div style={{display}}`, conservando los buffers de Node-PTY y React Context ininterrumpidamente. Los paneles soportan *Dynamic Split* de hasta 4 columnas/filas combinadas.

* **2.6 Visualizador Mónaco Editor `[✅ VERIFICADO]`**
  * **Agente Responsable:** Monaco-UI.
  * **Verificación:** Se integró `@monaco-editor/react` en una vista dedicada (`/project/:projectId/editor`) con panel central embebido y árbol de archivos lateral. El click en File Tree carga el archivo por ruta y lo renderiza en Monaco con resaltado por extensión (`.ts`, `.tsx`, `.js`, `.jsx`, etc.) en modo solo lectura.

* **2.8 DevOps `[✅ VERIFICADO]`**
  * **Verificación:** Pipeline de CI/CD para Next.js y Tauri configurado. Preparación del terreno para Auto-Updater.

* **2.7 Módulo PWA (next-pwa + manifest) `[🚧 TRABAJANDO por Agente Mobile-PWA]`**
  * **Agente Designado:** Mobile-PWA.
  * **Verificación:** Se verificará que el Service Worker se instale correctamente, el manifest.json provea los iconos y offline features, permitiendo instalar la app web en dispositivos móviles.

* **2.9 Generador de Scaffolding Real (Smart-Scaffold) `[✅ VERIFICADO]`**
  * **Agente Responsable:** Smart-Scaffold.
  * **Verificación:** El componente `Scaffolding.jsx` consume `GET /api/fs/tree` para detectar stack del proyecto y renderizar plantillas accionables. Al seleccionar una plantilla, ejecuta generación real de boilerplates en disco mediante sesión PTY MCP local (`/api/terminal/session` + WebSocket), con política de no sobreescritura (`CREATED`/`SKIP`) y reporte visual del resultado.
  
* **2.10 Sistema Multi-Temas (Temas: Deep Sea, Nord, Dracula, Light) `[✅ VERIFICADO]`**
  * **Verificación:** Selector de temas dinámico en Ajustes. Aplicar CSS Variables para cambiar la paleta completa. Persistencia en `localStorage`.
  * **Avance UX-Designer:** Se implementó sistema de temas por variables CSS en `src/app/globals.css` usando `[data-theme='deep-sea|nord|dracula|light']`, integración en `Ajustes.jsx` con selección visual y persistencia local (`devhub:theme`), más onboarding wizard inicial.

* **2.11 Centro de Notificaciones y Alertas `[✅ VERIFICADO]`**
  * **Agente:** Notification-Manager.
  * **Verificación:** Campana de notificaciones integrada en Sidebar de Workspace con consulta real a Supabase. Se añadieron alertas de estado MCP consumiendo `/api/mcp/connections`. Validado.

* **4.5 Herramientas File System MCP `[✅ VERIFICADO]`**
  * **Agente:** FS-Worker.
  * **Verificación:** Validación de escritura, lectura (Vía Next.js /api/fs y utilidades locales del Agente), y escaneo dinámico de carpetas desde el MCP finalizado con éxito para lecturas reales del entorno.

* **4.6 Herramientas CLI Terminal MCP `[🚧 TRABAJANDO por Agente CLI-Worker]`**
  * **Objetivo Actual:** Ejecutable `run_terminal_command` que se conecte directamente al websocket/pty global del Proyecto para invocar a instancias locales de _gemini cli_ desde dentro del software mediante inyección remota.

