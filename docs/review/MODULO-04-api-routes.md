# Módulo 4: API Routes — REPORTE DE REVISIÓN

> **Fecha:** Abril 2026
> **Estado:** ✅ Revisado
> **Total de rutas:** 46 archivos (18 grupos)
> **Hallazgo crítico:** Vulnerabilidades de command injection y path traversal

---

## 🔴 Hallazgos Críticos de Seguridad

### 1. Command Injection — `/api/agent/execute/route.js` (Línea 42)

```js
execAsync(`git checkout -b task/${task_id}-${agent_id} || true`);
```

`task_id` y `agent_id` son controlados por el usuario. Un atacante puede inyectar comandos arbitrarios:

```
task_id=foo; rm -rf /; echo bar
```

**Severidad:** 🔴 CRÍTICA — RCE potencial

### 2. Command Injection — `/api/agent/qa-result/route.js` (Líneas 28-30)

```js
execAsync(`git checkout main && git merge ${branch_name} && git branch -d ${branch_name}`);
```

`branch_name` viene del input del usuario sin sanitizar.

**Severidad:** 🔴 CRÍTICA — RCE potencial

### 3. Path Traversal — `/api/fs/file/route.js` (Línea 30)

```js
const resolved = path.resolve(basePath, filePathParam);
```

El comentario en el código dice: _"Si quisieras restringirlo de vuelta pon aquí la lógica de path traversal"_ — **la verificación fue removida intencionalmente**.

Un atacante puede leer CUALQUIER archivo:

```
/api/fs/file?path=../../../../etc/passwd&base=/
```

**Severidad:** 🔴 CRÍTICA — Lectura arbitraria de archivos

### 4. Path Traversal — `/api/fs/read/route.js` (Línea 18)

Mismo problema. Sin validación de path.

**Severidad:** 🔴 CRÍTICA — Lectura arbitraria de archivos

### 5. Path Traversal — `/api/fs/tree/route.js` (Línea 48)

`base` es completamente controlable por el usuario. Puede enumerar cualquier directorio.

**Severidad:** 🔴 CRÍTICA — Enumeración arbitraria de directorios

---

## 🟡 Bugs de Next.js

### `force-static` en rutas con mutaciones

Estas rutas tienen `export const dynamic = 'force-static'` pero también tienen handlers POST/PATCH/DELETE:

| Ruta                   | Método             | Problema                          |
| ---------------------- | ------------------ | --------------------------------- |
| `/api/ai/chat`         | POST               | No puede ser estática             |
| `/api/realtime`        | GET+runtime nodejs | Contradictorio con nodejs runtime |
| `/api/mcp/connections` | POST               | Mutación no funcionará            |
| `/api/tasks`           | POST, PATCH        | Mutaciones no funcionarán         |

**Impacto:** En producción, las mutaciones POST/PATCH/DELETE simplemente no funcionarán o darán errores 500.

---

## 💀 Rutas Muertas (0 consumidores en frontend)

### Grupo 1: Agentes legacy (5 rutas)

| Ruta                        | Qué hace                         | Por qué está muerta              |
| --------------------------- | -------------------------------- | -------------------------------- |
| `/api/agent/execute`        | Ejecuta agente + crea branch git | El frontend usa `/api/agenthub/` |
| `/api/agent/prompt-builder` | Construye prompts de agentes     | El frontend usa `/api/agenthub/` |
| `/api/agent/qa-result`      | Procesa aprobación QA            | El frontend usa `/api/agenthub/` |
| `/api/agents/launch`        | Lanza proceso OpenCode           | El frontend usa `/api/agenthub/` |
| `/api/agents/profiles`      | Lista perfiles Gemini            | No se llama desde ningún lado    |

### Grupo 2: Chat IA (2 rutas)

| Ruta                   | Qué hace               | Por qué está muerta           |
| ---------------------- | ---------------------- | ----------------------------- |
| `/api/ai/chat`         | Chat con Gemini REST   | No se llama desde ningún lado |
| `/api/centro-ia/query` | Query memorias via MCP | No se llama desde ningún lado |

### Grupo 3: Utilidades muertas (5 rutas)

| Ruta                        | Qué hace                 | Por qué está muerta                |
| --------------------------- | ------------------------ | ---------------------------------- |
| `/api/terminal/processes`   | Stub que retorna `[]`    | Nunca implementada, nadie la llama |
| `/api/terminal/sessions`    | Snapshot de sesiones TTY | Nadie la llama                     |
| `/api/invite/[token]`       | Redirect stub a `/hub`   | Sistema de invites deshabilitado   |
| `/api/projects/[id]/invite` | Mock de invitación       | No hace nada real                  |
| `/api/engram/memories`      | Query memorias via MCP   | Nadie la llama                     |

### Grupo 4: Duplicadas (2 rutas)

| Ruta                   | Qué hace                  | Duplicada con                                |
| ---------------------- | ------------------------- | -------------------------------------------- |
| `/api/tasks`           | CRUD de tareas via SQLite | Frontend usa `localClient` → `/api/db/query` |
| `/api/mcp/connections` | CRUD conexiones MCP       | Frontend usa `localClient` → `/api/db/query` |

**Total rutas muertas: 15 de 46**

---

## ✅ Rutas Funcionales (en uso)

### AgentHub (9 rutas)

