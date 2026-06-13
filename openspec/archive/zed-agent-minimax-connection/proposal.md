# Proposal: Zed Agent — MiniMax M2.7 Subscription Connection

## Intent

Enable the Zed agent persona (end-to-end senior developer with full swarm authority) to run against MiniMax M2.7 via the MiniMax Cloud Platform (MCP) Anthropic-compatible API, using the subscription plan. The Zed agent wraps OpenCode as its inner runtime and communicates with the DevHub swarm via the existing agent protocol (HMAC-signed heartbeats, tmux, Engram MCP tools). This change adds the MiniMax subscription credential path that is currently absent from DevHub's provider config system.

## Scope

### In

- `data/llm-providers-config.json` — add `minimax` provider entry with MCP endpoint and model ID
- `src/app/api/settings/llm-providers/route.js` — register `minimax` as a supported provider
- `src/app/api/settings/llm-providers/models/route.js` — serve model list for the minimax provider
- `src/lib/agentLaunchWrapper.js` — inject `ANTHROPIC_AUTH_TOKEN` and `ANTHROPIC_BASE_URL` into zed role launches
- `src/lib/agentLaunchCommand.js` — pass `--model minimax-coding-plan/MiniMax-M2.7` and `--base-url https://api.minimax.io/anthropic` when launching zed workers
- New: `src/lib/minimax/MiniMaxMcpClient.js` — thin HTTP client for the MiniMax MCP subscription endpoint (server-side only)
- New: `src/lib/minimax/MiniMaxCredentials.js` — resolves the API key from env / DevHub secrets / platform.minimaxi.com token-plan exchange
- New: `docs/prompts/swarm/swarm-zed-v1.md` — Zed phase contract prompt template
- `src/lib/sdd/SwarmPromptEngine.js` — add `'zed'` to `PHASE_CONTRACTS`

### Out

- No changes to existing swarm roles (director, coder, architect, qa, etc.)
- No changes to the DB schema or mission lifecycle
- No changes to `src/lib/sdd/ModelConsolidator.js` (consolidator already maps all MiniMax variants to `minimax-coding-plan/MiniMax-M2.7`)
- No changes to the HMAC auth protocol between DevHub and agents
- No changes to how OpenCode CLI itself works — DevHub injects credentials, OpenCode consumes them

## Capabilities

### New

**1. MiniMax MCP provider registration**

DevHub's `llm-providers-config.json` accepts `minimax` as a first-class provider alongside `copilot`, `openrouter`, `opencode`, `zen`:

```json
{
  "providers": {
    "minimax": {
      "ANTHROPIC_BASE_URL": "https://api.minimax.io/anthropic",
      "MINIMAX_MODEL": "minimax-coding-plan/MiniMax-M2.7",
      "enabled": true
    }
  },
  "priorityOrder": ["copilot", "minimax", "opencode", "openrouter", "zen", "direct"]
}
```

**2. MiniMax subscription model listing**

`GET /api/settings/llm-providers/models?provider=minimax` returns `["minimax-coding-plan/MiniMax-M2.7"]`. The subscription plan models are not enumerated by a public API, so this is a static manifest entry for the initial implementation, with a path to dynamic discovery via `platform.minimaxi.com` in a future iteration.

**3. Zed agent env injection**

`buildAgentEnvExports()` in `agentLaunchWrapper.js` receives a new `modelProvider` field. When `role === 'zed'`, it injects:

```
export ANTHROPIC_AUTH_TOKEN="<minimax_mcp_api_key>"
export ANTHROPIC_BASE_URL="https://api.minimax.io/anthropic"
export ANTHROPIC_MODEL="minimax-coding-plan/MiniMax-M2.7"
```

The API key is **never written to disk** (written to a temp file with `0600` permissions, executed in the same process tree), **never logged**, and **never passed on the command line**.

**4. MiniMaxCredentials credential resolver**

Three-tier resolution (highest to lowest priority):

