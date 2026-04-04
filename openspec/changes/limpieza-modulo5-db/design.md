# Design: Limpieza Módulo 5 — Eliminar Supabase, Dead Code y Fix Arquitectura

## Context

Módulo 5 migró de Supabase Cloud a SQLite local, pero quedaron residuos: ~28 llamadas `supabase.from()` directas en vistas de producción (AgentHub, SwarmControl, Dashboard, y adicionalmente ProjectDashboard, Roadmap, Conexiones, Ajustes, Tareas), credenciales expuestas en `.env.local` incluyendo `SUPABASE_SERVICE_ROLE_KEY`, funciones duplicadas en `localDb.js` (líneas 505-655), y el metrics API abre su propia conexión DB en vez de usar `getDb()` compartido.

**Nota de scope ampliada**: El grep reveló que hay 5 vistas adicionales con llamadas `supabase.from()` que NO están en el proposal original: `ProjectDashboard.jsx`, `Roadmap.jsx`, `Conexiones.jsx`, `Ajustes.jsx`, `Tareas.jsx`. Estas usan el mismo shim `localSupabase.js` y apuntan a tablas que ya existen en `localDb.tables`. Se incluyen en este diseño porque el objetivo es "cero imports de `@supabase/supabase-js` en código de producción".

---

## Architecture Decision 1: Cómo reemplazar Supabase en vistas

### Opción evaluada: Opción B — Usar el shim `localSupabase.js` existente

**Decisión: Opción B** ✅

### Justificación

| Criterio                 | Opción A: Nuevas API routes | Opción B: Shim localSupabase.js                                |
| ------------------------ | --------------------------- | -------------------------------------------------------------- |
| Archivos ya compatibles  | 0                           | **18 archivos** ya lo usan                                     |
| Cambios en vistas        | Rewrite completo de fetch   | **Cero cambios de lógica** — mismo API `.from().select().eq()` |
| Nuevos endpoints         | ~10 endpoints nuevos        | **0 endpoints nuevos**                                         |
| Realtime (SwarmControl)  | Necesita SSE nuevo          | `localRealtime` stub ya existe (no-op)                         |
| Riesgo de regresión      | Alto                        | **Bajo** — shim ya probado en 18 archivos                      |
| Tiempo de implementación | 2-3 días                    | **Horas**                                                      |

**Por qué Opción B:**

1. **`localSupabase.js` YA existe y funciona**: Implementa `LocalQueryClient` con `.select()`, `.eq()`, `.insert()`, `.update()`, `.delete()`, `.upsert()`, `.single()`, `.order()`, `.limit()`, `.in()`, `.neq()`, `.not()`, `.lt()`, `.lte()`, `.gt()`, `.gte()`. Habla con `/api/db/query` y `/api/db/mutate` que ya existen.

2. **18 archivos ya lo usan**: Si creamos API routes nuevas, tendríamos dos formas de hacer lo mismo. El shim es la capa de abstracción correcta.

3. **Las tablas ya están registradas**: `agent_hub_sessions` y `agent_hub_messages` ya existen en `localDb.tables` (líneas 302-303). El query route ya las soporta.

4. **El único gap es realtime**: SwarmControl usa `supabase.channel().on('postgres_changes')`. El shim ya tiene `localRealtime` stub (líneas 229-265) que es no-op. SwarmControl **ya tiene SSE propio** via `useSessionStream()` hook que conecta a `/api/agenthub/sessions/stream`. El channel de realtime de SwarmControl solo se usa para tasks (líneas 763-774), y se puede reemplazar con polling simple cada 5s (ya existe `fetchTasks()` con intervalo).

### Plan de migración por vista

**AgentHub.jsx** (12 llamadas `supabase.from()`):

- Todas apuntan a `agent_hub_sessions` y `agent_hub_messages` — tablas ya en `localDb.tables`
- Cambio: Ninguno en la lógica. El shim `createClient()` ya retorna un cliente compatible
- **Verificación**: Confirmar que `localSupabase.js` soporta todas las operaciones usadas:
  - `.insert()` ✅ (línea 132-136, muta via `_executeMutation`)
  - `.update().eq()` ✅ (línea 138-142)
  - `.delete().eq()` ✅ (línea 150-153)
  - `.select().eq().order()` ✅ (línea 27-37, 40-43, 80-83)

**SwarmControl.jsx** (3 llamadas `supabase.from()` + 1 channel realtime):

