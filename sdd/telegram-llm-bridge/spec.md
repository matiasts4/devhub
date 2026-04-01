# Spec: Telegram LLM Bridge

## Change: `telegram-llm-bridge`

Replaces the fragile tmux-based OpenCode execution in the Telegram bot with a direct LLM API bridge supporting 4 providers with automatic failover.

---

## 1. Requirements

### 1.1 Functional Requirements

**FR-1: Provider Abstraction**

- FR-1.1: The system SHALL implement a single `LLMProvider` interface that all provider adapters implement.
- FR-1.2: The interface SHALL expose a `chat(messages, tools, options)` method that returns `{ text, toolCalls, provider, model, usage }`.
- FR-1.3: The system SHALL support 4 provider adapters: CopilotSDK, OpenRouter, OpenCodeZen, DirectAPI.
- FR-1.4: Each adapter SHALL accept provider-specific configuration (API key, model, baseUrl) at construction time.

**FR-2: Failover Chain**

- FR-2.1: Providers SHALL be attempted in priority order: Copilot SDK → OpenRouter → OpenCode Zen → Direct API.
- FR-2.2: A provider SHALL be considered failed if it returns: HTTP 4xx/5xx, timeout, authentication error, or quota exceeded.
- FR-2.3: On provider failure, the system SHALL automatically attempt the next provider in the chain within 500ms.
- FR-2.4: The system SHALL log each failover event with source provider, error, and fallback provider.
- FR-2.5: If all providers fail, the system SHALL return a structured error with the last error from each attempted provider.
- FR-2.6: The system SHALL support a maximum of 3 retries per provider before falling back (configurable, default: 1 retry).

**FR-3: MCP Tool Integration**

- FR-3.1: The system SHALL convert MCP tool definitions to OpenAI-compatible function calling schemas.
- FR-3.2: In Phase 1, ONLY read-only MCP tools SHALL be exposed to the LLM (list, get, recall, explore, read).
- FR-3.3: Write tools (create, update, delete, write_file, git_commit) SHALL be disabled by default, enabled via feature flag `MCP_WRITE_TOOLS_ENABLED`.
- FR-3.4: When the LLM returns a tool call, the bridge SHALL execute the tool via the MCP server's stdio transport and return the result to the LLM.
- FR-3.5: The system SHALL support a maximum of 5 tool call iterations per user message (configurable via `MAX_TOOL_ITERATIONS`).
- FR-3.6: Tool execution results SHALL be capped at 2000 characters per tool to prevent context overflow.

**FR-4: Telegram Bot Integration**

- FR-4.1: When `LLM_BRIDGE_ENABLED=true`, chat.js SHALL route messages through the LLM bridge instead of opencode.js.
- FR-4.2: Conversation history from conversation.js SHALL be converted to OpenAI message format: `{ role: 'user'|'assistant'|'system', content: string }`.
- FR-4.3: A system prompt SHALL be injected as the first message instructing the LLM to respond in Rioplatense Spanish without internal reasoning markers.
- FR-4.4: Responses exceeding 4096 characters SHALL be split into chunks of 4000 characters (existing behavior preserved).
- FR-4.5: The bridge SHALL support a configurable timeout per provider (default: 30s).

**FR-5: Settings UI**

- FR-5.1: The system SHALL provide a new "LLM Providers" section in the web settings page at `/settings/llm-providers`.
- FR-5.2: Users SHALL be able to select a primary provider from a dropdown (Copilot SDK, OpenRouter, OpenCode Zen, Direct API).
- FR-5.3: When a provider is selected, a model selector SHALL dynamically populate with available models for that provider.
- FR-5.4: Users SHALL be able to configure API keys for each provider (stored encrypted in the database).
- FR-5.5: A "Test Connection" button SHALL verify the provider configuration by sending a minimal chat request.
- FR-5.6: Users SHALL be able to reorder the provider priority chain via drag-and-drop or up/down controls.
- FR-5.7: The settings SHALL persist to the `llm_provider_configs` database table.
- FR-5.8: The Telegram bot SHALL read runtime configuration from the database, falling back to environment variables if no DB config exists.

**FR-6: Feature Flags**

