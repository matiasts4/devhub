# design: zed-agent-minimax-connection

## type: architecture
## change: zed-agent-minimax-connection
## status: approved
## generated: 2026-05-30

---

## D-1: Design Principles

Three principles derived from the proposal:

1. **Credential injection via env vars, never CLI flags.** `ANTHROPIC_AUTH_TOKEN` (if used), `ANTHROPIC_BASE_URL`, and `ANTHROPIC_MODEL` are injected as shell exports into the wrapper script — they are never passed as `--api-key` or similar CLI arguments. This prevents credential exposure in shell history.

2. **Provider config is the single source of truth.** The `minimax` entry in `llm-providers-config.json` is the canonical definition of the endpoint URL, model ID, and enabled state. All downstream consumers (`buildAgentEnvExports`, models route, `buildAgentLaunchCommand`) read from this config rather than hardcoding values.

3. **Zed is an OpenCode profile, not a separate binary.** Zed launches as `opencode` with `--model minimax-coding-plan/MiniMax-M2.7 --base-url https://api.minimax.io/anthropic`. The OpenCode binary handles MiniMax subscription authentication transparently via its internal `opencode-go` provider. No `MINIMAX_MCP_API_KEY` env var is required for the Zed agent itself.

---

## D-2: Provider Config — `minimax` Entry

### Decision: New `minimax` provider in `llm-providers-config.json`

The `minimax` provider is added alongside `openrouter`, `copilot`, and `opencode` as a first-class entry. This gives the models route, the launch wrapper, and any future provider-aware code a consistent place to look.

```jsonc
// data/llm-providers-config.json

{
  "providers": {
    // ... existing providers ...
    "minimax": {
      "ANTHROPIC_BASE_URL": "https://api.minimax.io/anthropic",
      "MINIMAX_MODEL": "minimax-coding-plan/MiniMax-M2.7",
      "enabled": true
    }
  },
  "priorityOrder": ["copilot", "minimax", "opencode", "openrouter", "zen", "direct"],

  // New model options list for minimax
  "modelOptions": {
    // ... existing lists ...
    "minimax": [
      "minimax-coding-plan/MiniMax-M2.7"
    ]
  }
}
```

The model list is a static single-entry array. The subscription plan models are not enumerated by a public MiniMax API, so the initial implementation is a hardcoded manifest entry. Dynamic discovery via `platform.minimaxi.com` is deferred to a future iteration.

**Priority order placement**: `minimax` is inserted after `copilot` but before `opencode`. This reflects Zed's tier (premium subscription) without displacing existing priorities.

---

## D-3: Credential Chain

### Decision: OpenCode subscription path — no `MINIMAX_MCP_API_KEY` needed for Zed

The OpenCode binary ships with an embedded `opencode-go` provider that resolves MiniMax subscription credentials transparently. When OpenCode is invoked with `--model minimax-coding-plan/MiniMax-M2.7 --base-url https://api.minimax.io/anthropic`, it uses its own internal auth mechanism, not a raw API key passed from DevHub.

DevHub's role is limited to:
1. Injecting `ANTHROPIC_BASE_URL` and `ANTHROPIC_MODEL` as env vars so OpenCode reads them without requiring CLI flags.
2. Passing `--model` and `--base-url` to `opencode` so the binary knows which provider to use.

```
platform.minimaxi.com (subscription ownership)
  └─> OpenCode binary (opencode-go provider, subscription resolved internally)
        └─> ANTHROPIC_BASE_URL=https://api.minimax.io/anthropic
              └─> MiniMax M2.7 (subscription verified server-side by MiniMax)
```

**Alternative considered (rejected)**: Passing a raw `MINIMAX_MCP_API_KEY` via env var. This would require a `MiniMaxCredentials.js` resolver and token-plan exchange, adding complexity and a new failure mode. The subscription path via OpenCode is simpler and matches how the rest of the proposal frames the Zed agent's auth model.

---

## D-4: Env Injection — `buildAgentEnvExports`

