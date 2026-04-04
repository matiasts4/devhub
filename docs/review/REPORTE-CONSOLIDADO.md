# DevHub — Revisión Completa del Proyecto

> **Fecha:** Abril 2026
> **Módulos revisados:** 10/10
> **Archivos totales analizados:** ~250+
> **Total líneas de código auditadas:** ~25,000+

---

## 📊 Resumen Ejecutivo por Módulo

| #   | Módulo              | Archivos | Código Muerto                | Bugs Críticos               | Issues Medios        | Estado       |
| --- | ------------------- | -------- | ---------------------------- | --------------------------- | -------------------- | ------------ |
| 1   | Frontend Next.js    | ~10      | 54 líneas                    | 0                           | 9                    | ✅ Revisado  |
| 2   | Componentes UI      | 99       | 44 componentes (58%)         | 3 runtime                   | 13                   | ✅ Revisado  |
| 3   | Vistas/Páginas      | 14       | 350 líneas (2 vistas)        | 0                           | 28                   | ✅ Revisado  |
| 4   | API Routes          | 46       | 15 rutas muertas             | 5 (RCE + path traversal)    | 8                    | ✅ Revisado  |
| 5   | Base de Datos Local | ~10      | 14 archivos eliminados ✅    | 0                           | 3 fixes aplicados ✅ | ✅ Corregido |
| 6   | Telegram Bot        | ~45      | 11 archivos (LLM Bridge)     | 3 (ReferenceError + auth)   | 11                   | ✅ Revisado  |
| 7   | MCP Server          | 5        | openai dep + 4 tests muertos | 0                           | 9                    | ✅ Revisado  |
| 8   | Sidecar Backend     | 1        | **Completo** (orfanado)      | 1 (history buffer)          | 3                    | ✅ Revisado  |
| 9   | Desktop Tauri       | ~15      | 2 plugins no usados          | 4 (CSP, shell scope, paths) | 6                    | ✅ Revisado  |
| 10  | Agentes/Swarm       | 10       | 849 líneas (90%)             | 0                           | 13                   | ✅ Revisado  |

---

## 🔴 Hallazgos Críticos Totales (17)

### Seguridad (7)

| #   | Módulo       | Issue                                                      | Impacto                             |
| --- | ------------ | ---------------------------------------------------------- | ----------------------------------- |
| 1   | API Routes   | Command injection en `/api/agent/execute` (línea 42)       | RCE potencial                       |
| 2   | API Routes   | Command injection en `/api/agent/qa-result` (líneas 28-30) | RCE potencial                       |
| 3   | API Routes   | Path traversal en `/api/fs/file` (sin sanitización)        | Lectura arbitraria de archivos      |
| 4   | API Routes   | Path traversal en `/api/fs/read` (sin sanitización)        | Lectura arbitraria de archivos      |
| 5   | API Routes   | Path traversal en `/api/fs/tree` (base controlable)        | Enumeración de filesystem           |
| 6   | Telegram Bot | Token de Telegram expuesto en `.env`                       | Control total del bot               |
| 7   | Tauri        | `shell:allow-execute` sin scope + CSP nulo                 | Ejecución arbitraria desde frontend |

### Bugs de Runtime (6)

| #   | Módulo       | Issue                                                            | Impacto                   |
| --- | ------------ | ---------------------------------------------------------------- | ------------------------- |
| 8   | Componentes  | `EquipoSettings.jsx` importa `userPlus` (no existe)              | Crash al importar         |
| 9   | Componentes  | `TerminalTTY.jsx` llama `setInitError()` (estado no existe)      | Crash al iniciar terminal |
| 10  | Componentes  | `ProjectIndexRedirect.jsx` usa `next/navigation` en React Router | No funciona               |
| 11  | Telegram Bot | `executor.js` línea 294: `reason` undefined en `pauseTask()`     | Crash al pausar tareas    |
| 12  | Telegram Bot | `copilot-adapter.js`: args invertidos + constantes inexistentes  | Errores mal clasificados  |
| 13  | MCP Server   | `get_next_task` query `activeTask` declarada pero no usada       | Lógica muerta             |

### Arquitectura (4)

