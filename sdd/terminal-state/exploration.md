## Exploration: Estado Actual de la Terminal y Siguientes Pasos

### Current State

El ecosistema de terminales de DevHub está compuesto por tres piezas clave:

1. **Frontend (`TerminalTTY.jsx`):** Renderiza la terminal usando `xterm.js` y `xterm-addon-fit`. Se conecta mediante WebSockets a un servidor local, enviando comandos de input y eventos de redimensionamiento (resize).
2. **Frontend Multiplexer (`TerminalWorkspacesManager.jsx`):** Permite organizar las terminales en tabs ("Workspaces") y realizar divisiones horizontales (Split Right) y verticales (Split Down) usando `react-resizable-panels`. Persiste el estado del layout en `localStorage`. Escucha el evento global `devhub:run-agent` para inyectar automáticamente agentes de Gentleman en nuevos paneles.
3. **Backend PTY (`ttyServer.js`):** Instancia procesos nativos de shell con `node-pty` y expone un WebSocket Server. Las sesiones persisten en memoria usando `terminalId` (mapeado desde el ID del panel, como `p1`), lo que permite que al hacer _refresh_ del navegador (F5), el front reconecte a la misma terminal y reciba el historial almacenado en memoria.

### Affected Areas

- `src/lib/terminal/ttyServer.js` — Lógica del WebSocket Server y PTY. No maneja limpieza (graceful shutdown) de procesos huérfanos cuando el proceso padre (Next.js dev server) muere o recarga.
- `src/components/TerminalWorkspacesManager.jsx` — Sistema de layout. Funciona bien y ya implementa persistencia y el bridge UI-Agente (Fase 1 y Fase 3 listados en el `architecture-v2.md`).
- `docs/architecture-v2.md` — Requiere actualización para reflejar que la "Fase 1: Persistencia UI" y "Fase 3: El Puente UI-Agente" ya fueron implementados en el código.

### Approaches

Para mejorar la robustez de este sistema y evitar procesos zombi de `node-pty`:

1. **Implementar Graceful Shutdown del TTY Server**
   - Pros: Evita dejar procesos bash/node huérfanos en la PC del usuario cuando se detiene el servidor de DevHub.
   - Cons: Requiere intervenir el ciclo de vida del servidor (difícil en Next.js, pero manejable con listeners de `process`).
   - Effort: Low

2. **Extraer el TTY Server a un Sidecar Node**
   - Pros: Separa completamente la ejecución de la terminal del proceso de Next.js. El Next.js dev server puede recargar las veces que quiera sin perder/reiniciar los sockets ni matar las terminales.
   - Cons: Mayor complejidad en el arranque (hay que levantar Next.js + el Sidecar).
   - Effort: Medium

### Recommendation

Recomiendo implementar el **Graceful Shutdown del TTY Server (Approach 1)** por el momento para evitar el agotamiento de recursos locales en la máquina del usuario (procesos zombis de node-pty al reiniciar el dev server de Next.js frecuentemente). A largo plazo, el **Approach 2** es ideal para estabilizar la experiencia, pero requiere cambiar la orquestación del proyecto.

Además, se debe actualizar el archivo `docs/architecture-v2.md` para marcar como completadas las tareas de _Fase 1_ y _Fase 3_, ya que el código actual ya cubre persistencia y el puente de eventos `devhub:run-agent`.

### Risks

- Tocar el servidor de WebSockets atado a Next.js puede causar inestabilidad si no se limpian correctamente los listeners de eventos.
- Si se matan los PTY, hay que enviar el evento correcto al frontend para que muestre que el proceso terminó (lo cual ya está parcialmente soportado en `TerminalTTY`).

### Ready for Proposal

Yes. El estado fue analizado y ya existe una recomendación clara para resolver la deuda técnica con los procesos PTY huérfanos y actualizar la documentación de arquitectura.
