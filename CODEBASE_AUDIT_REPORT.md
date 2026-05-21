# DevHub — Codebase Audit Report

> **Fecha:** 2026-04-03
> **Alcance:** Diagnóstico completo — NO se modificaron archivos
> **Stack:** Next.js 16 (App Router), React 19, Tailwind v4, Supabase, SQLite (better-sqlite3), Tauri 2, Telegram Bot API, OpenCode (vendored)

---

## Resumen Ejecutivo

El codebase de DevHub es una aplicación full-stack ambiciosa que funciona como hub de gestión de proyectos con IA integrada. Sin embargo, presenta **deuda técnica significativa** acumulada por iteraciones rápidas. Los problemas más graves son de **seguridad** (credenciales expuestas, rutas sin autenticación, path traversal) y **arquitectura** (componentes god de 1600+ líneas, 0 capas de servicio, 46 API routes sin auth).

**Métricas clave:**
| Métrica | Valor |
|---------|-------|
| Archivos fuente auditados | ~120+ |
| API routes (Next.js) | 46 |
| Componentes React (views + components) | 100+ |
| Componentes >500 líneas (God Components) | 9 |
| Componente más grande | `AgentHub.jsx` — ~1600+ líneas |
| Routes con llamadas directas a DB | 22 de 46 (48%) |
| Routes sin autenticación | 46 de 46 (100%) |
| Routes que ejecutan shell commands | 9 |
| Duplicaciones de lógica identificadas | 20+ |
| Tests con assertions reales | ~5% (smoke tests) |

---

# 1) Hallazgos Críticos (Alto Impacto/Riesgo)

## C-01: Credenciales expuestas en repositorio

**Archivos:** `data/llm-providers-config.json`, `next.config.js`, `telegram-bot/.env`

**Problema:**

- API key de OpenRouter en plaintext: `sk-or-v1-dd2053...`
- GitHub Copilot OAuth token: `ghu_yb8Cznet...`
- Supabase URL y anon key hardcodeadas en `next.config.js` (líneas 20-21)
- Archivo `.env` existe en disco en `telegram-bot/` — verificar que no esté trackeado en git

**Impacto:** Cualquiera con acceso al repo puede usar estas credenciales. Si el repo es público, las keys están comprometidas.

**Riesgo:** 🔴 CRÍTICO

---

## C-02: Path Traversal en rutas `/api/fs/*`

**Archivos:**

- `src/app/api/fs/read/route.js` (línea 18)
- `src/app/api/fs/file/route.js` (línea 30)
- `src/app/api/fs/tree/route.js` (línea 48)

**Problema:** `path.resolve(basePath, userInput)` sin validación de que el path resultante permanezca dentro de `basePath`. Un atacante puede leer CUALQUIER archivo del sistema. El archivo `fs/file/route.js` tiene un comentario explícito reconociendo el problema: _"Si quisieras restringirlo de vuelta pon aqui la logica de path traversal."_

**Impacto:** Lectura arbitraria de archivos del sistema (`.env`, `~/.ssh/id_rsa`, `/etc/passwd`, etc.)

**Riesgo:** 🔴 CRÍTICO

---

## C-03: Rutas `/api/db/*` — Proxy de base de datos sin control de acceso

**Archivos:**

- `src/app/api/db/query/route.js` (127 líneas)
- `src/app/api/db/mutate/route.js` (60 líneas)

**Problema:**

- `query/route`: `SELECT ${fields} FROM ${table}` — nombres de tabla y columnas interpolados directamente desde input del usuario. SQL injection posible en nombres de tabla/columna.
- `mutate/route`: Permite INSERT/UPDATE/DELETE en CUALQUIER tabla sin autenticación.
- Ambas rutas están completamente abiertas.

**Impacto:** Cualquier cliente puede leer y modificar toda la base de datos.

**Riesgo:** 🔴 CRÍTICO

---

## C-04: 46 API routes sin autenticación ni autorización

**Alcance:** TODAS las rutas en `src/app/api/`

**Problema:** Ninguna de las 46 rutas verifica identidad del usuario, tokens de sesión, o permisos. Si la app se expone más allá de localhost, todo es público.

