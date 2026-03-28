---
Fecha de Modificación: 28 de marzo de 2026
Changelog:
  - 2026-03-28 v1: Creación del documento. Cubre las 8 tareas del Milestone "Fase 4 — Sistema de Priorización Inteligente de Tareas".
Milestone: "Fase 4 — Sistema de Priorización Inteligente de Tareas"
Due Date: 2026-04-25
---

# 12 Priorización Inteligente de Tareas

El cuello de botella más doloroso del flujo DevHub actual no es ejecutar tareas, sino saber **cuál ejecutar primero**. Este documento especifica el motor de priorización: un sistema de scoring multidimensional que permite al desarrollador y a los agentes Worker conocer en todo momento la tarea de mayor impacto disponible.

---

## ¿Por qué es necesario?

Actualmente el flujo es:
1. El usuario abre el Kanban.
2. Ve las tareas sin orden de importancia real.
3. Elige manualmente cuál pegar al agente.

Con este sistema el flujo pasa a ser:
1. El usuario abre la pestaña "Cola de Agente".
2. Ve las tareas ordenadas por score descendente.
3. Hace clic en "Ejecutar" → el prompt correcto se genera solo.

---

## Tareas de esta fase

---

### [PRIO-01] Diseñar esquema de scoring de prioridad por fórmula

**Prioridad:** `critical`
**Due:** 2026-04-18
**Responsable:** Agente Arquitecto / Controller

**Descripción completa:**
Definir y documentar el algoritmo de scoring que determina el orden de ejecución de tareas. La fórmula propuesta:

```
Prioridad_Score = (urgencia × 0.4) + (valor_negocio × 0.3) + (dependencias_desbloqueadas × 0.2) + (tiempo_estancada_en_horas / 48 × 0.1)
```

- **urgencia**: derivada del campo `priority` de la tarea (`critical=4, high=3, medium=2, low=1`).
- **valor_negocio**: campo nuevo en la tabla `tasks` (slider 1-10, configurado por el usuario).
- **dependencias_desbloqueadas**: número de tareas que esta tarea desbloquea al completarse (calculado desde `task_dependencies`).
- **tiempo_estancada**: horas desde la última actualización de `updated_at` cuando `status = 'in_progress'`.

**Decisiones de implementación a evaluar:**
- El score no se persistirá en DB, sino que será calculado en tiempo real en `get_next_task()` del MCP para asegurar frescura de los datos (sin desincronización de horas de estancamiento). El frontend también lo calculará on-the-fly para la "Vista Cola de Agente" recibiendo las dependencias vía API.
- Se implementará la fórmula estándar propuesta.

---

### [PRIO-02] Implementar sistema de Dependencias entre Tareas (DB)

**Prioridad:** `critical`
**Due:** 2026-04-18
**Responsable:** CLI-Worker / DB-Worker

**Descripción completa:**
Crear la tabla de relaciones de bloqueo entre tareas. Migración SQL a ejecutar en Supabase:

```sql
CREATE TABLE task_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  tipo TEXT CHECK (tipo IN ('blocks', 'related')) DEFAULT 'blocks',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (task_id, depends_on)
);

-- RLS
ALTER TABLE task_dependencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Los miembros del proyecto pueden ver dependencias"
  ON task_dependencies FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_dependencies.task_id
      AND t.project_id IN (
        SELECT project_id FROM project_members WHERE user_id = auth.uid()
      )
    )
  );
```

**Actualizar en el MCP (`devhub-mcp/server.js`):**
- `create_task_dependency({ task_id, depends_on, tipo })` — tool nueva
- `get_task_dependencies({ task_id })` — devuelve tareas que bloquea y que lo bloquean
- Incluir dependencias en la respuesta de `get_project_context()`

---

### [PRIO-03] Vista "Cola de Agente" — Tareas ordenadas por score

**Prioridad:** `high`
**Due:** 2026-04-20
**Responsable:** UI-Worker

**Descripción completa:**
Crear una nueva pestaña/tab en `src/pages/Tareas.jsx` llamada **"Cola de Agente"** que reemplaza la vista Kanban para el flujo de ejecución de Workers.

**Especificación de la vista:**
- Lista ordenada por `priority_score` descendente.
- Solo muestra tareas con `status = 'pending'` y que no estén bloqueadas por dependencias incompletas.
- Cada fila de la lista muestra:
  - Título de la tarea
  - Badge de milestone
  - Score numérico (ej. `8.4`)
  - Breakdown del score en tooltip: urgencia: 3.2 | valor: 2.1 | desbloquea: 1.8 | estancamiento: 0.3
  - Badge de prioridad (`critical`, `high`, etc.)
  - Botón **"⚡ Ejecutar con Worker"** — al hacer clic, genera y copia el prompt al clipboard.
- Botón de recarga manual + auto-refresh cada 60s.

**Prompt generado al hacer clic en "Ejecutar":**
```
Tarea: [título]
Milestone: [milestone]
Descripción completa: [descripción]
Archivos de referencia en /docs: [lista de docs relevantes detectados]
Dependencias completadas: [lista]
---
Ejecuta esta tarea siguiendo el System Prompt del Worker Agent (ver docs/09_Prompts_Maestros_Agentes.md). Abre una rama Git, implementa el cambio, actualiza /docs, y haz commit.
```

---

### [PRIO-04] Filtros avanzados en Kanban por milestone, fecha y score

**Prioridad:** `high`
**Due:** 2026-04-21
**Responsable:** UI-Worker

**Descripción completa:**
Ampliar el panel de filtros ya existente en `Tareas.jsx` con los siguientes controles:

| Control | Tipo | Descripción |
|---------|------|-------------|
| Filtrar por Milestone | `<select>` multi | Lista de milestones del proyecto |
| Rango de Due Date | Date picker range | Filtra tareas por fecha de vencimiento |
| Ordenar por | `<select>` | Opciones: `score desc`, `created_at desc`, `due_date asc`, `priority desc` |
| Solo desbloqueadas | Toggle | Oculta tareas cuyas dependencias no están completadas |
| Solo asignadas a mí | Toggle | Filtra por `assigned_to = auth.uid()` |

**Persistencia:** guardar el estado de todos los filtros en `localStorage` bajo la clave `devhub_kanban_filters_[project_id]`. Restaurar al montar el componente.

---

### [PRIO-05] Detector anti-parálisis de tareas estancadas

**Prioridad:** `medium`
**Due:** 2026-04-23
**Responsable:** Backend-Worker / Edge Function

**Descripción completa:**
Muchas tareas quedan "in_progress" y nadie las retoma. Este job las detecta y alerta.

**Implementación — Opción A (Supabase Edge Function programada):**
```typescript
// supabase/functions/stale-task-detector/index.ts
// Scheduled: every day at 08:00 UTC

const STALE_HOURS = 48;

const staleTasks = await supabase
  .from('tasks')
  .select('id, title, project_id, updated_at')
  .eq('status', 'in_progress')
  .lt('updated_at', new Date(Date.now() - STALE_HOURS * 3600 * 1000).toISOString());

// Para cada tarea estancada: actualizar campo stale_alert = true
await supabase.from('tasks').update({ stale_alert: true }).in('id', staleIds);
```

**Migración SQL requerida:**
```sql
ALTER TABLE tasks ADD COLUMN stale_alert BOOLEAN DEFAULT FALSE;
```

**Frontend — notificación al cargar Dashboard:**
Al montar `Dashboard.jsx`, hacer una query de `tasks` con `stale_alert = true`. Si hay resultados, mostrar toast de advertencia con lista de tareas, y botones: "Resetear a Pendiente" o "Escalar Prioridad".

---

### [PRIO-06] Herramienta MCP get_next_task() para Workers

**Prioridad:** `critical`
**Due:** 2026-04-22
**Responsable:** MCP-Worker

**Descripción completa:**
Esta tool es el punto de entrada del Swarm autónomo. Un Worker Agent la llama al arrancar para saber qué tarea ejecutar.

**Firma de la tool:**
```javascript
// devhub-mcp/server.js
server.tool("get_next_task", {
  project_id: z.string().uuid(),
  agent_id: z.string()  // identificador del agente, ej. "worker-1"
}, async ({ project_id, agent_id }) => {
  // 1. Calcular scores de todas las tareas pending del proyecto
  // 2. Filtrar las que no tienen dependencias bloqueantes incompletas
  // 3. Filtrar las que NO están asignadas a otro agent_id activo
  // 4. Devolver la de mayor score
  // 5. Actualizar: status = 'in_progress', assigned_to = agent_id
  // 6. Devolver objeto completo: { task, milestone, dependencies, related_docs }
});
```

**La respuesta debe incluir:**
- Descripción completa de la tarea
- Nombre del milestone al que pertenece
- Lista de dependencias ya completadas (contexto)
- Lista de archivos en `/docs` relevantes (búsqueda por keyword)
- System Prompt del Worker (referencia a `docs/09_Prompts_Maestros_Agentes.md`)

**Seguridad:** Si `agent_id` ya tiene una tarea `in_progress` asignada, devolver error en lugar de asignar otra.

---

### [PRIO-07] Modal de Edición de Tarea con campos de dependencias

**Prioridad:** `high`
**Due:** 2026-04-20
**Responsable:** UI-Worker

**Descripción completa:**
El modal de creación/edición de tarea (probablemente en `Tareas.jsx` o un componente `TaskModal.jsx`) debe incluir:

**Nuevos campos a añadir:**
1. **"Depende de"** — `<Select isMulti>` con lista de tareas del proyecto. Al seleccionar, crea registros en `task_dependencies` con `tipo = 'blocks'`.
2. **"Valor de Negocio"** — Slider de 1 a 10 con etiqueta textual (1=mínimo, 5=moderado, 10=core del negocio). Persiste en columna `business_value INTEGER` en tabla `tasks`.
3. **"Bloquea a"** — Campo de solo lectura (calculado) que muestra qué otras tareas dependen de esta.

**Migración SQL:**
```sql
ALTER TABLE tasks ADD COLUMN business_value INTEGER DEFAULT 5
  CHECK (business_value >= 1 AND business_value <= 10);
```

---

### [PRIO-08] Visualización de grafo de dependencias entre tareas

**Prioridad:** `medium`
**Due:** 2026-04-25
**Responsable:** UI-Worker

**Descripción completa:**
Vista alternativa en el Roadmap (`Roadmap.jsx`) que muestra un **grafo dirigido interactivo** de la red de dependencias entre tareas del proyecto.

**Librería recomendada:** `@xyflow/react` (react-flow v12) — ya es popular en el ecosistema React y tiene layouts automáticos.

**Especificación visual:**
- **Nodos**: cada tarea es un nodo con color por estado:
  - 🟢 Verde: `completed`
  - 🔵 Azul: `in_progress`
  - ⚪ Gris: `pending`
  - 🔴 Rojo: `blocked`
- **Aristas**: dirección del bloqueo (A → B significa "A debe completarse antes que B").
- **Layout**: dagre automático (arriba a abajo).
- Al hacer clic en un nodo: mostrar panel lateral con datos de la tarea.
- Toggle "Ver solo camino crítico" que resalta la cadena de dependencias más larga.

**Ruta de la vista:** Añadir como tab "Vista Grafo" dentro de `Roadmap.jsx`.