| #   | Módulo     | Issue                                             | Impacto                        |
| --- | ---------- | ------------------------------------------------- | ------------------------------ |
| 14  | API Routes | `force-static` en rutas con POST/PATCH/DELETE     | Mutaciones rotas en producción |
| 15  | Tauri      | `frontendDist` es URL en vez de path              | Build de producción roto       |
| 16  | Tauri      | Path hardcodeado `/home/matias/devhub` en wrapper | No funciona en otras máquinas  |
| 17  | Sidecar    | Sidecar orfanado — duplica PTY server de Next.js  | Código muerto completo         |

---

## 💀 Código Muerto Consolidado

| Módulo          | Archivos/Líneas             | Descripción                                                   |
| --------------- | --------------------------- | ------------------------------------------------------------- |
| 1. Frontend     | 54 líneas                   | providers.js stub, typos CSS, smoke-\* duplicado              |
| 2. Componentes  | 44 componentes (58%)        | 7 generales + 2 chat + 34 UI shadcn + 1 util                  |
| 3. Vistas       | 350 líneas (2 vistas)       | Dashboard.jsx + Proyectos.jsx                                 |
| 4. API Routes   | 15 rutas                    | Agentes legacy (6) + Chat IA (2) + Utils (5) + Duplicadas (2) |
| 5. DB Local     | 14 archivos ✅ ELIMINADOS   | Tests viejos, backups, exports de migración                   |
| 6. Telegram Bot | 11 archivos (~1,500 líneas) | LLM Bridge completo (deprecated)                              |
| 7. MCP Server   | 1 dep + 4 tests             | openai nunca usado + tests que no prueban el server           |
| 8. Sidecar      | 1 sistema completo          | Orfanado — reemplazado por ttyServer.js de Next.js            |
| 9. Tauri        | 2 plugins                   | notification + dialog no usados                               |
| 10. Agentes     | 849 líneas (90%)            | DocOps, slashSkills, hooks no usados                          |

**Total estimado: ~5,000+ líneas de código muerto identificadas**

---

## 📋 Plan de Acción por Prioridad

### 🔴 Prioridad 1 — Seguridad (Inmediato)

| #   | Acción                                         | Módulo | Esfuerzo |
| --- | ---------------------------------------------- | ------ | -------- |
| 1   | Rotar token de Telegram vía @BotFather         | 6      | 5 min    |
| 2   | Agregar sanitización de paths en `/api/fs/*`   | 4      | 1h       |
| 3   | Eliminar command injection en `/api/agent/*`   | 4      | 2h       |
| 4   | Agregar scope a `shell:allow-execute` en Tauri | 9      | 1h       |
| 5   | Agregar CSP en `tauri.conf.json`               | 9      | 30 min   |

### 🔴 Prioridad 2 — Bugs de Runtime (Esta semana)

| #   | Acción                                                        | Módulo | Esfuerzo |
| --- | ------------------------------------------------------------- | ------ | -------- |
| 6   | Fix `executor.js` línea 294 (`reason` undefined)              | 6      | 10 min   |
| 7   | Fix `copilot-adapter.js` argumentos y constantes              | 6      | 30 min   |
| 8   | Fix `TerminalTTY.jsx` estado `initError` inexistente          | 2      | 15 min   |
| 9   | Fix `EquipoSettings.jsx` import `userPlus` → `UserPlus`       | 2      | 5 min    |
| 10  | Eliminar `ProjectIndexRedirect.jsx` (Next.js en React Router) | 2      | 5 min    |
| 11  | Fix `force-static` → `force-dynamic` en rutas POST/PATCH      | 4      | 30 min   |
| 12  | Fix `frontendDist` en Tauri para producción                   | 9      | 30 min   |

### 🟡 Prioridad 3 — Eliminación de Código Muerto (Próxima semana)

| #   | Acción                                           | Módulo | Archivos | Esfuerzo |
| --- | ------------------------------------------------ | ------ | -------- | -------- |
| 13  | Eliminar 11 archivos LLM Bridge deprecated       | 6      | 11       | 2h       |
| 14  | Eliminar 34 componentes UI shadcn no usados      | 2      | 34       | 1h       |
| 15  | Eliminar 9 componentes generales muertos         | 2      | 9        | 1h       |
| 16  | Eliminar 15 rutas API muertas                    | 4      | 15       | 2h       |
| 17  | Eliminar 2 vistas muertas (Dashboard, Proyectos) | 3      | 2        | 15 min   |
| 18  | Eliminar sidecar-backend completo                | 8      | 3        | 1h       |
| 19  | Eliminar dep `openai` del MCP server             | 7      | 1        | 5 min    |
| 20  | Eliminar 849 líneas de agentes muertos           | 10     | 7        | 2h       |