**Rutas más peligrosas sin auth:**

- `/api/db/mutate` — mutación arbitraria de DB
- `/api/db/query` — lectura arbitraria de DB
- `/api/agent/execute` — ejecución de git commands
- `/api/agent/qa-result` — merge de branches via git
- `/api/agents/launch` — spawn de child processes
- `/api/settings/llm-providers/*` — modificación de config con API keys
- `/api/terminal/session` — spawn de PTY servers

**Riesgo:** 🔴 CRÍTICO

---

## C-05: Ejecución de comandos de shell desde API routes

**Archivos afectados (9 rutas):**

| Ruta                | Comando                                                              |
| ------------------- | -------------------------------------------------------------------- |
| `agenthub/headless` | `spawn('opencode', ['serve', ...])`                                  |
| `opencode/sessions` | `execFileAsync('opencode', ['session', 'list'])`                     |
| `mcp/engram`        | `spawn('engram', ['mcp', ...])`                                      |
| `engram/memories`   | `spawn('node', ['devhub-mcp/server.js'])`                            |
| `centro-ia/query`   | `spawn('node', ['devhub-mcp/server.js'])`                            |
| `agents/launch`     | `spawn('opencode', ['--task', ...], { detached: true })`             |
| `agent/qa-result`   | `execAsync('git checkout main && git merge ...')`                    |
| `agent/execute`     | `execAsync('git checkout -b ...')`                                   |

**Problema:** 9 rutas API ejecutan comandos del sistema operativo directamente. Sin validación de input, sin sandbox, sin rate limiting.

**Riesgo:** 🔴 CRÍTICO

---

## C-06: God Components — componentes de 500-1600+ líneas

