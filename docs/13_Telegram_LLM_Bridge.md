# Telegram LLM Bridge — Multi-Proveedor

## Overview

El Telegram LLM Bridge reemplaza la cadena frágil `tmux → opencode run --agent → capture-pane → regex stripping` con llamadas directas a APIs de LLM. Soporta **4 proveedores con failover automático**.

### Antes vs Después

| Aspecto       | Antes (tmux)                       | Después (LLM Bridge)      |
| ------------- | ---------------------------------- | ------------------------- |
| Latencia      | 30-120s                            | 5-15s                     |
| Confiabilidad | Regex frágil, se rompe con updates | API estable, documentada  |
| Tool Calling  | No soportado                       | Function calling nativo   |
| Fallback      | Ninguno                            | 3 proveedores de respaldo |
| Contexto      | En memoria (se pierde)             | Persistente en SQLite     |

## Arquitectura

```
Telegram → bot.js → chat.js → LLMBridge
                                    ├── FailoverOrchestrator
                                    │   ├── CopilotAdapter (primario)
                                    │   ├── OpenRouterAdapter (secundario)
                                    │   ├── OpenCodeZenAdapter (terciario)
                                    │   └── DirectApiAdapter (fallback)
                                    ├── ToolRegistry (23 MCP tools)
                                    └── ConversationManager (SQLite)
```

### Componentes Clave

| Componente                  | Archivo                        | Responsabilidad                                                 |
| --------------------------- | ------------------------------ | --------------------------------------------------------------- |
| **LLMBridge**               | `llm-bridge.js`                | Punto de entrada único; orquesta conversación, tools y failover |
| **FailoverOrchestrator**    | `failover-orchestrator.js`     | Cadena de prioridad, retry con backoff, circuit breaker         |
| **ToolRegistry**            | `tool-registry.js`             | MCP tools → OpenAI function calling schemas + ejecución         |
| **ConversationManager**     | `conversation-manager.js`      | Persistencia SQLite, truncamiento por tokens, system prompt     |
| **ProviderRegistry**        | `provider-registry.js`         | Lazy-load de adapters, lectura de env vars, registro            |
| **LLMProvider**             | `provider-interface.js`        | Contrato abstracto que TODOS los adapters implementan           |
| **OpenAICompatibleAdapter** | `openai-compatible-adapter.js` | Base adapter reutilizado por 3 de los 4 proveedores             |

## Proveedores

### 1. GitHub Copilot (Primario — prioridad 1)

| Propiedad             | Valor                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------- |
| **SDK**               | `@copilot-extensions/preview-sdk` (con fallback a `openai` package)                       |
| **Endpoint fallback** | `https://api.githubcopilot.com` (OpenAI-compatible)                                       |
| **Modelos**           | `gpt-4o`, `gpt-4o-mini`, `claude-3.5-sonnet`, `claude-3-opus`, `o1`, `o1-mini`, `o3-mini` |
| **Contexto máximo**   | 128K (GPT-4o), 200K (Claude/o1/o3)                                                        |
| **Requiere**          | Suscripción Copilot Pro ($10/mo) o Business ($19/mo)                                      |
| **Variables**         | `COPILOT_TOKEN`, `COPILOT_MODEL` (default: `gpt-4o`), `COPILOT_ENABLED`                   |

**Nota:** El adapter tiene un enfoque dual — intenta primero el SDK oficial de Copilot, y si no está disponible, hace fallback automático al endpoint OpenAI-compatible en `api.githubcopilot.com` usando el paquete `openai`.

### 2. OpenRouter (Secundario — prioridad 2)

| Propiedad             | Valor                                                                                                                         |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **API**               | OpenAI-compatible en `https://openrouter.ai/api/v1`                                                                           |
| **Modelos gratuitos** | `qwen/qwen-2.5-72b-instruct`, `meta-llama/llama-3.3-70b-instruct`, `google/gemma-2-27b-it`                                    |
| **Otros modelos**     | Claude 3.5 Sonnet, GPT-4o-mini, Mistral, y cientos más                                                                        |
| **Contexto máximo**   | 8K-200K según modelo (ver `getMaxTokens()` en el adapter)                                                                     |
| **Variables**         | `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` (default: `qwen/qwen-2.5-72b-instruct`), `OPENROUTER_BASE_URL`, `OPENROUTER_ENABLED` |