- `agent_registry.select()` ✅ — tabla en `localDb.tables` (línea 299)
- `tasks.select().eq().order()` ✅ — tabla en `localDb.tables` (línea 296)
- `tasks.select().eq().in().order().limit()` ✅ — `.in()` soportado (línea 50-53)
- **Realtime channel** (líneas 763-774): Reemplazar con polling cada 5s. El SSE ya maneja session updates en tiempo real. El channel solo refresca tasks, que ya se hace con `fetchTasks()`.

**Dashboard.jsx** (5 llamadas `supabase.from()`):

- `tasks.update().eq()` ✅
- `tasks.select().eq().lt()` ✅ — `.lt()` soportado (línea 55-58)
- `tasks.update().in()` ✅ — `.in()` soportado

**Vistas adicionales** (fuera del proposal original pero necesarias):

- `ProjectDashboard.jsx`: `tasks.select().eq()` ✅
- `Roadmap.jsx`: `milestones.insert()`, `milestones.update().eq()`, `milestones.delete().eq()` ✅
- `Conexiones.jsx`: `mcp_connections.insert()`, `mcp_connections.update().eq()`, `mcp_connections.delete().eq()` ✅
- `Ajustes.jsx`: `tasks.delete().eq()`, `milestones.delete().eq()`, `projects.delete().eq()` ✅
- `Tareas.jsx`: `task_dependencies.insert()`, `agent_registry.insert()`, `task_dependencies.select()`, `milestones.select().eq()`, `tasks.update().eq()`, `tasks.delete().eq()` ✅

**Conclusión**: Todas las operaciones están soportadas por el shim. No se necesitan API routes nuevas.

---

## Architecture Decision 2: MCP Server — Eliminar branch Supabase

**Decisión: Eliminar completamente la rama `DB_DRIVER=supabase`** ✅

### Justificación

1. **El branch supabase es código muerto**: `DB_DRIVER` default es `sqlite` (línea 34). No hay evidencia de que alguien use `DB_DRIVER=supabase` en producción.

2. **Mantiene dependencia innecesaria**: `devhub-mcp/package.json` tiene `@supabase/supabase-js` (línea 17) solo para este branch.

3. **Expone credenciales**: Las líneas 36-37 leen `SUPABASE_SERVICE_ROLE_KEY` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` — credenciales que deben eliminarse.

4. **`LocalQueryBuilder` ya es completo**: Implementa select, insert, update, upsert, delete con filtros eq, in, or(ilike), order, limit, single, count, head. Es funcionalmente equivalente al cliente Supabase para las operaciones del MCP server.

5. **`createLocalClient()` ya existe**: Líneas 380-429, con `ensureLocalMcpTables()` que crea `task_comments` y `agent_memory`.

### Cambios en `devhub-mcp/server.js`:

```
ANTES (líneas 34-445):
  DB_DRIVER switch → if supabase: import @supabase/supabase-js → createClient
                   → else: createLocalClient()

DESPUÉS:
  Eliminar DB_DRIVER, SUPABASE_URL, SUPABASE_KEY
  Eliminar condicional if/else (líneas 431-445)
  Usar directamente: const supabase = createLocalClient()
  Eliminar import de @supabase/supabase-js
  Eliminar devhub-mcp/package.json → @supabase/supabase-js
```

**Nota**: La variable se llama `supabase` pero apunta al cliente local. Se podría renombrar a `db` pero eso tocaría ~50 referencias en tools. **No renombrar** — el nombre es una variable interna, el riesgo de regresión supera el beneficio cosmético.

---

## Architecture Decision 3: Consolidación de conexiones DB

**Decisión: Unificar todo a `getDb()` de localDb** ✅

### Situación actual — 4 formas de acceder a la DB:

| #   | Método                   | Ubicación                        | Problema                                  |
| --- | ------------------------ | -------------------------------- | ----------------------------------------- |
| 1   | `localDb.getDb()`        | `localDb.js` línea 186           | ✅ Singleton correcto                     |
| 2   | `new Database(dbPath)`   | `api/metrics/route.js` línea 8   | ❌ Abre conexión propia, no usa singleton |
| 3   | `localDb.tables[table]`  | `api/db/query/route.js` línea 47 | ✅ Usa getDb() internamente               |
| 4   | `localDb.getDb()` en MCP | `devhub-mcp/server.js` línea 84  | ✅ Usa getDb()                            |

### Problema con metrics/route.js

La línea 8 crea `new Database(dbPath, { readonly: true })` — conexión independiente que:

- No comparte el singleton `_db` de `localDb`
- No ejecuta `ensureRuntimeSchema()` (por eso no encuentra `agent_logs`)
- No comparte WAL mode, foreign keys, busy timeout
- Cierra la DB al final (`db.close()`) pero en un server Next.js esto puede causar problemas

### Fix

```
ANTES (metrics/route.js):
  const db = new Database(dbPath, { readonly: true });
  // queries...
  db.close();

