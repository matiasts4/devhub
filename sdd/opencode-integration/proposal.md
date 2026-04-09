## Proposal: OpenCode Integration as Headless MCP/RPC Service

### Intent
Migrar la ejecución de OpenCode en DevHub de sesiones interactivas basadas en terminales TTY (tmux/pty) hacia una comunicación programática punto a punto mediante un servidor headless basado en eventos, utilizando el código fuente de OpenCode clonado localmente (`/opencode`).

### Strategy
Implementaremos la técnica **"Modo Microservicio"**. Modificaremos el monorepo de OpenCode para compilar una versión paralela del ejecutable que inicie un servidor local (WebSocket o SSE). DevHub instanciará este servidor en segundo plano e interactuará enviando instrucciones como JSON y recibiendo un stream estandarizado de eventos de razonamiento, ejecución o necesidad de intervención del usuario.

### Scope
**In Scope:**
- Extracción/desacople de la capa de renderizado terminal (Solid/OpenTUI) en OpenCode.
- Creación de un entrypoint tipo "Server" en OpenCode (`server.ts` o la adaptación del SDK).
- Modificación de la capa de orquestación de Agentes en DevHub (`telegram-bot/services/opencode.js` e interfaces de Agent Launcher).
- Mapeo de estados `[thinking]`, `[tool_execution]`, `[done]`, `[require_approval]` entre OpenCode y la UI/Telegram.

**Out of Scope:**
- Re-escribir el core de LLM de OpenCode.
- Migración forzada del stack de OpenCode de Bun a Node (se mantendrá corriendo en su propio proceso aislado bajo Bun).

### Success Metrics
- DevHub arranca sesiones de OpenCode instantáneamente sin glitches de terminal.
- Todos los eventos de razonamiento pueden ser interceptados y reformateados antes de mostrarlos al usuario en chat.
- Fallos en OpenCode levantan excepciones controladas en DevHub sin dejar procesos zombies de tmux.
