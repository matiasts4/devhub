---
Fecha de Modificación: 28 de marzo de 2026
Changelog:
  - 2026-03-28 v1: Creación del documento. Cubre las 7 tareas del Milestone "Fase 5 — Ejecución Autónoma del Agente (Swarm v2)".
Milestone: "Fase 5 — Ejecución Autónoma del Agente (Swarm v2)"
Status: COMPLETADO
Due Date: 2026-05-05
---

# 13 Swarm Autónomo v2 — Ejecución Real por LLM

El Swarm Control actual tiene la UI construida y los endpoints de ramas Git funcionando, pero **los Workers son cáscaras vacías** — no ejecutan nada sin intervención manual del humano. Esta fase cierra esa brecha: al final, un Worker Agent podrá recibir una tarea, crear su rama, ejecutar el código con un LLM real, y someter el resultado al QA de forma completamente autónoma.

> **Prerrequisito crítico:** Las tareas `[PRIO-01]`, `[PRIO-02]` y `[PRIO-06]` deben estar completadas antes de comenzar `[SWARM-02]`.

---

## Arquitectura del Swarm v2

```
[Usuario activa "Modo Swarm"]
          ↓
[SWARM-01] WorkerAgent se registra en agent_registry
          ↓
[PRIO-06]  get_next_task() → tarea de mayor score + contexto
          ↓
[SWARM-07] Prompt Builder → context window completo
          ↓
[SWARM-02] Orquestador LLM → llama al API, aplica cambios, git_commit
          ↓
[SWARM-04] QA Agent evalúa el diff automáticamente
          ↓
   ¿Aprobado?
   Sí → Merge a main. Tarea = completed.
   No → [SWARM-06] Feedback al Worker. Reintento (max 3 veces).
```

---

## Tareas de esta fase

---

### [SWARM-01] ✅ Sistema de Registro de Agentes con Heartbeat

**Prioridad:** `critical`
**Due:** 2026-04-28
**Responsable:** MCP-Worker / DB-Worker

**Descripción completa:**
Para que múltiples Workers puedan operar en paralelo sin colisionar, necesitamos saber en todo momento qué agentes están vivos, en qué tarea trabajan, y cuándo fue su última señal de vida.

**Migración SQL:**
```sql
CREATE TABLE agent_registry (
  agent_id TEXT PRIMARY KEY,           -- ej. "worker-claude-1", "worker-gpt-2"
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  modelo_llm TEXT,                     -- ej. "claude-sonnet-4-5", "gpt-4o"
  status TEXT CHECK (status IN ('idle', 'working', 'error')) DEFAULT 'idle',
  current_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  last_heartbeat TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Nuevas tools en el MCP:**

```javascript
// Lllamada al iniciar el agente
server.tool("register_agent", {
  agent_id: z.string(),
  project_id: z.string().uuid(),
  nombre: z.string(),
  modelo_llm: z.string().optional()
}, async (params) => { /* INSERT en agent_registry */ });

// Llamada cada 30 segundos mientras trabaja
server.tool("heartbeat_agent", {
  agent_id: z.string()
}, async ({ agent_id }) => {
  // UPDATE last_heartbeat = NOW()
  // Si no existe el agent_id, devolver error → el Worker debe re-registrarse
});

// Llamada al terminar o cuando el Worker es interrumpido
server.tool("unregister_agent", {
  agent_id: z.string()
}, async ({ agent_id }) => { /* DELETE de agent_registry */ });
```

**Job de limpieza:** Supabase Edge Function programada que detecta agentes con `last_heartbeat > 2 minutos` y los marca como `status = 'error'`, liberando su `current_task_id` para que otro Worker lo tome.

---

### [SWARM-02] ✅ Orquestador de Ejecución Autónoma por LLM

**Prioridad:** `critical`
**Due:** 2026-04-30
**Responsable:** Backend-Worker

**Descripción completa:**
El corazón del Swarm v2. Este endpoint recibe una tarea y la ejecuta de principio a fin invocando un LLM.

**Ruta:** `POST /api/agent/execute`

**Body esperado:**
```json
{
  "task_id": "uuid-de-la-tarea",
  "agent_id": "worker-claude-1",
  "llm_provider": "anthropic",
  "llm_model": "claude-sonnet-4-5"
}
```

**Flujo interno del endpoint (pseudocódigo):**
```
1. Verificar que el agent_id está registrado y es el asignado a esta tarea.
2. Llamar get_next_task() para obtener contexto completo.
3. Llamar git_branch({ name: `agent/${agent_id}/${task_id}` }) para crear rama aislada.
4. Llamar Prompt Builder [SWARM-07] para construir el context window.
5. Invocar la API del LLM con el context window.
   → El LLM responde con un plan de cambios (archivos a crear/modificar).
