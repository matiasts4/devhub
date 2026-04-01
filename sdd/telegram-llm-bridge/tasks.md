# Tasks: Telegram LLM Bridge

## Phase 1: Foundation / Infrastructure

- [ ] 1.1 Create `telegram-llm-bridge/` directory with subdirs: `providers/`, `orchestrator/`, `tools/`, `config/`, `utils/`
- [ ] 1.2 Create `telegram-llm-bridge/providers/interface.js` with `LLMProvider` base class defining `id`, `name`, `getModels()`, `chat()`, `validate()`
- [ ] 1.3 Create `telegram-llm-bridge/config/encryption.js` with AES-256-GCM encrypt/decrypt using `LLM_BRIDGE_ENCRYPTION_KEY`
- [ ] 1.4 Create `telegram-llm-bridge/config/loader.js` with config loading priority: DB → env vars → defaults
- [ ] 1.5 Add environment variables to `telegram-bot/.env.example` (LLM_BRIDGE_ENABLED, provider keys, feature flags)
- [ ] 1.6 Create database migration: `llm_provider_configs` and `llm_bridge_settings` tables with Supabase SQL

## Phase 2: Provider Adapters

- [ ] 2.1 Create `telegram-llm-bridge/providers/openai-compatible.js` base adapter (covers OpenRouter, OpenCode Zen, Direct API)
- [ ] 2.2 Create `telegram-llm-bridge/providers/openrouter.js` extending OpenAI compatible with OpenRouter endpoint and model catalog
- [ ] 2.3 Create `telegram-llm-bridge/providers/opencode-zen.js` extending OpenAI compatible with Zen endpoint
- [ ] 2.4 Create `telegram-llm-bridge/providers/direct-api.js` with configurable baseUrl
- [ ] 2.5 Create `telegram-llm-bridge/providers/copilot-sdk.js` adapter using @copilot-extensions/preview-sdk
- [ ] 2.6 Implement `validate()` method for each adapter (auth check with minimal request)
- [ ] 2.7 Implement `getModels()` for each adapter (hardcoded catalog + dynamic fetch where supported)

## Phase 3: Failover Orchestrator & Tool Execution

- [ ] 3.1 Create `telegram-llm-bridge/orchestrator/failover.js` with `FailoverOrchestrator` class (priority chain, retry logic, error classification)
- [ ] 3.2 Implement `shouldFailover()` decision logic per error type (auth, rate-limit, server-error, timeout)
- [ ] 3.3 Create `telegram-llm-bridge/orchestrator/tool-executor.js` for MCP stdio-based tool execution
- [ ] 3.4 Implement tool result truncation (2000 char cap) and iteration limit (max 5)
- [ ] 3.5 Implement `getUsageStats()` tracking per-provider request counts, errors, and latency

## Phase 4: MCP Tool Schemas

- [ ] 4.1 Create `telegram-llm-bridge/tools/mcp-tool-registry.js` with tool tier categorization (T1/T2/T3)
- [ ] 4.2 Convert 13 T1 read-only MCP tools to OpenAI function calling schemas in `tools/tool-schemas/`
- [ ] 4.3 Implement `buildToolSchema(flags)` function that returns enabled tools based on feature flags
- [ ] 4.4 Map MCP tool names to stdio execution handlers in tool-executor

## Phase 5: Telegram Bot Integration

- [ ] 5.1 Create `telegram-llm-bridge/index.js` main entry exporting `chat()`, `getToolSchema()`, `getUsageStats()`
- [ ] 5.2 Create `telegram-llm-bridge/utils/message-converter.js` with `buildOpenAIMessages()` (system prompt + history + current)
- [ ] 5.3 Modify `telegram-bot/commands/chat.js` to conditionally route through bridge when `LLM_BRIDGE_ENABLED=true`
- [ ] 5.4 Preserve existing behavior: chunking, sanitization, retry logic, conversation history updates
- [ ] 5.5 Add feature flag check: if disabled, fall through to existing `opencode.run()` path

## Phase 6: Settings UI (Frontend)

- [ ] 6.1 Create Next.js page `src/app/settings/llm-providers/page.jsx`
- [ ] 6.2 Create `src/components/LLMProviderSettings.jsx` with provider card list, API key inputs, model selectors
- [ ] 6.3 Create API route `src/app/api/settings/llm-providers/route.js` (GET/POST for provider configs)
- [ ] 6.4 Create API route `src/app/api/settings/llm-providers/test/route.js` for connection testing
- [ ] 6.5 Implement API key encryption in API routes before DB storage
- [ ] 6.6 Add provider priority reordering UI (drag handles or up/down controls)
- [ ] 6.7 Create API route `src/app/api/settings/llm-bridge/route.js` for feature flag toggles
- [ ] 6.8 Create API route `src/app/api/settings/llm-bridge/usage/route.js` for usage statistics display

## Phase 7: Testing & Verification

- [ ] 7.1 Write unit tests for `LLMProvider` interface contract (all adapters implement required methods)
- [ ] 7.2 Write unit tests for `FailoverOrchestrator` (failover chain, retry logic, all-providers-fail scenario)
- [ ] 7.3 Write unit tests for `buildOpenAIMessages()` (system prompt injection, history conversion)
- [ ] 7.4 Write integration test: chat with no tools → verify text response from each provider
- [ ] 7.5 Write integration test: chat with T1 tool call → verify tool execution and LLM continuation
- [ ] 7.6 Write integration test: provider failover → simulate 401 on primary, verify secondary responds
- [ ] 7.7 Manual E2E test: enable bridge, send Telegram message, verify response without tmux artifacts
- [ ] 7.8 Performance test: measure latency for simple query (target <15s) and tool query (target <45s)
- [ ] 7.9 Verify `LLM_BRIDGE_ENABLED=false` immediately reverts to opencode.js with zero regression
