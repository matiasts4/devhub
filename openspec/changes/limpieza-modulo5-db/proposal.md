# Proposal: Limpieza Módulo 5 — Eliminar Supabase, Dead Code y Fix Arquitectura

## Intent

Módulo 5 (Base de Datos Local) tiene **residuos de la migración Supabase→SQLite** que generan deuda técnica, exponen credenciales en `.env.local` (incluyendo `SUPABASE_SERVICE_ROLE_KEY` — admin key), y causan bugs de arquitectura. Las vistas usan Supabase directamente (~37 llamadas totales en AgentHub, SwarmControl, Dashboard) en lugar del bridge local, hay funciones duplicadas en `localDb.js`, y el metrics API abre conexiones DB independientes. Esto **bloquea la confianza** en que el proyecto funciona 100% offline con SQLite local.

## Scope

### In Scope

- Eliminar imports y llamadas directas a Supabase en `AgentHub.jsx`, `SwarmControl.jsx`, `Dashboard.jsx`
- Remover dependencias npm de Supabase (`@supabase/*`)
- Eliminar variables Supabase de `.env.local` (incluyendo `SUPABASE_SERVICE_ROLE_KEY` expuesta)
- Borrar scripts de test muertos y artefactos de migración
- Eliminar código duplicado en `localDb.js` (líneas 583-655)
- Fix: `metrics/route.js` usa `getDb()` en vez de abrir conexión propia
- Fix: agregar `agent_logs` a `ensureRuntimeSchema()`
- Fix: validar nombres de tabla en `/api/db/query/route.js`
- Fix: sanitizar input FTS5 en `searchTraces()`
- Actualizar `devhub-mcp/server.js` para usar solo driver SQLite

### Out of Scope

- Eliminar `localSupabase.js` — es un shim compatible usado por 18 archivos, habla a rutas locales
- Borrar documentación con referencias históricas a Supabase
- Refactorizar estructura de tablas existente
- Agregar nuevas features o endpoints

## Capabilities

### New Capabilities

- Ninguna — esta es una limpieza, no se introducen capacidades nuevas

### Modified Capabilities

- `local-database`: Eliminación de Supabase directo, fix de arquitectura, sanitización FTS5
- `db-api`: Validación de nombres de tabla en query route

## Approach

1. **Fase 1 — Supabase removal**: Reemplazar llamadas `supabase.from()` por `localDb.*` o `localSupabase.createClient()` en las 3 vistas. Remover deps npm y env vars.
2. **Fase 2 — Dead code**: Borrar archivos `.bak`, scripts de test, JSON de migración, funciones duplicadas.
3. **Fase 3 — Architecture fixes**: Metrics API usa `getDb()`, `agent_logs` en schema, validación de tablas, sanitización FTS5.
4. **Fase 4 — MCP cleanup**: `devhub-mcp/server.js` elimina branch de Supabase, solo SQLite.

## Affected Areas

| Area                                    | Impact   | Description                                                       |
| --------------------------------------- | -------- | ----------------------------------------------------------------- |
| `src/views/AgentHub.jsx`                | Modified | Reemplazar ~22 llamadas supabase por localDb                      |
| `src/views/SwarmControl.jsx`            | Modified | Reemplazar ~9 llamadas + realtime channel                         |
| `src/views/Dashboard.jsx`               | Modified | Reemplazar ~6 llamadas supabase                                   |
| `src/lib/db/localDb.js`                 | Modified | Eliminar funciones duplicadas, agregar agent_logs, sanitizar FTS5 |
| `src/app/api/metrics/route.js`          | Modified | Usar getDb() en vez de new Database()                             |
| `src/app/api/db/query/route.js`         | Modified | Validar nombres de tabla contra allowlist                         |
| `devhub-mcp/server.js`                  | Modified | Eliminar branch DB_DRIVER=supabase                                |
| `package.json`                          | Modified | Remover @supabase/\* deps                                         |
| `.env.local`                            | Modified | Eliminar SUPABASE\_\* variables                                   |
| `test-*.js` (5 files)                   | Removed  | Scripts de test muertos                                           |
| `scripts/export/*.json` (7 files)       | Removed  | Artefactos de migración                                           |
| `scripts/migrate-supabase-to-sqlite.js` | Removed  | Migración ya completada                                           |
| `src/views/Tareas.jsx.bak`              | Removed  | Backup file                                                       |

## Risks

| Risk                                            | Likelihood | Mitigation                                                              |
| ----------------------------------------------- | ---------- | ----------------------------------------------------------------------- |
| Regresión en vistas al cambiar supabase→localDb | Medium     | Test manual de AgentHub, SwarmControl, Dashboard después de cada cambio |
| Eliminar función que aún se usa                 | Low        | grep exhaustivo antes de borrar cada función                            |
| FTS5 sanitización rompe búsquedas válidas       | Low        | Sanitizar solo caracteres especiales de FTS5, no contenido normal       |
| MCP server pierde funcionalidad sin Supabase    | Low        | Solo afecta DB_DRIVER=supabase, que ya no se usa                        |

## Rollback Plan

1. `git revert` del commit completo — todos los cambios son reversibles
2. Las vistas mantienen compatibilidad con `localSupabase.js` shim (no se toca)
3. Las funciones eliminadas están duplicadas — las originales permanecen intactas
4. `.env.local` se puede restaurar de backup si es necesario

## Dependencies

- Ninguna — change autocontenido, no requiere otros changes

## Success Criteria

- [ ] Cero imports de `@supabase/supabase-js` en código de producción
- [ ] Cero variables SUPABASE\_\* en `.env.local`
- [ ] AgentHub, SwarmControl, Dashboard funcionan con datos locales
- [ ] `localDb.js` sin funciones duplicadas
- [ ] Metrics API usa `getDb()` compartido
- [ ] `agent_logs` table creada en `ensureRuntimeSchema()`
- [ ] Query route rechaza nombres de tabla inválidos
- [ ] FTS5 sanitiza caracteres especiales (`"`, `*`, `+`, `-`, etc.)
- [ ] `devhub-mcp/server.js` sin branch de Supabase
- [ ] `npm ls @supabase/*` retorna vacío