6. Aplicar los cambios de código al sistema de archivos.
7. Actualizar el directorio /docs según las instrucciones del Worker Prompt.
8. Llamar git_commit({ message: `[AGENT] ${task_id}: ${task_title}` }).
9. Actualizar tarea en DB: status = 'in_progress', añadir metadata de la ejecución.
10. Emitir evento para que el QA Agent [SWARM-04] evalúe el diff.
```

**Importante:** Las API Keys del LLM **nunca** deben loguearse ni guardarse en texto plano. Leer de variables de entorno o de la configuración cifrada del usuario [SWARM-03].

---

### [SWARM-03] ✅ Panel de Configuración de Credenciales LLM del Worker

**Prioridad:** `high`
**Due:** 2026-04-27
**Responsable:** UI-Worker

**Descripción completa:**
Sección dentro de `Ajustes.jsx` (o nueva ruta `/ajustes/agentes`) para gestionar las credenciales de los providers LLM que usarán los Workers.

**UI requerida:**

1. **Selector de Provider:** Anthropic / OpenAI / Google Gemini / Custom (OpenAI-compatible)
2. **Campo API Key:** Input de tipo `password`, con botón "Revelar". Al guardar, cifrar con AES-256-GCM antes de persistir. Nunca enviar la API Key cruda al backend de Next.js como query param.
3. **Selector de modelo:** Dropdown que se auto-rellena según el provider (ej. Anthropic → `claude-opus-4-5`, `claude-sonnet-4-5`, `claude-haiku-3-5`).
4. **Test de conectividad:** Botón "Probar conexión" que hace un request mínimo al LLM API y muestra ✅ o ❌ con el mensaje de error.
5. **Configuración de límites:** Tokens máximos por ejecución, temperatura, timeout.

**Almacenamiento:** Las credenciales se guardan en `localStorage` con cifrado AES. La clave de cifrado se deriva de una passphrase que el usuario introduce una vez por sesión.

---

### [SWARM-04] ✅ QA Agent con evaluación automática de diff por LLM

**Prioridad:** `high`
**Due:** 2026-05-02
**Responsable:** MCP-Worker / Backend-Worker

**Descripción completa:**
El QA Agent evalúa automáticamente si el trabajo del Worker es aceptable antes de hacer merge a main. Usa un LLM (puede ser distinto al del Worker, incluso uno más barato/rápido) para analizar el diff.

**Nueva tool en el MCP:**
```javascript
server.tool("qa_evaluate_branch", {
  task_id: z.string().uuid(),
  branch_name: z.string(),
  qa_agent_id: z.string()
}, async ({ task_id, branch_name, qa_agent_id }) => {
  // 1. git_diff_review({ branch: branch_name }) → obtiene el diff completo
  // 2. Carga la descripción original de la tarea
  // 3. Construye prompt de evaluación para el LLM QA
  // 4. Llama al LLM con el diff + descripción de la tarea
  // 5. El LLM devuelve: { result: 'approved'|'rejected', score: 0-10, reasons: string[] }
  // 6. Guarda el resultado en la DB (tabla qa_results o campo en tasks)
  // 7. Si approved: trigger merge a main
  // 8. Si rejected: trigger ciclo de feedback [SWARM-06]
});
```

**Checklist que debe validar el LLM QA:**
```
[ ] ¿El código implementa lo que describe la tarea?
[ ] ¿Se actualizó algún archivo en /docs?
[ ] ¿No hay credenciales, API keys ni secrets en el diff?
[ ] ¿No hay código comentado o console.log de debug obvios?
[ ] ¿Los nombres de funciones/variables son descriptivos?
[ ] ¿El commit message es descriptivo y sigue el formato [AGENT] task_id: título?
```

---

### [SWARM-05] ✅ Panel de Control de Ejecución con Queue y Historial

**Prioridad:** `high`
**Due:** 2026-05-03
**Responsable:** UI-Worker

**Descripción completa:**
Ampliar `src/pages/SwarmControl.jsx` con una vista completa de control del Swarm autónomo. Esta es la "Sala de Control" que el desarrollador humano supervisa.

**Secciones del panel:**

**1. Estado del Swarm (cabecera):**
- Indicador global: 🟢 Activo / ⏸️ Pausado / 🔴 Error
- Botón "⏸️ Pause Swarm" — detiene la cola. Workers en progreso terminan su tarea actual.
- Contador: `[3 workers activos] [12 tareas en cola] [85 completadas hoy]`

**2. Workers Activos (cards en tiempo real):**
- Nombre del agente, modelo LLM, tarea actual, tiempo transcurrido
- Barra de progreso estimada
- Botón "Ver Logs" → panel lateral con output en tiempo real
- Botón "Interrumpir" → libera la tarea y mata el proceso

**3. Cola de Ejecución (tabla):**
- Siguiente tarea que será tomada por el próximo Worker libre
- Score de prioridad visible
- Botón "Saltar al frente" (redirección de prioridad)

**4. Historial de Ejecuciones (tabla):**
- Tarea, agente, timestamp inicio/fin, resultado QA, tiempo total
- Filtros por fecha, agente, resultado
- Click en fila → abre DiffViewer con los cambios de esa ejecución

**5. Aprobar/Rechazar manual:**
- Cuando el QA rechaza pero el humano quiere aprobar igual: botón "Force Merge"
- Cuando el QA aprueba pero el humano quiere revisar: botón "Hold for Review"

---

### [SWARM-06] ✅ Ciclo de Feedback y Reintento cuando QA rechaza

**Prioridad:** `medium`
**Due:** 2026-05-04
**Responsable:** Backend-Worker / MCP-Worker

**Descripción completa:**
Evitar que un Worker quede en un loop infinito cuando su trabajo siempre es rechazado.

**Flujo cuando QA devuelve `rejected`:**

```
1. Guardar feedback del QA como comentario en la tarea:
   INSERT INTO task_comments (task_id, user_id, content, type)
   VALUES (task_id, 'qa-agent-uuid', qa_feedback, 'agent');

