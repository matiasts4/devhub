# Technical Design: Telegram LLM Bridge

## Executive Summary

This design replaces the fragile tmux-based OpenCode execution chain in the Telegram bot with a direct LLM API bridge that supports 4 providers with automatic failover. The bridge eliminates all terminal manipulation (temp files, tmux sessions, capture-pane polling, 40+ ANSI regex patterns) and provides direct API access to LLM providers with MCP tool calling support.

**Key change**: `opencode.run(agent, prompt)` → `llmBridge.chat(messages, tools, options)`

---

## 1. Architecture Overview

### 1.1 Component Diagram (Text-Based)

```
┌─────────────────────────────────────────────────────────────────────┐
│                        TELEGRAM BOT (CommonJS)                       │
│                                                                       │
│  bot.js ──► chat.js ──► llmBridge.js (new orchestrator)              │
│                │                    │                                  │
│                │              ┌─────┴──────┐                          │
│                │              │  Provider   │                          │
│                │              │  Selection  │  (Strategy Pattern)      │
│                │              │  Engine     │                          │
│                │              └─────┬──────┘                          │
│                │                    │                                  │
│                │    ┌───────────────┼───────────────┐                 │
│                │    ▼               ▼               ▼                 │
│                │  CopilotSDK    OpenRouter    OpenCodeZen    Direct   │
│                │  Adapter       Adapter       Adapter      Adapter    │
│                │    │             │             │            │        │
│                │    └─────────────┴─────────────┴────────────┘        │
│                │                    │                                  │
│                │              ┌─────┴──────┐                          │
│                │              │  Failover   │  (Chain of Resp.)        │
│                │              │  Chain      │                          │
│                │              └────────────┘                          │
│                │                                                      │
│  conversation.js ──► (unchanged: in-memory Map, max 20 msgs)         │
│                                                                       │
│  tool-registry.js ──► MCP tools → function calling schemas           │
│                                                                       │
│  mcp-executor.js ──► HTTP calls to devhub-mcp via stdio bridge       │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                     FRONTEND (Next.js / React)                      │
│                                                                       │
│  /settings/llm-providers ──► LLMProviderSettings.jsx                │
│         │                    │                                        │
│         │                    ├── ProviderCard (toggle, priority)     │
│         │                    ├── ModelSelector (per provider)        │
│         │                    └── ApiKeyInput (masked, encrypted)     │
│         │                                                             │
│         └──► /api/settings/llm-providers (CRUD)                      │
│                                                                       │
│  Settings Layout ──► navItems includes "LLM Providers"               │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                     DEVHUB MCP SERVER (stdio)                       │
│                                                                       │
│  30+ tools (git, projects, tasks, milestones, memory, swarm)        │
│  Exposed via zod schemas → converted to OpenAI function calling     │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 Data Flow: Complete Request/Response Cycle

```
1. User sends message via Telegram
   └─► bot.js receives msg.text

2. chat.js orchestrates:
   a. conversation.getAgent(chatId) → current agent name
   b. conversation.buildContextPrompt(chatId, text) → structured prompt
   c. bot.sendMessage("⏳ Pensando...")

3. llmBridge.chat() is called:
   a. Convert context prompt to OpenAI message format:
      [{ role: "system", content: systemPrompt },
       { role: "user", content: userMessage }]
   b. toolRegistry.getFunctionDefinitions() → array of function schemas
   c. Provider selection engine picks first available provider

4. Provider adapter executes:
   a. Build API request (headers, body, endpoint)
   b. Send HTTP request with messages + tools
   c. Handle streaming or batch response
   d. Parse response (text or tool_calls)

5. If tool_calls in response:
   a. mcpExecutor.execute(toolCall) → HTTP to devhub-mcp
   b. Feed tool result back to LLM
   c. Repeat until no more tool_calls

6. Final text response returned to chat.js

7. chat.js:
   a. conversation.addMessage(chatId, "user", text)
   b. conversation.addMessage(chatId, "assistant", response)
   c. Delete "thinking" message
   d. Send response to Telegram (chunked if > 4096 chars)
