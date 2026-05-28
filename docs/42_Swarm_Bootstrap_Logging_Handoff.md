# Swarm bootstrap + logging handoff

This document is the restart point for the current swarm-control work.

## TL;DR

- Visible swarm execution improved, but launch startup is still too eager and noisy.
- The next intended work is **launch instrumentation first**, then **director-first phased bootstrap**, then **an operational swarm prompt**, and only then a new real swarm run to inspect logs/results.
- Do **not** mix this with the deferred scroll-reset bug or terminal paste follow-up.
- Global OpenCode runtime config under `~/.config/opencode/` was changed and requires **OpenCode restart** to take effect.

## Current intent

User priority order is:

1. Fix swarm role profiles.
2. Fix per-role models.
3. Block hidden subagents for visible workers.
4. Add better launch logs / locks.
5. Define smarter startup mode.
6. Run a real swarm and inspect friction, quality, logs, and the separate Node memory spike.

Important user constraints:

- Prefer direct fixes over full SDD ceremony.
- Use visible tmux swarm workers first.
- Avoid hidden delegation by default.
- Use centralized context intelligently (Engram first, `sdd-init` only if needed).
- Terminal paste work was deferred to another agent.
- Workspace scroll-reset bug is explicitly out of scope for the next step.

## What is already fixed

### 1. Durable director feed + narrower MCP contract

- Commit: `670daf4`
- Message: `feat(agenthub): add durable director feed and shrink public MCP contract`

Behavioral result:

- backend durable `director-feed` exists
- `task_completed` and `handoff_ready` were added as canonical events
- public `devhub-mcp` contract was reduced to 24 tools

### 2. SwarmControl live refresh + terminal paste + repo prompt snapshot

- Commit: `fddfae2`
- Message: `feat(swarm-control): add scoped director refresh and terminal paste`

Behavioral result:

- `SwarmControl` refreshes from scoped `director-feed`
- terminal got explicit paste support paths
- repo snapshot of runtime prompt/config context exists in:
  - `docs/swarm-control/prompts/swarm-runtime-current.md`

### 3. Broad backup snapshot of noisy branch state

- Commit: `0b7eb36`
- Message: `chore: backup swarm control panel polish changes`

Purpose:

- preserve the broad current branch state, even with mixed/noisy changes

### 4. Visible role identity and hidden-subagent enforcement

Done but **not yet committed in repo** during this handoff range.

Repo files changed:

- `src/lib/operations/swarmControl.js`
- `src/lib/operations/__tests__/swarmControl.test.js`
- `docs/swarm-control/prompts/swarm-runtime-current.md`

Global runtime files changed:

- `~/.config/opencode/opencode.json`
- `~/.config/opencode/prompts/swarm/swarm-director.md`
- `~/.config/opencode/prompts/swarm/swarm-coder.md`
- `~/.config/opencode/prompts/swarm/swarm-explorer.md`
- `~/.config/opencode/prompts/swarm/swarm-reviewer.md`
- `~/.config/opencode/prompts/swarm/swarm-qa.md`
- `~/.config/opencode/prompts/swarm/swarm-devops.md`
- `~/.config/opencode/prompts/swarm/swarm-architect.md`
- `~/.config/opencode/prompts/swarm/swarm-auditor.md`

Verified result:

- dedicated visible profiles exist for director / coder / devops / architect / auditor / qa
- default role models no longer flatten all roles to `opencode-go/deepseek-v4-flash`
- hidden task spawning is blocked with `permission.task: "deny"`

Focused validation already run:

- `python -c "import json, pathlib; json.load(open(pathlib.Path('/home/matias/.config/opencode/opencode.json'))); print('opencode.json valid')"`
- `npm test -- --runInBand src/lib/operations/__tests__/swarmControl.test.js`
  - result: `45/45` passing

Critical note:

- **OpenCode restart is required** for these global config/prompt changes.

## Current runtime role/profile model

Expected visible role mapping after restart:

| Visible role | OpenCode agent profile | Default model | Hidden task spawning |
|---|---|---:|---|
| Director | `swarm-director` | `opencode-go/qwen3.6-plus` | denied |
| Coder | `swarm-coder` | `opencode-go/deepseek-v4-flash` | denied |
| DevOps | `swarm-devops` | `opencode-go/deepseek-v4-flash` | denied |
| Architect | `swarm-architect` | `opencode/claude-sonnet-4.6` | denied |
| Auditor | `swarm-auditor` | `opencode-go/qwen3.6-plus` | denied |
| QA | `swarm-qa` | `opencode-go/deepseek-v4-flash` | denied |

## Prompt/runtime sources

Runtime source of truth is global OpenCode config, not repo.

Verified source paths:

- `~/.config/opencode/opencode.json`
- `~/.config/opencode/prompts/swarm/swarm-director.md`
- `~/.config/opencode/prompts/swarm/swarm-coder.md`
- `~/.config/opencode/prompts/swarm/swarm-devops.md`
- `~/.config/opencode/prompts/swarm/swarm-architect.md`
- `~/.config/opencode/prompts/swarm/swarm-auditor.md`
- `~/.config/opencode/prompts/swarm/swarm-explorer.md`
- `~/.config/opencode/prompts/swarm/swarm-reviewer.md`
- `~/.config/opencode/prompts/swarm/swarm-qa.md`

Repo snapshot doc:

- `docs/swarm-control/prompts/swarm-runtime-current.md`

## What the visible swarm proved most recently

At the time of this handoff, visible tmux roster existed:

- `devhub-swarm-launch-4eb9c4d5-director`
- `devhub-swarm-launch-4eb9c4d5-coder`
- `devhub-swarm-launch-4eb9c4d5-architect`
- `devhub-swarm-launch-4eb9c4d5-auditor`
- `devhub-swarm-launch-4eb9c4d5-devops`

Latest pane evidence collected:

- **director** reported the minimal backend cut for staged bootstrap is in:
  - `src/app/api/agenthub/operations/health/route.js`
  - `src/lib/operations/swarmControl.js`
  - and estimated no changes needed in `src/lib/agentLaunchCommand.js`
- **coder** identified frontend injection points for phased startup UI/submission in:
  - `src/components/control-room/SwarmLaunchWizardModal.jsx`
  - `src/views/SwarmControl.jsx`
  - `src/components/terminal/hooks/useSwarmLaunchController.js`
  - `src/components/TerminalWorkspacesManager.jsx`
- **architect** confirmed draft/catalog/tests are the right place to add startup strategy/bootstrap fields
- **auditor** reported the swarm worktree itself was clean/narrow, but verification there was blocked by missing `node_modules`
- **devops** returned an environment note: worktree Node mismatch (`v24` parent vs `v22` worktree default) can break native modules like `better-sqlite3`; temporary fix suggested was `nvm use 24`

## Current diagnosis of launch/startup problem

The current launch path still does **direct all-role fan-out**.

That means:

1. launch draft is created immediately
2. all role programs are previewed immediately
3. backend loop creates runtime requests for **all roles** in one pass
4. workers start exploring in parallel too early

This is the core friction the user wants removed.

## Already verified architecture decision

Preferred startup shape:

1. **Director first**
2. **Engram first**
3. **`sdd-init` only if needed**
4. **Fan-out later**

Important constraint from the `sdd-init` skill:

- the orchestrator must **not** execute `sdd-init` inline
- if used, it must be invoked as a dedicated executor/sub-agent step

So the correct design is:

- Director starts alone
- Director reads Engram + current state
- Director decides if structural init is missing/stale
- only then, if needed, a bootstrap/init step runs
- only afterwards Director fans out to visible workers

## Next work item: launch logs first

This is the next intended implementation, before any new real swarm launch.

### Goal

Add enough launch instrumentation to answer:

- what launch strategy was chosen
- whether Director ran bootstrap first
- whether `sdd-init` was considered or used
- when worker fan-out happened
- what Node process memory did during launch
- whether a lock prevented overlapping launches or duplicate bootstrap