1. `MINIMAX_MCP_API_KEY` env var — user-set, immediate
2. DevHub secrets store: `minimax.mcpApiKey` — per-workspace credentials
3. `MINIMAX_TOKEN_PLAN_KEY` env var — subscription plan key from `platform.minimaxi.com`, exchanged for an MCP API key via the token-plan endpoint

On HTTP 401 from MiniMax MCP, the resolved key is invalidated and re-resolved on next request.

**5. MiniMaxMcpClient**

Server-side only. Wraps the MiniMax MCP Anthropic-compatible endpoint (`https://api.minimax.io/anthropic`). Used by DevHub routes that call MiniMax on behalf of agents (capability discovery, token-budget reporting). The Zed agent's own LLM calls go direct from the OpenCode subprocess via the injected env vars — not through this client.

### Modified

**6. `agentLaunchCommand.js` — Zed CLI flags**

`buildAgentLaunchCommand()` receives the `role` parameter. When `role === 'zed'`, the generated opencode invocation includes:

```
opencode --model minimax-coding-plan/MiniMax-M2.7 \
         --base-url https://api.minimax.io/anthropic
```

`--api-key` is deliberately omitted from the CLI; the key goes through env injection only.

**7. `llm-providers/models/route.js` — minimax branch**

```js
case 'minimax':
  return NextResponse.json(['minimax-coding-plan/MiniMax-M2.7']);
```

## Approach

### Credential injection chain

```
platform.minimaxi.com (subscription management)
  or user-provided MINIMAX_MCP_API_KEY
        │
        ▼
MiniMaxCredentials.resolve()   [src/lib/minimax/MiniMaxCredentials.js]
        │
        ▼
buildAgentEnvExports({ role: 'zed', modelProvider: 'minimax' })
  → injects ANTHROPIC_AUTH_TOKEN as shell export
        │
        ▼
spawn OpenCode subprocess with env vars inlined in wrapper script
  → reads ANTHROPIC_BASE_URL + ANTHROPIC_AUTH_TOKEN
        │
        ▼
MiniMax MCP:  POST https://api.minimax.io/anthropic/v1/messages
```

The wrapper script is written to `/tmp/devhub-agent-launch-{agentId}.sh` with mode `0600` before execution.

### Provider config flow

```
GET /api/settings/llm-providers/models?provider=minimax
  → llm-providers/models/route.js
  → case 'minimax'
  → returns ['minimax-coding-plan/MiniMax-M2.7']
```

### Zed role launch sequence

```
swarmControl.launchMission({ changeName, teamTemplate: 'zed-solo' })
  → SwarmPromptEngine.buildRoleAgentProfile('zed', changeName, 'apply')
  → buildAgentLaunchCommand({ role: 'zed',
       model: 'minimax-coding-plan/MiniMax-M2.7' })
  → buildAgentLaunchWrapper({ role: 'zed', supervisorUrl, agentId, ... })
      → buildAgentEnvExports({ role: 'zed',
           modelProvider: 'minimax' })   ← injects MiniMax creds
      → spawn OpenCode with --model flag
```

### Phase contract

`PHASE_CONTRACTS.zed` (new entry in `SwarmPromptEngine.js`):

```
ROLE: zed
EXECUTABLE PHASES: sdd-explore, sdd-propose, sdd-spec, sdd-design, sdd-tasks, sdd-apply, sdd-verify, sdd-archive
DELEGATABLE: all (uses coder/architect/qa workers for large changes)
CONTEXT BUDGET: ~8,000 tokens (MiniMax 2.7)
REACTIVATION: mem_search("sdd/{{change_name}}/director-log") → mem_get_observation on last artifact + apply-progress
```

## Affected Areas

