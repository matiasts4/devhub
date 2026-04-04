# Módulo 6: Telegram Bot — REPORTE DE REVISIÓN

> **Fecha:** Abril 2026
> **Estado:** ✅ Revisado
> **Archivos:** ~45 (1 bot + 18 commands + 10 services + 11 providers + 3 misc)
> **Hallazgo principal:** LLM Bridge deprecated (8 archivos muertos), bug de ReferenceError, token expuesto

---

## 🔴 Hallazgos Críticos

### 1. Token de Telegram expuesto en `.env`

```
TELEGRAM_BOT_TOKEN=8715065107:AAErSNCfbakEcyb080lDEBZ9il22rDuy3FM
```

Token real y activo en el repositorio. **Rotar inmediatamente vía @BotFather.**

### 2. Bug: `executor.js` línea 294 — ReferenceError

```js
async pauseTask(chatId) {
  const dbStatus = reason === 'bot shutdown' ? 'error' : 'paused';
  // ^^^ 'reason' NO ESTÁ DEFINIDO en este scope
}
```

`reason` es parámetro de `cancelTask()`, no de `pauseTask()`. **Crash al pausar tareas multi-turno.**

### 3. Bug: `copilot-adapter.js` — argumentos invertidos en `createClassifiedError`

```js
// Línea 369: orden incorrecto
return createClassifiedError(msg, ERROR_TYPES.RATE_LIMIT, true);
// Debería ser: createClassifiedError(ERROR_TYPES.RATE_LIMIT, msg, { retryAfter: true })

// Línea 375: ERROR_TYPES.AUTH no existe (es AUTH_ERROR)
// Línea 377: ERROR_TYPES.UNKNOWN no existe
```

---

## 💀 Código Muerto

### LLM Bridge completo (deprecated) — 8 archivos de providers

| Archivo                                           | Estado                                            |
| ------------------------------------------------- | ------------------------------------------------- |
| `services/providers/llm-bridge.js`                | 💀 DEPRECATED — reemplazado por OpenCode headless |
| `services/providers/conversation-manager.js`      | 💀 Solo usado por LLM Bridge                      |
| `services/providers/tool-registry.js`             | 💀 Solo usado por LLM Bridge                      |
| `services/providers/failover-orchestrator.js`     | 💀 Solo usado por LLM Bridge                      |
| `services/providers/provider-registry.js`         | 💀 Solo usado por LLM Bridge                      |
| `services/providers/provider-interface.js`        | 💀 Solo usado por LLM Bridge                      |
| `services/providers/openrouter-adapter.js`        | 💀 Solo usado por LLM Bridge                      |
| `services/providers/zen-adapter.js`               | 💀 Solo usado por LLM Bridge                      |
| `services/providers/direct-adapter.js`            | 💀 Solo usado por LLM Bridge                      |
| `services/providers/copilot-adapter.js`           | 💀 Solo usado por LLM Bridge (con bugs)           |
| `services/providers/openai-compatible-adapter.js` | 💀 Solo usado por LLM Bridge adapters             |

### Funciones y imports muertos

| Archivo                 | Issue                                                                                  |
| ----------------------- | -------------------------------------------------------------------------------------- |
| `commands/agente.js`    | Import `opencode` nunca usado                                                          |
| `commands/project.js`   | Import `opencode` nunca usado                                                          |
| `commands/chat.js`      | Import `api` nunca usado                                                               |
| `services/db.js`        | `getAgentLogs()`, `getAgentStats()` — nunca importados                                 |
| `services/api.js`       | `qaResult()` — nunca llamada                                                           |
| `services/opencode.js`  | `getAvailableAgents()`, `cleanOutput()`, `stripAnsi()` — exportados pero no importados |
| `lib/db-bridge.js`      | `updateSessionTaskState` y `ensureMultiTurnColumns` **duplicados** (definidos 2 veces) |
| `services/formatter.js` | `timeSince()` duplicada en `sesiones.js`                                               |
| `services/executor.js`  | `isMultiTurnTask()` duplicada en `chat.js` con keywords diferentes                     |

### Duplicación de `esc()` — 5 copias

| Archivo                 | Copia |
| ----------------------- | ----- |
| `services/formatter.js` | ✅    |
| `commands/project.js`   | Copia |
| `commands/session.js`   | Copia |
| `commands/status.js`    | Copia |
| `commands/sesiones.js`  | Copia |

---

## 🐛 Bugs y Issues