- FR-6.1: `LLM_BRIDGE_ENABLED` (boolean, default: false) — enables bridge routing in chat.js.
- FR-6.2: `MCP_WRITE_TOOLS_ENABLED` (boolean, default: false) — enables write-capable MCP tools.
- FR-6.3: `LLM_BRIDGE_STREAMING` (boolean, default: false) — enables streaming responses (deferred to future iteration).

### 1.2 Non-Functional Requirements

**NFR-1: Performance**

- NFR-1.1: Simple queries (no tool calls) SHALL complete within 15 seconds end-to-end.
- NFR-1.2: Queries with tool calls SHALL complete within 45 seconds end-to-end.
- NFR-1.3: Provider failover SHALL add no more than 500ms latency per fallback.
- NFR-1.4: The bridge SHALL not block the Telegram bot's event loop — all provider calls SHALL be async.

**NFR-2: Security**

- NFR-2.1: API keys SHALL be encrypted at rest using AES-256-GCM before storage in the database.
- NFR-2.2: API keys SHALL never appear in logs, error messages, or API responses.
- NFR-2.3: The encryption key SHALL be read from `LLM_BRIDGE_ENCRYPTION_KEY` environment variable.
- NFR-2.4: MCP tool execution SHALL run with the same permissions as the bot process (no privilege escalation).

**NFR-3: Observability**

- NFR-3.1: Each LLM request SHALL be logged with: provider used, model, latency, token usage, tool calls count, and success/failure status.
- NFR-3.2: Failover events SHALL be logged with WARN level including the failed provider and error type.
- NFR-3.3: The system SHALL expose a `getUsageStats()` function returning per-provider request counts and error rates.

**NFR-4: Reliability**

- NFR-4.1: The bridge SHALL gracefully handle provider API changes by catching and logging schema errors.
- NFR-4.2: Conversation state SHALL be preserved even if the bridge fails — the error is returned to the user but the conversation history remains intact.
- NFR-4.3: The system SHALL support hot-reloading of provider configuration without restarting the bot.

---

## 2. Scenarios

### Scenario 1: Simple chat message (no tools)

```
Given: LLM_BRIDGE_ENABLED=true, Copilot SDK configured as primary provider
When: User sends "¿Cómo estás?" via Telegram
Then:
  1. chat.js converts conversation history to OpenAI message format
  2. Bridge calls CopilotSDKAdapter.chat() with messages and no tools
  3. Copilot SDK returns text response
  4. Bridge returns { text: "¡Bien! ¿En qué te ayudo?", provider: 'copilot', ... }
  5. chat.js sanitizes and sends response to Telegram
  6. Conversation is updated with user message and assistant response
```

### Scenario 2: Provider failover

```
Given: Copilot SDK returns 429 (rate limit), OpenRouter configured as secondary
When: User sends any message
Then:
  1. Bridge attempts Copilot SDK → receives 429 error
  2. Bridge logs: "Provider copilot failed (429), falling back to openrouter"
  3. Bridge attempts OpenRouter → returns successful response
  4. Response is delivered to user with provider metadata logged
  5. Usage stats record: copilot=1 error, openrouter=1 success
```

### Scenario 3: MCP tool call (read-only)

```
Given: MCP tools enabled, user asks "¿Qué tareas tengo pendientes?"
When: LLM identifies need to call list_tasks tool
Then:
  1. LLM returns response with tool_calls: [{ name: 'list_tasks', arguments: { project_id: '...', status: 'pending' } }]
  2. Bridge executes list_tasks via MCP stdio transport
  3. MCP returns JSON result with task list
  4. Bridge sends tool result back to LLM as a tool message
  5. LLM processes result and returns final text response
  6. Final response is sent to Telegram user
```

### Scenario 4: All providers fail

```
Given: All 4 providers are unreachable
When: User sends a message
Then:
  1. Bridge attempts all providers in priority order
  2. Each provider fails (timeout or connection error)
  3. Bridge returns structured error: { ok: false, errors: [{ provider, error }, ...] }
  4. chat.js shows user: "⚠️ Error: No se pudo conectar con ningún proveedor LLM. Intentá de nuevo más tarde."
  5. Error is logged with all provider failure details
  6. Conversation history is preserved (error saved as assistant message)
```

### Scenario 5: Settings UI configuration