```

### 1.3 How This Fits Into Existing Architecture

| Component              | Before                                   | After                                  |
| ---------------------- | ---------------------------------------- | -------------------------------------- |
| `chat.js`              | Calls `opencode.run()`                   | Calls `llmBridge.chat()`               |
| `opencode.js`          | tmux session, temp files, regex cleaning | **Replaced entirely** by bridge        |
| `conversation.js`      | In-memory Map, 20 msg limit              | **Unchanged** — same interface         |
| `formatter.js`         | Markdown formatting                      | **Unchanged**                          |
| `bot.js`               | Entry point, command routing             | **Unchanged**                          |
| `devhub-mcp/server.js` | MCP server via stdio                     | **Unchanged** — called via HTTP bridge |

---

## 2. Design Patterns Used

### 2.1 Adapter Pattern (Provider Abstraction)

**Why**: Each LLM provider has different API shapes, authentication, and response formats. The Adapter pattern lets us normalize all providers behind a single `LLMProvider` interface.

```javascript
// Abstract interface all adapters implement
class LLMProvider {
  async chat(messages, tools = [], options = {}) {
    throw new Error('Not implemented');
  }
  async getAvailableModels() {
    throw new Error('Not implemented');
  }
  get name() {
    throw new Error('Not implemented');
  }
}
```

Each adapter translates the common interface to provider-specific calls:

- **CopilotSDKAdapter**: Uses `@copilot-extensions/preview-sdk` with native MCP support
- **OpenRouterAdapter**: OpenAI-compatible `/v1/chat/completions` with `openrouter.ai` base URL
- **OpenCodeZenAdapter**: OpenAI-compatible with Zen-specific headers
- **DirectAPIAdapter**: Generic OpenAI-compatible, configurable `baseUrl` + `apiKey`

### 2.2 Strategy Pattern (Provider Selection)

**Why**: Provider priority is configurable and may change at runtime. The Strategy pattern encapsulates the selection logic.

```javascript
class ProviderSelectionStrategy {
  constructor(config) {
    // config.providers = [{ name: 'copilot', enabled: true, priority: 1 }, ...]
    this.providers = config.providers
      .filter((p) => p.enabled)
      .sort((a, b) => a.priority - b.priority);
  }

  getNextProvider() {
    return this.providers.shift(); // Returns highest priority first
  }
}
```

### 2.3 Chain of Responsibility (Failover)

**Why**: When a provider fails (auth error, quota exceeded, timeout), the request automatically cascades to the next provider. Each handler either processes the request or passes it down the chain.

```javascript
class FailoverChain {
  async execute(messages, tools, options) {
    const errors = [];
    for (const provider of this.strategy.providers) {
      try {
        return await provider.adapter.chat(messages, tools, options);
      } catch (err) {
        errors.push({ provider: provider.name, error: err.message });
        logger.warn(`Provider ${provider.name} failed: ${err.message}`);
        // Continue to next provider
      }
    }
    throw new AggregateError(
      errors,
      `All providers failed: ${errors.map((e) => e.provider).join(', ')}`
    );
  }
}
```

### 2.4 Factory Pattern (Adapter Instantiation)

**Why**: Centralizes adapter creation based on configuration, avoiding scattered `switch` statements.

```javascript
class ProviderAdapterFactory {
  static create(config) {
    const adapters = {
      copilot: () => new CopilotSDKAdapter(config.copilot),
      openrouter: () => new OpenRouterAdapter(config.openrouter),
      zen: () => new OpenCodeZenAdapter(config.zen),
      direct: () => new DirectAPIAdapter(config.direct),
    };
    return adapters[config.type]?.() ?? null;
  }
}
```

### 2.5 Observer Pattern (Provider Health Monitoring)

**Why**: Track provider health metrics (latency, error rate, last successful call) for intelligent failover decisions.

```javascript
class ProviderHealthMonitor {
  recordSuccess(provider, latency) {
    /* ... */
  }
  recordFailure(provider, error) {
    /* ... */
  }
  isHealthy(provider) {
    /* circuit breaker logic */
  }
}
```

---

## 3. Module Structure

```
telegram-llm-bridge/                    # New root module
├── index.js                            # Main export: createBridge(config)
├── llm-bridge.js                       # Orchestrator: chat(), manages failover
├── providers/
│   ├── provider-interface.js           # Abstract LLMProvider class
│   ├── copilot-adapter.js              # GitHub Copilot SDK adapter
│   ├── openrouter-adapter.js           # OpenRouter (OpenAI-compatible)
│   ├── zen-adapter.js                  # OpenCode Zen (OpenAI-compatible)
│   └── direct-adapter.js               # Generic OpenAI-compatible
├── tool-registry.js                    # MCP tool → function calling converter
├── mcp-executor.js                     # Executes tool calls via HTTP to devhub-mcp
├── conversation-formatter.js           # Converts conversation.js output to OpenAI format
├── config/
│   └── providers.js                    # Provider config loader from .env
└── health-monitor.js                   # Provider health tracking + circuit breaker

