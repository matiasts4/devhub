---
Fecha de Modificación: 18 de mayo de 2026
Changelog:
  - 2026-03-27 v1: Documento creado con el esquema inicial de Supabase.
  - 2026-03-28 v2: Añadida columna `milestone_id` en `tasks`, campos `planning_prompt` y `planning_status` en `projects`, nueva tabla `project_files`. Actualizada sección de Tablas Futuras.
  - 2026-05-18 v3: Documentado `agent_workspaces` como control plane durable de SW-2.1A y aclarado el rol observer-only de runtime mirrors.
---

# 03 Esquema de Base de Datos

**Proyecto Supabase**: `devhub` | **ID**: `kpgeyukrsydjujqouape` | **Región**: `sa-east-1`

---

## Tablas

### `profiles`

Extiende `auth.users` con datos del perfil del usuario.

| Columna      | Tipo                     | Descripción          |
| ------------ | ------------------------ | -------------------- |
| `id`         | UUID (PK, FK→auth.users) | ID del usuario       |
| `full_name`  | TEXT                     | Nombre completo      |
| `avatar_url` | TEXT                     | URL del avatar       |
| `updated_at` | TIMESTAMPTZ              | Última actualización |

> Se auto-crea via trigger `on_auth_user_created` al registrarse.

---

### `projects`

Proyectos del usuario.

| Columna                | Tipo                 | Default            | Descripción                                                                       |
| ---------------------- | -------------------- | ------------------ | --------------------------------------------------------------------------------- |
| `id`                   | UUID (PK)            | uuid_generate_v4() | ID único                                                                          |
| `user_id`              | UUID (FK→auth.users) | —                  | Dueño                                                                             |
| `name`                 | TEXT                 | —                  | Nombre del proyecto                                                               |
| `description`          | TEXT                 | —                  | Descripción breve                                                                 |
| `color`                | TEXT                 | `#6366f1`          | Color de acento UI                                                                |
| `status`               | TEXT                 | `active`           | `active`, `paused`, `completed`, `archived`                                       |
| `progress`             | INT                  | `0`                | Porcentaje 0–100                                                                  |
| `planning_prompt`      | TEXT                 | NULL               | ⭐ Prompt de contexto para la Planning IA                                         |
| `planning_status`      | TEXT                 | `none`             | ⭐ `none`, `pending`, `completed` — estado del plan IA                            |
| `documentation_policy` | TEXT                 | `personal`         | ⭐ `personal`, `shared_legacy`, `archive_only` — gate de clasificación documental |
| `created_at`           | TIMESTAMPTZ          | NOW()              | Fecha creación                                                                    |
| `updated_at`           | TIMESTAMPTZ          | NOW()              | Última modificación                                                               |

> **`planning_status`** controla el flujo de onboarding IA: `none` = proyecto sin planning, `pending` = planning solicitado pero no ejecutado, `completed` = plan exhaustivo generado.

> **`documentation_policy`** controla cómo se trata la documentación del proyecto: `personal` usa el flujo DevHub; `shared_legacy` preserva la documentación compartida; `archive_only` archiva primero la legacy y luego crea documentación DevHub nueva.

---

### `tasks`

Tareas vinculadas a un proyecto (Kanban + Historial).

| Columna        | Tipo                                     | Default            | Descripción                                      |
| -------------- | ---------------------------------------- | ------------------ | ------------------------------------------------ |
| `id`           | UUID (PK)                                | uuid_generate_v4() | ID único                                         |
| `project_id`   | UUID (FK→projects)                       | —                  | Proyecto padre                                   |
| `user_id`      | UUID (FK→auth.users)                     | —                  | Dueño                                            |
| `milestone_id` | UUID (FK→milestones, ON DELETE SET NULL) | NULL               | ⭐ Hito al que pertenece                         |
| `title`        | TEXT                                     | —                  | Título de la tarea                               |
| `description`  | TEXT                                     | —                  | Descripción opcional                             |
| `status`       | TEXT                                     | `pending`          | `pending`, `in_progress`, `completed`, `blocked` |
| `priority`     | TEXT                                     | `medium`           | `low`, `medium`, `high`, `critical`              |
| `due_date`     | DATE                                     | —                  | Fecha límite                                     |
| `completed_at` | TIMESTAMPTZ                              | —                  | Cuando se completó                               |
| `created_at`   | TIMESTAMPTZ                              | NOW()              | Creación                                         |
| `updated_at`   | TIMESTAMPTZ                              | NOW()              | Modificación                                     |