### Decision: `modelProvider` parameter gates MiniMax env injection

`buildAgentEnvExports` in `agentLaunchWrapper.js` receives a new `modelProvider` field. When `modelProvider === 'minimax'` and `role === 'zed'`, it injects three additional exports:

```js
// src/lib/agentLaunchWrapper.js

export function buildAgentEnvExports({
  agentId,
  missionId,
  role,
  workspacePath,
  workspaceId,
  runId,
  supervisorUrl,
  tmuxSessionName,
  directorSessionName,
  modelProvider,  // NEW: 'minimax' | 'openrouter' | 'opencode' | ...
}) {
  const exports = [
    // ... existing DevHub vars ...
  ];

  // MINIMAX-1: Inject MiniMax MCP subscription env vars for Zed agents
  if (modelProvider === 'minimax') {
    const config = getLlmProviderConfig('minimax');
    if (config) {
      exports.push(`export ANTHROPIC_BASE_URL="${config.ANTHROPIC_BASE_URL}"`);
      exports.push(`export ANTHROPIC_MODEL="${config.MINIMAX_MODEL}"`);
      // ANTHROPIC_AUTH_TOKEN intentionally omitted — OpenCode resolves its own subscription auth
    }
  }

  return exports.join('\n');
}
```

`getLlmProviderConfig` is a thin helper that reads from `data/llm-providers-config.json`. It is imported at the top of `agentLaunchWrapper.js`.

**Security**: `ANTHROPIC_AUTH_TOKEN` is not injected for Zed because OpenCode manages subscription auth internally. If a future iteration requires a raw key, it would be injected here with the same never-logged discipline as `DEVHUB_AGENT_TOKEN`.

The wrapper script is written to `/tmp/devhub-agent-launch-{agentId}.sh` with mode `0600` before execution.

---

## D-5: CLI Flag Injection — `buildAgentLaunchCommand`

### Decision: `role === 'zed'` routes to OpenCode with MiniMax flags

`buildAgentLaunchCommand` (in `agentLaunchCommand.js` or `agentLaunchCommand.shared.js`) receives the `role` parameter. When `role === 'zed'`, it generates an opencode invocation with `--model minimax-coding-plan/MiniMax-M2.7 --base-url https://api.minimax.io/anthropic`.

```js
// Inside buildAgentLaunchCommand()

if (role === 'zed') {
  const config = getLlmProviderConfig('minimax');
  const model = config?.MINIMAX_MODEL ?? 'minimax-coding-plan/MiniMax-M2.7';
  const baseUrl = config?.ANTHROPIC_BASE_URL ?? 'https://api.minimax.io/anthropic';
  return `opencode --model ${model} --base-url ${baseUrl}`;
}
```

`--api-key` is deliberately absent — the subscription key is handled by OpenCode, not passed through DevHub.

If `role` is not `zed`, the function falls through to its existing routing logic (director, coder, architect, etc.).

---

## D-6: LLM Provider Routes

### `GET /api/settings/llm-providers/route.js` — Add `minimax` case

```js
case 'minimax':
  return NextResponse.json({
    id: 'minimax',
    name: 'MiniMax M2.7',
    enabled: config.enabled,
    status: 'active',
  });
```

### `GET /api/settings/llm-providers/models/route.js` — Add `minimax` branch

```js
case 'minimax':
  return NextResponse.json(['minimax-coding-plan/MiniMax-M2.7']);
```

Both routes read from `data/llm-providers-config.json`. If `minimax` is absent (pre-change state), they fall through to existing error handling.

---

## D-7: SwarmPromptEngine — Zed Phase Contract

### Decision: `PHASE_CONTRACTS.zed` added to `SwarmPromptEngine.js`

