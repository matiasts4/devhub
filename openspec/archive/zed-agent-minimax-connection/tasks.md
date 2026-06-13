# tasks: zed-agent-minimax-connection

## type: tasks
## change: zed-agent-minimax-connection
## status: in_progress
## generated: 2026-05-30

---

## T-1: Add `minimax` provider to `llm-providers-config.json`

**File**: `data/llm-providers-config.json`

Add `providers.minimax`, insert `minimax` into `priorityOrder` after `copilot`, and add `modelOptions.minimax`.

**Acceptance criteria**:
- `providers.minimax.ANTHROPIC_BASE_URL` = `"https://api.minimax.io/anthropic"`
- `providers.minimax.MINIMAX_MODEL` = `"minimax-coding-plan/MiniMax-M2.7"`
- `providers.minimax.enabled` = `true`
- `priorityOrder` includes `"minimax"` after `"copilot"` and before `"opencode"`
- `modelOptions.minimax` is a single-element array: `["minimax-coding-plan/MiniMax-M2.7"]`

```jsonc
// Expected diff in providers block
"minimax": {
  "ANTHROPIC_BASE_URL": "https://api.minimax.io/anthropic",
  "MINIMAX_MODEL": "minimax-coding-plan/MiniMax-M2.7",
  "enabled": true
}

// Expected priorityOrder
"priorityOrder": ["copilot", "minimax", "opencode", "openrouter", "zen", "direct"]

// Expected modelOptions entry
"modelOptions": {
  // ...existing...
  "minimax": ["minimax-coding-plan/MiniMax-M2.7"]
}
```

---

## T-2: Add `getLlmProviderConfig` helper

**Files**: `src/lib/llmProviderConfig.js` (new)

Thin read-only helper that reads `data/llm-providers-config.json` and returns the config for a named provider. All downstream consumers (`buildAgentEnvExports`, `buildAgentLaunchCommand`, routes) import from here — single source of truth.

**Signature**:
```js
/**
 * @param {string} providerKey - e.g. 'minimax', 'openrouter', 'opencode'
 * @returns {{ ANTHROPIC_BASE_URL?: string; MINIMAX_MODEL?: string; enabled?: boolean } | null}
 */
export function getLlmProviderConfig(providerKey) { ... }
```

Returns `null` if provider is absent or `enabled === false`.

**Acceptance criteria**:
- Exports `getLlmProviderConfig(providerKey)` as the only public function
- Reads `data/llm-providers-config.json` once per module instance (in-memory cache at module scope)
- Returns `null` when provider key is not in the config or when `enabled === false`
- Does not throw — callers handle null gracefully

---

## T-3: Add `minimax` case to `llm-providers/route.js`

**File**: `src/app/api/settings/llm-providers/route.js`

Add `case 'minimax':` inside `getProviderRequest()` (or equivalent switch) so the route recognizes `minimax` as a valid provider.

**Acceptance criteria**:
- `POST /api/settings/llm-providers` with `provider: 'minimax'` returns success (no "unknown provider" error)
- Response is consistent with existing provider entries: `{ id, name, enabled, status }`
- Reads `config.minimax` from `llm-providers-config.json` via `getLlmProviderConfig`

---

## T-4: Add `minimax` case to `llm-providers/models/route.js`

**File**: `src/app/api/settings/llm-providers/models/route.js`

Add `case 'minimax':` branch in `getProviderRequest()` that returns the static model list.

**Acceptance criteria**:
- `POST /api/settings/llm-providers/models` with `provider: 'minimax'` returns `200` with body `["minimax-coding-plan/MiniMax-M2.7"]`
- Returns empty array `[]` when `providers.minimax.enabled === false`
- Does not make an HTTP call to MiniMax — static manifest, no network dependency here

---

## T-5: Extend `buildAgentEnvExports` with `modelProvider` parameter

**File**: `src/lib/agentLaunchWrapper.js`

Add `modelProvider` to the destructured params of `buildAgentEnvExports`. When `modelProvider === 'minimax'` and `role === 'zed'`, inject `ANTHROPIC_BASE_URL` and `ANTHROPIC_MODEL` as shell exports from the config.