telegram-bot/                           # Existing bot (modified)
├── bot.js                              # Unchanged
├── commands/
│   └── chat.js                         # Modified: uses llmBridge instead of opencode
├── services/
│   ├── opencode.js                     # DEPRECATED (kept as fallback during migration)
│   ├── conversation.js                 # Unchanged
│   └── formatter.js                    # Unchanged
└── .env.example                        # Modified: add provider keys

src/                                    # Frontend (Next.js)
├── app/
│   └── settings/
│       ├── layout.jsx                  # Modified: add "LLM Providers" nav item
│       └── llm-providers/
│           └── page.jsx                # New settings page
├── components/
│   └── LLMProviderSettings.jsx         # Provider configuration UI
└── lib/
    └── api/
        └── llm-providers.js            # API client for provider settings
```

---

## 4. Key Design Decisions

### 4.1 Why Adapter Pattern Over Other Approaches

| Approach                  | Pros                                             | Cons                                    | Verdict       |
| ------------------------- | ------------------------------------------------ | --------------------------------------- | ------------- |
| **Adapter Pattern**       | Clean interface, easy to add providers, testable | Slight boilerplate per adapter          | ✅ **Chosen** |
| Single monolithic service | Simple initially                                 | Becomes unmaintainable with 4 providers | ❌            |
| Plugin system             | Extensible                                       | Overkill for 4 known providers          | ❌            |
| Direct API calls inline   | No abstraction                                   | Duplicated error handling, no failover  | ❌            |

The Adapter pattern is the right choice because:

1. We have **exactly 4 known providers** with different APIs
2. All providers share the same core operation: `chat(messages, tools) → response`
3. OpenRouter, OpenCode Zen, and Direct API are all OpenAI-compatible — they can share a **base adapter class**
4. Copilot SDK is the outlier — needs its own adapter but same interface

### 4.2 Function Calling Schema Generation from MCP Tools

MCP tools use zod schemas. We convert them to OpenAI function calling format:

```javascript
// MCP tool definition (from devhub-mcp/server.js):
server.tool('git_branch', 'Crea y/o cambia a una rama...', {
  branch_name: z.string().describe('Nombre de la nueva rama')
});

// Converted to OpenAI function calling:
{
  type: 'function',
  function: {
    name: 'git_branch',
    description: 'Crea y/o cambia a una rama...',
    parameters: {
      type: 'object',
      properties: {
        branch_name: { type: 'string', description: 'Nombre de la nueva rama' }
      },
      required: ['branch_name']
    }
  }
}
```

**Conversion strategy**:

1. Static JSON file generated from MCP server tool definitions (build-time)
2. Alternatively: HTTP endpoint on MCP server that returns all tool schemas
3. For v1: **Static JSON** — simpler, no runtime dependency

```javascript
// tool-registry.js
const MCP_TOOL_SCHEMAS = require('./mcp-tool-schemas.json');