```js
// src/lib/sdd/SwarmPromptEngine.js

const PHASE_CONTRACTS = {
  // ... existing entries (director, coder, architect, qa, etc.) ...

  zed: {
    role: 'zed',
    executablePhases: [
      'sdd-explore', 'sdd-propose', 'sdd-spec', 'sdd-design',
      'sdd-tasks', 'sdd-apply', 'sdd-verify', 'sdd-archive',
    ],
    delegatable: true,       // Zed can fan out to coder/architect/qa workers
    contextBudget: 8000,    // tokens — MiniMax M2.7 context budget
    reactivationHint:
      "mem_search('sdd/{{change_name}}/director-log') → " +
      "mem_get_observation on last artifact + apply-progress",
    model: 'minimax-coding-plan/MiniMax-M2.7',
    provider: 'minimax',
  },
};
```

`buildRoleAgentProfile('zed', changeName, phase)` calls `buildZedIdentityPrompt(vars)` which prepends Zed's identity block to the prompt when `role === 'zed'`. This injects:

- **Identity**: Senior architect, 15+ years, GDE & MVP, passionate teacher
- **Tone**: Caring, direct, trades in concepts over code
- **Behavioral constraints**: Verify before stating, match user language, call `mem_save` proactively
- **Tooling**: full DevHub toolbelt (file ops, terminal, git, db, swarm ops, Engram, SDD)

---

## D-8: Swarm Integration

### Zed in the swarm topology

Zed participates in the director/worker swarm as any other role, with these additions to `swarmControl.js`:

```js
// In SWARM_ROLE_DEFAULT_MODELS
zed: 'minimax-coding-plan/MiniMax-M2.7',

// In buildRoleAgentProfile routing
if (roleKey === 'zed') {
  return buildZedProfile(changeName, phase);
}

// In buildSwarmLaunchPrograms — new program option
{
  id: 'zed',
  label: 'Zed / OpenCode + MiniMax M2.7',
  program: 'opencode',
  model: 'minimax-coding-plan/MiniMax-M2.7',
  agent: phase === 'director' ? 'swarm-director' : 'swarm-coder',
}
```

**Identity persistence**: Zed's `agent_id` is `zed-{runId}`. Workspaces are labeled `sessionType: 'zed'` and `swarmRole: 'director'` or `'worker'` by `normalizeWorkspace`, enabling session restore.

---

## D-9: File Layout

```
src/
  lib/
    agentLaunchWrapper.js        # MODIFY: add modelProvider param; inject MiniMax env vars
    agentLaunchCommand.js        # MODIFY: add zed branch with MiniMax CLI flags
    agentLaunchCommand.shared.js # MODIFY: same zed branch (if shared util)
    sdd/
      SwarmPromptEngine.js       # MODIFY: add PHASE_CONTRACTS.zed
      ModelConsolidator.js       # NO CHANGE — alias already covers M2.7
    llmProviderConfig.js         # NEW (optional helper): reads llm-providers-config.json

  app/api/settings/llm-providers/
    route.js                    # MODIFY: add 'minimax' case
    models/route.js             # MODIFY: add 'minimax' branch

data/
  llm-providers-config.json     # MODIFY: add minimax provider + modelOptions.minimax

docs/
  prompts/swarm/
    swarm-zed-v1.md             # NEW: Zed phase contract prompt template
```

---

## D-10: Edge Cases and Error Handling

### MiniMax endpoint unreachable
OpenCode makes the HTTP call. If `https://api.minimax.io/anthropic` is unreachable, OpenCode fails with its own error. DevHub's wrapper trap catches the exit and reports `process_exit` via HMAC-signed event. No special handling needed.

### `minimax` provider absent from config (pre-change state)
`getLlmProviderConfig('minimax')` returns `undefined`. `buildAgentEnvExports` skips MiniMax injection; `buildAgentLaunchCommand` falls through to the existing routing. No error thrown.

### `providers.minimax.enabled = false`
Same as above — `getLlmProviderConfig` returns the config but callers should also check `enabled`. The models route should return `[]` when `enabled === false`. The launch wrapper skips injection when config is absent.

### OpenCode binary not found
Existing behavior — `buildAgentLaunchCommand` already handles missing executables by returning a descriptive error string rather than throwing.