**Ventaja:** Modelos gratuitos disponibles sin costo. Ideal como respaldo principal cuando Copilot no está configurado.

### 3. OpenCode Zen (Terciario — prioridad 3)

| Propiedad     | Valor                                                                                         |
| ------------- | --------------------------------------------------------------------------------------------- |
| **API**       | OpenAI-compatible en `https://zen.opencode.ai/v1`                                             |
| **Modelos**   | `zen-default` (64K ctx), `zen-large` (128K ctx), `zen-turbo` (32K ctx), `zen-coder` (64K ctx) |
| **Variables** | `ZEN_API_KEY`, `ZEN_MODEL` (default: `zen-default`), `ZEN_BASE_URL`, `ZEN_ENABLED`            |

### 4. API Directa (Fallback Universal — prioridad 4)

| Propiedad     | Valor                                                                              |
| ------------- | ---------------------------------------------------------------------------------- |
| **API**       | Cualquier endpoint OpenAI-compatible                                               |
| **Use cases** | Ollama local, vLLM, LiteLLM, OpenAI directa, proxies personalizados                |
| **Requiere**  | `LLM_BASE_URL` (obligatorio), `LLM_API_KEY` (opcional para proveedores locales)    |
| **Variables** | `LLM_API_KEY`, `LLM_MODEL` (default: `gpt-4o-mini`), `LLM_BASE_URL`, `LLM_ENABLED` |

**Ejemplos de uso:**

```bash
# OpenAI directa
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=sk-...
LLM_MODEL=gpt-4o-mini

# Ollama local (sin API key)
LLM_BASE_URL=http://localhost:11434/v1
LLM_MODEL=llama3

# LM Studio
LLM_BASE_URL=http://localhost:1234/v1
LLM_MODEL=local-model
```

## Cadena de Failover

El sistema intenta proveedores en orden de prioridad: **Copilot → OpenRouter → Zen → Direct**.

Ante un error, el `FailoverOrchestrator` clasifica el tipo y decide la acción:

| Tipo de Error       | Código HTTP                 | Acción                              | Reintentos                          |
| ------------------- | --------------------------- | ----------------------------------- | ----------------------------------- |
| `RATE_LIMIT`        | 429                         | Backoff exponencial (2^n × 1s)      | Sí, con `Retry-After` si disponible |
| `AUTH_ERROR`        | 401/403                     | **Failover inmediato** al siguiente | No                                  |
| `QUOTA_EXCEEDED`    | 403 (con "quota"/"billing") | **Failover inmediato** al siguiente | No                                  |
| `TIMEOUT`           | —                           | Reintentar con 50% menos timeout    | Sí, backoff suave                   |
| `MODEL_UNAVAILABLE` | 404                         | **Failover inmediato** al siguiente | No                                  |
| `SERVER_ERROR`      | 5xx                         | Reintentar 1 vez                    | 1 reintento                         |
| `CONTEXT_OVERFLOW`  | —                           | Truncar contexto y reintentar       | 1 reintento                         |

### Circuit Breaker

Cada proveedor trackea fallos consecutivos. El estado de salud se calcula así:

| Fallos Consecutivos | Estado      | Descripción                                       |
| ------------------- | ----------- | ------------------------------------------------- |
| 0                   | `healthy`   | Operando normalmente                              |
| 1-2                 | `degraded`  | Tuvo errores recientes pero funcional             |
| 3+                  | `unhealthy` | Múltiples fallos — se priorizan otros proveedores |
| N/A                 | `disabled`  | Deshabilitado por configuración                   |

## Herramientas MCP como Function Calling

El LLM puede llamar herramientas MCP durante la conversación. Están organizadas en **3 tiers** de seguridad:

### Tier 1 — Read-only (habilitadas por defecto)

| Herramienta             | Descripción                                             |
| ----------------------- | ------------------------------------------------------- |
| `get_project_context`   | Contexto completo de planificación de un proyecto       |
| `list_projects`         | Lista todos los proyectos (filtrable por estado)        |
| `get_project`           | Detalles completos de un proyecto (tareas + milestones) |
| `list_tasks`            | Tareas de un proyecto (filtrable por estado/prioridad)  |
| `get_dashboard`         | Resumen global de todos los proyectos                   |
| `list_milestones`       | Milestones del roadmap de un proyecto                   |
| `get_next_task`         | Siguiente tarea priorizada de la cola                   |
| `recall_memory`         | Búsqueda full-text en memoria del agente                |
| `explore_files`         | Explorar archivos de un directorio                      |
| `read_file`             | Leer contenido de un archivo                            |
| `git_diff_review`       | Inspeccionar diff entre ramas                           |
| `get_task_dependencies` | Dependencias de bloqueo entre tareas                    |
| `validate_topic_key`    | Validar topic_key para retrieval documental             |

