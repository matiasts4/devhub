# DevHub agent operating guide

Use this guide when working in this DevHub repository.

## DevHub MCP routing

DevHub MCP is the operational planning layer for this project. Use it proactively when the user asks about:

- project planning, roadmap, milestones, prioritization, execution queues, or task tracking;
- coordinating multiple agents/workers;
- checking project status before choosing what to implement next;
- recording progress on a task that belongs to DevHub planning.

Do **not** call DevHub MCP blindly for every coding turn. For small isolated code edits, inspect the repo and run tests normally. If the work changes project direction, creates follow-up tasks, affects roadmap, or needs coordination, update DevHub MCP.

Recommended flow:

1. Use Engram first for durable memory/context from previous sessions when it is available.
2. Use DevHub MCP for the current operational state: projects, tasks, milestones, execution queue, comments, and evidence.
3. For structural code exploration: **Graphify first** (`graphify query` / `path` / `explain` against `graphify-out/graph.json`). Only then fall back to codegraph, lean-ctx, or targeted grep on the `source_file`s the graph returned.
4. Save durable learnings/decisions back to Engram; save execution state/progress back to DevHub MCP.
5. Use the `devhub` CLI for runtime coordination: claims, leases, heartbeats, presence, and swarm operations.

## Tool intent

- `list_projects`, `get_project`, `get_project_context`: orient before planning.
- `bulk_create_tasks`, `bulk_create_milestones`: turn plans/roadmaps into structured work.
- `get_execution_queue`: select the next executable task.
- `update_task`, `add_task_comment`, `update_milestone`: report progress and outcomes.
- `devhub claim` / `devhub release`: claim and release execution leases.
- `devhub heartbeat`, `devhub update-status`, `devhub presence`, `devhub swarm-launch`: coordinate multi-agent runs.

The supported public MCP catalog is defined by `devhub-mcp/README.md` and enforced
by `devhub-mcp/tests/integration/tools-list.test.js`. Do not infer tools from
legacy harnesses or old planning documents.

## Daily / weekly cadence

Canonical detail lives in `devhub-mcp/AGENT-FLOW.md`. Minimum loop for this repo:

1. Orient with `get_project_context` / `get_execution_queue` (or `devhub queue`).
2. Claim one task (`devhub claim`), leave an intent comment, do the work.
3. Record decisions/blockers with `add_task_comment`; close only with `[git:checkpoint]`.
4. Release the lease (`devhub release`). Do not accept significant work without a DevHub task.
5. Weekly: review blocked/stale tasks, idle milestones, and plans without a linked task.

## Project Skills

The following skills are shipped inside this repo and should be loaded when the task context matches their trigger:

- `graphify` — `.agents/skills/graphify/SKILL.md`: Trigger on `/graphify`, rebuilds/updates, or any architecture / “how does X work?” / relationship question when `graphify-out/` exists (query first; see ## graphify).
- `devhub-morphology` — `skills/devhub-morphology/SKILL.md`: Trigger when adding, removing, or modifying a DevHub morphology (registry entry, CSS token block, selector wiring, factory usage, tests, and common pitfalls).

## Safety

- Never invent project/task IDs. Read them from DevHub MCP first.
- Prefer idempotent bulk tools for generated plans.
- Do not mark work completed unless it was verified.
- Git gate before `completed`/`qa-ready`: run `git status --short`, require a local checkpoint commit if files changed, and leave a `[git:checkpoint]` comment with `commit=<sha|none>`, docs, checks, and working-tree status.
- `commit=none` is valid only for analysis/investigation tasks with zero file changes.
- Do not push automatically; push only when a human asks or when publishing the task branch is operationally necessary for QA/handoff.
- Keep Engram and DevHub distinct: Engram is memory; DevHub is planning/execution state.

## graphify

This project has a **large** knowledge graph under `graphify-out/` (~tens of thousands of nodes). Using it correctly saves tokens and finds symbols faster than broad grep/read.

Skill (full pipeline / rebuilds): `.agents/skills/graphify/SKILL.md` (also user: `~/.grok/skills/graphify/`).  
CLI (Windows): `graphify` on PATH (`%USERPROFILE%\.local\bin\graphify.exe`).  
Interpreter pointer: `graphify-out/.graphify_python` (uv tool `graphifyy`).

When the user types `/graphify`, load the graphify skill before doing anything else.

### Always-on rules (token-cheap navigation)

1. **Graph first for codebase questions.** If `graphify-out/graph.json` exists and the user asks about architecture, “how does X work?”, “what calls Y?”, data flow, ownership, or where something lives — run Graphify **before** broad grep, full-file reads, or loading large reports.
2. **Prefer CLI over MCP.** Default tools (lightweight, no extra process):
   - `graphify query "<question>"` — broad neighborhood (BFS). Add `--dfs` for deep chains. Cap size with `--budget 800`–`2000` on this repo (default can still be large).
   - `graphify path "<A>" "<B>"` — shortest relationship path.
   - `graphify explain "<concept>"` — one node + neighbors.
3. **Never** open or stream `graphify-out/graph.json` whole into context (~40MB). Never dump the full `GRAPH_REPORT.md` unless the user asked for an architecture audit; if needed, read only God Nodes / Surprising Connections / Suggested Questions (head of report or targeted sections).
4. **Answer from the subgraph only.** Cite `source_file` + `source_location` and edge confidence (`EXTRACTED` / `INFERRED` / `AMBIGUOUS`). Do not invent edges. If the graph is thin, say so, then open only the files the graph pointed to.
5. **Query wording.** Graph matching is literal/substring on labels (no synonyms inside the binary). Prefer **code identifiers and English labels** present in the repo (`rightDockState`, `TerminalWorkspacesManager`, `claim_next_task`). For Spanish questions, expand to those tokens before querying. If zero hits, rephrase with identifiers from a second query or a narrow path/explain — do not fall back to whole-repo grep as the first retry.
6. **Skip Graphify only when:** the task is pure formatting/typo, the user forbids it, or the work is only about fixing a broken/stale graph. Dirty `graphify-out/` after hooks/updates is normal and **not** a reason to skip.
7. **After meaningful code edits** (new modules, renames, wiring changes): run `graphify update .` (AST-only, no API cost) so the graph stays usable. Do not rebuild the full corpus unless asked or the graph is missing.
8. **Optional wiki:** if `graphify-out/wiki/index.md` exists later, use it for broad navigation before raw source walks.
9. **MCP is optional.** `graphify-mcp` / `python -m graphify.serve` exists but is heavier. Prefer CLI unless MCP is already connected and the task needs fine-grained tools (`get_neighbors`, etc.).
