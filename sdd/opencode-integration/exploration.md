## Exploration: Native OpenCode Integration

### Current State
Actualmente, DevHub orquesta OpenCode ejecutándolo como un proceso hijo o dentro de una sesión de tmux (`opencode run` o `opencode --prompt`). Esto es frágil frente a caídas de la TTY, hace compleja la recolección de eventos intermedios (streaming de pasos) y complica la persistencia de las sesiones. OpenCode está incorporado ahora como un monorepo en `/opencode`.

### Affected Areas
- `telegram-bot/services/opencode.js` (o runners similares) — Dejará de crear sesiones tmux.
- `/opencode/packages/opencode/src/index.ts` — Necesitará desacoplar la salida de consola (Solid/OpenTUI) para exponer un emisor de eventos nativo.
- Capa de orquestación de DevHub — Deberá integrarse con `@opencode-ai/sdk` o vía HTTP/RPC.

### Approaches
1. **Integración Directa por Librería (SDK Import)**
   - *Brief:* DevHub importa directamente el motor de OpenCode usando `@opencode-ai/sdk` o el core del monorepo (`packages/opencode/src`).
   - *Pros:* Rendimiento máximo, tipado fuerte, control total de eventos en memoria y acceso directo a la máquina de estados.
   - *Cons:* DevHub y OpenCode comparten el mismo Event Loop; posibles colisiones de dependencias (Node/Bun).
   - *Effort:* High.

2. **Integración vía Servidor RPC/MCP (Microservicio Local)**
   - *Brief:* OpenCode se levanta localmente como un servidor headless que expone eventos por WebSockets, SSE, o como un servidor MCP (Model Context Protocol).
   - *Pros:* Aislamiento de procesos (si explota OpenCode, no explota DevHub), fácil manejo de hilos asíncronos corporativos (swarms), se respeta la arquitectura independiente.
   - *Cons:* Sobrecarga del transporte de red en localhost, necesidad de parsear serializaciones.
   - *Effort:* Medium.

### Recommendation
**Integración vía Servidor RPC/MCP (Microservicio Local).** Es la más robusta porque mantiene las barreras arquitectónicas intactas. Modificar OpenCode para que actúe como un motor de servidor que expone sus estados por streaming elimina la fragilidad del TTY, permitiendo a DevHub mandar prompts y recibir eventos estructurados de forma controlada sin acoplar las dependencias de TS de ambos proyectos.

### Risks
- Divergencia de repositorios: al hacer un fork interno (o clon), mantenerlo actualizado con upstream puede volverse doloroso.
- Compatibilidad del runtime: OpenCode está muy apalancado en `bun` (`bun test`, `bun run`), si DevHub usa `node`, mezclar ambos en modo Librería causará problemas graves.

### Ready for Proposal
Yes.