```
Given: User navigates to /settings/llm-providers
When: User selects "OpenRouter" as primary, enters API key, selects "qwen-plus" model
Then:
  1. API key is encrypted and saved to llm_provider_configs table
  2. User clicks "Test Connection"
  3. System sends minimal request to OpenRouter with selected model
  4. If successful: toast "Conexión exitosa ✓"
  5. If failed: toast "Error: {sanitized error message}"
  6. Configuration is immediately available to the Telegram bot (hot-reload)
```

### Scenario 6: Write tool blocked by feature flag

```
Given: MCP_WRITE_TOOLS_ENABLED=false, user asks "Creá una tarea nueva"
When: LLM attempts to call create_task tool
Then:
  1. Bridge checks feature flag — write tools are disabled
  2. Bridge returns tool error to LLM: "Tool 'create_task' is not available"
  3. LLM responds with text explaining the limitation
  4. User receives: "No puedo crear tareas directamente. Usá el comando /tareas en el bot."
```

---

## 3. Provider Interface Contract

All provider adapters MUST implement this exact interface:

```javascript
/**
 * @typedef {Object} ToolDefinition
 * @property {string} type - Always 'function'
 * @property {Object} function
 * @property {string} function.name - Tool name (snake_case)
 * @property {string} function.description - Human-readable description
 * @property {Object} function.parameters - JSON Schema for arguments
 */

/**
 * @typedef {Object} Message
 * @property {'user'|'assistant'|'system'|'tool'} role
 * @property {string} content
 * @property {string} [name] - Required for tool messages
 * @property {string} [tool_call_id] - Required for tool messages
 */

/**
 * @typedef {Object} ToolCall
 * @property {string} id - Unique call identifier
 * @property {string} name - Function name
 * @property {string} arguments - JSON string of arguments
 */

/**
 * @typedef {Object} Usage
 * @property {number} prompt_tokens
 * @property {number} completion_tokens
 * @property {number} total_tokens
 */

/**
 * @typedef {Object} ChatResponse
 * @property {string} text - Final text response from the LLM
 * @property {ToolCall[]} [toolCalls] - Tool calls requested by the LLM (if any)
 * @property {string} provider - Provider identifier (e.g., 'copilot', 'openrouter')
 * @property {string} model - Model name used
 * @property {Usage} [usage] - Token usage statistics
 */

/**
 * @typedef {Object} ProviderConfig
 * @property {string} apiKey - Encrypted or plaintext API key
 * @property {string} model - Model identifier
 * @property {string} [baseUrl] - Optional custom base URL (for Direct API)
 * @property {number} [timeout] - Request timeout in ms (default: 30000)
 * @property {number} [maxRetries] - Max retries before failover (default: 1)
 */

/**
 * LLM Provider Interface
 * All adapters MUST implement these methods.
 */
class LLMProvider {
  /**
   * @param {ProviderConfig} config
   */
  constructor(config) {}

  /**
   * Returns the provider identifier.
   * @returns {string} e.g., 'copilot', 'openrouter', 'opencode-zen', 'direct'
   */
  get id() {}

  /**
   * Returns the provider display name.
   * @returns {string} e.g., 'GitHub Copilot', 'OpenRouter'
   */
  get name() {}

  /**
   * Returns available models for this provider.
   * @returns {Promise<Array<{id: string, name: string, contextWindow: number}>>}
   */
  async getModels() {}

  /**
   * Sends a chat completion request.
   * @param {Message[]} messages - Conversation messages
   * @param {ToolDefinition[]} [tools] - Available tools (function calling schema)
   * @param {Object} [options]
   * @param {number} [options.maxTokens] - Maximum completion tokens
   * @param {number} [options.temperature] - Sampling temperature (0-2)
   * @param {AbortSignal} [options.signal] - Cancellation signal
   * @returns {Promise<ChatResponse>}
   */
  async chat(messages, tools = [], options = {}) {}

  /**
   * Validates the provider configuration (auth check).
   * @returns {Promise<{valid: boolean, error?: string}>}
   */
  async validate() {}
}
```

### 3.1 Failover Orchestrator