| Bug                                                  | Archivo                              | Severidad  |
| ---------------------------------------------------- | ------------------------------------ | ---------- |
| `reason` undefined en `pauseTask()`                  | `executor.js:294`                    | 🔴 Crítico |
| `createClassifiedError` args invertidos              | `copilot-adapter.js:369`             | 🔴 Crítico |
| `ERROR_TYPES.AUTH` no existe                         | `copilot-adapter.js:375`             | 🔴 Crítico |
| `ERROR_TYPES.UNKNOWN` no existe                      | `copilot-adapter.js:377`             | 🔴 Crítico |
| `db.js` abre conexión nueva por query                | `services/db.js`                     | 🟡 Alta    |
| `OPENCODE_PORT` env var documentada pero nunca leída | `services/opencode.js`               | 🟡 Media   |
| 5 copias de `esc()`                                  | Varios archivos                      | 🟡 Media   |
| `isMultiTurnTask()` duplicado                        | `chat.js` + `executor.js`            | 🟡 Media   |
| `db-bridge.js` funciones duplicadas                  | `lib/db-bridge.js`                   | 🟡 Media   |
| `session-bridge.js` usa `db.db.prepare()` raw        | `services/session-bridge.js:186`     | 🟡 Media   |
| Auth bypass si `ALLOWED_USER_IDS` vacío              | `services/auth.js`                   | 🟡 Media   |
| Sin auth en llamadas HTTP a Next.js                  | `services/api.js`                    | 🟡 Media   |
| `TELEGRAM_MULTI_TURN` no documentado                 | `.env.example`                       | 🟢 Baja    |
| Imports muertos en 3 commands                        | `agente.js`, `project.js`, `chat.js` | 🟢 Baja    |

---

## 🏗️ Arquitectura

### Patrón de conexiones DB (3 conexiones separadas)

| Módulo                       | Patrón                   | Tablas                                                                     |
| ---------------------------- | ------------------------ | -------------------------------------------------------------------------- |
| `services/db.js`             | Nueva conexión por query | projects, tasks, milestones, agent_registry                                |
| `lib/db-bridge.js`           | Conexión persistente     | telegram_session_map, agent_hub_sessions, agent_hub_messages, agent_traces |
| `services/activityLogger.js` | Conexión persistente     | telegram_activity, telegram_sessions, agent_logs                           |

**Problema:** 3 conexiones a la misma DB WAL — contention en writes concurrentes.

### Comandos duplicados/overlap

| Overlap      | Commands                                           |
| ------------ | -------------------------------------------------- |
| Nueva sesión | `/nueva_sesion` vs `/session new`                  |
| Ver sesiones | `/sesiones` vs `/session` vs `/session info`       |
| Status       | `/estado` (proyectos) vs `/status` (sesión actual) |

---

## 🗑️ Archivos candidatos a eliminación

| Archivo                                           | Razón                                          |
| ------------------------------------------------- | ---------------------------------------------- |
| `services/providers/llm-bridge.js`                | DEPRECATED — reemplazado por OpenCode headless |
| `services/providers/conversation-manager.js`      | Solo usado por LLM Bridge                      |
| `services/providers/tool-registry.js`             | Solo usado por LLM Bridge                      |
| `services/providers/failover-orchestrator.js`     | Solo usado por LLM Bridge                      |
| `services/providers/provider-registry.js`         | Solo usado por LLM Bridge                      |
| `services/providers/provider-interface.js`        | Solo usado por LLM Bridge                      |
| `services/providers/openrouter-adapter.js`        | Solo usado por LLM Bridge                      |
| `services/providers/zen-adapter.js`               | Solo usado por LLM Bridge                      |
| `services/providers/direct-adapter.js`            | Solo usado por LLM Bridge                      |
| `services/providers/copilot-adapter.js`           | Solo usado por LLM Bridge (con bugs)           |
| `services/providers/openai-compatible-adapter.js` | Solo usado por LLM Bridge adapters             |

**Total a eliminar: 11 archivos (~1,500 líneas)**

## 🔧 Fixes recomendados

### Prioridad 1 — Seguridad

1. **Rotar token de Telegram** vía @BotFather
2. **Agregar auth** en llamadas HTTP a Next.js

### Prioridad 2 — Bugs críticos

3. **Fix** `executor.js` línea 294 — pasar `reason` como parámetro
4. **Fix** `copilot-adapter.js` — orden de argumentos + constantes válidas
5. **Eliminar** funciones duplicadas en `db-bridge.js`

### Prioridad 3 — Limpieza

6. **Eliminar** 11 archivos de providers deprecated
7. **Centralizar** `esc()` en `formatter.js` (eliminar 4 copias)
8. **Unificar** `isMultiTurnTask()` en un solo lugar
9. **Eliminar** imports muertos en commands
10. **Refactorizar** `db.js` para usar conexión compartida