> **`milestone_id`** permite calcular el progreso de un hito matemáticamente: `tareas completadas / tareas totales del hito`. Las tareas sin milestone son "huérfanas".

---

### `milestones`

Hitos del roadmap de un proyecto.

| Columna       | Tipo                 | Default            | Descripción                                      |
| ------------- | -------------------- | ------------------ | ------------------------------------------------ |
| `id`          | UUID (PK)            | uuid_generate_v4() | ID único                                         |
| `project_id`  | UUID (FK→projects)   | —                  | Proyecto padre                                   |
| `user_id`     | UUID (FK→auth.users) | —                  | Dueño                                            |
| `title`       | TEXT                 | —                  | Título del hito                                  |
| `description` | TEXT                 | —                  | Descripción                                      |
| `status`      | TEXT                 | `planned`          | `planned`, `in_progress`, `completed`, `at_risk` |
| `due_date`    | DATE                 | —                  | Fecha objetivo                                   |
| `created_at`  | TIMESTAMPTZ          | NOW()              | Creación                                         |
| `updated_at`  | TIMESTAMPTZ          | NOW()              | Modificación                                     |

---

### `project_files` ⭐ NUEVA

Archivos de contexto subidos por el usuario para la Planning IA.

| Columna      | Tipo                                    | Default           | Descripción                                 |
| ------------ | --------------------------------------- | ----------------- | ------------------------------------------- |
| `id`         | UUID (PK)                               | gen_random_uuid() | ID único                                    |
| `project_id` | UUID (FK→projects, ON DELETE CASCADE)   | —                 | Proyecto padre                              |
| `user_id`    | UUID (FK→auth.users, ON DELETE CASCADE) | —                 | Dueño                                       |
| `file_name`  | TEXT                                    | —                 | Nombre original del archivo                 |
| `content`    | TEXT                                    | —                 | Contenido textual completo                  |
| `file_type`  | TEXT                                    | `text`            | Extensión sin punto (md, json, txt, py...)  |
| `size_chars` | INT (GENERATED)                         | —                 | `length(content)` calculado automáticamente |
| `created_at` | TIMESTAMPTZ                             | NOW()             | Creación                                    |

> **RLS habilitado**: solo el `user_id` dueño puede leer/escribir sus archivos. Index en `project_id` para queries rápidas.
>
> Tipos soportados vía UI: `.txt` `.md` `.json` `.yaml` `.yml` `.csv` `.js` `.ts` `.py` `.jsx` `.tsx` — máx **2MB** por archivo.

---

### `agent_workspaces` ⭐ SW-2.1A / SW-2.2A

Reserva durable de workspaces de agentes. DevHub guarda lifecycle, metadata observada y evidence hook; **El ejecutor sigue siendo dueño de Git/worktree real**.

