# DevHub MCP Server

Servidor MCP local que expone herramientas de DevHub a Antigravity (y cualquier cliente MCP compatible).

**Sin API key externa** — se conecta directamente a Supabase usando tus credenciales locales.

---

## Setup: 2 pasos

### 1. Añadir `SUPABASE_SERVICE_ROLE_KEY` a `.env.local`

Obtén la Service Role Key desde el [Dashboard de Supabase](https://supabase.com/dashboard/project/kpgeyukrsydjujqouape/settings/api):

```bash
# En /home/matias/devhub/.env.local — añadir:
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key-aqui
```

> ⚠️ **Nunca commitear esta clave.** El `.gitignore` ya la excluye (`*.local`).

### 2. (Ya hecho) Configuración en Antigravity

El servidor ya está registrado en `/home/matias/.gemini/antigravity/mcp_config.json`:

```json
"devhub": {
  "command": "node",
  "args": ["/home/matias/devhub/devhub-mcp/server.js"]
}
```

Reinicia Antigravity para que cargue el nuevo servidor.

---

## Herramientas disponibles

| Herramienta | Descripción |
|-------------|-------------|
| `list_projects` | Lista todos los proyectos (filtro por estado) |
| `get_project` | Detalles completos de un proyecto + tareas + hitos |
| `update_project` | Actualiza nombre, estado, progreso, color |
| `list_tasks` | Tareas de un proyecto (filtro por estado/prioridad) |
| `create_task` | Crea una nueva tarea |
| `update_task` | Cambia estado, prioridad, título de una tarea |
| `delete_task` | Elimina una tarea |
| `list_milestones` | Hitos del roadmap |
| `create_milestone` | Crea un nuevo hito |
| `update_milestone` | Actualiza estado/fecha de un hito |
| `get_dashboard` | Resumen global de todos los proyectos |

---

## Test manual

```bash
cd /home/matias/devhub
node devhub-mcp/server.js
# Si ves "✅ DevHub MCP Server iniciado" el servidor funciona
```

---

## Sin SUPABASE_SERVICE_ROLE_KEY

El servidor también funciona con el `NEXT_PUBLIC_SUPABASE_ANON_KEY`, pero verás solo los datos cuyo RLS permite acceso anónimo (ninguno por defecto). La service role key bypasea RLS y permite acceso total.