### Zed launched with non-`minimax` provider
`buildAgentEnvExports({ modelProvider: 'openrouter' })` skips MiniMax injection. `buildAgentLaunchCommand({ role: 'zed', modelProvider: 'openrouter' })` still emits `--model minimax-coding-plan/MiniMax-M2.7` because Zed's model is fixed. Callers must not override Zed's model.

### Zed workspace path does not exist
Existing `buildAgentLaunchWrapper` already includes a path validation block that exits with code 1 if the workspace directory is absent.

---

## D-11: Dependency Graph

```
llm-providers-config.json (minimax entry)
  ↑ read by: getLlmProviderConfig (helper in agentLaunchWrapper.js)
               llm-providers/route.js
               llm-providers/models/route.js

getLlmProviderConfig (helper)
  ↓ consumed by: buildAgentEnvExports (modelProvider === 'minimax' branch)
               buildAgentLaunchCommand (role === 'zed' branch)

agentLaunchWrapper.js — buildAgentEnvExports
  ↑ called by: buildAgentLaunchWrapper
  ↓ emits: shell export block injected into wrapper script

agentLaunchCommand.js — buildAgentLaunchCommand
  ↑ called by: swarmControl.js (createSwarmLaunchDraft, buildAgentLaunchCommand)
  ↓ emits: opencode CLI invocation string

SwarmPromptEngine.js — PHASE_CONTRACTS.zed
  ↑ read by: buildRoleAgentProfile('zed', ...)
  ↓ consumed by: SwarmPromptEngine.buildZedIdentityPrompt

swarmControl.js
  ↑ orchestrates: Zed role launch using all the above modules
  ↓ labeled workspaces: sessionType: 'zed', swarmRole: 'director'|'worker'
```

---

## D-12: Resolved Proposal Conflicts

The proposal contains two competing narratives:

**Narrative A** (first half, Intent section, D-4 MiniMaxCredentials): Requires a `MINIMAX_MCP_API_KEY` env var, a `MiniMaxCredentials.js` resolver, and token-plan exchange via `platform.minimaxi.com`.

**Narrative B** (second half, Scope "Out of Scope", Subscription Client Module, Approach Phase 3/4): "No `MINIMAX_API_KEY` stored anywhere — subscription auth is internal to OpenCode." No `MiniMaxCredentials.js` mentioned.

**Decision**: Adopt Narrative B. Rationale:
- Narrative B is the more recent section and explicitly scopes out the API key approach.
- OpenCode's `opencode-go` provider already handles subscription auth internally; adding a separate credentials resolver is redundant and adds a new failure mode.
- The simpler design (no new credentials module) matches the proposal's stated rollback plan which does not reference `MiniMaxCredentials.js`.

If a future iteration requires raw API-key access to the MiniMax MCP endpoint (for DevHub-side tooling like capability discovery), a `MiniMaxMcpClient.js` and credential resolver can be added as a separate change.

---

## D-13: Rollback Plan

All changes are additive and non-destructive. Rollback in order:

1. **Immediate**: Set `providers.minimax.enabled = false` in `llm-providers-config.json`. The models route returns `[]` and `buildAgentEnvExports` skips MiniMax injection. No in-flight agents affected.
2. **Agents in flight**: Continue with their already-injected env vars. New launches after server restart pick up the disabled provider.
3. **Remove MiniMax injection branch** from `buildAgentEnvExports` in `agentLaunchWrapper.js`.
4. **Remove `zed` case** from `buildAgentLaunchCommand`.
5. **Remove `minimax` case** from `llm-providers/route.js` and `llm-providers/models/route.js`.
6. **Remove `zed` entry** from `PHASE_CONTRACTS` in `SwarmPromptEngine.js`.
7. **Remove `minimax` from `priorityOrder`** and `modelOptions` in `llm-providers-config.json`.
8. **DB**: No schema changes — no migration needed.

---

*Design decisions in this file are authoritative. Implementation must not contradict D-1 through D-13 without a formal spec amendment.*