| Columna                | Tipo      | Default                                    | Descripción                                                                                                                |
| ---------------------- | --------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `id`                   | TEXT (PK) | —                                          | `workspace_id` estable y único                                                                                             |
| `project_id`           | UUID/TEXT | —                                          | Proyecto padre                                                                                                             |
| `agent_id`             | TEXT      | —                                          | Agente dueño de la reserva                                                                                                 |
| `current_task_id`      | TEXT      | NULL                                       | Tarea activa asociada                                                                                                      |
| `run_id_or_session_id` | TEXT      | NULL                                       | Correlación runtime opcional                                                                                               |
| `repo_root`            | TEXT      | —                                          | Repo lógico asociado                                                                                                       |
| `workspace_path`       | TEXT      | —                                          | Identificador lógico `workspace://...`                                                                                     |
| `worktree_path`        | TEXT      | NULL                                       | Path físico reportado por el ejecutor                                                                                      |
| `base_branch`          | TEXT      | —                                          | Rama base explícita                                                                                                        |
| `base_commit`          | TEXT      | `f814998dd05cb491caf8637bf570dbd74b539090` | Baseline seguro congelado                                                                                                  |
| `branch_name`          | TEXT      | NULL                                       | Nombre reservado de branch                                                                                                 |
| `status`               | TEXT      | `planned`                                  | `planned`, `provisioning`, `ready`, `active`, `paused`, `conflicted`, `cleanup_pending`, `completed`, `failed`, `orphaned` |
| `observed_branch`      | TEXT      | NULL                                       | Rama observada por el ejecutor                                                                                             |
| `observed_head`        | TEXT      | NULL                                       | Commit/head observado                                                                                                      |
| `observed_dirty`       | TEXT      | NULL                                       | `clean`, `dirty`, `dirty-excluded`; se preserva textual                                                                    |
| `last_error`           | TEXT      | NULL                                       | Último error o drift detectado                                                                                             |
| `recovery_reason`      | TEXT      | NULL                                       | Motivo explícito de pausa/orfandad/recuperación                                                                            |
| `evidence_ref`         | TEXT      | NULL                                       | Hook opaco congelado para SW-3.1                                                                                           |
| `claimed_at`           | TEXT      | NULL                                       | Timestamp operativo                                                                                                        |
| `started_at`           | TEXT      | NULL                                       | Inicio real de trabajo                                                                                                     |
| `updated_at`           | TEXT      | NOW()                                      | Última actualización                                                                                                       |
| `completed_at`         | TEXT      | NULL                                       | Fin terminal                                                                                                               |
| `created_at`           | TEXT      | NOW()                                      | Creación                                                                                                                   |

Reglas clave:

- `ready` y `active` requieren `branch_name`, `worktree_path`, `observed_branch` y `observed_head`.
- Las filas terminales (`completed`, `failed`) son inmutables y no se reutilizan.
- Existen locks activos por `branch_name`, `worktree_path` y `(agent_id,current_task_id)` en estados no terminales.
- `cleanup_pending` modela intención de teardown; no implica ejecución Git dentro de DevHub.
- La idempotencia operativa de preparación se resuelve por `workspace_id + correlation_id`.
- `evidence_ref` es opaco en control plane, pero debe seguir siendo **auditable** vía SW-3.1 con joins **auditables** sin copiar detalles de git al esquema durable.

---

### `ai_interactions`

Historial de conversaciones con agentes IA (referenciado en CentroIA.jsx).

| Columna      | Tipo                 | Descripción       |
| ------------ | -------------------- | ----------------- |
| `id`         | UUID (PK)            | ID único          |
| `project_id` | UUID (FK→projects)   | Proyecto contexto |
| `user_id`    | UUID (FK→auth.users) | Dueño             |
| `created_at` | TIMESTAMPTZ          | Creación          |

---

## Seguridad (RLS)

Todas las tablas tienen **Row Level Security activado**. La política en cada tabla garantiza que los usuarios **solo puedan leer y escribir sus propios registros** (`auth.uid() = user_id`).

---

## Relaciones Clave

```
auth.users
    ↓
  profiles (1:1)
    ↓
  projects (1:N)
    ├── milestones (1:N)
    ├── tasks (1:N) ──── milestone_id → milestones (N:1, nullable)
    ├── agent_workspaces (1:N)  ⭐ control plane workspace lifecycle
    ├── project_files (1:N)  ⭐ nueva
    └── ai_interactions (1:N)
```

---

## Tablas Futuras

| Tabla                   | Propósito                                     |
| ----------------------- | --------------------------------------------- |
| `agent_runs`            | Evidencia durable por ejecución (SW-3.1)      |
| `agent_artifacts`       | Bitácora append-only y artifacts de ejecución |
| `mcp_connections`       | Configuraciones de MCPs por usuario/proyecto  |
| `scaffolding_templates` | Plantillas de scaffolding guardadas           |

> `devhub_agent_runs` NO es tabla durable del esquema canónico. Sigue siendo runtime/UI mirror observer-only hasta que SW-3.1 formalice `agent_runs`.