DESPUÉS:
  const db = localDb.getDb();
  // queries...
  // NO cerrar — es singleton compartido
```

**Nota sobre `agent_logs`**: La tabla `agent_logs` NO existe en `ensureRuntimeSchema()`. Las queries del metrics route apuntan a una tabla que no se crea automáticamente. Hay dos opciones:

- **Opción A**: Agregar `agent_logs` a `ensureRuntimeSchema()` (como dice el proposal)
- **Opción B**: Cambiar las queries para usar `agent_traces` que YA existe y tiene datos equivalentes

**Decisión: Opción B** — `agent_traces` ya tiene toda la información que `agent_logs` tendría (session_id, agent_name, tool_name, tool_status, duration_ms, created_at). No crear una tabla duplicada. Las queries se adaptan:

```sql
-- ANTES (agent_logs):
SELECT session_id, agent_name, MAX(created_at) as last_activity
FROM agent_logs GROUP BY session_id, agent_name

-- DESPUÉS (agent_traces):
SELECT session_id, agent_name, MAX(created_at) as last_activity
FROM agent_traces GROUP BY session_id, agent_name
```

Esto elimina la necesidad de agregar `agent_logs` al schema y usa datos que ya existen.

---

## Architecture Decision 4: Validación de nombres de tabla en `/api/db/query`

**Decisión: Agregar allowlist de tablas válidas** ✅

El query route actual (línea 47-49) solo verifica `localDb.tables[table]` — esto ya es una validación implícita. Pero el mutate route (línea 15-17) hace lo mismo. **Ambos ya validan**, pero el error message expone el nombre de la tabla solicitada.

**Mejora**: Agregar una allowlist explícita como capa de seguridad adicional:

```js
const ALLOWED_TABLES = new Set([
  'projects',
  'tasks',
  'milestones',
  'project_files',
  'agent_registry',
  'mcp_connections',
  'ai_interactions',
  'agent_hub_sessions',
  'agent_hub_messages',
  'profiles',
  'task_dependencies',
  'telegram_sessions',
  'telegram_activity',
  'agent_traces',
  'agent_session_usage',
  'telegram_session_map',
]);
```

Esto previene inyección SQL a través del parámetro `table` en caso de que `localDb.tables` tenga alguna entrada inesperada en el futuro.

---

## Architecture Decision 5: Sanitización FTS5 en `searchTraces()`

**Decisión: Sanitizar caracteres especiales de FTS5 antes de pasar a MATCH** ✅

FTS5 interpreta caracteres como `"`, `*`, `+`, `-`, `NEAR`, `AND`, `OR`, `NOT` como operadores. Si un usuario busca `fix "auth" bug`, la query falla con syntax error.

**Implementación**:

```js
function sanitizeFts5Query(term) {
  if (!term) return '';
  // Escapar comillas dobles
  let sanitized = term.replace(/"/g, '""');
  // Envolver en comillas si contiene caracteres especiales
  if (/[\*\+\-"]/.test(sanitized) || /\b(NEAR|AND|OR|NOT)\b/i.test(sanitized)) {
    sanitized = `"${sanitized}"`;
  }
  return sanitized;
}
```

Aplicar en `searchTraces()` línea 471 antes de pasar `searchTerm` a `MATCH`.

---

## Implementation Plan

### Fase 1: Código muerto (bajo riesgo, rápido)

**Objetivo**: Eliminar todo lo que no se usa sin tocar código productivo.