class ToolRegistry {
  getFunctionDefinitions(options = {}) {
    let tools = MCP_TOOL_SCHEMAS;
    if (options.readOnlyOnly) {
      tools = tools.filter((t) => READ_ONLY_TOOLS.has(t.function.name));
    }
    if (options.exclude) {
      tools = tools.filter((t) => !options.exclude.has(t.function.name));
    }
    return tools;
  }
}
```

### 4.3 Streaming vs Batch Responses

**Decision**: **Batch responses for v1**, streaming deferred.

**Rationale**:

- Telegram has a 4096 character message limit — streaming requires message editing
- node-telegram-bot-api supports `editMessageText` but it's complex with rate limits
- Current bot already uses batch (waits for full response)
- Streaming adds complexity: partial messages, rate limiting, user experience
- **v2**: Add streaming with progressive message updates

### 4.4 Error Handling and Retry Strategy

```
Provider Error Classification:
├── RETRYABLE (retry on same provider)
│   ├── Rate limit (429) → exponential backoff, max 2 retries
│   ├── Timeout → increase timeout by 50%, max 1 retry
│   └── Transient network error → immediate retry, max 1
├── FAILOVER (immediately try next provider)
│   ├── Auth error (401/403) → skip this provider entirely
│   ├── Quota exceeded → skip for this session
│   └── Model not found → skip, log warning
└── FATAL (return error to user)
    ├── All providers exhausted
    └── Invalid request (400) → user error, don't retry
```

### 4.5 Security Considerations

| Concern              | Mitigation                                                                    |
| -------------------- | ----------------------------------------------------------------------------- |
| API key exposure     | Keys in `.env` only, never committed, `.env` in `.gitignore`                  |
| Key rotation         | Admin can update keys via settings UI without restart                         |
| MCP tool permissions | Read-only tools enabled by default, write tools require explicit opt-in       |
| Prompt injection     | System prompt includes strict output instructions; tool results are sanitized |
| Rate limiting        | Per-provider rate tracking, backoff on 429 responses                          |

---

## 5. MCP Tool Integration Design

### 5.1 Tool Exposure as Function Calling

All 30+ MCP tools are converted to function calling definitions. They are grouped by category:

```javascript
const TOOL_CATEGORIES = {
  // READ-ONLY (enabled by default in Telegram)
  READ: [
    'list_projects',
    'get_project',
    'list_tasks',
    'get_task_dependencies',
    'get_next_task',
    'list_milestones',
    'get_dashboard',
    'get_project_context',
    'recall_memory',
    'recall_memory_semantic',
    'explore_files',
    'read_file',
    'git_diff_review',
    'validate_topic_key',
    'build_context_pack',
  ],
  // WRITE (require explicit opt-in via settings)
  WRITE: [
    'create_task',
    'update_task',
    'delete_task',
    'add_task_comment',
    'create_milestone',
    'update_milestone',
    'create_task_dependency',
    'git_branch',
    'git_commit',
    'write_file',
    'mkdir_p',
    'save_memory',
    'register_agent',
    'heartbeat_agent',
    'unregister_agent',
    'update_agent_status',
    'qa_evaluate_branch',
    'mark_planning_done',
    'update_project',
  ],
};
```

### 5.2 Tool Execution Pipeline

```
LLM returns tool_call → mcpExecutor.execute(toolCall)
  │
  ├─► 1. Validate tool name exists in registry
  ├─► 2. Validate arguments against schema (ajv or zod)
  ├─► 3. Check permission (read-only vs write)
  ├─► 4. Execute via HTTP POST to devhub-mcp bridge endpoint
  │     OR directly call devhub-mcp functions via imported module
  ├─► 5. Sanitize result (truncate if > 2000 chars)
  └─► 6. Return to LLM as tool result message
```

**Execution approach**: Since `devhub-mcp/server.js` runs as a stdio process, we have two options:

| Approach                          | Pros                              | Cons                               |
| --------------------------------- | --------------------------------- | ---------------------------------- |
| **Import MCP functions directly** | No extra process, fast, simple    | Tightly coupled to MCP server code |
| **HTTP bridge to MCP stdio**      | Decoupled, can run MCP separately | Extra latency, needs bridge server |

**Decision**: **Import MCP functions directly** for v1. The MCP server's tool handlers are pure functions that can be extracted and imported. This avoids the complexity of a bridge server.

```javascript
// mcp-executor.js
import { createClient } from '@supabase/supabase-js';
// Import tool handlers directly from devhub-mcp
import { toolHandlers } from '../../devhub-mcp/handlers.js';