```javascript
/**
 * @typedef {Object} FailoverConfig
 * @property {LLMProvider[]} providers - Ordered list of providers (priority order)
 * @property {number} maxRetriesPerProvider - Retries before falling back (default: 1)
 * @property {number} fallbackDelayMs - Delay between fallbacks (default: 500)
 */

class FailoverOrchestrator {
  /**
   * @param {FailoverConfig} config
   */
  constructor(config) {}

  /**
   * Executes chat with automatic failover.
   * @param {Message[]} messages
   * @param {ToolDefinition[]} tools
   * @param {Object} options
   * @returns {Promise<ChatResponse>}
   * @throws {AggregateError} If all providers fail
   */
  async chat(messages, tools = [], options = {}) {}

  /**
   * Returns usage statistics across all providers.
   * @returns {Object} { perProvider: { requests, errors, avgLatency }, totalRequests, totalErrors }
   */
  getUsageStats() {}

  /**
   * Hot-reloads provider list (replaces current providers).
   * @param {LLMProvider[]} newProviders
   */
  reloadProviders(newProviders) {}
}
```

---

## 4. MCP Tool Schema

### 4.1 Tool Categories

MCP tools are categorized into 3 tiers for progressive exposure:

| Tier                          | Tools                                                                                                                                                                                                                                      | Description                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| **T1: Read-Only** (Phase 1)   | `list_projects`, `get_project`, `list_tasks`, `get_task_dependencies`, `list_milestones`, `get_dashboard`, `get_project_context`, `recall_memory`, `validate_topic_key`, `explore_files`, `read_file`, `get_next_task`, `get_session_info` | Safe, no side effects        |
| **T2: Write** (Phase 2)       | `create_task`, `update_task`, `update_project`, `update_milestone`, `add_task_comment`, `create_milestone`, `create_task_dependency`, `save_memory`, `update_agent_status`, `write_file`, `mkdir_p`                                        | Modifies state               |
| **T3: Destructive** (Phase 3) | `delete_task`, `git_branch`, `git_commit`, `git_diff_review`, `unregister_agent`                                                                                                                                                           | Irreversible or system-level |

### 4.2 Function Calling Schema Format

Each MCP tool is converted to an OpenAI-compatible function definition:

```javascript
// Example: list_tasks MCP tool → function calling schema
{
  type: 'function',
  function: {
    name: 'list_tasks',
    description: 'Lista las tareas de un proyecto, opcionalmente filtradas por estado o prioridad.',
    parameters: {
      type: 'object',
      properties: {
        project_id: {
          type: 'string',
          format: 'uuid',
          description: 'UUID del proyecto'
        },
        status: {
          type: 'string',
          enum: ['pending', 'in_progress', 'completed', 'blocked', 'all'],
          description: 'Filtrar por estado. Default: all'
        },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'critical', 'all'],
          description: 'Filtrar por prioridad. Default: all'
        }
      },
      required: ['project_id']
    }
  }
}
```

### 4.3 Tool Execution Flow

```
1. LLM returns response with tool_calls array
2. Bridge iterates each tool_call:
   a. Parse arguments JSON
   b. Map tool name to MCP tool handler
   c. Execute via MCP stdio transport (spawn child process)
   d. Capture stdout, parse JSON result
   e. Truncate result to 2000 chars if needed
   f. Build tool message: { role: 'tool', tool_call_id, name, content: result }
3. Send all tool messages back to LLM
4. LLM returns final text response (or more tool calls)
5. Repeat up to MAX_TOOL_ITERATIONS (default: 5)
```

### 4.4 MCP Tool Registry

```javascript
// telegram-llm-bridge/tools/mcp-tool-registry.js

const READ_ONLY_TOOLS = [
  'list_projects',
  'get_project',
  'list_tasks',
  'get_task_dependencies',
  'list_milestones',
  'get_dashboard',
  'get_project_context',
  'recall_memory',
  'validate_topic_key',
  'explore_files',
  'read_file',
  'get_next_task',
  'getSessionInfo',
];

const WRITE_TOOLS = [
  'create_task',
  'update_task',
  'update_project',
  'update_milestone',
  'add_task_comment',
  'create_milestone',
  'create_task_dependency',
  'save_memory',
  'update_agent_status',
  'write_file',
  'mkdir_p',
];

const DESTRUCTIVE_TOOLS = [
  'delete_task',
  'git_branch',
  'git_commit',
  'git_diff_review',
  'unregister_agent',
];

/**
 * Builds function calling schema for enabled tool tiers.
 * @param {Object} flags - { writeTools: boolean, destructiveTools: boolean }
 * @returns {ToolDefinition[]}
 */
function buildToolSchema(flags = { writeTools: false, destructiveTools: false }) {
  const enabled = [...READ_ONLY_TOOLS];
  if (flags.writeTools) enabled.push(...WRITE_TOOLS);
  if (flags.destructiveTools) enabled.push(...DESTRUCTIVE_TOOLS);
  return enabled.map((toolName) => mcpToolToFunctionSchema(toolName));
}
```