| #   | Acción                                                              | Archivos                                | Riesgo                                                              |
| --- | ------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------- |
| 1.1 | Eliminar scripts de test muertos (`test-*.js`, 5 files)             | `test-*.js`                             | Bajo                                                                |
| 1.2 | Eliminar artefactos de migración (`scripts/export/*.json`, 7 files) | `scripts/export/`                       | Bajo                                                                |
| 1.3 | Eliminar script de migración ya completada                          | `scripts/migrate-supabase-to-sqlite.js` | Bajo                                                                |
| 1.4 | Eliminar backup file                                                | `src/views/Tareas.jsx.bak`              | Bajo                                                                |
| 1.5 | Eliminar funciones duplicadas en `localDb.js` (líneas 583-655)      | `src/lib/db/localDb.js`                 | Bajo — son duplicados exactos de 400-505                            |
| 1.6 | Eliminar `SUPABASE_*` de `.env.local`                               | `.env.local`                            | Bajo                                                                |
| 1.7 | Eliminar `@supabase/*` de `package.json` root                       | `package.json`                          | Bajo — verificar que ningún archivo productivo importe directamente |
| 1.8 | Eliminar `@supabase/supabase-js` de `devhub-mcp/package.json`       | `devhub-mcp/package.json`               | Bajo                                                                |

### Fase 2: Fix de arquitectura en localDb y API routes

**Objetivo**: Corregir bugs estructurales antes de migrar vistas.

| #   | Acción                                                             | Archivos                                                          | Riesgo                                                   |
| --- | ------------------------------------------------------------------ | ----------------------------------------------------------------- | -------------------------------------------------------- |
| 2.1 | Fix metrics API: usar `localDb.getDb()` en vez de `new Database()` | `src/app/api/metrics/route.js`                                    | Medio — cambiar queries de `agent_logs` → `agent_traces` |
| 2.2 | Agregar allowlist de tablas en query y mutate routes               | `src/app/api/db/query/route.js`, `src/app/api/db/mutate/route.js` | Bajo                                                     |
| 2.3 | Sanitizar FTS5 en `searchTraces()`                                 | `src/lib/db/localDb.js`                                           | Bajo                                                     |

### Fase 3: Migración de vistas

**Objetivo**: Todas las vistas usan el shim localSupabase.js (que ya habla con SQLite).

**Importante**: Las vistas YA importan `createClient` de `localSupabase.js`. El shim ya funciona. Las llamadas `supabase.from()` YA van a SQLite via API routes. **No hay que cambiar la lógica de las vistas**.

| #   | Acción                                                                                | Archivos                     | Riesgo                                           |
| --- | ------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------ |
| 3.1 | Verificar que AgentHub funciona con shim local                                        | `src/views/AgentHub.jsx`     | Bajo — ya usa `createClient()` de localSupabase  |
| 3.2 | Reemplazar realtime channel de SwarmControl con polling                               | `src/views/SwarmControl.jsx` | Medio — el channel de tasks necesita alternativa |
| 3.3 | Verificar Dashboard con shim local                                                    | `src/views/Dashboard.jsx`    | Bajo                                             |
| 3.4 | Verificar vistas adicionales (ProjectDashboard, Roadmap, Conexiones, Ajustes, Tareas) | 5 archivos                   | Bajo — ya usan localSupabase shim                |

**Detalle Fase 3.2 — SwarmControl realtime**:

El channel de realtime en SwarmControl (líneas 763-774) hace:

```js
const channel = supabase
  .channel('swarm_control_tasks')
  .on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'tasks', filter: `project_id=eq.${project.id}` },
    () => fetchTasks()
  )
  .subscribe();
```

El stub `localRealtime.channel()` en `localSupabase.js` (líneas 230-263) es un no-op que no dispara callbacks de `postgres_changes`. **Reemplazo**: Agregar un `setInterval` que llame a `fetchTasks()` cada 5 segundos. Ya existe un patrón similar en SwarmControl para traces activos (líneas 790-795).

### Fase 4: MCP Server + dependencias + credenciales

**Objetivo**: MCP server solo usa SQLite, sin branch de Supabase.

| #   | Acción                                                 | Archivos                             | Riesgo                      |
| --- | ------------------------------------------------------ | ------------------------------------ | --------------------------- |
| 4.1 | Eliminar branch `DB_DRIVER=supabase`                   | `devhub-mcp/server.js` líneas 34-445 | Bajo — default ya es sqlite |
| 4.2 | Eliminar variables SUPABASE\_\* del MCP                | `devhub-mcp/server.js` líneas 36-37  | Bajo                        |
| 4.3 | Eliminar import condicional de `@supabase/supabase-js` | `devhub-mcp/server.js` línea 433     | Bajo                        |
| 4.4 | Remover dependencia de `@supabase/supabase-js`         | `devhub-mcp/package.json`            | Bajo                        |
| 4.5 | `npm install` para limpiar lockfile                    | `package-lock.json`                  | Bajo                        |

---

## File Impact

### Modified