| File | Change |
|------|--------|
| `data/llm-providers-config.json` | Add `providers.minimax`; insert `minimax` into `priorityOrder` |
| `src/lib/agentLaunchWrapper.js` | `buildAgentEnvExports()` — add `modelProvider` param; inject MiniMax env vars for `role === 'zed'` |
| `src/lib/agentLaunchCommand.js` | `buildAgentLaunchCommand()` — when `role === 'zed'`, add `--model` and `--base-url` opencode flags |
| `src/app/api/settings/llm-providers/route.js` | Add `minimax` case in provider registration |
| `src/app/api/settings/llm-providers/models/route.js` | Add `case 'minimax':` branch returning static model list |
| `src/lib/minimax/MiniMaxMcpClient.js` | **New** — HTTP client for MiniMax MCP Anthropic-compatible endpoint |
| `src/lib/minimax/MiniMaxCredentials.js` | **New** — credential resolver: env var → secrets store → token-plan exchange |
| `docs/prompts/swarm/swarm-zed-v1.md` | **New** — Zed phase contract prompt template |
| `src/lib/sdd/SwarmPromptEngine.js` | Add `'zed'` entry to `PHASE_CONTRACTS` |

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| MiniMax MCP API key expires or rotates | Medium | `MiniMaxCredentials` caches resolved key with TTL; invalidates cache and re-resolves on HTTP 401 |
| `minimax-coding-plan/` prefix routing is internal MiniMax — no public docs | Low | Start with static model ID; instrument 400/404 errors; add dynamic discovery once API surface is confirmed |
| API key exposed via shell history if passed on CLI | Critical | All credential injection via env var exports only — never a CLI flag |
| Zed agent cwd mismatch with workspace path | Medium | `buildAgentLaunchWrapper()` already enforces `exit 1` on `cwd !== workspacePath` |
| ~8k token context budget is tight for full SDD phases | Medium | Phase contract sets the budget; Zed instructed to use Engram proactively for artifact offloading |
| `minimax` provider added to `priorityOrder` displaces existing priority | Low | `minimax` is inserted in a safe position; `copilot` remains first |

## Rollback Plan

1. **Immediate**: Set `providers.minimax.enabled = false` in `llm-providers-config.json`. Restart agent hub server. No in-flight agents are affected by the read-side config change.
2. **Agents in flight**: Next heartbeat hits the supervisor; existing agents' OpenCode processes continue with their already-injected env vars until natural exit. New agent launches after restart pick up the disabled provider.
3. **Env var injection**: Remove the `modelProvider === 'minimax'` branch from `buildAgentEnvExports()`. Function falls back to previous behavior.
4. **CLI flags**: Remove zed-specific routing from `buildAgentLaunchCommand()`.
5. **DB**: No schema changes — no migration needed.
6. **Re-enablement**: Reverse step 1. Subsequent launches recover MiniMax injection normally.

## Dependencies

- `MINIMAX_MCP_API_KEY` or `MINIMAX_TOKEN_PLAN_KEY` must be present in the environment — user sets this; DevHub does not provision it
- OpenCode CLI at the resolved executable path — existing dependency, confirmed present
- MiniMax MCP endpoint `https://api.minimax.io/anthropic` reachable from the agent host — network-level dependency
- DevHub HMAC auth protocol unchanged — Zed uses the same `DEVHUB_AGENT_TOKEN` mechanism as all other agents
- Engram MCP tools unchanged — Zed uses the same `mem_save`/`mem_search` tools as all other agents

## Success Criteria

1. `GET /api/settings/llm-providers/models?provider=minimax` returns `200` with body `["minimax-coding-plan/MiniMax-M2.7"]`
2. A zed agent launched via `swarmControl.launchMission()` has `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`, and `ANTHROPIC_MODEL` set (verified by grep on the generated wrapper script)
3. The Zed agent's first API call to `https://api.minimax.io/anthropic/v1/messages` succeeds with HTTP 200 (not 401/403/400)
4. `SwarmPromptEngine.buildRoleAgentProfile('zed', ...)` returns a valid prompt without throwing
5. Rollback by setting `providers.minimax.enabled = false` does not break existing director/coder/architect agent launches