### Likely files to change

- `src/lib/operations/swarmControl.js`
  - add draft fields for startup strategy/bootstrap mode
- `src/app/api/agenthub/operations/health/route.js`
  - extend existing launch trace with bootstrap/fan-out/memory snapshots
  - possibly implement phased runtime request partitioning
- `src/components/control-room/SwarmLaunchWizardModal.jsx`
  - optional UI for launch strategy selection
- `src/views/SwarmControl.jsx`
  - submit phased launch config
- `src/components/terminal/hooks/useSwarmLaunchController.js`
  - submit phased launch config from terminal path
- `src/components/TerminalWorkspacesManager.jsx`
  - same as above if terminal-side launch remains supported
- `tests/agenthub/api/operations-health.test.js`
  - launch trace / phased launch expectations
- `src/lib/operations/__tests__/swarmControl.test.js`
  - draft default/startup strategy expectations

### Existing logging already present

Do not reinvent from zero. Current backend already has:

- `SWARM_LAUNCH_TRACE_TYPE = 'swarm_launch'`
- `SWARM_LAUNCH_TRACE_TOOL_NAME = 'launch_swarm_local'`
- `buildLaunchTracePayload(...)`
- `persistLaunchTrace(...)`

The next change should **extend** this trace, not replace it.

### Lightweight memory logging recommendation

Keep it cheap. Log only a few snapshots:

- before director bootstrap
- after director bootstrap
- before worker fan-out
- after worker fan-out

Recommended fields per snapshot:

- timestamp
- pid
- rss
- heapUsed
- heapTotal
- external
- arrayBuffers
- phase label
- launchId
- missionId

If adding lock info, log:

- whether launch lock acquired
- lock owner / launchId
- lock released timestamp

## Proposed phased launch behavior

### Happy path

1. user launches swarm with strategy `director_first`
2. backend creates mission + director runtime request first
3. trace records `phase=bootstrap_start`
4. director consumes Engram and current state
5. director decides whether bootstrap init is needed
6. if not needed, trace records `bootstrap_skipped`
7. if needed, trace records delegated bootstrap executor start/end
8. backend / UI then fan out worker runtime requests
9. trace records `fanout_start` and `fanout_complete`

### Initial version should stay simple

Do **not** over-design yet.

Good first version:

- launch strategy field in draft
- backend trace phases
- director runtime request clearly separated from worker runtime requests
- worker fan-out can still happen immediately after a short bootstrap checkpoint if full async orchestration is too much for first pass

## Operational prompt draft for the next swarm test

Use after logs + phased startup are implemented and OpenCode has been restarted.

```text
Ejecutar un swarm de verificación operativa en modo director-first.

Objetivo:
- iniciar primero al Director visible
- usar Engram como contexto inicial
- ejecutar bootstrap estructural solo si el Director detecta falta de contexto, drift relevante o tooling sin inicializar
- fan-out a workers visibles recién después del bootstrap
- dejar trazas claras de fases de launch, decisiones de bootstrap, fan-out y snapshots livianos de memoria Node

Roles visibles iniciales:
- Director
- Coder
- DevOps
- Architect
- Auditor

Reglas:
- no lanzar workers ocultos ni subagentes escondidos
- no usar delegación oculta por defecto
- priorizar coordinación visible y evidencia durable
- no empezar exploración paralela masiva antes de que el Director cierre el bootstrap
- si bootstrap no hace falta, dejarlo explícito en logs

Qué validar al final:
- identidad correcta de perfiles por rol
- modelo correcto por rol
- ausencia de subagentes ocultos
- trazas de launch completas por fase
- comportamiento de memoria Node durante launch
- calidad del handoff del Director y de los workers visibles
```

## Tests/logs already relevant

### Verified tests already run in this conversation

- `npm test -- --runInBand src/lib/operations/__tests__/swarmControl.test.js`
  - result: `45/45` passing after role/profile/model fixes

Earlier focused tests also passed for previous fixes:

- `src/app/api/agenthub/sessions/stream/route.test.js`
- `src/views/__tests__/SwarmControl.test.jsx`
- `src/components/__tests__/TerminalTTY.test.js`
- `src/components/__tests__/TerminalWorkspacesManager.shortcuts.test.jsx`
- `src/lib/terminal/__tests__/nativeVteBridge.test.js`

### Tests that will matter next

- `tests/agenthub/api/operations-health.test.js`
- `src/lib/operations/__tests__/swarmControl.test.js`
- optionally UI submit path tests if launch strategy is exposed in the wizard/control room

## Risks / warnings

- Repo working tree is very dirty; keep the next launch/bootstrap change narrow.
- Global OpenCode config changes are outside repo and require restart.
- Do not confuse the separate Node launch spike with normal opencode worker RSS.
- Do not mix the deferred terminal paste follow-up into this work.
- Do not mix the scroll-reset bug into this work.

## New incident to inspect: white screen / apparent crash with swarm left open

User reported a new incident after leaving the swarm open idle:

- the app went white / blank
- later the terminal area came back
- user does **not** think they were actively doing anything at that moment
- user asked whether I had done anything to the swarm

### Important honesty note

I **did** interact with the visible swarm shortly before this report, but only by sending read-only inspection instructions to the existing visible tmux panes so they could inspect code paths and report evidence. I did **not** intentionally launch a new swarm, terminate the swarm, or run an explicit destructive swarm command in that phase.

### What I was able to verify locally

#### 1. The visible swarm sessions are gone now

At re-check time:

```bash
tmux list-sessions
```

returned:

```text
no server running on /tmp/tmux-1000/default
```

So the visible swarm tmux server/session set was no longer alive by the time I inspected after the report.

#### 2. The desktop/dev runtime itself was still alive

Live processes at inspection time still included:

- `target/debug/devhub`
- `node ... next dev --port 3100`
- `node ... .next/dev/build/postcss.js ...`
- `sidecar-backend/server.js`
- multiple `opencode` processes

So this did **not** look like a full machine-wide or full Tauri-dev shutdown at inspection time.

#### 3. No fresh crash-dump evidence was created for this specific incident

Latest files under:

- `data/logs/crash-dumps/`

were still old entries from `2026-05-23T22:xx` to `2026-05-24T00:06`, mostly with reason:

- `ws_abrupt_close_no_clients`

I found **no new crash-dump file** clearly tied to this new blank-screen incident.

#### 4. Browser log shows real frontend/runtime exceptions that can plausibly produce blank UI states

Recent errors in `data/logs/browser.log` include:

- `2026-05-27T01:30:37.064Z`
  - `TypeError: undefined is not an object (evaluating 'this._renderer.value.dimensions')`
  - source points into xterm bundle internals
  - stack includes `syncScrollArea`

- `2026-05-27T04:32:57.884Z`
  - same `this._renderer.value.dimensions` error in xterm bundle

- `2026-05-27T04:32:57.899Z`
  - same error but stack includes `_innerRefresh`

- `2026-05-26T19:11:41.872Z`
  - `ReferenceError: Can't find variable: selectedNodeObj`
  - component: `SwarmTopologyGraph`

These are real browser/runtime exceptions, not just warnings.

#### 5. Terminal debug log shows a suspicious native VTE / zero-size lifecycle immediately before the blank-state class of symptoms

Recent lines in `data/logs/terminal-debug.log` show the main terminal panel `p442` doing this sequence:

- starts as `requestedRendererMode: "vte-experimental"`, initially `effectiveRendererMode: "xterm"`
- native VTE probe becomes ready
- native VTE is opened, shown, resized repeatedly
- then later the same connected terminal reports:
  - `width: 0`
  - `height: 0`
  - `zeroSized: true`
  - `effectiveRendererMode: "vte-experimental"`
  - repeated `reactivate-start` / `reactivate-settled`
- around the same period there are repeated:
  - `native VTE hide requested {"reason":"terminal-manager-hidden"}`

That suggests a strong candidate:

- the same-window native VTE path may be ending up hidden or zero-sized while still logically connected, which can explain a blank terminal area or white/empty state without a full backend crash.

### Current best hypotheses

Most likely suspects, ordered by evidence strength:

1. **xterm renderer lifecycle exception**
   - `this._renderer.value.dimensions` errors are concrete and recent
   - could blank or destabilize the terminal/UI slice

2. **native VTE visibility / zero-size regression**
   - `p442` remained connected but fell into zero-sized state with repeated hide/show lifecycle traffic
   - compatible with “everything went blank, then terminals came back”

3. **separate React/UI exception in swarm topology**
   - `selectedNodeObj` undefined in `SwarmTopologyGraph`
   - could blank a slice of the control room, though evidence is older than the terminal renderer errors

### What I cannot prove yet

- I cannot prove the exact root cause of **this** reported incident from logs alone.
- I cannot prove whether the white screen was caused by the visible swarm idling, by terminal renderer lifecycle, or by one of the existing frontend exceptions.
- I cannot prove that my read-only pane prompts caused it.
- I **can** say there is real local evidence of frontend/runtime exceptions and suspicious terminal lifecycle state around the timeframe family of this failure.

### Task to continue later

Add this as a dedicated investigation task before or alongside launch logging:

- reproduce the blank/white-screen state with swarm left idle
- capture timestamp immediately when it happens
- correlate three artifacts around that timestamp:
  - `data/logs/browser.log`
  - `data/logs/terminal-debug.log`
  - process snapshot (`ps`) + tmux/session state
- specifically inspect:
  - xterm renderer error `this._renderer.value.dimensions`
  - native VTE hide/show/zero-size lifecycle for the main panel
  - any `SwarmTopologyGraph` runtime exception during the same window
- add honest fallback UI instead of silent blank if renderer/native host becomes zero-sized or crashes

### Suggested next files for this crash investigation

- `src/components/TerminalTTY.jsx`
- `src/lib/terminal/nativeVteBridge.js`
- `src-tauri/src/native_vte.rs`
- `src/components/control-room/SwarmSurfaceCard.jsx`
- `src/views/SwarmControl.jsx`
- `src/components/control-room/SwarmTopologyGraph*` (or wherever the topology graph lives now)

### Suggested verification commands when reproducing

```bash
tmux list-sessions
ps -eo pid,ppid,rss,vsz,comm,args --sort=-rss | rg "devhub|tauri|node|opencode|next|swarm"
python - <<'PY'
from pathlib import Path
for name in ['browser.log', 'terminal-debug.log']:
    p = Path('/home/matias/ArxonLabs/devhub/data/logs') / name
    lines = p.read_text(errors='replace').splitlines()
    print(f'--- {name} ---')
    for line in lines[-80:]:
        print(line)
PY
```

## Resume checklist

- [ ] Restart OpenCode so global swarm agent config/prompt changes actually apply.
- [ ] Inspect current dirty files before touching launch/bootstrap files.
- [ ] Extend launch trace with explicit phases and lightweight memory snapshots.
- [ ] Add launch strategy/bootstrap fields to swarm draft.
- [ ] Implement the first director-first startup cut.
- [ ] Update focused tests.
- [ ] Run one real swarm.
- [ ] Review logs, visible panes, and resulting quality/friction.

## Fast resume command map

Useful files to read first on resume:

- `docs/swarm-control/prompts/swarm-runtime-current.md`
- `docs/42_Swarm_Bootstrap_Logging_Handoff.md`
- `src/lib/operations/swarmControl.js`
- `src/app/api/agenthub/operations/health/route.js`
- `tests/agenthub/api/operations-health.test.js`
- `src/lib/operations/__tests__/swarmControl.test.js`

Useful runtime checks:

```bash
tmux list-sessions
git status --short
ps -eo pid,rss,comm,args --sort=-rss | rg "opencode|node|jest|swarm"
```

## Out of scope for the next step

- terminal paste follow-up
- workspace switch scroll reset bug
- generalized observability drawer / mission log UI
- larger morphology/brutalist theme work