2. Incrementar campo `retry_count` en tasks.
   if retry_count >= 3:
     → status = 'blocked'
     → Notificación al humano: "La tarea X falló 3 veces. Revisión manual requerida."
     → STOP (no reintentar)
   else:
     → Construir nuevo prompt para el Worker incluyendo el feedback del QA
     → Lanzar nueva ejecución del Worker con el contexto aumentado

3. El nuevo prompt del Worker incluye:
   "AVISO: Tu intento anterior fue rechazado por los siguientes motivos:
   [razones del QA]
   Corrígelos en esta nueva ejecución."
```

**Migración SQL:**
```sql
ALTER TABLE tasks ADD COLUMN retry_count INTEGER DEFAULT 0;
ALTER TABLE tasks ADD COLUMN last_qa_feedback TEXT;
```

---

### [SWARM-07] ✅ Prompt Builder automático con contexto de archivos

**Prioridad:** `high`
**Due:** 2026-05-05
**Responsable:** Backend-Worker / MCP-Worker

**Descripción completa:**
El éxito del Swarm autónomo depende de que el Workers reciba todo el contexto necesario en su context window al comenzar la tarea. Construir ese context window manualmente es inviable a escala.

**Lógica del Prompt Builder:**

```javascript
async function buildWorkerPrompt({ task, project, milestone, dependencies }) {
  const sections = [];

  // 1. System Prompt del Worker (de docs/09_Prompts_Maestros_Agentes.md)
  sections.push(await readDoc('09_Prompts_Maestros_Agentes.md'));

  // 2. Contexto del proyecto
  sections.push(`## Proyecto: ${project.name}\n${project.description}`);

  // 3. Milestone actual
  sections.push(`## Milestone: ${milestone.title}\n${milestone.description}`);

  // 4. Tarea a ejecutar (descripción completa)
  sections.push(`## Tu Tarea: ${task.title}\n${task.description}`);

  // 5. Dependencias completadas (contexto de lo que ya existe)
  if (dependencies.length > 0) {
    sections.push(`## Dependencias ya completadas:\n${dependencies.map(d => `- ${d.title}`).join('\n')}`);
  }

  // 6. Documentos relevantes del /docs (búsqueda por keywords de la tarea)
  const relevantDocs = await searchDocsByKeywords(task.title + ' ' + task.description);
  sections.push(`## Documentación relevante:\n${relevantDocs.map(d => d.content).join('\n\n---\n\n')}`);

  // 7. Instrucciones de cierre
  sections.push(`## Al terminar:\n- Actualiza /docs con los cambios realizados.\n- Haz git commit con el mensaje: [AGENT] ${task.id}: ${task.title}\n- Llama a complete_task({ task_id: "${task.id}" }) en el MCP.`);

  return sections.join('\n\n');
}
```

**Función `searchDocsByKeywords`:** Busca en el directorio `/docs` los archivos que contengan palabras clave extraídas del título y descripción de la tarea. Devuelve los fragmentos más relevantes (máx. 2000 tokens por doc).
