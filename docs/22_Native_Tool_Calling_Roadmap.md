# Roadmap: Native Tool Calling en AgentHub (Opción C)

> **Estado:** Pendiente — la Opción A (XML parsing + proxy) fue implementada como solución inmediata.
> Este documento describe la evolución arquitectónica necesaria cuando el XML parsing se quede corto.

---

## Por qué existe este documento

AgentHub actualmente usa un hack probado: el LLM emite tags XML (`<execute_engram>`, `<execute_devhub>`),
el frontend los intercepta y los ejecuta. Funciona, pero tiene limitaciones conocidas:

- El LLM debe emitir XML sintácticamente correcto (fragile ante variaciones del modelo)
- No hay llamadas paralelas a múltiples tools en el mismo turno
- No hay loop de razonamiento: tool → resultado → reflexión → siguiente tool
- No funciona con modelos que hacen function calling nativo pero no necesariamente XML

Cuando cualquiera de estos límites se haga visible en producción, hay que migrar a Opción C.

---

## Arquitectura: Opción C — Native Function Calling

### Diagrama de flujo

```
Usuario envía mensaje
        ↓
POST /api/agenthub/chat  ←── con tools: [{type: "function", ...}, ...]
        ↓
LLM response stream
        ↓
    ┌──────────────────────────────┐
    │  Parseador de stream         │
    │  Detecta:                    │
    │   - content chunk → emitir   │
    │   - tool_calls delta → acum  │
    └──────────────────────────────┘
        ↓ cuando finish_reason === "tool_calls"
Ejecutar tool(s) en paralelo
   → /api/mcp/devhub  (para tools de DevHub)
   → /api/mcp/engram  (para tools de Engram)
        ↓
Inyectar tool_message(s) al contexto
        ↓
Segunda llamada al LLM (con role: "tool" results)
        ↓
Continuar stream hasta "stop"
        ↓
Respuesta final al usuario
```

### Cambios necesarios por archivo

#### 1. `src/app/api/agenthub/chat/route.js`

```js
// Definición de tools (mantener sincronizado con devhub-mcp/server.js)
const DEVHUB_TOOLS = [
  {
    type: "function",
    function: {
      name: "dh_list_projects",
      description: "Lista todos los proyectos del usuario con progreso y estado",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["active", "paused", "completed", "archived", "all"]
          }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "dh_list_tasks",
      description: "Lista tareas de un proyecto, filtrables por estado o prioridad",
      parameters: {
        type: "object",
        required: ["project_id"],
        properties: {
          project_id: { type: "string", format: "uuid" },
          status: { type: "string", enum: ["pending", "in_progress", "completed", "blocked", "all"] },
          priority: { type: "string", enum: ["low", "medium", "high", "critical", "all"] }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "dh_update_task",
      description: "Actualiza estado, prioridad u otros campos de una tarea",
      parameters: {
        type: "object",
        required: ["task_id"],
        properties: {
          task_id: { type: "string" },
          status: { type: "string", enum: ["pending", "in_progress", "completed", "blocked"] },
          priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
          title: { type: "string" },
          description: { type: "string" }
        }
      }
    }
  },
  // ... agregar los 23 tools restantes siguiendo el mismo patrón
];

// Función ejecutora de tools (mapea function name → MCP tool name)
const TOOL_NAME_MAP = {
  dh_list_projects: "list_projects",
  dh_list_tasks: "list_tasks",
  dh_update_task: "update_task",
  // etc.
};

async function executeToolCall(toolCall, baseUrl) {
  const mcpTool = TOOL_NAME_MAP[toolCall.function.name];
  if (!mcpTool) throw new Error(`Unknown tool: ${toolCall.function.name}`);

  const args = JSON.parse(toolCall.function.arguments);
  const res = await fetch(`${baseUrl}/api/mcp/devhub`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ toolName: mcpTool, args }),
  });
  if (!res.ok) throw new Error(`Tool call failed: ${res.status}`);
  return res.json();
}
```

#### Loop de tool calling en el stream handler:

```js
// En el bloque que maneja el stream OpenAI:
let toolCallsAccum = {};  // id → {name, args_chunks[]}

for await (const chunk of response) {
  const delta = chunk.choices?.[0]?.delta;
  const finishReason = chunk.choices?.[0]?.finish_reason;

  // Acumular tool call deltas
  if (delta?.tool_calls) {
    for (const tc of delta.tool_calls) {
      if (!toolCallsAccum[tc.index]) {
        toolCallsAccum[tc.index] = { id: tc.id, name: tc.function?.name || "", args: "" };
      }
      if (tc.function?.name) toolCallsAccum[tc.index].name = tc.function.name;
      if (tc.function?.arguments) toolCallsAccum[tc.index].args += tc.function.arguments;
    }
  }

  // Text content — stream normally
  if (delta?.content) {
    controller.enqueue(encoder.encode(JSON.stringify({ type: "chunk", content: delta.content }) + "\n"));
  }

  // Tool calls complete — execute in parallel
  if (finishReason === "tool_calls") {
    const calls = Object.values(toolCallsAccum);
    const results = await Promise.all(calls.map(tc => executeToolCall(tc, baseUrl)));

    // Build new messages context with tool results
    const toolMessages = results.map((result, i) => ({
      role: "tool",
      tool_call_id: calls[i].id,
      content: JSON.stringify(result),
    }));

    // Continue generation loop with tool results injected
    // ... segunda llamada al LLM con messages + tool results
  }
}
```

#### 2. `src/views/AgentHub.jsx`

- `parseAndExecuteCommands` ya NO necesita XML parsing
- En su lugar, el backend maneja el loop completo y devuelve la respuesta final
- Si querés streaming del loop (ver tool en ejecución), hay que emitir `{ type: "tool_start", name }` y `{ type: "tool_result", name, content }` desde el backend
- El frontend renderiza esos eventos como el live panel ya hace con subagents

#### 3. `src/app/api/mcp/devhub/route.js`

Sin cambios — el proxy ya funciona, lo sigue usando el executeToolCall del backend.

---

## Cuándo migrar

Señales de que ya llegó el momento:

- [ ] Un modelo empieza a generar XML malformado con frecuencia (args con comillas escapadas, etc.)
- [ ] Necesitás ejecutar 2+ tools en paralelo en una sola respuesta del LLM
- [ ] Los usuarios piden features que requieren razonamiento multi-step (tool A → ver resultado → decidir → tool B)
- [ ] Querés que el LLM use tools SIN que el prompt le diga cuándo hacerlo (que lo infiera solo)

---

## Consideraciones de seguridad para Opción C

- **Validar toolName contra whitelist** antes de ejecutar — el LLM podría alucinar tool names
- **Limitar argumentos peligrosos**: `delete_task` debe requerir confirmación explícita del usuario
- **Rate limiting** en el loop de tool calling: máximo N iteraciones para evitar bucles infinitos
- **Timeout** por tool call: si el MCP tarda > 10s, abandonar y notificar

---

## Reference: Opción A implementada (estado actual)

La Opción A usó el patrón XML parsing ya probado con Engram:

- LLM emite `<execute_devhub tool="..." args='...'></execute_devhub>`
- `parseAndExecuteCommands` en `AgentHub.jsx` lo intercepta
- Llama a `/api/mcp/devhub` → proxy a OpenCode `/mcp/devhub/call`
- Inyecta el resultado como mensaje de usuario silencioso (`skipParse=true`)

**Archivos modificados (Opción A):**
- `~/.config/opencode/opencode.json` — devhub MCP habilitado
- `src/app/api/mcp/devhub/route.js` — proxy creado
- `src/views/AgentHub.jsx` — formatMessage + parseAndExecuteCommands extendidos
- `src/app/api/agenthub/chat/route.js` — system prompt actualizado con tools DevHub

---

*Fecha de decisión: 2026-04-08*
*Contexto: AgentHub necesitaba acceso directo a DevHub MCP para tareas pequeñas sin spawning de OpenCode subagent.*
