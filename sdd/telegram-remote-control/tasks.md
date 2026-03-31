# Tasks: Control Remoto por Telegram

## Fase 1: Infraestructura Base

### T1.1: Crear estructura del proyecto `telegram-bot/`

- [ ] Crear directorio `telegram-bot/`
- [ ] Crear `package.json` con dependencias (`node-telegram-bot-api`, `better-sqlite3`, `dotenv`)
- [ ] Crear `.env.example` con variables necesarias
- [ ] Crear `.gitignore` para `.env` y `node_modules`
- [ ] Crear estructura de directorios: `commands/`, `services/`, `utils/`

### T1.2: Crear capa de datos `services/db.js`

- [ ] Wrapper de `better-sqlite3` apuntando a `data/devhub.db`
- [ ] Implementar `getDashboard()` — proyectos activos con contadores
- [ ] Implementar `getTasks(projectId, filters)` — tareas filtradas
- [ ] Implementar `getProgress(projectId)` — porcentaje de avance
- [ ] Implementar `getAgents()` — estado del swarm
- [ ] Implementar `getNextTask(projectId)` — scoring de prioridad
- [ ] Implementar `pauseAgent(agentId)` / `resumeAgent(agentId)`
- [ ] Implementar `updateTaskStatus(taskId, status)`
- [ ] Implementar `getProjectByName(nameOrId)` — búsqueda flexible
- [ ] Implementar `getActiveProjects()` — lista de proyectos activos

### T1.3: Crear capa HTTP `services/api.js`

- [ ] Wrapper de `fetch` para Next.js API routes
- [ ] Implementar `health()` — verificar Next.js corriendo
- [ ] Implementar `getProfiles()` — perfiles de Gemini CLI
- [ ] Implementar `getSessions()` — sesiones activas de OpenCode
- [ ] Implementar `executeAgent({ taskId, agentId })` — preparar ejecución
- [ ] Implementar `buildPrompt({ taskId, agentId })` — construir prompt
- [ ] Implementar `launchAgent({ task, profileName, projectId })` — lanzar agente
- [ ] Implementar `qaResult({ taskId, result, reasons, branchName })` — resultado QA

### T1.4: Crear servicio de autenticación `services/auth.js`

- [ ] Verificación de `chat.id` contra `ALLOWED_USER_IDS`
- [ ] Mensaje de error para accesos no autorizados

### T1.5: Crear servicio de formateo `services/formatter.js`

- [ ] Formateo de dashboard en Markdown
- [ ] Formateo de lista de tareas en Markdown
- [ ] Formateo de progreso en Markdown
- [ ] Formateo de estado de agentes en Markdown
- [ ] Formateo de mensajes de error
- [ ] Formateo de confirmaciones de acción

### T1.6: Crear utility de logging `utils/logger.js`

- [ ] Logger simple con timestamps y niveles (info, warn, error)

## Fase 2: Comandos de Consulta

### T2.1: Comando `/estado`

- [ ] Handler que consulta `db.getDashboard()`
- [ ] Formatea respuesta con `formatter.formatDashboard()`
- [ ] Manejo de error si no hay proyectos activos

### T2.2: Comando `/tareas [proyecto]`

- [ ] Parseo de argumento (nombre o ID de proyecto)
- [ ] Búsqueda flexible de proyecto con `db.getProjectByName()`
- [ ] Consulta de tareas con `db.getTasks()`
- [ ] Formateo de lista de tareas
- [ ] Manejo de error si proyecto no existe

### T2.3: Comando `/progreso [proyecto]`

- [ ] Parseo de argumento
- [ ] Consulta de progreso con `db.getProgress()`
- [ ] Formateo con barra de progreso visual (████░░░░░░)
- [ ] Mostrar hito actual si existe

### T2.4: Comando `/agentes`

- [ ] Consulta de agentes con `db.getAgents()`
- [ ] Formateo con estado visual (🟢 working, ⚪ idle, 🔴 error, ⏸️ paused)
- [ ] Mostrar tiempo desde último heartbeat
- [ ] Mostrar tarea actual si existe

### T2.5: Comando `/help`

- [ ] Lista de todos los comandos con descripción
- [ ] Ejemplos de uso

## Fase 3: Comandos de Acción

### T3.1: Comando `/pausar [agente]`

- [ ] Parseo de argumento (ID del agente)
- [ ] Si no se especifica, pausar todos los agentes working
- [ ] Ejecutar `db.pauseAgent()`
- [ ] Confirmación de acción