| Componente                      | Líneas | Responsabilidades                                                                                                                                                                                          |
| ------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AgentHub.jsx`                  | ~1600+ | Chat, SSE parsing, trace management, session CRUD, subagent orchestration, permissions, command palette, keyboard shortcuts, onboarding, LLM config, MCP status (15+ fetch calls, 25+ useState, 7+ useRef) |
| `SwarmControl.jsx`              | ~1500+ | Session management, SSE streaming, task queue, MCP status, project launching, Supabase realtime                                                                                                            |
| `Ajustes.jsx`                   | 1116   | 6 tabs completos (proyectos, tema, LLM, perfil, prefs, danger zone), theme management, onboarding wizard, delete cascade                                                                                   |
| `Tareas.jsx`                    | 999    | Kanban board, agent queue, task modal, Supabase realtime, localStorage filters, agent dispatch                                                                                                             |
| `Scaffolding.jsx`               | 802    | Template definitions, script generation, WebSocket TTY, stack inference, output parsing                                                                                                                    |
| `ProjectHub.jsx`                | 708    | Project CRUD, file handling, drag & drop, stats, filtering                                                                                                                                                 |
| `Conexiones.jsx`                | 700    | MCP connection CRUD, modal forms, type config                                                                                                                                                              |
| `ChatMessageList.jsx`           | 755    | 6 sub-componentes inline, smart auto-scroll, message rendering                                                                                                                                             |
| `TerminalWorkspacesManager.jsx` | 749    | Workspace management, LocalStorage persistence, keyboard shortcuts, panel grid                                                                                                                             |

**Problema:** Violación masiva de Single Responsibility Principle. Cada componente es una aplicación completa.

**Impacto:** Imposible de testear unitariamente, mantenimiento extremadamente difícil, bugs en cascada, re-renders innecesarios masivos.

**Riesgo:** 🔴 CRÍTICO (mantenibilidad)

---

## C-07: Funciones duplicadas verbatim en `localDb.js`

**Archivo:** `src/lib/db/localDb.js`

**Problema:** Líneas 505-577 y 583-655 son **copias exactas**. `insertMessage`, `getMessagesBySession`, y `getToolTracesBySession` están definidas dos veces. La segunda definición sobrescribe silenciosamente la primera.

**Impacto:** 73 líneas de código muerto. Bug de copy-paste que indica falta de revisión.

**Riesgo:** 🔴 CRÍTICO (calidad de código)

---

## C-08: `eval()` en `ttyServer.js`

**Archivo:** `src/lib/terminal/ttyServer.js` (líneas 8-9)

**Problema:** `eval('require')('node-pty')` y `eval('require')('ws')` para bypass de Webpack.

**Impacto:** Violación de CSP, riesgo de seguridad si el código es manipulable, anti-patrón conocido.

**Riesgo:** 🔴 CRÍTICO

---

## C-09: Hardcoded absolute paths a máquina específica

| Archivo                         | Línea | Path                                       |
| ------------------------------- | ----- | ------------------------------------------ |
| `src/lib/db/localDb.js`         | 14    | `/home/matias/devhub/data/devhub.db`       |
| `src/lib/terminal/ttyServer.js` | 157   | `/home/matias/devhub/devhub-mcp/server.js` |

**Problema:** El código falla en cualquier entorno que no sea la máquina de desarrollo original.

**Riesgo:** 🔴 CRÍTICO (portabilidad)

---

## C-10: API key de Gemini expuesta en URL query string

**Archivo:** `src/app/api/ai/chat/route.js` (línea 87)

**Problema:** `?key=${apiKey}` — la API key se expone en la URL, que es logueada por proxies, servidores, y navegadores.

**Riesgo:** 🔴 CRÍTICO

---

# 2) Hallazgos Medios (Mejorables)

## M-01: Lógica duplicada masiva

### Duplicaciones identificadas (20+):

| Patrón Duplicado                              | Archivos Afectados                                                                      |
| --------------------------------------------- | --------------------------------------------------------------------------------------- |
| `loadConfig()` helper                         | `agenthub/chat`, `agenthub/sessions/health`, `settings/llm-providers`                   |
| Copilot token exchange + headers              | `agenthub/chat`, `settings/llm-providers/models`, `settings/llm-providers/copilot/poll` |
| `OPENCODE_PORT = 4153`                        | 5+ archivos                                                                             |
| MCP server connection (`connectToMcpServer`)  | `engram/memories`, `centro-ia/query`                                                    |
| `esc()` (escape Markdown)                     | `sesiones.js`, `session.js`, `project.js`, `status.js` (telegram-bot)                   |
| `timeSince()`                                 | `sesiones.js`, `formatter.js` (telegram-bot)                                            |
| `findProject()` / `getProjectByName()`        | `db.js`, `db-bridge.js` (telegram-bot)                                                  |
| `getActiveProjects()`                         | `db.js`, `db-bridge.js` (telegram-bot)                                                  |
| `getAgentLogs()` / `getAgentStats()`          | `db.js`, `activityLogger.js` (telegram-bot)                                             |
| SSE parsing loop (~80% idéntico)              | `opencode.js` `run()` y `sendMessage()` (telegram-bot)                                  |
| `isMountedRef` pattern                        | `useSessionUsage.js`, `useAgentTraces.js`                                               |
| Query builder chainable API                   | `localDb.js` `LocalQuery`, `localSupabase.js` `LocalQueryClient`                        |
| Card header pattern (icon + title + subtitle) | `ProjectDashboard`, `Roadmap`, `Historial`, `Conexiones`, `Ajustes`, `Scaffolding`      |
| Breadcrumb pattern                            | 6+ views                                                                                |
| `createClient()` Supabase                     | 12+ archivos (llamado en cada render)                                                   |
| `TOOL_ICON_MAP`                               | `ContextToolGroup`, `ToolErrorCard`, `LiveTracePreview`                                 |
| `CONTEXT_GROUP_TOOLS`                         | `AgentTracePanel`, `ContextToolGroup`                                                   |
| Model label cleaning regex                    | `ChatInput`, `ChatMessageList`, `AgentHub`                                              |
| `safeFetch` + `timeAgo`                       | `TelegramMonitor`, `NotificationCenter`                                                 |
| Agent profile/model label cleaning            | `ChatInput`, `ChatMessageList`                                                          |

---

## M-02: 0 capa de servicio — componentes llaman directamente a APIs y DB

**Problema:** No existe una capa de servicios/repositorios. Los componentes React hacen `fetch()` directo a API routes, y las API routes llaman directamente a funciones de DB.

**Ejemplo de flujo actual:**

```
Componente → fetch('/api/agenthub/chat') → import('@/lib/db/localDb') → db.prepare()
```

**Flujo esperado (Clean Architecture):**

```
Componente → useChat Hook → ChatService → AgentRepository → DB
```

**Impacto:** Acoplamiento máximo, imposible de testear, imposible de reutilizar lógica.

---

## M-03: Múltiples conexiones concurrentes a la misma DB SQLite

**Problema:** El telegram-bot abre 3 conexiones persistentes simultáneas a la misma base de datos:

1. `db.js` — open-per-call pattern
2. `activityLogger.js` — conexión persistente
3. `db-bridge.js` — conexión persistente

**Impacto:** Contención de locks, riesgo de corrupción bajo carga, desperdicio de recursos.

---

## M-04: Global state mutation sin cleanup

| Módulo               | Global                       | Riesgo                         |
| -------------------- | ---------------------------- | ------------------------------ |
| `use-toast.js`       | `listeners[]`, `memoryState` | Listener leak, test pollution  |
| `copilot-token.js`   | `cached` object              | Token persiste entre sesiones  |
| `localDb.js`         | `_db` singleton              | No hay aislamiento para tests  |
| `config.js`          | `configCache`, `configMtime` | Sin invalidación               |
| `ttyServer.js`       | `globalThis[GLOBAL_TTY_KEY]` | Procesos PTY huérfanos con HMR |
| `devhub-realtime.js` | `globalThis[GLOBAL_KEY]`     | WS server + watcher filtrados  |

---

## M-05: Memory leaks y missing cleanup en useEffect

| Archivo                    | Problema                                                                |
| -------------------------- | ----------------------------------------------------------------------- |
| `AgentHub.jsx`             | 3 useEffect con `eslint-disable-line` para missing deps                 |
| `Dashboard.jsx`            | Polling interval sin cleanup si el componente se desmonta durante fetch |
| `use-toast.js`             | Listener array crece sin límite — cada re-render agrega un listener     |
| `ttyServer.js`             | Sin función de shutdown para WS server o procesos PTY                   |
| `devhub-realtime.js`       | Sin función de shutdown para WS server o chokidar watcher               |
| `telegram-bot/bot.js`      | `setInterval` de limpieza de conversaciones nunca se limpia en shutdown |
| `telegram-bot/opencode.js` | `serverProcess` nunca se limpia en SIGINT/SIGTERM del bot               |

---

## M-06: Triple-fetch race condition en `useAgentTraces.js`

**Problema:** Tres `useEffect` hooks independientes llaman a `fetchTraces`. Cuando `sessionId`, `enabled`, y `activeFilters` cambian simultáneamente, se disparan **tres fetches redundantes**.

---

## M-07: CSP deshabilitado en Tauri

**Archivo:** `src-tauri/tauri.conf.json` (línea 27)

**Problema:** `"csp": null` — Content Security Policy completamente deshabilitado.

**Impacto:** Sin protección contra XSS, injection de scripts, etc.

---

## M-08: Hardcoded values y magic numbers

**Más de 60 magic numbers identificados**, incluyendo:

- Intervalos de polling (30000, 5000, 2000, 10000, 15000)
- Límites de caracteres (1200, 60, 80, 300)
- Colores hardcoded (#58A6FF, #3FB950, #F778BA) — aparecen cientos de veces
- IDs de usuario hardcoded (`'local-user'`) — 12+ archivos
- Perfiles de agente hardcoded — `AgentLaunchModal.jsx`
- Templates de scaffold hardcoded con contenido completo de archivos

---

## M-09: 0 validación de props en componentes React

**Problema:** Todos los 100+ componentes carecen de PropTypes o TypeScript. Props como `isOpen`, `onClose`, `project` se aceptan sin validación.

**Impacto:** Errores silenciosos en runtime, sin autocompletado en IDE, bugs difíciles de rastrear.

---

## M-10: Inline styles masivos vs Tailwind inconsistente

**Problema:** Componentes como `AgentHub.jsx` usan ~80% inline styles, mientras que `Proyectos.jsx` usa 95% Tailwind. Handlers `onMouseEnter`/`onMouseLeave` mutan estilos inline cuando deberían usar clases `hover:` de Tailwind.

**Impacto:** Inconsistencia visual, pérdida de beneficios de Tailwind (purge, dark mode, responsive), dificultad de mantenimiento.

---

## M-11: Re-renders innecesarios masivos

| Componente       | Problema                                                                    |
| ---------------- | --------------------------------------------------------------------------- |
| `AgentHub.jsx`   | 25+ state variables — cualquier cambio re-renderiza todo. Sin `React.memo`  |
| `UsageChart.jsx` | `CustomTooltip` definido dentro del render — nuevo componente cada render   |
| `Ajustes.jsx`    | 6 `render*Tab` functions recreadas cada render                              |
| `Tareas.jsx`     | `visibleTasks` filter corre en cada render                                  |
| `Dashboard.jsx`  | `metricCards` array recreado cada render                                    |
| 12+ views        | `createClient()` de Supabase llamado en cada render (debería ser `useMemo`) |

---

## M-12: Tests de calidad insuficiente

**Problema:**

- E2E tests son smoke tests: `expect(typeof selectorExists).toBe('boolean')` pasa siempre
- Unit tests usan custom test runners manuales, no Jest/Vitest
- 0 tests para componentes React
- 0 tests para `LocalQueryBuilder`
- `concurrency-test.js` y `headless-test.js` no son tests reales — scripts ad-hoc con `process.exit(0)`
- `__init__.py` vacío — leftover de Python

**Cobertura estimada:** <5% del código productivo.

---

## M-13: `tailwind.config.js` probablemente dead code

**Problema:** Tailwind v4 (`^4.2.2`) usa configuración basada en CSS, no JS. Este archivo probablemente es ignorado.

---

## M-14: `src/index.js` y `src/proxy.ts` son dead code

- `src/index.js`: Entry point de CRA, no usado por Next.js App Router
- `src/proxy.ts`: Debería estar en la raíz del proyecto como `middleware.ts` para que Next.js lo use

---

## M-15: `opencode/` — proyecto completo vendido en el repo

**Problema:** Clon completo de OpenCode con su propio `.git/` dentro del repo. Debería ser un git submodule o eliminado.

---

## M-16: Telegram Bot — Auth bypass cuando `ALLOWED_USER_IDS` está vacío

**Archivo:** `telegram-bot/services/auth.js` (líneas 23-28)

**Problema:** Si la variable de entorno no está configurada, el bot permite acceso a TODOS. El warning se loggea solo una vez.

---

## M-17: Copilot adapter — Error classification rota

**Archivo:** `telegram-bot/services/providers/copilot-adapter.js`

**Problema:** `_mapError()` llama a `createClassifiedError()` con argumentos en orden incorrecto. TODAS las clasificaciones de error de Copilot están malformadas. Además usa `ERROR_TYPES.AUTH` y `ERROR_TYPES.UNKNOWN` que no existen.

---

## M-18: Inconsistencia de idiomas

**Problema:** Mezcla de español e inglés en nombres de variables, texto de UI, y comentarios:

- `handleSend` vs `generarPlantilla` vs `fetchTelegram`
- `Ajustes.jsx` vs `Dashboard.jsx`
- Comentarios en español en algunos archivos, inglés en otros

---

## M-19: ESLint plugins no utilizados

**Problema:** `eslint-plugin-jsx-a11y` y `eslint-plugin-import` están en `devDependencies` pero no se usan en la config. `no-unused-vars` y `prefer-const` son `warn` en vez de `error`.

---

## M-20: `src/lib/db/localDb.js` — SQL injection potencial

**Archivo:** `src/lib/db/localDb.js`

**Problema:** `buildSelectQuery` interpola nombres de tabla y campos directamente en SQL. Si `tableName` viene de input de usuario, es SQL injection.

---

# 3) Recomendaciones de Priorización para Refactor

## Fase 1: Seguridad Inmediata (Semana 1)

**Estas deben resolverse ANTES de cualquier otra cosa.**

| Prioridad | Acción                                                                                         | Esfuerzo | Impacto |
| --------- | ---------------------------------------------------------------------------------------------- | -------- | ------- |
| 🔴 1      | Rotar todas las credenciales expuestas (OpenRouter, Copilot, Supabase)                         | 1h       | Máximo  |
| 🔴 2      | Mover secrets a `.env`, agregar `data/` a `.gitignore`                                         | 2h       | Máximo  |
| 🔴 3      | Fix path traversal en `/api/fs/*` — validar que paths resueltos permanezcan dentro de basePath | 2h       | Máximo  |
| 🔴 4      | Eliminar o proteger `/api/db/query` y `/api/db/mutate`                                         | 1h       | Máximo  |
| 🔴 5      | Agregar auth middleware básico a TODAS las API routes                                          | 4h       | Máximo  |
| 🔴 6      | Eliminar `eval()` de `ttyServer.js` — usar dynamic import estándar                             | 1h       | Alto    |
| 🔴 7      | Habilitar CSP en `tauri.conf.json`                                                             | 1h       | Alto    |
| 🔴 8      | Hardcoded paths → variables de entorno                                                         | 2h       | Alto    |

## Fase 2: Deuda Técnica Crítica (Semanas 2-3)

| Prioridad | Acción                                                                            | Esfuerzo | Impacto |
| --------- | --------------------------------------------------------------------------------- | -------- | ------- |
| 🟠 9      | Eliminar funciones duplicadas en `localDb.js` (73 líneas)                         | 1h       | Alto    |
| 🟠 10     | Extraer `loadConfig()` a módulo compartido                                        | 2h       | Medio   |
| 🟠 11     | Extraer Copilot token exchange a servicio compartido                              | 3h       | Medio   |
| 🟠 12     | Crear archivo de constantes — magic numbers → named constants                     | 4h       | Medio   |
| 🟠 13     | Extraer `esc()`, `timeSince()`, `safeFetch` a módulo compartido en telegram-bot   | 2h       | Medio   |
| 🟠 14     | Unificar query builders (`LocalQuery` + `LocalQueryClient`)                       | 4h       | Medio   |
| 🟠 15     | Eliminar dead code: `src/index.js`, `src/proxy.ts`, `__init__.py`, `ws_probe.txt` | 1h       | Bajo    |
| 🟠 16     | Fix `tailwind.config.js` o eliminar (Tailwind v4)                                 | 2h       | Medio   |
| 🟠 17     | Fix auth bypass en telegram-bot (`ALLOWED_USER_IDS`)                              | 1h       | Alto    |
| 🟠 18     | Fix error classification en copilot-adapter                                       | 2h       | Medio   |

## Fase 3: Refactor Arquitectónico (Semanas 4-8)

| Prioridad | Acción                                                                           | Esfuerzo    | Impacto |
| --------- | -------------------------------------------------------------------------------- | ----------- | ------- |
| 🟡 19     | **Descomponer `AgentHub.jsx`** en 8-10 hooks + componentes                       | 2-3 semanas | Máximo  |
| 🟡 20     | **Descomponer `SwarmControl.jsx`** en hooks + componentes                        | 1-2 semanas | Alto    |
| 🟡 21     | **Descomponer `Ajustes.jsx`** — cada tab como componente                         | 1 semana    | Alto    |
| 🟡 22     | **Descomponer `Tareas.jsx`** — TaskModal, AgentQueueView, hooks                  | 1 semana    | Alto    |
| 🟡 23     | Crear capa de servicios para API calls (reemplazar fetch directo en componentes) | 2 semanas   | Máximo  |
| 🟡 24     | Crear capa de repositorios para DB (reemplazar llamadas directas en routes)      | 2 semanas   | Máximo  |
| 🟡 25     | Migrar a TypeScript o al menos JSDoc completo                                    | 3-4 semanas | Alto    |
| 🟡 26     | Unificar inline styles → Tailwind consistente                                    | 2 semanas   | Medio   |
| 🟡 27     | Agregar error boundaries a nivel de app y por feature                            | 2 días      | Alto    |
| 🟡 28     | Fix memory leaks (cleanup en useEffect, intervalos, listeners)                   | 3 días      | Alto    |

## Fase 4: Testing y Calidad (Semanas 8-10)

| Prioridad | Acción                                                     | Esfuerzo  | Impacto |
| --------- | ---------------------------------------------------------- | --------- | ------- |
| 🟢 29     | Migrar a Vitest/Jest como test runner principal            | 2 días    | Medio   |
| 🟢 30     | Escribir tests reales para E2E (assertions significativas) | 1 semana  | Alto    |
| 🟢 31     | Tests unitarios para hooks y servicios                     | 2 semanas | Alto    |
| 🟢 32     | Tests para `LocalQueryBuilder` y funciones de DB           | 3 días    | Medio   |
| 🟢 33     | Configurar coverage mínimo (target: 60%)                   | 1 día     | Medio   |
| 🟢 34     | Agregar ESLint plugins faltantes o eliminarlos             | 1 día     | Bajo    |
| 🟢 35     | Hacer `no-unused-vars` y `prefer-const` reglas `error`     | 1 día     | Bajo    |

## Fase 5: Mejoras Estructurales (Ongoing)

| Prioridad | Acción                                                                          | Esfuerzo | Impacto |
| --------- | ------------------------------------------------------------------------------- | -------- | ------- |
| ⚪ 36     | `opencode/` → git submodule o eliminar                                          | 1 día    | Medio   |
| ⚪ 37     | Actualizar `memory/PRD.md`                                                      | 2 días   | Bajo    |
| ⚪ 38     | Completar spec `telegram-llm-bridge`                                            | 1 día    | Bajo    |
| ⚪ 39     | Pin dependencias en telegram-bot (eliminar `"latest"`)                          | 2h       | Medio   |
| ⚪ 40     | Agregar rate limiting a telegram-bot y sidecar                                  | 2 días   | Alto    |
| ⚪ 41     | Unificar logger (eliminar `console.error/warn` en favor de logger estructurado) | 1 día    | Bajo    |
| ⚪ 42     | Establecer convención de idioma (español o inglés consistente)                  | Ongoing  | Bajo    |

---

## Resumen de Priorización

```
Fase 1 (Semana 1):     SEGURIDAD — 8 acciones, ~14h de esfuerzo
Fase 2 (Semanas 2-3):  DEUDA CRÍTICA — 10 acciones, ~22h de esfuerzo
Fase 3 (Semanas 4-8):  REFACTOR ARQUITECTÓNICO — 10 acciones, 8-12 semanas
Fase 4 (Semanas 8-10): TESTING Y CALIDAD — 7 acciones, ~4 semanas
Fase 5 (Ongoing):      MEJORAS ESTRUCTURALES — 7 acciones, ongoing
```

**Total estimado:** 12-16 semanas para una refactorización completa, con mejoras de seguridad inmediatas en la primera semana.

---

## Principios de Arquitectura Violados

| Principio                        | Violación                                          | Severidad |
| -------------------------------- | -------------------------------------------------- | --------- |
| **Single Responsibility**        | 9 God Components (500-1600+ líneas)                | 🔴        |
| **Separation of Concerns**       | 0 capas de servicio, componentes llaman DB directo | 🔴        |
| **DRY**                          | 20+ duplicaciones de lógica identificadas          | 🔴        |
| **Open/Closed**                  | Hardcoded values everywhere, no extensibilidad     | 🟠        |
| **Dependency Inversion**         | Dependencia directa de implementaciones concretas  | 🟠        |
| **Least Privilege**              | 46 routes sin auth, DB proxy abierto               | 🔴        |
| **Defense in Depth**             | Path traversal, SQL injection, eval()              | 🔴        |
| **Fail Fast**                    | Empty catch blocks, fire-and-forget operations     | 🟠        |
| **Immutability**                 | Global state mutation en 6+ módulos                | 🟠        |
| **Composition over Inheritance** | Query builders duplicados en vez de compartir base | 🟠        |

---

_Fin del reporte de auditoría._
