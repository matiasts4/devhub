# Delta Spec: Local Database

## ADDED Requirements

### Requirement: Eliminación de Supabase en Vistas Frontend

El sistema DEBE reemplazar todas las llamadas directas a `supabase.from()` en vistas frontend por llamadas a API routes locales que utilicen `localDb` o `localSupabase.createClient()`.

#### Scenario: AgentHub.jsx migra ~22 llamadas a API routes locales

- GIVEN AgentHub.jsx tiene ~22 llamadas directas a `supabase.from()`
- WHEN se ejecuta la migración
- THEN todas las llamadas se reemplazan por fetch a `/api/agenthub/...`
- AND ninguna importación de `@supabase/supabase-js` permanece en el archivo

#### Scenario: SwarmControl.jsx migra ~9 llamadas + canal realtime

- GIVEN SwarmControl.jsx tiene ~9 llamadas a Supabase + un canal realtime
- WHEN se ejecuta la migración
- THEN las llamadas se reemplazan por API routes locales
- AND el canal realtime se reemplaza por polling o SSE
- AND la funcionalidad de actualizaciones en tiempo real se mantiene

#### Scenario: Dashboard.jsx migra ~6 llamadas a API routes locales

- GIVEN Dashboard.jsx tiene ~6 llamadas directas a Supabase
- WHEN se ejecuta la migración
- THEN todas las llamadas se reemplazan por fetch a `/api/projects/...`
- AND los datos se obtienen correctamente desde SQLite local

### Requirement: Eliminación de Dependencias npm de Supabase

El sistema DEBE remover todas las dependencias de Supabase del package.json y verificar que ningún archivo importe de `@supabase/*`.

#### Scenario: Remoción de dependencias del package.json raíz

- GIVEN el package.json raíz contiene `@supabase/auth-helpers-nextjs`, `@supabase/ssr`, `@supabase/supabase-js`
- WHEN se ejecuta `npm uninstall` de las dependencias
- THEN las dependencias se eliminan del package.json
- AND `npm ls @supabase/*` retorna vacío

#### Scenario: Remoción de dependencias del devhub-mcp/package.json

- GIVEN devhub-mcp/package.json contiene `@supabase/supabase-js`
- WHEN se ejecuta la limpieza
- THEN la dependencia se elimina del package.json del MCP server

#### Scenario: Verificación de imports residuales

- GIVEN se completó la eliminación de dependencias
- WHEN se ejecuta `grep -r "@supabase/" src/ devhub-mcp/`
- THEN no se encuentran imports de `@supabase/*` (excepto en `localSupabase.js`)

### Requirement: Eliminación de Credenciales de Supabase

El sistema DEBE remover todas las variables de entorno de Supabase de `.env.local` y verificar que `.env.local` esté en `.gitignore`.

#### Scenario: Remoción de variables de entorno

- GIVEN `.env.local` contiene `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- WHEN se ejecuta la limpieza
- THEN las variables se eliminan de `.env.local`
- AND la admin key `SUPABASE_SERVICE_ROLE_KEY` ya no está expuesta

#### Scenario: Verificación de .gitignore

- GIVEN `.env.local` contiene credenciales sensibles
- WHEN se verifica `.gitignore`
- THEN `.env.local` está listado en `.gitignore`

### Requirement: Eliminación de Código Muerto

El sistema DEBE borrar funciones duplicadas, archivos de backup, scripts de migración completada, y archivos de test muertos.

#### Scenario: Eliminación de funciones duplicadas en localDb.js

- GIVEN `localDb.js` tiene funciones duplicadas en líneas 583-655
- WHEN se ejecuta la limpieza
- THEN las funciones duplicadas se eliminan
- AND las funciones originales permanecen intactas

#### Scenario: Eliminación de archivos de backup y migración

- GIVEN existen `src/views/Tareas.jsx.bak`, `scripts/export/*.json` (7 archivos), `scripts/migrate-supabase-to-sqlite.js`
- WHEN se ejecuta la limpieza
- THEN todos los archivos se eliminan del repositorio

#### Scenario: Eliminación de scripts de test muertos

- GIVEN existen `test-rls.js`, `test-schema.js`, `test-schema2.js`, `test-projects.js`, `test-veloce.js`, `update-project.js`
- WHEN se ejecuta la limpieza
- THEN todos los scripts de test muertos se eliminan

### Requirement: Fix de Arquitectura en API Routes

El sistema DEBE corregir bugs de arquitectura en API routes, incluyendo uso compartido de conexiones DB, validación de tablas, y sanitización de inputs FTS5.

#### Scenario: Metrics API usa getDb() compartido

- GIVEN `src/app/api/metrics/route.js` abre una conexión DB propia con `new Database()`
- WHEN se ejecuta el fix
- THEN la route usa `getDb()` de `localDb.js`
- AND no se crean conexiones DB independientes

#### Scenario: Tabla agent_logs en ensureRuntimeSchema()

- GIVEN `ensureRuntimeSchema()` en `localDb.js` no incluye la tabla `agent_logs`
- WHEN se ejecuta el fix
- THEN la tabla `agent_logs` se agrega al schema de runtime
- AND la tabla se crea automáticamente si no existe

#### Scenario: Sanitización de input FTS5 en searchTraces()

- GIVEN `searchTraces()` acepta input de usuario sin sanitizar
- WHEN se ejecuta el fix
- THEN los caracteres especiales de FTS5 se escapan: `"`, `*`, `-`, `+`, `(`, `)`, `/`, `\`, `:`, `^`, `$`, `~`, `AND`, `OR`, `NOT`
- AND las búsquedas válidas continúan funcionando correctamente

### Requirement: MCP Server Solo SQLite

El sistema DEBE eliminar la rama `DB_DRIVER=supabase` del código del MCP server y usar exclusivamente el driver SQLite.

#### Scenario: Eliminación de branch de Supabase en MCP

- GIVEN `devhub-mcp/server.js` tiene una rama condicional para `DB_DRIVER=supabase`
- WHEN se ejecuta la limpieza
- THEN la rama de Supabase se elimina completamente
- AND el servidor usa exclusivamente el driver SQLite

#### Scenario: Verificación de funcionalidad MCP

- GIVEN el MCP server se ejecuta después de la limpieza
- WHEN se realizan consultas a la base de datos
- THEN todas las consultas funcionan correctamente con SQLite
- AND no hay errores relacionados con drivers faltantes

## MODIFIED Requirements

### Requirement: Compatibilidad con localSupabase.js Shim

El sistema DEBE mantener `localSupabase.js` como shim compatible para los 18 archivos cliente que lo utilizan, ya que no es una dependencia de Supabase cloud sino un bridge a API routes locales.

(Previously: `localSupabase.js` era considerado como candidato de eliminación junto con otras dependencias de Supabase)

#### Scenario: Shim localSupabase.js permanece intacto

- GIVEN `localSupabase.js` es usado por 18 archivos cliente
- WHEN se ejecuta la limpieza
- THEN el archivo NO se elimina ni modifica
- AND los 18 archivos cliente continúan funcionando normalmente

## REMOVED Requirements

### Requirement: Soporte de Supabase Cloud en MCP Server

(Reason: La migración a SQLite está completada y el driver de Supabase ya no se usa en producción)

### Requirement: Variables de Entorno de Supabase

(Reason: Las credenciales de Supabase ya no son necesarias después de la migración completa a SQLite)
