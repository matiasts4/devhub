# Auditoría: Supabase, Autenticación y Proyectos Compartidos

**Fecha:** 2026-06-21  
**Proyecto:** DevHub (`/home/matias/ArxonLabs/devhub`)  
**Objetivo:** Revisar, verificar, replicar, corregir y mejorar la lógica de proyectos compartidos, autenticación, membresías y sincronización colaborativa con Supabase.

---

## 1. Resumen ejecutivo

El repo ya tiene una **base multi-tenant parcialmente implementada** (`devhub-cloud-foundation`) con:

- Auth provider hexagonal (`local` | `supabase` | `fake`).
- DB driver selector (`sqlite` | `supabase` | `postgres-generic`).
- Tablas de tenancy (`workspaces`, `workspace_members`, `workspace_invitations`, `project_members`, `project_invitations`).
- Políticas de roles (`owner`, `admin`, `member`, `viewer`).
- 6 MCP tools de workspace (`workspace.list`, `.create`, `.members`, `.add_member`, `.update_member_role`, `.remove_member`).
- Flujo web de invitaciones por token (`/api/workspaces/[id]/invitations`, `/invitations/[token]`, `/api/invitations/[token]/accept`).
- Migración SQL colaborativa (`migrations/20260608_collaborative_auth.sql`) con RLS por workspace.

Sin embargo, **la funcionalidad de "proyectos compartidos con base de datos única y sincronización en tiempo real" no está completa**: hay gaps de RLS, inconsistencias de esquema entre SQLite y Postgres, realtime parcial en el frontend (solo `tasks`, no `milestones`), y el modelo project-vs-workspace no está del todo unificado.

---

## 2. Arquitectura actual

### 2.1 Modos de operación (`.env.example`)

| Modo                | `DEVHUB_OPERATION_MODE` | Auth       | DB                 |
| ------------------- | ----------------------- | ---------- | ------------------ |
| Local-dev (default) | `local` / ausente       | `local`    | `sqlite`           |
| Cloud               | `cloud`                 | `supabase` | `supabase`         |
| Self-hosted         | `self-hosted`           | `supabase` | `postgres-generic` |

