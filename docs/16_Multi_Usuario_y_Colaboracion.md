---
Fecha de Modificación: 28 de marzo de 2026
Changelog:
  - 2026-03-28 v1: Creación del documento. Cubre las 5 tareas del Milestone "Fase 8 — Multi-Proyecto y Colaboración en Equipo".
Milestone: "Fase 8 — Multi-Proyecto y Colaboración en Equipo"
Due Date: 2026-06-10
---

# 16 Multi-Usuario y Colaboración en Equipo

DevHub nació como una herramienta personal. Esta fase lo transforma en una plataforma colaborativa donde múltiples desarrolladores humanos y enjambres de agentes IA pueden coexistir en el mismo proyecto con roles bien definidos, sin pisarse entre sí.

> **Prerrequisitos:** Las tablas de `agent_registry` (`[SWARM-01]`) y `task_events` (`[MEMO-03]`) deben existir antes de implementar las políticas RLS de esta fase.

---

## Modelo de Roles

| Rol | Capacidades |
|-----|------------|
| `admin` | Invitar/expulsar miembros, crear/eliminar proyectos, todas las operaciones |
| `worker` | Crear/editar tareas, comentar, spawnar agentes, hacer merge |
| `viewer` | Solo lectura: ver tareas, kanban, roadmap, historial |

---

## Tareas de esta fase

---

### [TEAM-01] Sistema de Invitación a Proyecto con Roles (DB + Email)

**Prioridad:** `high`
**Due:** 2026-05-30
**Responsable:** Backend-Worker / DB-Worker

**Descripción completa:**
Implementar el flujo completo que permite a un Admin invitar a colaboradores a su proyecto.

**Migración SQL:**
```sql
CREATE TABLE project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT CHECK (role IN ('admin', 'worker', 'viewer')) NOT NULL DEFAULT 'worker',
  invited_email TEXT,                   -- email del invitado (antes de que acepte)
  invite_token TEXT UNIQUE,            -- token único para el link de aceptación
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,             -- NULL = invitación pendiente
  invited_by UUID REFERENCES auth.users(id),
  UNIQUE (project_id, user_id)
);
```

**Flujo de invitación:**

```
Admin hace clic en "Invitar Colaborador"
         ↓
Ingresa email + elige rol
         ↓
Backend: INSERT en project_members con invite_token = uuid()
         ↓
Email enviado vía Resend/SendGrid:
  "Te han invitado a [Proyecto] en DevHub.
   Tu rol: Worker.
   [Aceptar Invitación] → https://devhub.app/invite/[token]"
         ↓
Invitado hace clic en el link
         ↓
Si no tiene cuenta: redirigir a /register con email pre-filled
Si tiene cuenta: aceptar directamente
         ↓
UPDATE project_members SET user_id = auth.uid(), accepted_at = NOW()
         ↓
Redirigir a /project/:id
```

**Endpoint:** `POST /api/projects/[id]/invite` con body `{ email, role }`.

**Endpoint de aceptación:** `GET /api/invite/[token]` — verifica el token y actualiza la membresía.

**UI en `Ajustes.jsx`:** Sección "Equipo" con lista de miembros actuales (con rol y fecha de unión), formulario de invitación, y botón de expulsión (admin only).

---

### [TEAM-02] Row Level Security multi-usuario para todas las tablas

**Prioridad:** `critical`
**Due:** 2026-06-01
**Responsable:** DB-Worker / Security-Worker

**Descripción completa:**
Con múltiples usuarios, es esencial que cada uno solo pueda ver y modificar los datos de sus proyectos. Las políticas RLS deben actualizarse en todas las tablas.

**Función helper para verificar membresía:**
```sql
CREATE OR REPLACE FUNCTION is_project_member(project_uuid UUID, required_role TEXT DEFAULT NULL)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = project_uuid
    AND user_id = auth.uid()
    AND accepted_at IS NOT NULL
    AND (required_role IS NULL OR role = required_role OR role = 'admin')
  );
$$ LANGUAGE SQL SECURITY DEFINER;
```

**Políticas para cada tabla:**

```sql
-- PROJECTS
CREATE POLICY "Ver proyectos donde eres miembro" ON projects
  FOR SELECT USING (is_project_member(id));

CREATE POLICY "Solo admin puede editar proyecto" ON projects
  FOR UPDATE USING (is_project_member(id, 'admin'));

-- TASKS
CREATE POLICY "Miembros ven tareas del proyecto" ON tasks
  FOR SELECT USING (is_project_member(project_id));

CREATE POLICY "Workers y admins crean tareas" ON tasks
  FOR INSERT WITH CHECK (is_project_member(project_id) AND
    (SELECT role FROM project_members WHERE project_id = tasks.project_id AND user_id = auth.uid()) IN ('admin', 'worker'));

CREATE POLICY "Workers y admins editan tareas" ON tasks
  FOR UPDATE USING (is_project_member(project_id));

-- MILESTONES (mismo patrón que tasks)
-- PROJECT_FILES (mismo patrón que tasks)
-- AGENT_MEMORY (mismo patrón)
-- AGENT_REGISTRY (mismo patrón)
-- TASK_DEPENDENCIES (mismo patrón)
-- TASK_EVENTS (solo lectura para todos los miembros)
-- TASK_COMMENTS (todos los miembros pueden ver, workers/admins pueden comentar)
```

**Verificación post-implementación:** Usar la tool `get_advisors` del `supabase-mcp-server` con `type: 'security'` para detectar tablas que aún no tienen RLS habilitado.

---

### [TEAM-03] Colaboración en tiempo real con Supabase Realtime + Presence

