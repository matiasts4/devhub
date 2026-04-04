# Módulo 5: Base de Datos Local — REPORTE DE REVISIÓN

> **Fecha:** Abril 2026
> **Estado:** ✅ Revisado y corregido
> **Cambio:** `limpieza-modulo5-db`

---

## ✅ Correcciones Aplicadas

### 1. Eliminación completa de Supabase

| Acción          | Archivo                   | Detalle                                                                                             |
| --------------- | ------------------------- | --------------------------------------------------------------------------------------------------- |
| 🗑️ Dependencias | `package.json`            | Eliminados `@supabase/auth-helpers-nextjs`, `@supabase/ssr`, `@supabase/supabase-js`                |
| 🗑️ Dependencias | `devhub-mcp/package.json` | Eliminado `@supabase/supabase-js`                                                                   |
| 🗑️ Credenciales | `.env.local`              | Eliminadas `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| ✅ Verificado   | `.gitignore`              | `.env.local` ya estaba ignorado                                                                     |
| 🔧 MCP Server   | `devhub-mcp/server.js`    | Eliminado switch `DB_DRIVER`, ahora solo SQLite local                                               |

### 2. Código muerto eliminado

| Archivo                                                   | Razón                                                                                  |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `src/lib/db/localDb.js` (líneas 583-655)                  | Funciones `insertMessage`, `getMessagesBySession`, `getToolTracesBySession` duplicadas |
| `src/views/Tareas.jsx.bak`                                | Backup obsoleto con import a `@/lib/supabase/client` (ruta inexistente)                |
| `test-rls.js`, `test-schema.js`, `test-schema2.js`        | Scripts de prueba con Supabase, no referenciados                                       |
| `test-projects.js`, `test-veloce.js`, `update-project.js` | Scripts de prueba con Supabase, no referenciados                                       |
| `test-mcp.js`                                             | Test MCP no referenciado en package.json                                               |
| `scripts/export/*.json` (7 archivos)                      | Datos de migración Supabase→SQLite ya completada                                       |

### 3. Fixes de arquitectura

| Fix               | Archivo                         | Antes                                              | Después                                                            |
| ----------------- | ------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------ |
| FTS5 sanitization | `src/lib/db/localDb.js`         | `searchTerm` pasado directo a `MATCH`              | `sanitizeFtsQuery()` escapa `"` y envuelve en `""`                 |
| Table allowlist   | `src/app/api/db/query/route.js` | Table param validado después de construir SQL      | Validación contra `Object.keys(localDb.tables)` ANTES de construir |
| DB connection     | `src/app/api/metrics/route.js`  | `new Database()` independiente, query `agent_logs` | `localDb.getDb()`, query `agent_traces`                            |

---

## 📊 Estado Actual de la Base de Datos

### Tablas en `localDb.js` (ensureRuntimeSchema)

| Tabla                  | Creada por   | Usada por                     | Estado               |
| ---------------------- | ------------ | ----------------------------- | -------------------- |
| `project_files`        | localDb.js   | `/api/projects/[id]/files`    | ✅                   |
| `telegram_activity`    | localDb.js   | API routes telegram           | ✅                   |
| `telegram_sessions`    | localDb.js   | API routes telegram           | ✅                   |
| `agent_hub_sessions`   | localDb.js   | AgentHub API, vistas          | ✅                   |
| `agent_hub_messages`   | localDb.js   | AgentHub API, vistas          | ✅                   |
| `agent_traces`         | localDb.js   | Traces API, metrics           | ✅                   |
| `agent_traces_fts`     | localDb.js   | Búsqueda FTS5                 | ✅                   |
| `agent_session_usage`  | localDb.js   | Usage API                     | ✅                   |
| `telegram_session_map` | localDb.js   | Session mapping               | ✅                   |
| `projects`             | makeTableOps | MCP, API routes               | ✅                   |
| `tasks`                | makeTableOps | API routes                    | ✅                   |
| `milestones`           | makeTableOps | MCP                           | ✅                   |
| `agent_registry`       | makeTableOps | ⚠️ Solo en `tables` object    | ⚠️                   |
| `mcp_connections`      | makeTableOps | ⚠️ Solo en `tables` object    | ⚠️                   |
| `ai_interactions`      | makeTableOps | ⚠️ Solo en `tables` object    | ⚠️                   |
| `profiles`             | makeTableOps | ⚠️ Solo en `tables` object    | ⚠️                   |
| `task_dependencies`    | makeTableOps | ⚠️ Solo en `tables` object    | ⚠️                   |
| `agent_logs`           | telegram-bot | telegram-bot, metrics (antes) | ⚠️ Externa a localDb |

### Tablas huérfanas (definidas pero sin uso activo detectado)

- `agent_registry` — definida en `tables` pero sin queries directos
- `mcp_connections` — definida en `tables` pero sin queries directos
- `ai_interactions` — definida en `tables` pero sin queries directos
- `profiles` — definida en `tables` pero sin queries directos
- `task_dependencies` — definida en `tables` pero sin queries directos

### Tabla externa

- `agent_logs` — creada y usada SOLO por `telegram-bot/services/activityLogger.js` y `telegram-bot/services/db.js`. No está en `localDb.js`.

---

## 🔒 Seguridad

| Issue                              | Estado      | Detalle                           |
| ---------------------------------- | ----------- | --------------------------------- |
| Supabase Service Role Key expuesta | ✅ RESUELTO | Eliminada de `.env.local`         |
| SQL injection en FTS5              | ✅ RESUELTO | `sanitizeFtsQuery()` escapa input |
| SQL injection en table name        | ✅ RESUELTO | Allowlist antes de construir SQL  |
| Conexión DB duplicada en metrics   | ✅ RESUELTO | Usa `localDb.getDb()` compartido  |

---

## 🏗️ Arquitectura

### Capas de acceso a DB

```
┌─────────────────────────────────────────────────┐
│  Vistas (React)                                 │
│  → localSupabase.js (shim)                      │
│    → /api/db/query, /api/db/mutate              │
│      → localDb.js (better-sqlite3)              │
│        → data/devhub.db                         │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  API Routes (Next.js)                           │
│  → localDb.js (getDb(), tables, ORM functions)  │
│    → data/devhub.db                             │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  MCP Server (devhub-mcp)                        │
│  → localDb.js (require CJS)                     │
│    → data/devhub.db                             │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  Telegram Bot (telegram-bot)                    │
│  → telegram-bot/services/db.js (propia conexión)│
│  → telegram-bot/services/activityLogger.js      │
│    → data/devhub.db (tabla agent_logs)          │
└─────────────────────────────────────────────────┘
```

### ⚠️ Issue pendiente: Telegram Bot conexiones independientes

El telegram bot abre sus propias conexiones a SQLite en vez de usar `localDb.getDb()`. Esto funciona con WAL mode pero es ineficiente. No se corrigió en este cambio porque requiere refactor del bot.

---

## 📋 Checklist de Revisión Original

- [x] ¿Qué librería usa? → `better-sqlite3` (CommonJS)
- [x] ¿Cómo se inicializa? → `getDb()` singleton con `ensureRuntimeSchema()`
- [x] ¿Dónde se almacena? → `data/devhub.db` (WAL mode)
- [x] ¿Schema completo? → 17 tablas + FTS5 virtual table
- [x] ¿Migraciones? → No hay sistema de migraciones formal
- [x] ¿Qué datos se guardan localmente? → Todo (proyectos, tareas, sesiones, traces, usage)
- [x] ¿Sesiones? → No hay sistema de sesiones de usuario en DB
- [x] ¿SQL injection? → Queries parametrizados ✅, FTS5 sanitizado ✅, table allowlist ✅
- [x] ¿Datos sensibles en DB? → No detectado
- [x] ¿Concurrencia? → WAL mode + busy_timeout 5000ms

---

## 🎯 Recomendaciones para próxima iteración

1. **Agregar sistema de migraciones** — tabla `schema_version` con version tracking
2. **Unificar telegram-bot a `localDb.getDb()`** — eliminar conexiones independientes
3. **Agregar `agent_logs` a `ensureRuntimeSchema()`** — o migrar a `agent_traces`
4. **Limpiar tablas huérfanas** — si `agent_registry`, `mcp_connections`, etc. no se usan, eliminarlas del schema
5. **Agregar índices faltantes** — verificar queries lentos y agregar índices donde corresponda
