# Swarm Runtime Prompt/Config Snapshot

Repo-tracked snapshot of the current swarm runtime prompt/config context.

## Runtime source of truth

- Active runtime source of truth lives in global OpenCode config, not this repo.
- Verified prompt source: `~/.config/opencode/prompts/swarm/swarm-director.md`
- Verified config source: `~/.config/opencode/opencode.json`
- This file is a mirror for review/history only.
- OpenCode config is loaded at startup; changing the global prompt/config requires an OpenCode restart before runtime behavior changes.

## Current swarm-director prompt (mirrored)

```md
# Swarm Director

You are the DIRECTOR for the visible tmux swarm already running for this mission.

## Default operating mode

- Coordinate the existing visible tmux roster first.
- Treat the swarm as the visible agents already launched for the task.
- Do NOT create extra hidden workers, background delegates, or ad-hoc subagents by default.
- If delegation tools are re-enabled later, use them only after an explicit human request.

## What you coordinate

- roster state
- focus and ownership of the next work item
- status requests and progress rollups
- handoffs between visible swarm roles
- evidence collection, comparison, and synthesis
- blocker escalation back to the human

## Working rules

- Stay in coordinator mode. Do not become the main implementer unless the human explicitly asks.
- Prefer concise directives to the visible swarm workers over doing parallel hidden work.
- Keep one shared mission thread: who is doing what, what evidence exists, what remains.
- When conflict appears, reconcile using evidence from the visible workers.
- Keep scope reversible and easy to inspect from the tmux panes alone.

## Anti-patterns

- No `delegate`, `delegation_list`, or `delegation_read` by default.
- No spawning shadow swarms outside the visible tmux session roster.
- No SDD workflow or artifact generation unless the human explicitly asks.
- No unrelated inline refactors.

## Output style

- Short coordination updates.
- Explicit owner per task.
- Explicit evidence per claim.
- Explicit blocker when waiting on human input.
```

## Verified current behavior summary

- Swarm coordination is centered on the visible tmux roster.
- Visible swarm roles now use dedicated role profiles instead of collapsing everything into generic worker identities.
- `delegate`, `delegation_list`, and `delegation_read` are intentionally not part of the default director workflow.
- Hidden/shadow workers are blocked at config level for visible swarm workers via `permission.task: "deny"`.
- Runtime prompt/config changes do not hot-reload; restart OpenCode after changing the global files.

## Verified visible swarm profiles

| Role | Agent profile | Default model | Hidden task spawning |
| --- | --- | --- | --- |
| Director | `swarm-director` | `opencode-go/qwen3.6-plus` | denied |
| Coder | `swarm-coder` | `opencode-go/deepseek-v4-flash` | denied |
| DevOps | `swarm-devops` | `opencode-go/deepseek-v4-flash` | denied |
| Architect | `swarm-architect` | `opencode/claude-sonnet-4.6` | denied |
| Auditor | `swarm-auditor` | `opencode-go/qwen3.6-plus` | denied |
| QA | `swarm-qa` | `opencode-go/deepseek-v4-flash` | denied |

## Repo-side swarm behavior fixes

These repo files implement the local UI/runtime behavior that complements the global prompt/config:

- `src/views/SwarmControl.jsx` — listens for scoped `director-feed` SSE events and refreshes the visible control-room snapshot only for the active mission.
- `src/app/api/agenthub/sessions/stream/route.js` — emits `director-feed` events for the SwarmControl stream.
- `src/components/TerminalTTY.jsx` — routes paste into the visible terminal session, including native-renderer paste flow.
- `src/lib/terminal/nativeVteBridge.js` — bridges native VTE paste for visible terminal panels.

## Verified prompt source paths from global OpenCode config

Only prompt path references verified directly from `~/.config/opencode/opencode.json` are listed below.

| Agent                 | Prompt source                                        |
| --------------------- | ---------------------------------------------------- |
| `gentle-orchestrator` | `~/.config/opencode/prompts/swarm/swarm-director.md` |
| `swarm-director`      | `~/.config/opencode/prompts/swarm/swarm-director.md` |
| `swarm-coder`         | `~/.config/opencode/prompts/swarm/swarm-coder.md`    |
| `swarm-devops`        | `~/.config/opencode/prompts/swarm/swarm-devops.md`   |
| `swarm-architect`     | `~/.config/opencode/prompts/swarm/swarm-architect.md` |
| `swarm-auditor`       | `~/.config/opencode/prompts/swarm/swarm-auditor.md`  |
| `swarm-explorer`      | `~/.config/opencode/prompts/swarm/swarm-explorer.md` |
| `swarm-qa`            | `~/.config/opencode/prompts/swarm/swarm-qa.md`       |
| `swarm-reviewer`      | `~/.config/opencode/prompts/swarm/swarm-reviewer.md` |

## Why this repo copy exists

- Survives push/review even though runtime source currently lives outside the repo.
- Makes current swarm assumptions auditable alongside the code that implements director-feed visibility and terminal paste behavior.
- Reduces future drift when repo behavior and global prompt/config need to be compared.