**Prioridad:** `high`
**Due:** 2026-06-04
**Responsable:** Frontend-Worker

**Descripción completa:**
Cuando dos personas están en el mismo proyecto en simultáneo, los cambios de uno deben verse inmediatamente en la pantalla del otro sin necesidad de recargar.

**Implementación con Supabase Realtime:**

```javascript
// src/hooks/useProjectRealtime.js
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export function useProjectRealtime({ projectId, onTaskChanged, onMilestoneChanged }) {
  useEffect(() => {
    const channel = supabase
      .channel(`project:${projectId}`)
      // Escuchar cambios en tareas
      .on('postgres_changes', {
        event: '*',          // INSERT, UPDATE, DELETE
        schema: 'public',
        table: 'tasks',
        filter: `project_id=eq.${projectId}`
      }, (payload) => onTaskChanged(payload))
      // Escuchar cambios en milestones
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'milestones',
        filter: `project_id=eq.${projectId}`
      }, (payload) => onMilestoneChanged(payload))
      // Presence: quién está viendo esta página
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        updateOnlineUsers(state);
      })
      .subscribe();

    // Anunciar que este usuario está en la página
    channel.track({
      user_id: currentUser.id,
      user_name: currentUser.name,
      page: 'kanban',
      joined_at: new Date().toISOString()
    });

    return () => supabase.removeChannel(channel);
  }, [projectId]);
}
```

**Indicador de presencia en el sidebar:**
```jsx
<PresenceIndicator>
  {onlineUsers.map(user => (
    <Avatar key={user.user_id} name={user.user_name} status="online" />
  ))}
</PresenceIndicator>
```

**Actualización del Kanban sin refetch completo:**
Al recibir un evento `UPDATE` en `tasks`, actualizar únicamente la tarjeta afectada en el estado local del Kanban (React state) usando el payload del evento, sin hacer un nuevo `SELECT` completo.

---

### [TEAM-04] Atribución de Tareas a Personas o Agentes + Vista "Lo mío"

**Prioridad:** `medium`
**Due:** 2026-06-06
**Responsable:** Backend-Worker / UI-Worker

**Descripción completa:**
Extender la columna `assigned_to` en `tasks` para apuntar tanto a usuarios como a agentes.

**Migración SQL:**
```sql
-- La columna assigned_to ya existe, pero debe aceptar tanto user_id UUID como agent_id TEXT
-- Solución: usar dos columnas separadas
ALTER TABLE tasks ADD COLUMN assigned_to_user UUID REFERENCES auth.users(id);
ALTER TABLE tasks ADD COLUMN assigned_to_agent TEXT;  -- agent_id del registry

-- La columna original assigned_to puede deprecarse gradualmente
```

**Auto-atribución al ejecutar tarea:**
Cuando un Worker completa una tarea, automáticamente:
```javascript
await supabase.from('tasks').update({
  assigned_to_agent: agent_id,
  status: 'completed',
  completed_at: new Date().toISOString()
}).eq('id', task_id);
```

**UI — Avatar en tarjeta del Kanban:**
```jsx
<TaskCard>
  {/* ... contenido de la tarea ... */}
  <div className="assignees">
    {task.assigned_to_user && (
      <UserAvatar userId={task.assigned_to_user} size="sm" tooltip />
    )}
    {task.assigned_to_agent && (
      <AgentBadge agentId={task.assigned_to_agent} size="sm" tooltip />
    )}
  </div>
</TaskCard>
```

**Vista "Lo mío" en `Tareas.jsx`:**
- Nuevo tab "Lo mío" que filtra: `assigned_to_user = auth.uid()` y `status != 'completed'`.
- Badge en el tab con el conteo de tareas asignadas.

---

### [TEAM-05] Sistema de Comentarios en Tareas (humanos y agentes)

**Prioridad:** `medium`
**Due:** 2026-06-08
**Responsable:** Backend-Worker / UI-Worker

**Descripción completa:**
Los comentarios en tareas son el canal de comunicación entre el humano, los Workers y el QA Agent. Deben soportar Markdown y diferenciarse visualmente entre autor humano y autor agente.

**Migración SQL:**
```sql
CREATE TABLE task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),  -- NULL si es un agente
  agent_id TEXT,                            -- NULL si es un humano
  content TEXT NOT NULL,
  type TEXT CHECK (type IN ('human', 'agent', 'qa', 'system')) DEFAULT 'human',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Miembros ven comentarios" ON task_comments
  FOR SELECT USING (is_project_member(project_id));
CREATE POLICY "Workers y admins comentan" ON task_comments
  FOR INSERT WITH CHECK (is_project_member(project_id));
```

**Tool MCP para que agentes comenten:**
```javascript
server.tool("add_task_comment", {
  task_id: z.string().uuid(),
  project_id: z.string().uuid(),
  agent_id: z.string(),
  content: z.string(),
  type: z.enum(['agent', 'qa']).default('agent')
}, async (params) => {
  await supabase.from('task_comments').insert({ ...params, user_id: null });
});
```

**UI — Panel lateral de Tarea:**
- Al hacer clic en una tarea del Kanban → se abre un drawer lateral.
- Parte superior: descripción completa + metadata (milestone, prioridad, score, fechas).
- Parte inferior: hilo de comentarios cronológico.
- Comentarios de agentes: borde izquierdo de color diferente (azul), badge "🤖 Agent".
- Comentarios de QA: badge "🔍 QA" + resultado (✅/❌).
- Input de texto con soporte Markdown (vista previa en tiempo real).
- **@menciones:** Al escribir `@`, autocompletar con los miembros del proyecto.
