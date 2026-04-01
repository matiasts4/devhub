## Exploration: Mejoras al chat de Telegram y manejo de sesiones OpenCode

### Current State
El bot actual (`telegram-bot`) funciona como un proxy entre el celular del usuario y DevHub.
- **Chat Conversacional**: Cuando el usuario envía texto, el bot usa `conversation.js` para concatenar los últimos mensajes y lanza un proceso **nuevo** de `opencode run` usando una sesión temporal de `tmux`.
- **Estado Stateless en OpenCode**: A nivel de proceso, OpenCode no mantiene una sesión viva entre mensajes en la terminal; cada mensaje es una ejecución "one-shot" de `opencode run` (a la cual se le inyecta el historial para simular memoria).
- **Herramientas DevHub Integradas**: El bot consulta SQLite (`db.js`) para ver logs y sesiones, y llama a la API de Next.js (`api.js`) para lanzar agentes (`/spawn`, `/continuar`), leer progreso (`/progreso`) y consultar tareas (`/tareas`).

### Affected Areas
- `telegram-bot/commands/chat.js` — Maneja la entrada de usuario y llama al runner.
- `telegram-bot/services/opencode.js` — Runner que lanza `tmux new-session` por cada interacción.
- `telegram-bot/services/conversation.js` — Mantiene el historial en memoria de Node.

### Approaches para mejorar el manejo de OpenCode

1. **Mantener el modelo actual (One-Shot con inyección de contexto)**
   - Pros: Fácil de mantener, no hay procesos zombis de fondo, el agente siempre arranca "limpio".
   - Cons: OpenCode pierde el contexto del sistema de archivos entre mensajes (si abrió un editor, lo cierra); gasta muchos tokens reenviando todo el historial.
   - Effort: Low (Ya existe).

2. **Procesos persistentes de OpenCode (Sesiones Vivas)**
   - En lugar de lanzar `opencode run` y matarlo, lanzar `opencode` en modo interactivo en una sesión fija de `tmux` y mandarle comandos vía `tmux send-keys`.
   - Pros: Mantendría el estado real del agente (archivos editados, herramientas en uso), sería mucho más rápido al no reiniciar el runtime.
   - Cons: Difícil parsear cuándo el agente terminó de "pensar y responder" versus cuándo está esperando input. Complejidad alta de sincronización.
   - Effort: High.

3. **Uso de Engram/Memoria RAG para contexto en One-Shot**
   - En lugar de mandar el string gigante de la conversación, resetear la sesión de Node seguido, pero hacer que el agente busque contexto en SQLite/Engram al arrancar.
   - Pros: Ahorra tokens, mantiene contexto de cosas viejas (semanas atrás).
   - Cons: Requiere que el agente sea proactivo en buscar.
   - Effort: Medium.

### ¿Cuándo cambiar o mantener sesión de OpenCode?

- **Mantener la misma sesión (historial continuo)**: 
  - Cuando se está iterando sobre un mismo bug o tarea técnica.
  - Cuando las preguntas consecutivas requieren el contexto de lo charlado (ej: "¿Y qué pasa con el archivo auth.js?", "¿Podés agregarle un log a eso?").
  
- **Cambiar/Resetear la sesión (borrar historial)** (`/reset` o `/nueva_sesion`):
  - Cuando se cambia drásticamente de tema o proyecto (ej: de arreglar un bug en la UI a configurar el servidor en Rust). 
  - ¿Por qué? Para limpiar la "ventana de contexto". Si el historial crece mucho, el LLM se marea con instrucciones viejas, pierde atención (attention drop) y consume créditos/APIs innecesariamente.

### Recommendation
Mantener el modo de ejecución "One-Shot con inyección de contexto" actual para el chat estándar, pero educar al usuario (o automatizarlo) para hacer `/reset` al cambiar de tarea. 
Para tareas largas donde el agente deba operar de fondo, usar `/spawn [tarea]` que delega la tarea a un worker asíncrono en DevHub, mientras el bot de Telegram solo observa con `/tareas` o `/progreso`, en lugar de retener todo en el chat.

### Risks
- Si se decide implementar "Sesiones Vivas" (tmux continuo), el bot podría desincronizarse fácilmente al no saber cuándo el agente espera input (como una confirmación `[Y/n]`).
- Bloqueo de hilos: sesiones guardadas muy largas reventarían el token limit si no se truncan bien en `conversation.js`.

### Ready for Proposal
Yes. La arquitectura actual es robusta pero el problema es conceptual: definir las pautas de uso para no gastar tokens innecesarios ni marear al agente.
