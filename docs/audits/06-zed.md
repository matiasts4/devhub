# Audit Report: Zed Agent

**Audited**: 2026-05-30
**Auditor**: Sub-agent exploration
**Status**: 🟠 Issues found — implementation incomplete

---

## Files Analyzed

| File                                             | Purpose                                                     |
| ------------------------------------------------ | ----------------------------------------------------------- |
| `/api/assistant/chat/route.js`                   | Asistente Zed — direct MiniMax API chat with tool execution |
| `src/lib/operations/swarmControl.js`             | Swarm Zed registration in buildSwarmLaunchPrograms()        |
| `src/lib/agentLaunchCommand.shared.js`           | Shared Zed launch command builder                           |
| `src/lib/agentLaunchWrapper.js`                  | Shell wrapper — injects MiniMax env vars                    |
| `src/lib/llmProviderConfig.js`                   | LLM provider config reader                                  |
| `src/lib/sdd/SwarmPromptEngine.js`               | Phase contracts — NO zed entry                              |
| `src/lib/asistente/utils/zed-logger.js`          | Shared Zed logging utility                                  |
| `docs/prompts/swarm/swarm-zed-v1.md`             | Zed prompt template (8-phase SDD)                           |
| `openspec/archive/zed-agent-minimax-connection/` | Archived design — rejected in favor of OpenCode path        |

---

## Architecture: Two Distinct Zed Systems

| System            | Purpose                             | Tool Execution                |
| ----------------- | ----------------------------------- | ----------------------------- |
| **Asistente Zed** | Direct chat API to MiniMax M2.7     | ✅ Via ToolRegistry (5 tools) |
| **Swarm Zed**     | Named agent persona in swarm roster | ❌ Via OpenCode subscription  |

Asistente Zed and Swarm Zed share the `zed-logger` utility but are otherwise completely separate systems.

---

## 🔴 CRITICAL — `PHASE_CONTRACTS.zed` Never Implemented

**File**: `src/lib/sdd/SwarmPromptEngine.js`

`buildPhaseContractSection()` falls back to `PHASE_CONTRACTS.coder` for Zed because no `zed` key exists in `PHASE_CONTRACTS`. The design doc (`openspec/archive/zed-agent-minimax-connection/design.md`) specified adding:

```javascript
zed: {
  role: 'zed',
  executablePhases: ['sdd-explore', 'sdd-propose', 'sdd-spec', 'sdd-design',
                      'sdd-tasks', 'sdd-apply', 'sdd-verify', 'sdd-archive'],
  delegatable: true,
  contextBudget: 8000,
  model: 'minimax-coding-plan/MiniMax-M2.7',
  provider: 'minimax',
}
```

**This was never added.** Zed swarm agents receive the generic coder phase contract instead of Zed's full 8-phase SDD contract.

The T-9 comment confirms this:

```javascript
// T-9: Prepend Zed identity block when role is zed
// (Zed role removed — block kept as placeholder)
```

---

## 🔴 CRITICAL — `modelProvider` Never Passed to Wrapper for Swarm-Launched Zed

**File**: `src/app/api/agenthub/operations/health/route.js`

In `buildLaunchCommand()` at line ~238, `buildAgentLaunchWrapper()` is called **without** `modelProvider`. This means the MiniMax env vars injection in `buildAgentEnvExports()` is never triggered:

```javascript
// agentLaunchWrapper.js — this branch is NEVER triggered for Zed swarm agents:
if (modelProvider === 'minimax') {
  exports.push(`export ANTHROPIC_BASE_URL="${config.ANTHROPIC_BASE_URL}"`);
  exports.push(`export ANTHROPIC_MODEL="${config.MINIMAX_MODEL}"`);
}
```

**Impact**: Zed-as-a-swarm-agent launches without MiniMax endpoint config. Falls back to OpenCode defaults.

---

## 🟡 Medium — Documentation vs Implementation Mismatch

**File**: `docs/prompts/swarm/swarm-zed-v1.md` vs actual `buildRoleAgentProfile`

The prompt template says Zed can execute all 8 SDD phases. But `buildRoleAgentProfile('zed', ...)` returns `profileKey: 'swarm-director'` — which maps to the director phase contract that only executes `sdd-explore, sdd-propose, sdd-design`. The documentation promises 8 phases; the implementation delivers 3.

---

## 🟡 Medium — Asistente Zed API Key Fallback

**File**: `/api/assistant/chat/route.js`, line ~132

```javascript
const apiKey = process.env.ANTHROPIC_API_KEY || process.env.MINIMAX_API_KEY;
```

If both are absent, the error says "No API key configured" without clarifying which env var was expected or which one should be set.

---

## 🟡 Medium — No Integration Between Asistente and Swarm Zed

A user cannot use Asistente chat to interact with a running swarm mission, or vice versa. The two Zed systems are completely siloed.

---

## 🟡 Medium — `pending_deliveries` Never Re-injected

From `SWARM_COMMUNICATION_HANDOFF_2026-05-30.md`: deliveries are written to `/tmp/devhub-pending-deliveries.log` but never re-injected into the agent's terminal, prompt, or inbox file.

---

## Tools Available to Asistente Zed (via ToolRegistry)

| Tool             | Name                   | Purpose                      |
| ---------------- | ---------------------- | ---------------------------- |
| `terminalTool`   | `open_terminal`        | Open PTY terminal session    |
| `browserTool`    | `open_url`             | Open URL via `xdg-open`      |
| `delegationTool` | `delegate_to_opencode` | Delegate to OpenCode in tmux |
| `fileTool`       | `browse_files`         | List or read files           |
| `swarmTool`      | `get_swarm_status`     | Query swarm mission DB       |

---

## Recommendations

1. **Add `PHASE_CONTRACTS.zed`** to `SwarmPromptEngine.js` — the core identity and phase contract for Zed-as-swarm-agent
2. **Pass `modelProvider: 'minimax'`** to `buildAgentLaunchWrapper()` in health route so MiniMax env vars are injected
3. **Reconcile documentation** with implementation — either update the prompt template or fix `buildRoleAgentProfile` to route Zed through all 8 phases
4. **Add Zed entry** to `SWARM_ROLE_DEFAULT_MODELS` if not already present
5. **Integrate pending_deliveries** handoff mechanism so deliveries reach the agent runtime
