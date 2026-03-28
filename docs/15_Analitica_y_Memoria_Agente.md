---
Fecha de Modificación: 28 de marzo de 2026
Changelog:
  - 2026-03-28 v1: Creación del documento. Cubre las 6 tareas del Milestone "Fase 7 — Analítica Avanzada y Gestión de Memoria del Agente".
Milestone: "Fase 7 — Analítica Avanzada y Gestión de Memoria del Agente"
Due Date: 2026-05-28
---

# 15 Analítica Avanzada y Gestión de Memoria del Agente

Un agente que no recuerda sus errores los repite. Un equipo que no mide su velocidad no puede predecir sus fechas. Esta fase dota a DevHub de dos capacidades que lo elevan de herramienta a plataforma inteligente: **memoria persistente entre sesiones** para los agentes, y **analítica real** basada en los eventos históricos del proyecto.

> **Prerrequisitos:** `[SWARM-01]` debe estar completado (tabla `agent_registry` existente) antes de comenzar `[MEMO-01]`.

---

## Tareas de esta fase

---

### [MEMO-01] Sistema de Memoria Persistente del Agente en Supabase

**Prioridad:** `critical`
**Due:** 2026-05-18
**Responsable:** DB-Worker / MCP-Worker

**Descripción completa:**
Actualmente cuando un agente termina una sesión, todo su conocimiento sobre el proyecto se pierde. La próxima sesión empieza desde cero, repitiendo investigaciones y a veces cometiendo los mismos errores.

**Migración SQL:**
```sql
CREATE TABLE agent_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agent_id TEXT,                        -- NULL = memoria compartida del proyecto
  key TEXT NOT NULL,                    -- identificador semántico, ej. "auth_decision"
  value TEXT NOT NULL,                  -- contenido de la memoria en texto libre
  tipo TEXT CHECK (tipo IN ('fact', 'decision', 'error', 'context')) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para búsqueda full-text
CREATE INDEX agent_memory_fts ON agent_memory USING gin(to_tsvector('spanish', value));

-- RLS
ALTER TABLE agent_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Miembros del proyecto pueden ver y crear memorias"
  ON agent_memory FOR ALL USING (
    project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid())
  );
```

**Nuevas tools en el MCP:**

```javascript
// Guardar una memoria
server.tool("save_memory", {
  project_id: z.string().uuid(),
  key: z.string(),
  value: z.string(),
  tipo: z.enum(['fact', 'decision', 'error', 'context']),
  agent_id: z.string().optional()
}, async (params) => { /* UPSERT en agent_memory */ });

// Recuperar memorias por búsqueda full-text
server.tool("recall_memory", {
  project_id: z.string().uuid(),
  query: z.string(),   // texto libre de búsqueda
  tipo: z.enum(['fact', 'decision', 'error', 'context', 'all']).optional(),
  limit: z.number().default(10)
}, async ({ project_id, query, tipo, limit }) => {
  // Búsqueda full-text con ts_rank
  const results = await supabase.rpc('search_memory', { project_id, query, tipo, limit });
  return results;
});
```

**Protocolo para los Workers:** Al comenzar una tarea, el Worker DEBE llamar `recall_memory({ query: task_title })` para recuperar conocimiento previo relevante. Al terminar, DEBE llamar `save_memory()` con al menos:
- Las decisiones técnicas tomadas al implementar la tarea.
- Cualquier error encontrado y cómo fue resuelto.

---

### [MEMO-02] Búsqueda Semántica de Memoria con pgvector (RAG)

**Prioridad:** `high`
**Due:** 2026-05-20
**Responsable:** DB-Worker / MCP-Worker

**Descripción completa:**
La búsqueda full-text de `[MEMO-01]` encuentra coincidencias exactas de palabras. Pero si el agente busca "error con la autenticación" y la memoria guardada dice "problema al configurar Supabase Auth", no habrá coincidencia. La búsqueda semántica con embeddings resuelve esto.

**Habilitar pgvector en Supabase:**
```sql
-- En el panel de Supabase: Extensions → Habilitar "vector"
CREATE EXTENSION IF NOT EXISTS vector;

-- Agregar columna de embedding a agent_memory
ALTER TABLE agent_memory ADD COLUMN embedding VECTOR(1536);

-- Índice para búsqueda aproximada rápida (HNSW)
CREATE INDEX agent_memory_embedding_idx ON agent_memory
  USING hnsw (embedding vector_cosine_ops);
```