### Tier 2 — Write (requieren opt-in)

| Herramienta           | Descripción                          |
| --------------------- | ------------------------------------ |
| `create_task`         | Crear nueva tarea en un proyecto     |
| `update_task`         | Actualizar estado/prioridad de tarea |
| `add_task_comment`    | Agregar comentario a una tarea       |
| `create_milestone`    | Crear nuevo milestone en el roadmap  |
| `update_milestone`    | Actualizar milestone existente       |
| `update_project`      | Actualizar campos de un proyecto     |
| `git_branch`          | Crear/cambiar a rama Git aislada     |
| `git_commit`          | Realizar commit con cambios actuales |
| `register_agent`      | Registrar Worker Agent en el swarm   |
| `heartbeat_agent`     | Renovar señal de vida de un agente   |
| `update_agent_status` | Actualizar estado visual del agente  |

### Tier 3 — Destructivas (deshabilitadas por defecto)

| Herramienta        | Descripción                   |
| ------------------ | ----------------------------- |
| `delete_task`      | Eliminar tarea (irreversible) |
| `unregister_agent` | Desregistrar agente del swarm |

### Habilitar Tiers

```javascript
// Desde código:
bridge.setToolTiers([1, 2]); // Habilitar read-only + write

// O vía ToolRegistry:
toolRegistry.enableTier(2); // Habilitar Tier 2
toolRegistry.disableTier(1); // Deshabilitar Tier 1
```

## Configuración

### Variables de Entorno

Ver `telegram-bot/.env.example` para la lista completa. Las variables mínimas para un setup funcional:

```bash
# Mínimo: al menos un proveedor configurado
# Opción A — OpenRouter (gratuito):
OPENROUTER_API_KEY=sk-or-...

# Opción B — Copilot (requiere suscripción):
COPILOT_TOKEN=ghp_...

# Opción C — API directa (Ollama local, sin costo):
LLM_BASE_URL=http://localhost:11434/v1

# Feature flag
LLM_BRIDGE_ENABLED=true
```

### Feature Flag

```bash
# Activar LLM Bridge (default: true)
LLM_BRIDGE_ENABLED=true

# Desactivar y volver a modo legacy (tmux/opencode)
LLM_BRIDGE_ENABLED=false
```

### Orden de Proveedores

El orden por defecto es `['copilot', 'openrouter', 'zen', 'direct']`. Se puede personalizar:

```javascript
const { createLLMBridge } = require('./providers/provider-registry');

const orchestrator = createLLMBridge({
  order: ['openrouter', 'direct'], // Solo estos dos, en este orden
  maxRetries: 5,
  timeout: 90000,
});
```

## Conversaciones y Contexto

### Persistencia SQLite

Las conversaciones se guardan en la tabla `llm_conversations` con:

- **Truncamiento automático** por tokens (default: 32K)
- **Límite de mensajes** por conversación (default: 30)
- **Estimación de tokens** (~4 chars/token, conservador)
- **Limpieza automática** de mensajes antiguos (default: 24h)

### System Prompt por Defecto

```
Sos un asistente de DevHub, una herramienta de gestión de proyectos para desarrolladores.
Podés ayudar con: crear tareas, ver proyectos, consultar milestones, gestionar agentes,
revisar código, y responder preguntas sobre el estado del proyecto.
Respondé en español rioplatense (voseo), de forma clara y directa.
Si no sabés algo, decilo honestamente.
```

Se puede personalizar vía `options.systemPrompt` al crear el bridge.

## Tool Call Loop

El LLMBridge maneja automáticamente el ciclo de tool calls:

```
1. Usuario envía mensaje
2. Bridge construye historial (system + conversación)
3. LLM responde → ¿tiene tool calls?
   ├─ NO → devolver texto al usuario (fin)
   └─ SÍ → ejecutar cada tool, agregar resultados al historial
           → volver al paso 3
4. Si se alcanzan maxToolIterations (default: 5) → forzar respuesta sin tools
```