class MCPExecutor {
  constructor(config) {
    this.supabase = createClient(config.supabaseUrl, config.supabaseKey);
    this.cwd = config.cwd || process.cwd();
  }

  async execute(toolCall) {
    const { name, arguments: args } = toolCall.function;
    const handler = toolHandlers[name];
    if (!handler) throw new Error(`Unknown tool: ${name}`);

    const result = await handler(args, { supabase: this.supabase, cwd: this.cwd });
    return this.sanitizeResult(result);
  }

  sanitizeResult(result) {
    const text = typeof result === 'string' ? result : JSON.stringify(result);
    const MAX_RESULT = 2000;
    if (text.length > MAX_RESULT) {
      return text.substring(0, MAX_RESULT) + '\n\n[... resultado truncado ...]';
    }
    return text;
  }
}
```

### 5.3 Read-Only vs Write Tools Strategy

- **Default**: Only read-only tools are available to the Telegram bot
- **Opt-in**: Write tools can be enabled per-chat via `/tools write on` command
- **Safety**: Destructive tools (`delete_task`, `write_file`) require confirmation
- **Audit**: All tool executions are logged with chatId, tool name, and result

### 5.4 Tool Result Formatting

Tool results are formatted as concise text for the LLM:

```
✅ list_projects: 3 proyectos encontrados
  - devhub (active, 45%)
  - mi-app (in_progress, 20%)
  - legacy (archived, 100%)
```

Error results:

```
❌ get_project: Proyecto no encontrado (id: abc-123)
```

---

## 6. Settings UI Design

### 6.1 Component Structure

```
/settings/llm-providers/page.jsx
├── LLMProviderSettings
│   ├── ProviderCard (×4: Copilot, OpenRouter, Zen, Direct)
│   │   ├── Toggle (enable/disable)
│   │   ├── PrioritySelector (drag or number input)
│   │   ├── ApiKeyInput (masked, with show/hide)
│   │   ├── ModelSelector (dropdown, fetches from provider API)
│   │   └── StatusIndicator (healthy/degraded/unconfigured)
│   ├── SaveButton (saves all changes at once)
│   └── TestConnectionButton (per-provider)
│
└── ToolPermissions
    ├── ReadToolsToggle (default: on)
    ├── WriteToolsToggle (default: off)
    └── ToolList (checkboxes for individual tools)
```

### 6.2 State Management

```javascript
// Using React useState + useEffect (consistent with existing patterns)
const [providers, setProviders] = useState([
  { id: 'copilot', name: 'GitHub Copilot', enabled: true, priority: 1, apiKey: '', model: '' },
  { id: 'openrouter', name: 'OpenRouter', enabled: true, priority: 2, apiKey: '', model: '' },
  { id: 'zen', name: 'OpenCode Zen', enabled: true, priority: 3, apiKey: '', model: '' },
  {
    id: 'direct',
    name: 'Direct API',
    enabled: false,
    priority: 4,
    apiKey: '',
    model: '',
    baseUrl: '',
  },
]);

// Save all changes atomically
const handleSave = async () => {
  await fetch('/api/settings/llm-providers', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ providers }),
  });
};
```

### 6.3 API Integration

```
Frontend ──► PUT /api/settings/llm-providers ──► Supabase (settings table)
Frontend ──► GET  /api/settings/llm-providers ──► Supabase (settings table)
Frontend ──► POST /api/settings/llm-providers/test ──► Test provider connectivity
```

**Settings storage**: Store in Supabase `llm_provider_settings` table:

```sql
CREATE TABLE llm_provider_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth_users(id),
  provider_id VARCHAR(50) NOT NULL,  -- 'copilot', 'openrouter', 'zen', 'direct'
  enabled BOOLEAN DEFAULT true,
  priority INTEGER NOT NULL,
  api_key_encrypted TEXT,            -- Encrypted API key
  model VARCHAR(100),
  base_url TEXT,                     -- For direct API
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, provider_id)
);
```

### 6.4 Model List Fetching

Each provider exposes a `/v1/models` endpoint (or equivalent):

```javascript
// Fetch models when provider is selected
const fetchModels = async (providerId, apiKey) => {
  const endpoints = {
    openrouter: 'https://openrouter.ai/api/v1/models',
    zen: `${ZEN_BASE_URL}/v1/models`,
    direct: `${baseUrl}/v1/models`,
    copilot: null, // Copilot SDK doesn't expose model list
  };

  const endpoint = endpoints[providerId];
  if (!endpoint) return [];

  const res = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const data = await res.json();
  return data.data?.map((m) => m.id) || [];
};
```

---

## 7. Migration Plan

### 7.1 Feature Flag Approach

```javascript
// telegram-bot/.env
LLM_BRIDGE_ENABLED=true          # Master switch
LLM_BRIDGE_TOOL_MODE=read-only   # Tool permission level
LLM_BRIDGE_PROVIDER_PRIORITY=copilot,openrouter,zen,direct
```

```javascript
// chat.js — conditional routing
const LLM_BRIDGE_ENABLED = process.env.LLM_BRIDGE_ENABLED === 'true';