---

## Scope

### In Scope
- Zed as a named agent persona: identity, personality, and capability profile
- Zed's subscription client module: how Zed authenticates with MiniMax M2.7 through the OpenCode binary
- Agent personality system: tool definitions, context windows, behavioral guardrails
- Swarm integration: Zed as a Director/Worker role in DevHub's director/worker model
- API endpoint configuration: `ANTHROPIC_BASE_URL=https://api.minimax.io/anthropic` propagation
- Model selection: `minimax-coding-plan/MiniMax-M2.7` alias via `ModelConsolidator.js`
- Agent launch integration: adding Zed to `AGENT_PROGRAM_EXECUTABLES` and `buildRoleAgentProfile`

### Out of Scope
- Implementing a standalone Zed binary (Zed is an OpenCode prompt profile, not a separate process)
- Obtaining a raw MiniMax API key (subscription is embedded in OpenCode — no env var needed)
- Multi-provider routing beyond MiniMax M2.7 (this proposal is MiniMax-first)
- UI changes for a Zed-specific dashboard panel

---

## Capabilities

### Zed Agent Persona

| Attribute | Value |
|-----------|-------|
| Agent name | `zed` |
| Agent key | `zed` (role key in swarm topology) |
| Default program | `opencode` |
| Default model | `minimax-coding-plan/MiniMax-M2.7` |
| Swarm roles | Director, Coder, Builder, QA, Auditor (all roles eligible) |
| OpenCode profile | `swarm-director` when acting as Director; `swarm-coder` for terminal roles |
| Identity | Senior architect, 15+ years experience, GDE & MVP — passionate teacher |
| Tone | Caring, direct, trades in concepts over code |
| Tooling | DevHub full toolbelt: file ops, terminal, git, db, swarm ops |
| Context window | MiniMax M2.7 native context (handled by OpenCode) |

### Subscription Client Module

The subscription client is not a separate HTTP client library. It is the **OpenCode binary acting as the transport layer**:

```
DevHub (launch command)
  └─> OpenCode binary (opencode-go provider, embedded subscription)
        └─> ANTHROPIC_BASE_URL=https://api.minimax.io/anthropic
              └─> MiniMax M2.7 (subscription verified server-side)
```

- No `MINIMAX_API_KEY` stored anywhere — subscription auth is internal to OpenCode
- No `MINIMAX_SUBSCRIPTION_KEY` stored anywhere
- The `opencode-go` provider handles token resolution transparently
- DevHub's only responsibility: pass `--model minimax-coding-plan/MiniMax-M2.7` to OpenCode

### Agent Personality System

Zed's personality is expressed as a prompt profile loaded by OpenCode. Personality traits are injected via `SwarmPromptEngine` role variables:

```js
// In buildRoleAgentProfile (swarmControl.js):
const ZED_PERSONALITY = {
  name: 'Zed',
  identity: 'Senior architect, 15+ years, GDE & MVP. Passionate teacher.',
  tone: 'Caring, direct, concepts over code. Pushes back when shortcuts are taken.',
  constraints: [
    'Never generate code without explaining the concept first',
    'Verify technical claims before stating them',
    'Match user language in reply (Spanish/English)',
    'Call mem_save proactively after decisions, bug fixes, discoveries',
  ],
  tools: ['file_ops', 'terminal', 'git', 'db', 'swarm_ops', 'engram', 'sdd'],
};
```

When `buildRoleAgentProfile('zed', changeName, phase)` is called, the returned `prompt` field is enriched with Zed's identity context before being passed to OpenCode.

### Swarm Integration

Zed participates in the DevHub director/worker swarm topology as any other role:

- **As Director**: Zed is the orchestrator. Receives mission brief, fans out to workers, aggregates results, handles handoff.
- **As Worker**: Zed executes assigned tasks, reports progress via `mission_control`, delivers artifacts.
- **Identity persistence**: Zed's `agent_id` is `zed-{run_id}` in mission participants.
- **Session restore**: Zed workspaces are labeled `sessionType: 'zed'` and `swarmRole: 'director'` or `'worker'` per `normalizeWorkspace` in `swarmControl.js`.

Zed's role programs mapping (added to `buildRoleAgentProfile`):

```js
const ZED_ROLE_PROGRAMS = {
  director: 'opencode',  // uses --agent swarm-director
  coder: 'opencode',     // uses --agent swarm-coder
  builder: 'opencode',
  qa: 'opencode',
  auditor: 'opencode',
  devops: 'opencode',
  architect: 'opencode',
};
```

### API Endpoint Configuration

The endpoint is already configured in the environment; Zed inherits it by being launched through OpenCode:

```js
// In ModelConsolidator.js (existing):
const MINIMAX_ALIAS_MAP = {
  'minimax-m2.7': 'minimax-coding-plan/MiniMax-M2.7',
  'MiniMax-M2.7': 'minimax-coding-plan/MiniMax-M2.7',
  // Zed uses the same alias — no changes needed here
};

// OpenCode resolves internally:
// ANTHROPIC_BASE_URL=https://api.minimax.io/anthropic
// The subscription is verified server-side by MiniMax's OpenAI-compatible endpoint.
```

No new env vars are introduced. DevHub passes the model string; OpenCode handles the rest.

---

## Approach

### Phase 1: Agent Registration

Add Zed to the DevHub agent registry (no new binary needed — Zed is an OpenCode profile):

1. **`AGENT_PROGRAM_EXECUTABLES`** (`agentLaunchCommand.shared.js`): Zed maps to `opencode`. The existing `resolveAgentProgramExecutable('zed')` returns the OpenCode path.

2. **`buildRoleAgentProfile`** (`swarmControl.js`): Add `zed` to the role mapping, pointing to `swarm-director` (for Director role) or `swarm-coder` (for terminal roles).

3. **`createSwarmLaunchDraft`** (`swarmControl.js`): Add `zed` to `SWARM_ROLE_DEFAULT_MODELS` with `minimax-coding-plan/MiniMax-M2.7`.

4. **`buildSwarmLaunchPrograms`** (`swarmControl.js`): Add Zed as a program option (label: "Zed / OpenCode + MiniMax M2.7").

### Phase 2: Personality Injection

5. **`SwarmPromptEngine`**: Extend `buildPrompt` or create a `buildZedIdentityPrompt(vars)` that prepends Zed's identity block to the prompt when `role === 'zed'`.

6. **`buildRoleAgentProfile` for Zed**: When `roleKey === 'zed'`, return a prompt object that includes the Zed identity context and behavioral constraints.

### Phase 3: Swarm Launch Integration

7. **`createSwarmLaunchDraft`**: When the user selects "Zed" as the program for a role, use `opencode` as the program ID with `--model minimax-coding-plan/MiniMax-M2.7` and the Zed identity prompt profile.

8. **`buildAgentLaunchCommand`** (`agentLaunchCommand.shared.js`): When `programId === 'zed'`, route to the `opencode` branch with `modelId = 'minimax-coding-plan/MiniMax-M2.7'` and `opencodeAgent = 'swarm-director'` (or role-appropriate profile).

### Phase 4: Workspace Identity

9. **`normalizeWorkspace`** (`swarmControl.js`): Preserve `sessionType: 'zed'` and `swarmRole` on Zed's workspaces to enable session restore.

10. **`agentLaunchCommand.shared.js`**: When launching Zed, pass `cwd` explicitly so workspace labeling is correct.

---

## Affected Areas

