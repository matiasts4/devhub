# Exploration: Telegram LLM Bridge

## Current State

The Telegram bot currently uses a **fragile tmux-based chain** to interact with OpenCode agents:

```
Telegram → bot.js → chat.js → conversation.buildContextPrompt() → opencode.run()
  → [writes temp prompt file + bash script]
  → [creates tmux session]
  → [sends-keys to run `opencode run --agent <name>`]
  → [polls capture-pane every 3s]
  → [strips ANSI with 40+ regex patterns]
  → [detects completion via shell prompt or stability]
  → returns cleaned text → Telegram reply
```

**Key architecture details:**

- `telegram-bot/` is a standalone Node.js (CommonJS) process with long polling
- Dependencies: `node-telegram-bot-api`, `better-sqlite3`, `dotenv`
- Conversation state is **in-memory** (Map), max 20 messages, cleaned up after 1 hour
- Data access is dual: SQLite direct (`db.js`) + HTTP to Next.js (`api.js`)
- No LLM API calls exist — everything goes through the `opencode` CLI

## Affected Areas

- `telegram-bot/services/opencode.js` — **Primary target for replacement**. The entire tmux runner, ANSI stripping, and polling logic (~296 lines)
- `telegram-bot/commands/chat.js` — Will change from calling `opencode.run()` to calling the new LLM bridge
- `telegram-bot/services/conversation.js` — May need enhancement for persistent history or larger context windows
- `telegram-bot/package.json` — Will need new LLM client dependencies
- `devhub-mcp/server.js` — Source of truth for 30+ tools that the LLM bridge must expose as function calls

## Approaches

### 1. **OpenAI-Compatible Adapter (Primary)**

- Implement a standard `chat.completions` client that works with any OpenAI-compatible API
- Covers: OpenRouter, OpenCode Zen, Direct API keys (OpenAI, Groq, etc.)
- Pros: Single adapter covers 3/4 providers, well-documented API, streaming support, tool calling
- Cons: Doesn't cover GitHub Copilot SDK (needs separate adapter)
- Effort: **Low**

### 2. **GitHub Copilot SDK Adapter (Secondary)**

- Use `@copilot-extensions/preview-sdk` or similar for native Copilot integration
- Pros: Official API, native MCP support, agent mode
- Cons: SDK may be unstable/preview, limited documentation, vendor lock-in
- Effort: **Medium**

### 3. **Keep tmux Runner as Fallback**

- Retain `opencode.run()` as a last-resort provider
- Pros: Zero migration risk, works with existing setup
- Cons: Maintains the fragile code, defeats the purpose
- Effort: **Low** (keep as-is)

## Recommendation

**Implement an OpenAI-compatible adapter as the primary bridge**, with a provider registry pattern:

```
LLM Bridge
├── ProviderRegistry
│   ├── OpenAICompatible (OpenRouter, OpenCode Zen, Direct)
│   ├── CopilotSDK (GitHub Copilot)
│   └── OpenCodeCLI (fallback, current tmux runner)
├── ToolRegistry (maps MCP tools → function calling definitions)
├── ConversationManager (persistent history, context window management)
└── TelegramAdapter (maps bridge output → Telegram messages)
```

This approach:

1. Eliminates the tmux/ANSI chain for 3/4 providers
2. Adds proper tool calling (MCP tools as function definitions)
3. Supports streaming responses
4. Keeps the existing bot as the Telegram entry point
5. Is incremental — can migrate one provider at a time

## Risks

- **GitHub Copilot SDK availability**: The SDK may not be publicly stable or well-documented. Needs verification before committing.
- **MCP tool integration**: Each provider has different tool/function calling formats. OpenAI-compatible uses `tools` array, Copilot SDK may differ.
- **Cost management**: OpenRouter and direct API keys incur per-token costs. Need budget controls.
- **Context window limits**: Different providers have different limits. The current 20-message cap needs to become provider-aware.
- **Migration complexity**: The conversation.js in-memory state needs to be compatible with the new bridge's message format.

## Ready for Proposal

**Yes.** The exploration has sufficient detail about the current architecture, pain points, MCP tools, and provider requirements to proceed with a change proposal. The orchestrator should tell the user:

> "Investigación completa. El bot actual usa tmux + 40+ regex para capturar output de OpenCode — es frágil pero entendible. Identifiqué 30+ herramientas MCP que el bridge necesita soportar. Recomiendo un adapter OpenAI-compatible como primary (cubre OpenRouter, OpenCode Zen, y Direct API) con Copilot SDK como secondary. ¿Querés que arme la propuesta?"