| Ruta                                         | Uso                 | Estado               |
| -------------------------------------------- | ------------------- | -------------------- |
| `/api/agenthub/sessions/`                    | Lista sesiones      | ✅ Bien implementada |
| `/api/agenthub/sessions/[id]/traces/`        | GET/POST traces     | ✅ Bien implementada |
| `/api/agenthub/sessions/[id]/traces/search/` | Búsqueda FTS5       | ✅ Bien implementada |
| `/api/agenthub/sessions/[id]/usage/`         | Token usage         | ✅ Bien implementada |
| `/api/agenthub/chat/`                        | Chat multi-provider | ✅ Bien implementada |
| `/api/agenthub/headless/`                    | Ejecución headless  | ✅ Funcional         |
| `/api/agenthub/mcp/status/`                  | Status MCP          | ✅ Funcional         |
| `/api/agenthub/sessions/health/`             | Health check        | ✅ Funcional         |
| `/api/agenthub/traces/persist/`              | Persistencia traces | ✅ Funcional         |

### Terminal (1 ruta)

| Ruta                    | Uso            | Estado                       |
| ----------------------- | -------------- | ---------------------------- |
| `/api/terminal/session` | Inicia TTY PTY | ✅ Usada por TerminalTTY.jsx |

### Settings (5 rutas)

| Ruta                                              | Uso              | Estado                                      |
| ------------------------------------------------- | ---------------- | ------------------------------------------- |
| `/api/settings/llm-providers`                     | CRUD config LLM  | ✅ Usada por AgentHub y LLMProviderSettings |
| `/api/settings/llm-providers/models`              | Lista modelos    | ✅ Usada por LLMProviderSettings            |
| `/api/settings/llm-providers/test`                | Test conexión    | ✅ Usada por LLMProviderSettings            |
| `/api/settings/llm-providers/copilot/device-flow` | OAuth Copilot    | ✅ Usada por LLMProviderSettings            |
| `/api/settings/llm-providers/copilot/poll`        | Poll OAuth token | ✅ Usada por LLMProviderSettings            |

### Proyectos y Telegram (5 rutas)

| Ruta                       | Uso                     | Estado                                 |
| -------------------------- | ----------------------- | -------------------------------------- |
| `/api/projects/[id]/files` | CRUD archivos           | ✅ Usada por ProjectHub                |
| `/api/telegram/activity`   | Log actividad           | ✅ Usada por TelegramMonitor           |
| `/api/telegram/status`     | Status bot              | ✅ Usada por NotificationCenter        |
| `/api/opencode/sessions`   | Lista sesiones OpenCode | ✅ Usada por TerminalWorkspacesManager |
| `/api/realtime`            | Status realtime server  | ✅ Usada por RealtimeBridge            |

---

## 📊 Resumen por Categoría

| Categoría      | Total  | Funcionales | Muertas             | Críticas              |
| -------------- | ------ | ----------- | ------------------- | --------------------- |
| AgentHub       | 9      | 9           | 0                   | 0                     |
| Agentes legacy | 5      | 0           | 5                   | 2 (command injection) |
| Chat IA        | 2      | 0           | 2                   | 0                     |
| Filesystem     | 3      | 3           | 0                   | 3 (path traversal)    |
| Terminal       | 3      | 1           | 2                   | 0                     |
| Settings       | 5      | 5           | 0                   | 0                     |
| Proyectos      | 2      | 1           | 1 (invite mock)     | 0                     |
| MCP            | 2      | 0           | 1 (engram memories) | 0                     |
| Telegram       | 2      | 2           | 0                   | 0                     |
| Misc           | 10     | 4           | 6                   | 0                     |
| **Total**      | **45** | **25**      | **14**              | **5**                 |

---

## 🗑️ Archivos candidatos a eliminación inmediata

| Archivo                             | Razón                                       |
| ----------------------------------- | ------------------------------------------- |
| `api/agent/execute/route.js`        | Muerta + command injection                  |
| `api/agent/prompt-builder/route.js` | Muerta                                      |
| `api/agent/qa-result/route.js`      | Muerta + command injection                  |
| `api/agents/launch/route.js`        | Muerta                                      |
| `api/agents/profiles/route.js`      | Muerta                                      |
| `api/ai/chat/route.js`              | Muerta + `force-static` en POST             |
| `api/centro-ia/query/route.js`      | Muerta + spawn por request                  |
| `api/terminal/processes/route.js`   | Stub muerto                                 |
| `api/terminal/sessions/route.js`    | Muerta                                      |
| `api/invite/[token]/route.js`       | Stub muerto                                 |
| `api/projects/[id]/invite/route.js` | Mock muerto                                 |
| `api/engram/memories/route.js`      | Muerta                                      |
| `api/tasks/route.js`                | Duplicada + `force-static` en POST/PATCH    |
| `api/mcp/connections/route.js`      | Duplicada + `force-static` en POST          |

**Total a eliminar: 14 archivos**

## 🔧 Fixes requeridos en rutas activas

| Archivo                 | Fix                                        | Severidad  |
| ----------------------- | ------------------------------------------ | ---------- |
| `api/fs/file/route.js`  | Agregar path traversal guard               | 🔴 Crítico |
| `api/fs/read/route.js`  | Agregar path traversal guard               | 🔴 Crítico |
| `api/fs/tree/route.js`  | Agregar path traversal guard + depth limit | 🔴 Crítico |
| `api/realtime/route.js` | Cambiar `force-static` a `force-dynamic`   | 🟡 Bug     |