### 🟡 Prioridad 4 — Mejoras de Arquitectura (Siguiente sprint)

| #   | Acción                                              | Módulo | Esfuerzo |
| --- | --------------------------------------------------- | ------ | -------- |
| 21  | Splittear `SwarmControl.jsx` (1,640 → 6-8 archivos) | 3      | 1-2 días |
| 22  | Splittear `AgentHub.jsx` (1,507 → 4-5 archivos)     | 3      | 1-2 días |
| 23  | Resolver duplicación Ajustes vs `/settings`         | 3      | 2h       |
| 24  | Unificar conexiones DB del Telegram Bot             | 6      | 2h       |
| 25  | Escribir tests de integración reales para MCP       | 7      | 1 día    |
| 26  | Fix path hardcodeado en wrapper Tauri               | 9      | 1h       |
| 27  | Memoizar `createClient()` en componentes            | 2      | 2h       |
| 28  | Centralizar `esc()` y `isMultiTurnTask()`           | 6      | 1h       |

---

## 📈 Métricas del Proyecto

| Métrica                         | Valor                |
| ------------------------------- | -------------------- |
| **Total archivos de código**    | ~250+                |
| **Líneas totales estimadas**    | ~25,000+             |
| **Código muerto identificado**  | ~5,000+ líneas (20%) |
| **Bugs críticos**               | 17                   |
| **Componentes UI no usados**    | 44 de 99 (58%)       |
| **Rutas API muertas**           | 15 de 46 (33%)       |
| **Vistas muertas**              | 2 de 14 (14%)        |
| **Archivos del bot deprecated** | 11 de ~45 (24%)      |
| **Módulos con código muerto**   | 10 de 10 (100%)      |

---

## 🏆 Lo que está Bien

| Aspecto                    | Módulo | Detalle                                          |
| -------------------------- | ------ | ------------------------------------------------ |
| DB Local bien estructurada | 5      | `localDb.js` con singleton, WAL mode, FTS5       |
| API routes de AgentHub     | 4      | Bien implementadas, sin Supabase                 |
| Hooks de observabilidad    | 10     | `useAgentTraces`, `useSessionUsage` bien hechos  |
| Componentes de chat        | 2      | `ChatMessageList`, `StreamingMessage` excelentes |
| MCP tools bien definidos   | 7      | 23 herramientas con Zod validation               |
| Telegram bot architecture  | 6      | Buena separación commands/services               |
| Temas CSS                  | 1      | 8 temas bien definidos en globals.css            |
| Terminal embebido Next.js  | 8      | `ttyServer.js` superior al sidecar               |

---

## 📁 Archivos de Reporte Generados

Todos los reportes están en `docs/review/` para reutilizar con otros agentes:

| Archivo                         | Contenido                             |
| ------------------------------- | ------------------------------------- |
| `PLAN-REVISION-MODULAR.md`      | Plan maestro con mapa de dependencias |
| `MODULO-01-frontend-nextjs.md`  | Frontend Next.js                      |
| `MODULO-02-componentes-ui.md`   | Componentes UI                        |
| `MODULO-03-vistas-paginas.md`   | Vistas/Páginas                        |
| `MODULO-04-api-routes.md`       | API Routes                            |
| `MODULO-05-base-datos-local.md` | Base de Datos Local (corregido)       |
| `MODULO-06-telegram-bot.md`     | Telegram Bot                          |
| `MODULO-07-mcp-server.md`       | MCP Server                            |
| `MODULO-08-sidecar-backend.md`  | Sidecar Backend                       |
| `MODULO-09-desktop-tauri.md`    | Desktop Tauri                         |
| `MODULO-10-agentes-swarm.md`    | Agentes y Swarm                       |
| `REPORTE-CONSOLIDADO.md`        | Este archivo                          |