if (LLM_BRIDGE_ENABLED) {
  response = await llmBridge.chat(contextPrompt, {
    tools: toolRegistry.getFunctionDefinitions({ readOnlyOnly: true }),
    timeout: 60_000,
  });
} else {
  // Fallback to existing tmux-based runner
  response = await opencode.run(agent, contextPrompt, { timeout: 120_000 });
}
```

### 7.2 Phased Rollout

| Phase       | Duration | What                                      | Rollback          |
| ----------- | -------- | ----------------------------------------- | ----------------- |
| **Phase 1** | Week 1   | Build bridge module alongside opencode.js | Delete folder     |
| **Phase 2** | Week 2   | Feature flag + internal testing           | Set flag to false |
| **Phase 3** | Week 3   | Enable for read-only tools only           | Disable tools     |
| **Phase 4** | Week 4   | Enable write tools with opt-in            | Disable tools     |
| **Phase 5** | Week 5+  | Remove opencode.js, clean up              | Git revert        |

### 7.3 Rollback Strategy

1. **Immediate**: Set `LLM_BRIDGE_ENABLED=false` in `.env` → reverts to tmux-based opencode.js
2. **Partial**: Disable specific providers in config → failover skips them
3. **Complete**: `git revert` integration commits → opencode.js untouched

### 7.4 Testing Strategy

```
Unit Tests:
├── Provider adapter tests (mock HTTP responses)
│   ├── copilot-adapter.test.js
│   ├── openrouter-adapter.test.js
│   ├── zen-adapter.test.js
│   └── direct-adapter.test.js
├── Failover chain tests
│   ├── all-providers-fail.test.js
│   ├── first-provider-fails.test.js
│   └── circuit-breaker.test.js
├── Tool registry tests
│   ├── schema-conversion.test.js
│   └── permission-filtering.test.js
└── Conversation formatter tests
    ├── prompt-to-messages.test.js
    └── response-sanitization.test.js