**Pipeline de embedding (al hacer save_memory):**
```javascript
async function embedAndSave(memoryText) {
  // 1. Generar embedding con OpenAI text-embedding-3-small (o alternativa local)
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: memoryText
  });
  const embedding = response.data[0].embedding;

  // 2. Guardar en Supabase junto con el embedding
  await supabase.from('agent_memory').insert({ value: memoryText, embedding });
}
```

**Función de búsqueda semántica (Supabase RPC):**
```sql
CREATE OR REPLACE FUNCTION search_memory_semantic(
  project_id UUID,
  query_embedding VECTOR(1536),
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 10
)
RETURNS TABLE(id UUID, key TEXT, value TEXT, tipo TEXT, similarity FLOAT)
LANGUAGE SQL AS $$
  SELECT id, key, value, tipo,
    1 - (embedding <=> query_embedding) AS similarity
  FROM agent_memory
  WHERE agent_memory.project_id = search_memory_semantic.project_id
    AND 1 - (embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
$$;
```

**Nueva tool MCP:**
```javascript
server.tool("recall_memory_semantic", {
  project_id: z.string().uuid(),
  query: z.string(),
  match_threshold: z.number().default(0.7),
  limit: z.number().default(10)
}, async ({ project_id, query, match_threshold, limit }) => {
  const embedding = await generateEmbedding(query);
  return await supabase.rpc('search_memory_semantic', { project_id, query_embedding: embedding, match_threshold, match_count: limit });
});
```

---

### [MEMO-03] Event Log de Tareas para métricas de velocity del equipo

**Prioridad:** `high`
**Due:** 2026-05-18
**Responsable:** DB-Worker / Backend-Worker

**Descripción completa:**
Para calcular métricas reales de performance (velocity, lead time, cycle time), necesitamos un registro de todos los eventos que le ocurren a una tarea a lo largo de su vida.

**Migración SQL:**
```sql
CREATE TABLE task_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  tipo TEXT CHECK (tipo IN (
    'created', 'status_change', 'priority_change',
    'comment_added', 'agent_spawned', 'qa_approved',
    'qa_rejected', 'merged', 'blocked', 'stale_detected'
  )) NOT NULL,
  actor TEXT,                           -- 'user', agent_id, 'system'
  meta JSONB,                           -- datos adicionales del evento
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX task_events_task_idx ON task_events(task_id);
CREATE INDEX task_events_project_idx ON task_events(project_id, created_at DESC);
```

**Insertar eventos automáticamente:** Crear un trigger de Supabase que inserte un evento `status_change` cada vez que `tasks.status` cambia:

```sql
CREATE OR REPLACE FUNCTION log_task_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status != NEW.status THEN
    INSERT INTO task_events (task_id, project_id, tipo, meta)
    VALUES (NEW.id, NEW.project_id, 'status_change',
      jsonb_build_object('from', OLD.status, 'to', NEW.status));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER task_status_change_trigger
AFTER UPDATE ON tasks
FOR EACH ROW EXECUTE FUNCTION log_task_status_change();
```

**Endpoint de métricas:** `GET /api/analytics/velocity?project_id=uuid&period=30d`

Respuesta:
```json
{
  "tasks_per_day": 3.2,
  "avg_cycle_time_hours": 14.5,
  "avg_time_in_pending_hours": 8.1,
  "avg_time_in_progress_hours": 6.4,
  "qa_approval_rate": 0.87,
  "agent_vs_human_ratio": 0.73
}
```

---

### [MEMO-04] Predicción de fecha de entrega basada en velocity histórico

**Prioridad:** `medium`
**Due:** 2026-05-22
**Responsable:** Backend-Worker / UI-Worker

**Descripción completa:**
Con el velocity calculado en `[MEMO-03]`, podemos predecir cuándo terminará el proyecto.

**Algoritmo de predicción:**
```javascript
function predictDelivery({ completedTasks, totalTasks, velocityPerDay }) {
  const remainingTasks = totalTasks - completedTasks;
  const daysToComplete = remainingTasks / velocityPerDay;

  return {
    optimistic: addDays(today, daysToComplete * 0.7),    // 30% más rápido
    realistic: addDays(today, daysToComplete),
    pessimistic: addDays(today, daysToComplete * 1.5),    // 50% más lento
    confidence: velocity_sample_size > 10 ? 'alta' : velocity_sample_size > 5 ? 'media' : 'baja'
  };
}
```

**UI — Card "Predicción de Entrega" en `Dashboard.jsx`:**