Import `getLlmProviderConfig` at the top of the file.

**Acceptance criteria**:
- `buildAgentEnvExports({ ..., modelProvider: 'minimax' })` injects exactly two exports:
  - `export ANTHROPIC_BASE_URL="https://api.minimax.io/anthropic"`
  - `export ANTHROPIC_MODEL="minimax-coding-plan/MiniMax-M2.7"`
- `ANTHROPIC_AUTH_TOKEN` is intentionally **not** injected — OpenCode resolves its own subscription auth internally (D-1 principle)
- `buildAgentEnvExports` skips MiniMax injection for all other `modelProvider` values or when config is absent/null
- `buildAgentLaunchWrapper` passes `modelProvider` through to `buildAgentEnvExports`
- No credentials appear on the command line or in shell history

```js
// Expected injection (inside buildAgentEnvExports)
if (modelProvider === 'minimax') {
  const config = getLlmProviderConfig('minimax');
  if (config) {
    exports.push(`export ANTHROPIC_BASE_URL="${config.ANTHROPIC_BASE_URL}"`);
    exports.push(`export ANTHROPIC_MODEL="${config.MINIMAX_MODEL}"`);
  }
}
```

---

## T-6: Add `zed` role branch to `buildAgentLaunchCommand` (shared)

**File**: `src/lib/agentLaunchCommand.shared.js`

Add `role === 'zed'` routing in `buildAgentLaunchCommand` that emits an opencode invocation with `--model minimax-coding-plan/MiniMax-M2.7 --base-url https://api.minimax.io/anthropic`. No `--api-key` flag.

Import `getLlmProviderConfig` at the top of the file.

**Acceptance criteria**:
- `buildAgentLaunchCommand('opencode', prompt, { role: 'zed', ... })` returns a command string containing:
  - `--model minimax-coding-plan/MiniMax-M2.7`
  - `--base-url https://api.minimax.io/anthropic`
  - `--agent swarm-director` (or `swarm-coder` based on `options.opencodeAgent`)
- Model and base-url values come from `getLlmProviderConfig('minimax')` with hardcoded fallbacks
- `--api-key` is never included (D-1: credential injection via env vars only)
- All non-zed roles fall through to existing switch logic unchanged

```js
// Expected injection (inside buildAgentLaunchCommand switch for 'opencode')
case 'opencode': {
  const sessionFlag = sessionId ? ` --session ${sessionId}` : '';
  if (role === 'zed') {
    const config = getLlmProviderConfig('minimax');
    const model = config?.MINIMAX_MODEL ?? 'minimax-coding-plan/MiniMax-M2.7';
    const baseUrl = config?.ANTHROPIC_BASE_URL ?? 'https://api.minimax.io/anthropic';
    const agent = opencodeAgent || 'swarm-director';
    innerCommand = modelId
      ? `${executable} --agent ${agent} --model ${modelId} --base-url ${baseUrl}${sessionFlag}`
      : `${executable} --agent ${agent} --model ${model} --base-url ${baseUrl}${sessionFlag}`;
  } else {
    // existing opencode case logic
    ...
  }
  break;
}
```

---

## T-7: Add `zed` role branch to `buildAgentLaunchCommand` (server)

**File**: `src/lib/agentLaunchCommand.js`

Mirror the `role === 'zed'` branch from the shared module. The server module uses the same opencode switch logic; add the zed routing before the generic opencode case.

Import `getLlmProviderConfig` at the top of the file.

**Acceptance criteria**: Same as T-6 but applied to the server-side `buildAgentLaunchCommand` in `agentLaunchCommand.js`.

---

## T-8: Add `PHASE_CONTRACTS.zed` to `SwarmPromptEngine.js`

**File**: `src/lib/sdd/SwarmPromptEngine.js`

Add the `zed` entry to `PHASE_CONTRACTS` object:

**Acceptance criteria**:
- `PHASE_CONTRACTS.zed` has:
  - `role: 'zed'`
  - `executablePhases`: `['sdd-explore', 'sdd-propose', 'sdd-spec', 'sdd-design', 'sdd-tasks', 'sdd-apply', 'sdd-verify', 'sdd-archive']`
  - `delegatable: true`
  - `contextBudget: 8000`
  - `reactivationHint`: as specified in D-7
  - `model: 'minimax-coding-plan/MiniMax-M2.7'`
  - `provider: 'minimax'`
- `buildPhaseContractForRole('zed', phase, vars)` returns a valid prompt section
- No existing phase contract entries are modified

---

## T-9: Add Zed identity injection to `buildRoleAgentProfile` / prompt engine

**File**: `src/lib/sdd/SwarmPromptEngine.js` (or `swarmControl.js` if identity is injected there)

Zed's identity block is prepended to the prompt when `role === 'zed'`:

- **Identity**: Senior architect, 15+ years, GDE & MVP, passionate teacher
- **Tone**: Caring, direct, concepts over code
- **Behavioral constraints**: Verify before stating, match user language, call `mem_save` proactively
- **Tooling**: full DevHub toolbelt (file ops, terminal, git, db, swarm ops, Engram, SDD)

**Acceptance criteria**:
- `buildRoleAgentProfile('zed', changeName, phase)` returns a prompt that includes Zed's identity block
- The identity block is additive to the phase contract ( Zed personality + swarm-director structure)
- If `buildZedIdentityPrompt(vars)` function is created, it is exported or called from the profile builder

---

## T-10: Add Zed to swarm launch programs catalog

**File**: `src/lib/operations/swarmControl.js`

Add Zed to `SWARM_ROLE_DEFAULT_MODELS` and `buildSwarmLaunchPrograms`:

- `SWARM_ROLE_DEFAULT_MODELS.zed = 'minimax-coding-plan/MiniMax-M2.7'`
- Program option: `{ id: 'zed', label: 'Zed / OpenCode + MiniMax M2.7', program: 'opencode', model: 'minimax-coding-plan/MiniMax-M2.7' }`

**Acceptance criteria**:
- `createSwarmLaunchDraft` includes Zed as a selectable program option
- Zed program maps to `opencode` binary with `--agent swarm-director` / `swarm-coder`
- Workspace rows created for Zed agents have `sessionType: 'zed'` and `swarmRole: 'director'` or `'worker'` (via `normalizeWorkspace`)

---

## T-11: Create Zed phase contract prompt template

**File**: `docs/prompts/swarm/swarm-zed-v1.md` (new)

Document Zed's phase contract as a prompt template that can be loaded by OpenCode when launching Zed as a director or worker.

**Acceptance criteria**:
- File is created at the specified path
- Contains Zed's role definition, executable phases, context budget, reactivation hint, and identity block
- Serves as the canonical reference for what the SwarmPromptEngine injects for Zed

---

## Dependency Order

```
T-1  llm-providers-config.json (minimax entry added)
  ↑
T-2  getLlmProviderConfig helper     ← consumed by T-3, T-4, T-5, T-6, T-7
  ↑
T-3  llm-providers/route.js (minimax case)
T-4  llm-providers/models/route.js (minimax branch)
T-5  agentLaunchWrapper.js (modelProvider param + MiniMax env injection)
  ↑
T-6  agentLaunchCommand.shared.js (zed role branch)
T-7  agentLaunchCommand.js (zed role branch, server-side mirror)
  ↑
T-8  SwarmPromptEngine.js (PHASE_CONTRACTS.zed)
T-9  SwarmPromptEngine.js or swarmControl.js (Zed identity injection)
  ↑
T-10  swarmControl.js (Zed in SWARM_ROLE_DEFAULT_MODELS + programs catalog)
  ↑
T-11  docs/prompts/swarm/swarm-zed-v1.md (phase contract template)
```

---

## Non-Goals (Out of Scope for This Change)

- No `MiniMaxCredentials.js` or `MiniMaxMcpClient.js` — OpenCode handles subscription auth internally (D-12 resolution)
- No DB schema changes
- No changes to existing roles (director, coder, architect, qa, etc.)
- No changes to `ModelConsolidator.js` — alias already covers M2.7

---

*Implementation must not contradict design.md decisions D-1 through D-13. Each task is one reviewable commit.*