---

## 5. Settings UI Requirements

### 5.1 Page Structure

New route: `/settings/llm-providers` (Next.js App Router page)

The settings page follows the existing pattern from `EquipoSettings.jsx`:

- React component with `useState`/`useEffect`
- Supabase client for data operations
- Sonner toast for notifications
- CSS variables for theming (`var(--surface-sunken)`, `var(--text-primary)`, etc.)

### 5.2 Component: `LLMProviderSettings`

```
LLMProviderSettings
├── ProviderPriorityList (drag-and-drop reorderable list)
│   ├── ProviderCard (per provider)
│   │   ├── Provider icon + name
│   │   ├── Status indicator (configured / not configured)
│   │   ├── API key input (masked, with show/hide toggle)
│   │   ├── Model selector (dropdown, dynamically populated)
│   │   ├── Base URL input (only for Direct API)
│   │   ├── Test Connection button
│   │   └── Enable/Disable toggle
│   └── Reorder handles (up/down arrows)
├── FeatureFlagsSection
│   ├── LLM_BRIDGE_ENABLED toggle
│   ├── MCP_WRITE_TOOLS_ENABLED toggle
│   └── MAX_TOOL_ITERATIONS number input
├── UsageStatsPanel (read-only)
│   ├── Per-provider request counts
│   ├── Error rates
│   └── Average latency
└── Save/Reset buttons
```

### 5.3 Database Schema

New table: `llm_provider_configs`

```sql
CREATE TABLE llm_provider_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,  -- 'copilot', 'openrouter', 'opencode-zen', 'direct'
  api_key_encrypted TEXT NOT NULL,
  model VARCHAR(100) NOT NULL,
  base_url VARCHAR(500),           -- NULL for providers with fixed endpoints
  priority INTEGER NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_validated_at TIMESTAMPTZ,
  last_validation_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, provider)
);

CREATE TABLE llm_bridge_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  bridge_enabled BOOLEAN DEFAULT false,
  mcp_write_tools_enabled BOOLEAN DEFAULT false,
  max_tool_iterations INTEGER DEFAULT 5,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);
```

### 5.4 API Endpoints

```
POST   /api/settings/llm-providers          — Create/update provider config
GET    /api/settings/llm-providers          — List all provider configs
POST   /api/settings/llm-providers/test     — Test connection for a provider
POST   /api/settings/llm-providers/reorder  — Update priority order
GET    /api/settings/llm-providers/models   — Get available models for provider
POST   /api/settings/llm-bridge             — Update bridge feature flags
GET    /api/settings/llm-bridge/usage       — Get usage statistics
```

### 5.5 Provider Model Catalogs

Each provider has a known set of models (hardcoded + dynamic fetch):

```javascript
const PROVIDER_MODELS = {
  copilot: [
    { id: 'gpt-4.1', name: 'GPT-4.1', contextWindow: 1047576 },
    { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', contextWindow: 200000 },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', contextWindow: 1048576 },
  ],
  openrouter: [
    { id: 'qwen/qwen-plus', name: 'Qwen Plus', contextWindow: 131072 },
    { id: 'qwen/qwen-turbo', name: 'Qwen Turbo', contextWindow: 131072 },
    { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', contextWindow: 200000 },
    { id: 'openai/gpt-4.1', name: 'GPT-4.1', contextWindow: 1047576 },
  ],
  'opencode-zen': [
    { id: 'qwen-plus', name: 'Qwen Plus', contextWindow: 131072 },
    { id: 'qwen-turbo', name: 'Qwen Turbo', contextWindow: 131072 },
  ],
  direct: [
    // Dynamic — user enters baseUrl + model name
  ],
};
```

---

## 6. Telegram Bot Integration

### 6.1 Modified chat.js Flow