| File | Change |
|------|--------|
| `src/lib/agentLaunchCommand.shared.js` | Add `zed` to `AGENT_PROGRAM_EXECUTABLES` (maps to opencode path); route `buildAgentLaunchCommand` for `programId === 'zed'` |
| `src/lib/operations/swarmControl.js` | Add Zed to role mapping, role models, programs catalog, `buildRoleAgentProfile` |
| `src/lib/sdd/SwarmPromptEngine.js` | Add `buildZedIdentityPrompt()` function; call from `buildRoleAgentProfile` when role is zed |
| `src/lib/sdd/ModelConsolidator.js` | No changes needed — alias already covers MiniMax M2.7 |
| `src/lib/db/schema.js` | Add `sessionType: 'zed'` as valid enum value if schema enforces allowlist |
| `docs/swarm/AGENTS.md` | Document Zed as DevHub's named agent persona |

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| OpenCode subscription is tied to the logged-in OpenCode user, not a devhub-level credential | Low | High | OpenCode is invoked under the DevHub OS user context — subscription is already authenticated |
| MiniMax M2.7 subscription has per-seat or per-IP limits | Low | Medium | OpenCode manages connection pooling and reuse; DevHub runs on localhost — no IP variability |
| Zed's personality prompt conflicts with swarm-director profile | Low | Low | Zed identity is additive — the swarm-director profile provides role structure; Zed personality provides tone/constraints |
| No way to distinguish Zed from generic opencode agents in logs | Medium | Low | Add `AGENT_IDENTITY=zed` env var to Zed launch commands for filtering in observability |
| Engram memory not tagged with Zed's agent_id | Low | Low | Zed's `agent_id` is `zed-{run_id}`; mem_save calls from within Zed get the correct agent context |

---

## Rollback Plan

All changes are additive and non-destructive:

- **Phase 1 rollback**: Remove `zed` entries from `AGENT_PROGRAM_EXECUTABLES`, role mapping, and programs catalog. No data migration needed.
- **Phase 2 rollback**: Remove `buildZedIdentityPrompt` and its call from `buildRoleAgentProfile`. Existing swarm profiles remain functional.
- **Phase 3 rollback**: Revert `buildAgentLaunchCommand` routing. Remove Zed from launch draft defaults.
- **Phase 4 rollback**: Remove `sessionType: 'zed'` from schema enum if added. Workspace rows already tolerate null `sessionType`.

No database migration is required for any rollback.

---

## Dependencies

| Dependency | Status | Notes |
|-----------|--------|-------|
| OpenCode binary at `/home/matias/.opencode/bin/opencode` | Present | Confirmed — same binary used for all swarm agents |
| `minimax-coding-plan/MiniMax-M2.7` alias in `ModelConsolidator.js` | Present | Already resolves to `minimax-m2.7` |
| `ANTHROPIC_BASE_URL=https://api.minimax.io/anthropic` | Present | Set in OS environment; OpenCode reads it |
| `SwarmPromptEngine` | Present | `buildPrompt` function available for personality injection |
| DevHub SDD workflow | Present | All phases (spec, design, tasks, apply, verify, archive) available |
| `normalizeWorkspace` preserves `sessionType` | Present | Confirmed in `swarmControl.js` |

---

## Success Criteria

1. **Zed launches as a swarm agent**: `createSwarmLaunchDraft` includes Zed as a selectable program; `buildAgentLaunchCommand` produces a valid tmux-wrapped opencode command for Zed with `--model minimax-coding-plan/MiniMax-M2.7`.
2. **Zed connects to MiniMax M2.7**: OpenCode's internal subscription handles auth transparently — no API key in env, no custom HTTP client needed.
3. **Zed personality is injected**: The prompt passed to OpenCode includes Zed's identity block (senior architect persona, behavioral constraints, tone rules).
4. **Zed appears in swarm roster**: Mission participants show `agent_id: 'zed-{run_id}'` with correct role label.
5. **Zed workspaces are labeled**: `sessionType: 'zed'` and `swarmRole` are persisted on workspace rows, enabling session restore.
6. **Rollback is safe**: Removing Zed from the registry does not affect any existing swarm agent (opencode/codex/hermes).