### T3.2: Comando `/reanudar [agente]`

- [ ] Parseo de argumento
- [ ] Ejecutar `db.resumeAgent()`
- [ ] Confirmación de acción

### T3.3: Comando `/continuar [proyecto]` — COMPLEJO

- [ ] Parseo de argumento (nombre o ID de proyecto)
- [ ] Verificar que Next.js está corriendo (`api.health()`)
- [ ] Calcular next task con `db.getNextTask()`
- [ ] Si no hay tareas: responder "No hay tareas pendientes"
- [ ] Si hay tarea:
  - [ ] `POST /api/agent/execute` → asignar tarea, crear rama
  - [ ] `POST /api/agent/prompt-builder` → construir prompt
  - [ ] `POST /api/agents/launch` → lanzar agente
  - [ ] Responder con confirmación y detalles de la tarea

### T3.4: Comando `/spawn [tarea] [perfil]` — DIRECTO

- [ ] Parseo de argumentos (tarea + perfil)
- [ ] Validar perfil con `api.getProfiles()`
- [ ] `POST /api/agents/launch` directamente
- [ ] Responder con confirmación

### T3.5: Comando `/sesiones`

- [ ] Consulta de sesiones con `api.getSessions()`
- [ ] Formateo de sesiones activas

## Fase 4: Entry Point y Configuración

### T4.1: Crear `bot.js` — Entry point

- [ ] Carga de `.env` con `dotenv`
- [ ] Inicialización de `TelegramBot` con polling
- [ ] Middleware de autenticación
- [ ] Registro de todos los comandos
- [ ] Manejo global de errores
- [ ] Mensaje de inicio

### T4.2: Crear `commands/index.js` — Registro

- [ ] Exportar todos los handlers de comandos
- [ ] Mapeo de comando → handler

### T4.3: Crear `README.md` — Documentación

- [ ] Instrucciones de instalación
- [ ] Configuración de Telegram Bot (BotFather)
- [ ] Obtención de Telegram User ID
- [ ] Variables de entorno necesarias
- [ ] Comandos disponibles
- [ ] Instrucciones de systemd service

### T4.4: Crear systemd service file

- [ ] Archivo `devhub-telegram-bot.service`
- [ ] Instrucciones de instalación en README

## Fase 5: Testing y Validación

### T5.1: Pruebas manuales de todos los comandos

- [ ] `/estado` — verifica dashboard
- [ ] `/tareas devhub` — verifica lista de tareas
- [ ] `/progreso devhub` — verifica porcentaje
- [ ] `/agentes` — verifica estado del swarm
- [ ] `/pausar` — verifica pausa de agente
- [ ] `/reanudar` — verifica reanudación
- [ ] `/continuar devhub` — verifica flujo completo de launch
- [ ] `/spawn "tarea" default` — verifica launch directo
- [ ] `/sesiones` — verifica sesiones activas
- [ ] `/help` — verifica lista de comandos

### T5.2: Pruebas de autenticación

- [ ] Verificar que usuarios no autorizados son rechazados
- [ ] Verificar que el owner tiene acceso

### T5.3: Pruebas de error

- [ ] Next.js no corriendo → error amigable
- [ ] Proyecto no existe → error amigable
- [ ] No hay tareas pendientes → mensaje informativo
- [ ] Agente no existe → error amigable

## Dependencias entre tareas

```
T1.1 (estructura) ──→ T1.2 (db) ──→ T2.x (consulta) ──→ T5.x (testing)
                 ──→ T1.3 (api) ──→ T3.x (acción)  ──→ T5.x (testing)
                 ──→ T1.4 (auth) ──┘
                 ──→ T1.5 (formatter) ──┘
                 ──→ T1.6 (logger) ──┘

T2.x + T3.x ──→ T4.1 (bot.js) ──→ T4.3 (README) ──→ T4.4 (systemd)
```

## Estimación de esfuerzo

| Fase                | Tareas | Complejidad | Tiempo estimado |
| ------------------- | ------ | ----------- | --------------- |
| T1: Infraestructura | 6      | Media       | 2-3 horas       |
| T2: Consulta        | 5      | Baja        | 1-2 horas       |
| T3: Acción          | 5      | Alta        | 3-4 horas       |
| T4: Entry Point     | 4      | Baja        | 1 hora          |
| T5: Testing         | 3      | Media       | 1-2 horas       |
| **Total**           | **23** |             | **8-12 horas**  |