Integration Tests:
├── Full chat flow (mock Telegram bot)
├── Tool execution flow (mock MCP handlers)
└── Provider failover end-to-end
```

---

## 8. Dependencies

### 8.1 New npm Packages

| Package                           | Purpose                                                       | Version  | Provider            |
| --------------------------------- | ------------------------------------------------------------- | -------- | ------------------- |
| `openai`                          | OpenAI-compatible API client (covers OpenRouter, Zen, Direct) | `^4.x`   | telegram-llm-bridge |
| `@copilot-extensions/preview-sdk` | GitHub Copilot SDK (if available)                             | `latest` | telegram-llm-bridge |
| `ajv`                             | JSON schema validation for tool arguments                     | `^8.x`   | telegram-llm-bridge |

**Note**: The `openai` package is the primary HTTP client. It works with ANY OpenAI-compatible endpoint, covering 3 of 4 providers out of the box.

### 8.2 Updated package.json

```json
{
  "dependencies": {
    "node-telegram-bot-api": "latest",
    "better-sqlite3": "latest",
    "dotenv": "latest",
    "openai": "^4.x",
    "ajv": "^8.x"
  }
}
```

### 8.3 Version Compatibility

| Component           | Node.js        | Notes                         |
| ------------------- | -------------- | ----------------------------- |
| telegram-bot        | 18+ (CommonJS) | Existing bot uses require()   |
| telegram-llm-bridge | 18+ (ESM)      | New module uses import/export |
| devhub-mcp          | 18+ (ESM)      | Already uses import           |
| Frontend            | Next.js 14+    | App Router, client components |

**Interop note**: Since `telegram-bot` uses CommonJS and the new bridge uses ESM, we'll use dynamic `import()` in `chat.js`:

```javascript
// chat.js (CommonJS)
let llmBridge;
async function getBridge() {
  if (!llmBridge) {
    const mod = await import('../../telegram-llm-bridge/index.js');
    llmBridge = mod.createBridge({
      /* config */
    });
  }
  return llmBridge;
}
```

---

## 9. Provider Adapter Details

### 9.1 Shared Base: OpenAICompatibleAdapter

OpenRouter, OpenCode Zen, and Direct API all use the OpenAI-compatible format. They share a base class:

```javascript
class OpenAICompatibleAdapter extends LLMProvider {
  constructor(config) {
    super();
    this.openai = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    });
    this.model = config.model;
    this.name = config.name;
  }

  async chat(messages, tools = [], options = {}) {
    const response = await this.openai.chat.completions.create({
      model: this.model,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      max_tokens: options.maxTokens || 4096,
      temperature: options.temperature ?? 0.7,
    });

    const choice = response.choices[0];
    return {
      content: choice.message.content,
      toolCalls: choice.message.tool_calls,
      usage: response.usage,
      provider: this.name,
    };
  }

  async getAvailableModels() {
    const models = await this.openai.models.list();
    return models.data.map((m) => m.id);
  }
}
```

### 9.2 Provider-Specific Configs

```javascript
// config/providers.js
export const DEFAULT_CONFIG = {
  copilot: {
    enabled: true,
    priority: 1,
    apiKey: process.env.COPILOT_API_KEY,
    model: process.env.COPILOT_MODEL || 'gpt-4o',
  },
  openrouter: {
    enabled: true,
    priority: 2,
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: 'https://openrouter.ai/api/v1',
    model: process.env.OPENROUTER_MODEL || 'qwen/qwen-2.5-72b-instruct',
  },
  zen: {
    enabled: true,
    priority: 3,
    apiKey: process.env.ZEN_API_KEY,
    baseURL: process.env.ZEN_BASE_URL || 'https://zen.opencode.ai/v1',
    model: process.env.ZEN_MODEL || 'default',
  },
  direct: {
    enabled: false,
    priority: 4,
    apiKey: process.env.DIRECT_API_KEY,
    baseURL: process.env.DIRECT_BASE_URL,
    model: process.env.DIRECT_MODEL,
  },
};
```

---

## 10. Risk Assessment

| Risk                             | Likelihood | Impact | Mitigation                                               |
| -------------------------------- | ---------- | ------ | -------------------------------------------------------- |
| Copilot SDK unavailable/unstable | Medium     | High   | OpenRouter as immediate fallback; Direct API as ultimate |
| MCP tool schema mismatch         | Medium     | Medium | Start with read-only tools; schema validation with ajv   |
| Provider cost overrun            | Low        | Medium | Free-tier models first; add usage tracking in v2         |
| API key exposure                 | Low        | High   | Encrypted storage; never log keys; rotate if leaked      |
| Conversation context overflow    | Medium     | Medium | Token estimation + truncation strategy per provider      |
| ESM/CJS interop issues           | Medium     | Low    | Dynamic import() wrapper; thorough testing               |
| Telegram rate limiting           | Low        | Low    | Message chunking already implemented; respect 4096 limit |

---

## 11. Future Considerations (Out of Scope for v1)

- **Streaming responses**: Progressive message updates via `editMessageText`
- **Persistent conversation history**: Move from in-memory Map to SQLite/Supabase
- **Cost management dashboard**: Track usage per provider, set budgets
- **Intelligent provider selection**: Choose provider based on model capabilities needed
- **Multi-turn tool execution**: Allow LLM to chain multiple tool calls
- **Response caching**: Cache identical queries to reduce API calls
- **Webhook mode**: Replace long polling with Telegram webhooks for scalability