| File                             | Change                                                             | Líneas aprox                         |
| -------------------------------- | ------------------------------------------------------------------ | ------------------------------------ |
| `src/lib/db/localDb.js`          | Eliminar funciones duplicadas (583-655), agregar sanitización FTS5 | ~80 líneas eliminadas, ~10 agregadas |
| `src/app/api/metrics/route.js`   | Usar `localDb.getDb()`, cambiar `agent_logs` → `agent_traces`      | ~20 líneas modificadas               |
| `src/app/api/db/query/route.js`  | Agregar allowlist de tablas                                        | ~15 líneas agregadas                 |
| `src/app/api/db/mutate/route.js` | Agregar allowlist de tablas                                        | ~15 líneas agregadas                 |
| `src/views/SwarmControl.jsx`     | Reemplazar realtime channel con polling                            | ~15 líneas modificadas               |
| `devhub-mcp/server.js`           | Eliminar branch supabase, variables, import                        | ~20 líneas eliminadas                |
| `package.json`                   | Eliminar 3 deps `@supabase/*`                                      | 3 líneas eliminadas                  |
| `devhub-mcp/package.json`        | Eliminar 1 dep `@supabase/supabase-js`                             | 1 línea eliminada                    |
| `.env.local`                     | Eliminar variables `SUPABASE_*`                                    | ~4 líneas eliminadas                 |

### Removed

| File                                    | Reason                  |
| --------------------------------------- | ----------------------- |
| `test-*.js` (5 files)                   | Scripts de test muertos |
| `scripts/export/*.json` (7 files)       | Artefactos de migración |
| `scripts/migrate-supabase-to-sqlite.js` | Migración ya completada |
| `src/views/Tareas.jsx.bak`              | Backup file             |

### Created

| File    | Reason                      |
| ------- | --------------------------- |
| Ninguno | No se crean archivos nuevos |

---

## Risks

| Risk                                                        | Likelihood | Impact | Mitigation                                                                                                  |
| ----------------------------------------------------------- | ---------- | ------ | ----------------------------------------------------------------------------------------------------------- |
| Regresión en vistas al cambiar de realtime a polling        | Medium     | Medium | Polling ya existe para traces; probar SwarmControl con agentes activos                                      |
| `agent_traces` no tiene mismos datos que `agent_logs`       | Low        | High   | Verificar que `agent_traces` tiene `agent_name`, `session_id`, `duration_ms`, `tool_status` — todos existen |
| Funciones duplicadas eliminadas eran ligeramente diferentes | Low        | Medium | Diff exhaustivo líneas 400-505 vs 583-655 antes de borrar                                                   |
| Allowlist de tablas bloquea tabla válida nueva              | Low        | Low    | Documentar allowlist y actualizar al agregar tablas                                                         |
| FTS5 sanitización rompe búsquedas válidas                   | Low        | Low    | Sanitizar solo caracteres especiales, no contenido normal                                                   |
| MCP server pierde funcionalidad sin Supabase                | Very Low   | Low    | Solo afecta `DB_DRIVER=supabase` que ya no se usa                                                           |

---

## Rollback Plan

1. `git revert` del commit completo — todos los cambios son reversibles
2. Las vistas mantienen compatibilidad con `localSupabase.js` shim (no se modifica la API)
3. Las funciones eliminadas en localDb.js son duplicados exactos — las originales permanecen
4. `.env.local` se puede restaurar de git history
5. Dependencies se pueden re-instalar con `npm install`

---

## Success Criteria

- [ ] Cero imports de `@supabase/supabase-js` en código de producción (grep: `import.*@supabase`)
- [ ] Cero variables `SUPABASE_*` en `.env.local`
- [ ] Cero llamadas `new Database()` fuera de `localDb.js`
- [ ] AgentHub, SwarmControl, Dashboard funcionan con datos locales
- [ ] `localDb.js` sin funciones duplicadas (líneas 583-655 eliminadas)
- [ ] Metrics API usa `localDb.getDb()` compartido
- [ ] Metrics API usa `agent_traces` en vez de `agent_logs`
- [ ] Query route y mutate route tienen allowlist de tablas
- [ ] FTS5 sanitiza caracteres especiales (`"`, `*`, `+`, `-`, NEAR, AND, OR, NOT)
- [ ] `devhub-mcp/server.js` sin branch de Supabase ni variables SUPABASE\_\*
- [ ] `npm ls @supabase/*` retorna vacío en root y devhub-mcp
- [ ] SwarmControl usa polling en vez de realtime channel para tasks