```javascript
// NEW flow when LLM_BRIDGE_ENABLED=true
const bridge = require('../services/llm-bridge');

module.exports = async function chat(bot, msg) {
  const chatId = msg.chat.id;
  const text = msg.text || '';

  // 1. Build messages in OpenAI format
  const messages = buildOpenAIMessages(chatId, text);

  // 2. Build tool schema based on feature flags
  const tools = bridge.getToolSchema({
    writeTools: process.env.MCP_WRITE_TOOLS_ENABLED === 'true',
  });

  // 3. Execute via bridge (handles failover internally)
  const response = await bridge.chat(messages, tools, {
    timeout: 30_000,
    maxToolIterations: parseInt(process.env.MAX_TOOL_ITERATIONS || '5', 10),
  });

  // 4. Send response to Telegram (existing chunking logic preserved)
  sendTelegramResponse(bot, chatId, response.text, msg.message_id);

  // 5. Update conversation history
  conversation.addMessage(chatId, 'user', text);
  conversation.addMessage(chatId, 'assistant', response.text);
};
```

### 6.2 Message Format Conversion

```javascript
function buildOpenAIMessages(chatId, newMessage) {
  const conv = conversation.getConversation(chatId);

  // System prompt
  const messages = [
    {
      role: 'system',
      content:
        'Sos un asistente de DevHub. Respondé en español rioplatense, claro y directo. ' +
        'NO incluyas razonamiento interno, thinking, análisis, ni pasos de depuración. ' +
        'NO repitas ni cites el contexto. ' +
        'Usá las herramientas disponibles cuando necesites información de proyectos, tareas o archivos.',
    },
  ];

  // History
  for (const m of conv.messages) {
    messages.push({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content,
    });
  }

  // Current message
  messages.push({ role: 'user', content: newMessage });

  return messages;
}
```

### 6.3 Bridge Module Structure

```
telegram-llm-bridge/
├── index.js                    — Main entry, exports chat(), getToolSchema()
├── providers/
│   ├── interface.js            — LLMProvider base class / interface definition
│   ├── copilot-sdk.js          — Copilot SDK adapter
│   ├── openrouter.js           — OpenRouter adapter (OpenAI-compatible)
│   ├── opencode-zen.js         — OpenCode Zen adapter (OpenAI-compatible)
│   └── direct-api.js           — Generic OpenAI-compatible adapter
├── orchestrator/
│   ├── failover.js             — FailoverOrchestrator class
│   └── tool-executor.js        — MCP tool execution via stdio
├── tools/
│   ├── mcp-tool-registry.js    — Tool definitions and schema builder
│   └── tool-schemas/           — Per-tool function calling schemas
│       ├── list-projects.js
│       ├── list-tasks.js
│       └── ... (one file per tool)
├── config/
│   ├── loader.js               — Loads config from DB or env vars
│   └── encryption.js           — AES-256-GCM encrypt/decrypt for API keys
└── utils/
    ├── message-converter.js    — Telegram ↔ OpenAI message format
    └── logger.js               — Structured logging for bridge operations
```

---

## 7. Configuration & Environment

### 7.1 Environment Variables (.env.example additions)

```bash
# ─── LLM Bridge ───────────────────────────────────────────────
LLM_BRIDGE_ENABLED=false
LLM_BRIDGE_ENCRYPTION_KEY=your-32-byte-hex-key-here

# Copilot SDK
COPILOT_API_KEY=
COPILOT_MODEL=gpt-4.1

# OpenRouter
OPENROUTER_API_KEY=
OPENROUTER_MODEL=qwen/qwen-plus

# OpenCode Zen
OPENCODE_ZEN_API_KEY=
OPENCODE_ZEN_MODEL=qwen-plus

# Direct API (generic OpenAI-compatible)
DIRECT_API_BASE_URL=
DIRECT_API_KEY=
DIRECT_API_MODEL=

# Feature Flags
MCP_WRITE_TOOLS_ENABLED=false
MAX_TOOL_ITERATIONS=5
LLM_BRIDGE_STREAMING=false
```

### 7.2 Configuration Loading Priority

```
1. Database config (llm_provider_configs) — if user configured via UI
2. Environment variables — fallback if no DB config exists
3. Hardcoded defaults — last resort
```