Variables requeridas:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon>
SUPABASE_SERVICE_ROLE_KEY=<service>   # server/MCP
```

### 2.2 Auth

- **Port:** `src/lib/auth/provider.js` (`getAuthProvider()`).
- **Adapters:**
  - `src/lib/auth/providers/local.js` — usuario sintético `local-user`, sin pared de auth.
  - `src/lib/auth/providers/supabase.js` — magic link OTP, `getSession`, `verifyToken`, `getAccessToken`.
  - `src/lib/auth/providers/fake.js` — test-only.
- **Contexto React:** `src/lib/auth/AuthContext.js` — lee sesión vía `createClient()` de `localClient.js`, fetchea workspaces, guarda `activeWorkspaceId` en `localStorage`.

### 2.3 Cliente de base de datos (frontend)

`src/lib/db/localClient.js`:

- En modo cloud crea un cliente Supabase real (`@supabase/supabase-js`) con `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY`.
- En modo local devuelve un stub `localAuth` + `localRealtime`.
- `LocalQueryClient` emula la API `.from().select().eq()` y decide si consulta Supabase o el backend SQLite vía `/api/db/*`.
- La lógica `_shouldQuerySupabase(table)` consulta Supabase solo si:
  - Está autenticado (`window.__devhub_authenticated === true`).
  - La tabla es `workspaces` o `workspace_members` (siempre).
  - O el workspace activo no es `local-ws`.
- Las mutaciones primero escriben en SQLite local vía `/api/db/mutate` y luego sincronizan a Supabase (fire-and-forget).

### 2.4 DB server-side / MCP

- **Selector:** `src/lib/db/driver-selector.js`.
- **SQLite:** `src/lib/db/localClient.js` (mejor renombrar, es server-side) + `src/lib/db/shared.js` (`better-sqlite3`).
- **Postgres genérico:** `src/lib/db/postgres-generic.js` (`pg`).
- **Supabase (MCP):** `devhub-mcp/server.js` crea un cliente Supabase con `SUPABASE_SERVICE_ROLE_KEY`.
- **Tenancy policy:** `src/lib/tenancy/policy.js` (`can`, `assertCan`, `grantsFor`).
- **Contexto SQLite:** `src/lib/tenancy/with-workspace-context.js`.

### 2.5 Invitaciones y membresías

- **Admin:** `src/lib/invitations/supabaseAdmin.js`.
- **Token:** `src/lib/invitations/token.js` (no leído directamente, usado en rutas).
- **Crear invitación:** `POST /api/workspaces/[id]/invitations` → inserta `workspace_invitations` (token, 7 días).
- **Aceptar:** `POST /api/invitations/[token]/accept` → inserta `workspace_members` / `project_members` y marca `accepted`.
- **UI aceptación:** `src/app/invitations/[token]/page.jsx` — magic link + aceptación automática si ya hay sesión.
- **Migraciones oficiales del cloud foundation:**
  - `migrations/sql/0001_workspaces.sql` — crea tablas de tenancy (`workspaces`, `workspace_members`, `project_members`, `workspace_invitations`, `project_invitations`, `devhub_audit_log`) y RLS sobre ellas.
  - `migrations/sql/0002_tenancy_policies.sql` — agrega `workspace_id` a `projects`, `tasks`, `milestones`, `agent_runs`, `agent_artifacts`, `supervisor_snapshots`, `swarm_missions`, `mission_messages`, `operator_inbox`; habilita RLS por workspace.
- **Migración colaborativa reciente:** `migrations/20260608_collaborative_auth.sql`:
  - Trigger `restrict_signup_to_owner()` permite registro solo al owner o con invitación pendiente.
  - Trigger `handle_new_user()` acepta invitaciones automáticamente al crear usuario.
  - Backfill `workspace_id` en `tasks`/`milestones` desde `projects`.
  - RLS por workspace en `projects`, `tasks`, `milestones` (versión más permisiva con fallback `user_id` y `workspace_id IS NULL`).

### 2.6 MCP tools relevantes

`devhub-mcp/tools/workspaces.js`:

- `workspace.list` — lista workspaces del actor.
- `workspace.create` — crea workspace + owner membership.
- `workspace.members` — lista miembros.
- `workspace.add_member` — admin/owner only.
- `workspace.update_member_role` — admin/owner + last-owner protection.
- `workspace.remove_member` — admin/owner + last-owner protection.

`devhub-mcp/tools/projects.js`:

- `list_projects`, `get_project`, `create_project`, `update_project`, `delete_project`.
- `create_project` usa `getActorUserId()` pero **no valida workspace ni membership**.
- No hay tool `project.share` ni `project.members`.

`devhub-mcp/tools/tasks.js`:

- CRUD de tareas + cola de ejecución.
- No valida que el actor sea miembro del workspace del proyecto.
- No hay tool de comentarios con `project_id` (solo `task_id`).

---

## 3. Hallazgos y problemas

### 3.1 CRÍTICO — Discrepancia de esquema: `workspace_id` existe en Postgres pero no en SQLite/documentación

- En **Postgres** (`migrations/sql/0002_tenancy_policies.sql`) `projects`, `tasks`, `milestones`, etc. **sí tienen** `workspace_id` con índices y RLS.
- En **SQLite** (`src/lib/db/schema.js`) la tabla `projects` se define **sin** `workspace_id`.
- En **documentación** (`docs/03_Esquema_BaseDatos.md` v3) `projects` también se describe **sin** `workspace_id`.
- `devhub-mcp/tools/projects.js` hace `query.eq('workspace_id', workspace_id)`, lo que funcionará en Supabase pero fallará o ignorará en SQLite.

**Implicación:** la aplicación no puede correr modo cloud/local con el mismo esquema mental. En SQLite no hay separación por workspace, y el frontend/MCP no tiene una estrategia consistente para asignar `workspace_id` al crear proyectos.

### 3.2 CRÍTICO — RLS de la migración es permisiva

```sql
CREATE POLICY projects_workspace_write ON public.projects FOR ALL
  USING (user_id = devhub_current_user_id() OR devhub_is_member(workspace_id))
  WITH CHECK (user_id = devhub_current_user_id() OR devhub_is_member(workspace_id));
```

- Permite a **cualquier miembro** del workspace editar/eliminar **cualquier proyecto**.
- No respeta roles (`viewer` no debería escribir, `member` quizás sí, `admin` sí).
- `workspace_id IS NULL` permite lectura a todos (lógica legacy), lo que puede filtrar datos.

### 3.3 CRÍTICO — MCP tools no validan membresía ni workspace

- `create_project`, `update_project`, `delete_project`, `create_task`, `update_task`, `create_milestone`, etc., no reciben `workspace_id` ni validan que el actor pertenezca al workspace del proyecto.
- En modo cloud con service role key se **bypasea RLS**, por lo que la única protección sería la validación explícita en los tools. Hoy no existe.
- `getActorUserId()` en `projects.js` incluso tiene un bug: llama `getActor()` **sin await** (`const session = getActor();`), por lo que siempre cae en fallback `local-user`.

### 3.4 ALTO — Falta unificación proyecto/workspace

- El modelo actual tiene **dos niveles de membresía**: workspace y project.
- El usuario quiere "proyectos compartidos" donde los miembros del proyecto comparten tarjetas y fases.
- Actualmente un proyecto hereda miembros del workspace, pero no hay UI/API para compartir un proyecto específico con gente fuera del workspace (aunque existen tablas `project_members` e `project_invitations`).

### 3.5 ALTO — Realtime parcial: tarjetas sí, fases no; y con refetch completo

- **`src/views/Tareas.jsx`** ya tiene una suscripción Supabase Realtime a cambios en `tasks` filtrados por `project_id` (líneas 978-989). Al recibir un evento hace `fetchData()` completo.
- **No hay suscripción realtime para `milestones`** (fases del roadmap). Si un usuario crea/edita un hito, los demás no lo ven hasta recargar.
- **No hay suscripción realtime en `Proyectos.jsx`**: de hecho, esa vista usa datos **mock hardcodeados** (`proyectos` array estático) y no conecta con Supabase/SQLite.
- `src/lib/realtime/devhub-realtime.js` existe pero es un servidor WebSocket local para notificar cambios de **filesystem** (`chokidar` + `ws`), no está relacionado con Supabase ni con Kanban.
- `docs/16_Multi_Usuario_y_Colaboracion.md` propone `useProjectRealtime`; no está implementado como hook reutilizable.

### 3.6 ALTO — Presence de proyecto hardcodeada a usuario local

- `src/components/PresenceAvatars.jsx` ya implementa presencia de Supabase Realtime en un canal `presence:project:${projectId}`.
- Pero hardcodea `LOCAL_USER = { id: 'local-user', email: 'local@devhub.local' }` para trackear presence. En modo cloud esto no refleja al usuario autenticado real, haciendo inútil el indicador de "quién está online".

### 3.7 ALTO — AuthContext no carga memberships del actor

- `src/lib/auth/AuthContext.js` solo guarda `user` y fetchea `workspaces` vía `db.from('workspaces').select('*')`.
- En modo cloud esto funciona por RLS (el usuario ve solo sus workspaces), pero no carga roles ni memberships.
- `AuthProvider` de Supabase (`src/lib/auth/providers/supabase.js`) devuelve `workspaceMemberships: []` siempre.

### 3.8 MEDIO — Frontend/cliente hace dual-write frágil

- `LocalQueryClient._executeMutation()` escribe primero SQLite local y luego sincroniza a Supabase sin esperar confirmación ni manejar conflictos.
- No hay estrategia de reconciliación si Supabase falla.
- `_cacheLocally` en lecturas hace `upsert` a SQLite sin validar pertenencia.

### 3.9 MEDIO — Signup/auth callback no maneja invitaciones pendientes en el frontend

- `src/app/auth/callback/page.jsx` no redirige a `/invitations/[token]` si hay un token pendiente en `sessionStorage`.
- `src/app/invitations/[token]/page.jsx` guarda el token en `sessionStorage` y acepta si hay sesión, pero si el usuario llega primero al callback de magic link, pierde el contexto de invitación.

### 3.10 MEDIO — Migración `20260608_collaborative_auth.sql` asume funciones/triggers previos

- Usa `current_setting('app.owner_email', true)` y fallback hardcoded a `matiastobarsilva12344321@gmail.com`.
- No crea `profiles` si no existe (aunque Supabase Auth lo hace normalmente).
- Las políticas `FOR ALL` en lugar de separadas por operación dificultan auditar permisos.

### 3.11 BAJO — Inconsistencia de nombres y legacy shims

- `src/lib/db/localClient.js` en realidad es un cliente híbrido Supabase/SQLite en el frontend; el nombre es confuso.
- `project_members` en SQLite usa roles `owner|admin|member|viewer`; la migración Postgres para `project_invitations` mapea `member` → `worker` (legacy).
- `docs/16_Multi_Usuario_y_Colaboracion.md` propone roles `admin|worker|viewer` mientras que el código actual usa `owner|admin|member|viewer`.

---

## 4. Gap analysis vs. objetivo deseado

| Funcionalidad deseada                               | Estado actual                                    | Gap                                                                           |
| --------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------- |
| Proyectos compartidos por configuración             | Parcial (workspace compartido, no project-level) | Necesita decidir si compartir por workspace o por proyecto                    |
| Base de datos única en Supabase                     | Migración parcial                                | Falta `workspace_id` en esquema SQLite y documentación                        |
| Si alguien mueve una tarjeta, se ve en todos        | Parcial (`Tareas.jsx` recarga todo)              | Falta actualización optimista incremental; `Proyectos.jsx` ni siquiera lee DB |
| Si alguien crea fases, se actualizan para los demás | No implementado                                  | Falta suscripción realtime a `milestones`                                     |
| Roles y permisos claros                             | Parcial en policy.js                             | Falta aplicar en MCP tools y RLS                                              |
| Invitaciones funcionales                            | Web flow listo                                   | Falta integración con magic link callback y seed automático                   |

---

## 5. Plan de acción priorizado

### Fase A — Corregir cimientos (bloqueante)

1. **Unificar esquema `projects`:**
   - Agregar `workspace_id` a `projects` en `src/lib/db/schema.js` y en `docs/03_Esquema_BaseDatos.md`.
   - Backfill idempotente en SQLite para legacy rows (`local-ws`).
   - Asegurar que `create_project` en MCP y frontend siempre asigne `workspace_id`.

2. **Corregir `AuthProvider` de Supabase:**
   - Hacer `getSession` y `verifyToken` devuelvan `workspaceMemberships` reales desde `workspace_members`.
   - Sincronizar con `AuthContext` para que el frontend conozca roles.

3. **Corregir `getActorUserId()` en `projects.js`:**
   - Agregar `await` y manejar async correctamente.

### Fase B — Seguridad (CRÍTICO)

4. **Validar membresía en todos los MCP tools de proyecto/tarea/hito:**
   - Recibir `workspace_id` explícito o resolverlo desde `project_id`.
   - Usar `ensureActorWithMemberships` + `assertCan` antes de cada escritura.
   - Aplicar mismo patrón en `tasks.js` y `projects.js`.

5. **Endurecer RLS en Supabase:**
   - Separar políticas por `SELECT/INSERT/UPDATE/DELETE`.
   - Usar función `devhub_is_member_with_role(workspace_id, required_role)`.
   - Quitar fallback `workspace_id IS NULL` o limitarlo al owner.
   - Aplicar RLS también a `workspace_members`, `workspace_invitations`, `project_members`, `project_invitations`.

### Fase C — Proyectos compartidos y realtime (valor de producto)

6. **Decidir modelo de compartición:**
   - Opción 1: Todo dentro de un workspace se comparte automáticamente (más simple).
   - Opción 2: Cada proyecto tiene su propia lista de miembros (más flexible, más complejo).
   - Recomendación: Opción 1 para empezar, Opción 2 como evolución.

7. **Completar realtime colaborativo:**
   - En `Tareas.jsx`: optimizar para que actualice solo la tarjeta afectada en lugar de `fetchData()` completo.
   - Agregar suscripción realtime a `milestones` (crear/editar/eliminar fases se refleje en todos).
   - Crear hook reutilizable `useProjectRealtime({ projectId, onTaskChanged, onMilestoneChanged })`.
   - Reemplazar datos mock de `Proyectos.jsx` por lectura real de Supabase/SQLite + suscripción a cambios de proyectos del workspace.

8. **Corregir presencia de proyecto:**
   - `PresenceAvatars.jsx` debe usar el usuario autenticado real en lugar de `LOCAL_USER` hardcodeado.
   - Integrar con `AuthContext` para obtener `user.id` y `user.email`.

### Fase D — UX de invitaciones

9. **Mejorar flujo magic-link + invitación:**
   - `auth/callback` debe redirigir a `/invitations/[token]` si existe `devhub:pending-invite-token`.
   - Asegurar que `handle_new_user()` en Supabase acepte invitaciones incluso si el usuario ya existe (hoy solo en INSERT).

10. **Seeds y migración de datos:**
    - Script para asociar proyectos existentes al workspace del owner.
    - Migración de `project_members` legacy a `workspace_members` si se elige Opción 1.

---

## 6. Información que necesito del usuario

Para poder implementar las correcciones necesito confirmación/datos:

1. **Credenciales de Supabase** (para probar y configurar MCP):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - ¿Puedo escribirlas en `.env.local` o las llenás vos?

2. **Modelo de compartición deseado:**
   - ¿Compartir **todo el workspace** (todos los proyectos del workspace para todos los miembros)?
   - ¿O compartir **proyecto por proyecto** con miembros independientes del workspace?

3. **Configuración del MCP de Supabase para Kimi Code CLI:**
   - En este entorno no veo archivo de configuración MCP nativa (solo `.kimi-code/config.toml`).
   - ¿Te referís a configurarlo en **OpenCode** y que yo lo use desde allí?
   - ¿O querés que lo agregue a tu `devhub-mcp` como un tool adicional que hable con Supabase?
   - ¿Qué MCP de Supabase usás en OpenCode? (`@supabase/mcp-server`, `supabase-mcp-server`, otro?)

4. **Permisos para migrar DB en Supabase:**
   - ¿Puedo ejecutar la migración `migrations/20260608_collaborative_auth.sql` con ajustes de seguridad?
   - ¿Hay datos de producción que deba preservar?

5. **Scope inicial:**
   - ¿Querés que empiece por la **Fase A+B** (cimientos + seguridad) antes de tocar realtime?
   - ¿O preferís un spike rápido de **realtime Kanban** para validar la experiencia?

---

## 7. Archivos clave revisados

- `.env.example`
- `MIGRATION_CLOUD_FOUNDATION.md`
- `docs/03_Esquema_BaseDatos.md`
- `docs/16_Multi_Usuario_y_Colaboracion.md`
- `src/lib/auth/providers/supabase.js`
- `src/lib/auth/provider.js`
- `src/lib/auth/AuthContext.js`
- `src/lib/db/driver-selector.js`
- `src/lib/db/localClient.js`
- `src/lib/db/postgres-generic.js`
- `src/lib/db/schema.js`
- `src/lib/db/shared.js`
- `src/lib/db/workspaces.js`
- `src/lib/tenancy/policy.js`
- `src/lib/tenancy/with-workspace-context.js`
- `src/lib/invitations/supabaseAdmin.js`
- `src/app/api/workspaces/[id]/invitations/route.js`
- `src/app/api/invitations/[token]/accept/route.js`
- `src/app/invitations/[token]/page.jsx`
- `src/app/auth/callback/page.jsx`
- `devhub-mcp/server.js`
- `devhub-mcp/tools/projects.js`
- `devhub-mcp/tools/workspaces.js`
- `devhub-mcp/tools/tasks.js`
- `migrations/20260608_collaborative_auth.sql`
- `migrations/20260607_fix_auth_triggers.sql`
- `migrations/sql/0001_workspaces.sql`
- `migrations/sql/0002_tenancy_policies.sql`
- `src/lib/realtime/devhub-realtime.js`
- `src/lib/pizarra/useSharedSurfaceRegistry.js`
- `src/components/workspace/SharedSurfacesProvider.jsx`
- `src/components/PresenceAvatars.jsx`
- `src/views/Tareas.jsx`
- `src/views/Proyectos.jsx`

---

## 8. Recomendación inmediata

No tocar realtime ni invitaciones hasta que estén firmes:

1. Esquema unificado con `workspace_id` en `projects`.
2. `AuthProvider` Supabase devolviendo memberships reales.
3. Validación de membresía en todos los MCP tools de escritura.
4. RLS endurecida en Supabase.

Una vez eso esté verificado con tests, agregar realtime es relativamente directo con `supabase.channel().on('postgres_changes', ...)`.