## Troubleshooting

### "No hay proveedores disponibles"

- Verificar que al menos un proveedor tenga API key configurada
- Para Direct API, se requiere `LLM_BASE_URL` (es el único obligatorio)
- Revisar logs del bot para ver qué proveedores se registraron:
  ```
  Provider "copilot" skipped: no API key configured
  Provider "openrouter" registered (model: qwen/qwen-2.5-72b-instruct)
  LLM Bridge initialized with 1 provider(s): openrouter
  ```

### "Timeout after 60000ms"

- El proveedor está lento o no responde
- El failover automático intentará el siguiente proveedor
- Si todos fallan, verificar conectividad de red
- Se puede aumentar el timeout: `timeout: 90000` en las opciones del bridge

### "Token inválido o sin permisos"

- Verificar que la API key sea correcta
- Para Copilot, verificar que la suscripción esté activa
- Para OpenRouter, verificar que la cuenta tenga crédito
- Los errores 401/403 trigger failover inmediato al siguiente proveedor

### El LLM llama herramientas en loop infinito

- El sistema tiene un límite de 5 iteraciones de tool calls (`maxToolIterations`)
- Después de 5 iteraciones, fuerza una respuesta de texto con el prompt: _"Respondé con un resumen conciso de lo que encontraste. No solicites más herramientas."_
- Si sucede frecuentemente, revisar el system prompt o deshabilitar herramientas específicas

### "Todos los proveedores fallaron"

- Todos los proveedores configurados tuvieron errores
- Revisar logs para ver el último error de cada proveedor
- Verificar que las API keys no hayan expirado
- Probar conectividad manual: `curl -H "Authorization: Bearer $KEY" https://api.example.com/v1/models`

## Estructura de Archivos

```
telegram-bot/services/providers/
├── provider-interface.js          # Contrato abstracto (LLMProvider, ERROR_TYPES)
├── openai-compatible-adapter.js   # Base adapter (reutilizado por 3 proveedores)
├── copilot-adapter.js             # GitHub Copilot SDK + fallback OpenAI-compatible
├── openrouter-adapter.js          # OpenRouter (extiende OpenAICompatibleAdapter)
├── zen-adapter.js                 # OpenCode Zen (extiende OpenAICompatibleAdapter)
├── direct-adapter.js              # API Directa universal (extiende OpenAICompatibleAdapter)
├── failover-orchestrator.js       # Orquestador de failover + circuit breaker
├── provider-registry.js           # Registry, lazy-load y configuración desde env
├── tool-registry.js               # MCP tools → function calling + ejecución
├── conversation-manager.js        # Persistencia SQLite de conversaciones
└── llm-bridge.js                  # Orquestador principal (single entry point)
```

## Para Agentes

Cuando un Worker Agent necesita interactuar con el bot de Telegram:

1. El bot usa el LLM Bridge para procesar mensajes (`bridge.chat(chatId, message)`)
2. El LLM puede llamar herramientas MCP para leer/escribir datos de DevHub
3. Las herramientas **Tier 1** (read-only) están siempre disponibles
4. Las herramientas **Tier 2** (write) requieren configuración explícita (`enableTier(2)`)
5. Las herramientas **Tier 3** (destructivas) están deshabilitadas por defecto
6. Las respuestas se envían como texto plano a Telegram (sin Markdown)
7. El contexto de conversación persiste en SQLite entre mensajes del mismo chat

### Uso desde código

```javascript
const { getLLMBridgeService } = require('./services/providers/llm-bridge');

// Inicialización (una sola vez, con la DB de SQLite)
const bridge = getLLMBridgeService(db, {
  maxMessages: 30,
  maxTokens: 32000,
  maxToolIterations: 5,
});

// Uso:
const response = await bridge.chat(chatId, '¿Cuáles son mis tareas pendientes?', {
  enableTools: true,
  temperature: 0.7,
});
// response = texto plano listo para enviar a Telegram
```

### Status del Bridge

```javascript
const status = bridge.getStatus();
// {
//   enabled: true,
//   providers: { copilot: { status: 'healthy', ... }, openrouter: { ... }, ... },
//   tools: { total: 23, enabled: 13, byTier: { ... } },
//   orchestrator: { totalRequests: 42, totalFailovers: 3, ... }
// }
```