```javascript
// config/loader.js
async function loadProviderConfig(providerId) {
  // Try DB first
  const dbConfig = await db.getProviderConfig(providerId);
  if (dbConfig) {
    return {
      apiKey: decrypt(dbConfig.api_key_encrypted),
      model: dbConfig.model,
      baseUrl: dbConfig.base_url,
      enabled: dbConfig.enabled,
      priority: dbConfig.priority,
    };
  }

  // Fallback to env
  const envMap = {
    copilot: { apiKey: process.env.COPILOT_API_KEY, model: process.env.COPILOT_MODEL },
    openrouter: { apiKey: process.env.OPENROUTER_API_KEY, model: process.env.OPENROUTER_MODEL },
    'opencode-zen': {
      apiKey: process.env.OPENCODE_ZEN_API_KEY,
      model: process.env.OPENCODE_ZEN_MODEL,
    },
    direct: {
      apiKey: process.env.DIRECT_API_KEY,
      model: process.env.DIRECT_API_MODEL,
      baseUrl: process.env.DIRECT_API_BASE_URL,
    },
  };

  return envMap[providerId] || null;
}
```

---

## 8. Error Handling

### 8.1 Error Classification

| Error Type     | HTTP Code | Retry?            | Failover?                | User Message                                                       |
| -------------- | --------- | ----------------- | ------------------------ | ------------------------------------------------------------------ |
| Authentication | 401/403   | No                | Yes                      | "Error de configuración del proveedor. Contactá al administrador." |
| Rate Limit     | 429       | Yes (after delay) | Yes (if retry exhausted) | "Demasiadas solicitudes. Intentá en unos segundos."                |
| Quota Exceeded | 402       | No                | Yes                      | "Se agotó la cuota del proveedor. Cambiando a respaldo..."         |
| Server Error   | 5xx       | Yes               | Yes (if retry exhausted) | "Error temporal del proveedor. Reintentando..."                    |
| Timeout        | N/A       | Yes               | Yes (if retry exhausted) | "El proveedor tardó demasiado. Reintentando..."                    |
| Invalid Schema | 400       | No                | Yes                      | "Error de formato. Reintentando con otro proveedor..."             |
| All Failed     | N/A       | No                | No                       | "No se pudo conectar con ningún proveedor. Intentá más tarde."     |

### 8.2 Failover Decision Logic

```javascript
function shouldFailover(error, attempt, maxRetries) {
  // Never failover on client errors that won't be fixed by switching
  if (error.type === 'invalid-config') return { failover: false, retry: false };

  // Auth errors: failover immediately (retrying won't help)
  if (error.type === 'auth-error') return { failover: true, retry: false };

  // Rate limit: retry with backoff first, then failover
  if (error.type === 'rate-limit') {
    if (attempt < maxRetries)
      return { failover: false, retry: true, delay: error.retryAfter || 5000 };
    return { failover: true, retry: false };
  }

  // Server errors: retry once, then failover
  if (error.type === 'server-error') {
    if (attempt < maxRetries) return { failover: false, retry: true, delay: 1000 };
    return { failover: true, retry: false };
  }

  // Timeout: retry once with increased timeout, then failover
  if (error.type === 'timeout') {
    if (attempt < maxRetries) return { failover: false, retry: true, delay: 500 };
    return { failover: true, retry: false };
  }

  // Default: failover
  return { failover: true, retry: false };
}
```

### 8.3 Tool Execution Errors

```javascript
// When an MCP tool fails during execution:
// 1. Log the error with tool name and arguments (sanitized — no API keys)
// 2. Return error to LLM as tool message: { role: 'tool', content: 'Error: {message}' }
// 3. LLM can retry with different arguments or respond with text
// 4. If tool fails 3 times in same conversation, disable it for that session
```

---

## 9. Adapter Implementation Details

### 9.1 OpenAI-Compatible Base Adapter (covers OpenRouter, OpenCode Zen, Direct API)

```javascript
class OpenAICompatibleAdapter extends LLMProvider {
  constructor(config) {
    super(config);
    this.baseUrl = config.baseUrl || this.defaultBaseUrl;
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.timeout = config.timeout || 30000;
  }

  async chat(messages, tools = [], options = {}) {
    const body = {
      model: this.model,
      messages,
      ...(tools.length > 0 && { tools, tool_choice: 'auto' }),
      max_tokens: options.maxTokens || 4096,
      temperature: options.temperature ?? 0.7,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    if (options.signal) {
      options.signal.addEventListener('abort', () => controller.abort());
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw classifyHttpError(response.status, await response.text());
    }

    const data = await response.json();
    return parseOpenAIResponse(data, this.id, this.model);
  }
}
```

