# Causa 2 — Migración SQLite: índice sobre `invited_email` antes del ALTER

## Problema

La DB canónica del usuario en `~/.devhub/data/devhub.db` era **legacy**: tabla `project_members` creada antes de las columnas de invitaciones (`invited_email`, `invite_token`, etc.).

`ensureAllSchema()` en `src/lib/db/schema.js` intentaba:

```sql
CREATE INDEX IF NOT EXISTS idx_project_members_invited_email ON project_members(invited_email)
```

**antes** de ejecutar:

```sql
ALTER TABLE project_members ADD COLUMN invited_email TEXT;
```

En SQLite esto falla con `no such column: invited_email`. El error propagaba al hub → toast **"Error al cargar proyectos"** y lista vacía (aunque `SELECT * FROM projects` devolvía filas).

## Síntomas

- Hub abre pero **no lista proyectos**
- Toast de error al cargar proyectos
- Logs/API: error de schema al inicializar DB
- Proyecto existía en DB (`Devhub`, `workspace_id=local-ws`) pero UI mostraba 0

## Cómo se detectó

```bash
# Inspeccionar columnas actuales
sqlite3 ~/.devhub/data/devhub.db "PRAGMA table_info(project_members);"

# Si faltan invited_* en DB vieja, reproducir ensureAllSchema en dev
node -e "
  const { ensureAllSchema } = require('./src/lib/db/schema');
  // ... abrir DB legacy y llamar ensureAllSchema
"
# → SqliteError: no such column: invited_email
```

También útil:

```bash
sqlite3 ~/.devhub/data/devhub.db "SELECT id, name FROM projects;"
# → filas presentes mientras la UI dice vacío
```

## Corrección

1. Mover creación de índices `idx_project_members_invited_email` e `idx_project_members_invite_token` **después** del loop de `ALTER TABLE` (mismo patrón que ya existía para `task_comments.user_id`).

2. Añadir ALTERs explícitos en el loop legacy:

   - `invited_email`, `invite_token`, `invited_at`, `accepted_at`, `invited_by`

3. Test de regresión: `src/lib/db/core.test.js` — `ensureAllSchema upgrades legacy project_members invite columns`.

## Orden correcto (regla ponytail)

```text
CREATE TABLE IF NOT EXISTS  → solo aplica en DB nueva
ALTER TABLE ... ADD COLUMN  → upgrade DB legacy
CREATE INDEX ...            → solo cuando la columna ya existe
```

## Archivos

- `src/lib/db/schema.js`
- `src/lib/db/core.test.js`