```jsx
<PredictionCard>
  <h3>📅 Fecha Estimada de Entrega</h3>
  <div className="prediction-range">
    <span className="optimistic">Optimista: {format(prediction.optimistic, 'dd/MM/yyyy')}</span>
    <span className="realistic highlight">Realista: {format(prediction.realistic, 'dd/MM/yyyy')}</span>
    <span className="pessimistic">Pesimista: {format(prediction.pessimistic, 'dd/MM/yyyy')}</span>
  </div>
  <span className="confidence">Confianza: {prediction.confidence} ({velocity_sample_size} días de datos)</span>
  <StatusBadge
    text={isAheadOfSchedule ? '✅ Ahead of schedule' : '⚠️ Behind schedule'}
  />
</PredictionCard>
```

**Actualizar en tiempo real:** al completar una tarea, llamar al endpoint de predicción y actualizar la card sin recargar la página.

---

### [MEMO-05] Panel de Historial del Swarm y Reporte de Sprint exportable

**Prioridad:** `medium`
**Due:** 2026-05-24
**Responsable:** UI-Worker

**Descripción completa:**
Transformar `src/pages/Historial.jsx` de una vista básica a un panel completo de análisis del Swarm.

**Secciones del panel:**

**1. Línea de tiempo de ejecuciones:**
- Vista estilo Activity Feed: lista cronológica de eventos del Swarm.
- Cada evento muestra: agente, tarea, timestamp, resultado (✅ QA aprobado / ❌ QA rechazado / ⏱️ Timeout).
- Filtros: por agente, por milestone, por resultado, por rango de fechas.

**2. Estadísticas del sprint:**
```
┌─────────────────────────────────────────┐
│  Sprint actual (últimos 14 días)        │
│  ─────────────────────────────────────  │
│  Tareas completadas: 23                 │
│  Por agente IA: 18  (78%)               │
│  Por humano: 5      (22%)               │
│  Tasa de aprobación QA: 89%             │
│  Tiempo promedio por tarea: 12.3h       │
│  Tareas bloqueadas aún: 3               │
└─────────────────────────────────────────┘
```

**3. Exportar reporte:**
- Botón "📥 Exportar CSV" → descarga tabla de eventos del período seleccionado.
- Botón "📄 Exportar PDF" → genera un resumen visual del sprint usando `jsPDF` o `react-pdf`.

**Estructura del CSV:**
```
fecha,tarea,milestone,agente,duracion_horas,resultado_qa,intentos
2026-05-10,Implementar auth,Fase 5,worker-claude-1,8.2,approved,1
2026-05-11,Crear endpoint API,Fase 5,worker-gpt-2,14.1,approved,2
```

---

### [MEMO-06] Centro IA con acceso al Memory Graph del proyecto

**Prioridad:** `medium`
**Due:** 2026-05-26
**Responsable:** UI-Worker / MCP-Worker

**Descripción completa:**
El `CentroIA.jsx` actual tiene un botón "Zap" para solicitar sugerencias al agente. Esta tarea lo convierte en una **interfaz de consulta conversacional** al Memory Graph del proyecto.

**Funcionalidad nueva en CentroIA.jsx:**

1. **Input de consulta libre:** El usuario escribe una pregunta en lenguaje natural.
   - Ejemplo: "¿Qué decisiones se tomaron sobre la base de datos?"
   - Ejemplo: "¿Qué errores encontraron los agentes al implementar el Terminal?"
   - Ejemplo: "¿Cuál es el estado actual del sistema de autenticación?"

2. **Backend — endpoint `/api/centro-ia/query`:**
   ```javascript
   // Flujo:
   // 1. Generar embedding de la pregunta del usuario
   // 2. Llamar recall_memory_semantic() con el embedding
   // 3. Combinar los resultados con los documentos relevantes del /docs
   // 4. Construir un prompt de síntesis para el LLM
   // 5. Devolver respuesta + fuentes citadas
   ```

3. **Respuesta con fuentes citadas:**
   ```
   Respuesta: Se decidió usar Supabase como DB primaria con RLS activado.
   La tabla tasks tiene milestone_id como FK nullable hacia milestones.
   
   Fuentes:
   - docs/03_Esquema_BaseDatos.md (decisión de Nov 2025)
   - Memoria del agente worker-claude-1: "task_dependencies usa UUID pairs"
   ```

4. **Historial de consultas:** Guardar las últimas 20 consultas en localStorage para referencia rápida.