### 9.2 Copilot SDK Adapter

```javascript
class CopilotSDKAdapter extends LLMProvider {
  constructor(config) {
    super(config);
    this.apiKey = config.apiKey;
    this.model = config.model || 'gpt-4.1';
  }

  async chat(messages, tools = [], options = {}) {
    // Uses @copilot-extensions/preview-sdk or direct GitHub API
    // MCP tools are passed as native function definitions
    // Returns response in OpenAI-compatible format
    const response = await copilotSDK.chat({
      model: this.model,
      messages,
      tools: tools.map((t) => t.function), // Extract function definitions
      max_tokens: options.maxTokens || 4096,
    });

    return {
      text: response.content,
      toolCalls: response.tool_calls || [],
      provider: this.id,
      model: this.model,
      usage: response.usage,
    };
  }
}
```

---

## 10. Migration Plan

### Phase 1: Foundation (Week 1)

- [ ] Create `telegram-llm-bridge/` directory structure
- [ ] Implement `LLMProvider` interface and `OpenAICompatibleAdapter`
- [ ] Implement `FailoverOrchestrator`
- [ ] Add environment variables to `.env.example`
- [ ] Write unit tests for adapter interface contract

### Phase 2: MCP Tools (Week 1-2)

- [ ] Build MCP tool schema converter
- [ ] Implement T1 read-only tool definitions (13 tools)
- [ ] Implement stdio-based MCP tool executor
- [ ] Write integration tests for tool execution flow

### Phase 3: Telegram Integration (Week 2)

- [ ] Create `llm-bridge/index.js` entry point
- [ ] Modify `chat.js` to conditionally route through bridge
- [ ] Add feature flag `LLM_BRIDGE_ENABLED`
- [ ] Test with all 4 providers

### Phase 4: Settings UI (Week 2-3)

- [ ] Create database migrations (`llm_provider_configs`, `llm_bridge_settings`)
- [ ] Build API endpoints for provider management
- [ ] Create `/settings/llm-providers` page component
- [ ] Implement encryption/decryption for API keys
- [ ] Add "Test Connection" functionality

### Phase 5: Verification & Cleanup (Week 3)

- [ ] End-to-end testing with real providers
- [ ] Performance testing (latency, token usage)
- [ ] Failover testing (simulate provider failures)
- [ ] Documentation update
- [ ] Deprecate `opencode.js` (keep as fallback for 2 weeks)

---

## 11. Risks & Mitigations

| Risk                                                          | Impact | Likelihood | Mitigation                                                                   |
| ------------------------------------------------------------- | ------ | ---------- | ---------------------------------------------------------------------------- |
| Copilot SDK API instability or unavailability                 | High   | Medium     | OpenRouter as immediate fallback; Direct API as ultimate fallback            |
| MCP tool schema incompatibility across providers              | Medium | Medium     | Start with read-only tools; test each provider individually                  |
| API key exposure in logs or errors                            | High   | Low        | Encrypt at rest; sanitize all error messages; never log keys                 |
| Provider cost overrun                                         | Medium | Low        | Use free-tier models by default; add usage tracking                          |
| Conversation context exceeds provider token limits            | Medium | Medium     | Implement message truncation strategy (oldest-first, preserve system prompt) |
| Hot-reload race condition (config changes during active chat) | Low    | Low        | Use atomic config swap; active requests use snapshot of config               |
| Database config unavailable (Supabase down)                   | Medium | Low        | Fallback to environment variables; cache last-known config in memory         |

---

## 12. Success Criteria

- [ ] Telegram chat responses work without tmux session creation
- [ ] All 4 provider adapters pass basic chat completion test
- [ ] MCP tool calling works for all T1 read-only tools
- [ ] Provider failover works when primary is unavailable (verified by test)
- [ ] No ANSI codes or bash artifacts in responses
- [ ] Response time under 15s for simple queries (no tools)
- [ ] Response time under 45s for queries with tool calls
- [ ] Settings UI allows full provider configuration and testing
- [ ] Zero regression in existing bot functionality (commands still work)
- [ ] Feature flag `LLM_BRIDGE_ENABLED=false` immediately reverts to opencode.js
