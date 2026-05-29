# Delta for Swarm-SDD Integration

## ADDED Requirements

### Requirement: M1 — Swarm Prompts Enable SDD Phase Execution

The system MUST redesign all 8 swarm role prompts (`~/.config/opencode/prompts/swarm/*.md`) to remove "Do NOT start SDD workflows" prohibitions and add phase contract instructions enabling each role to execute its corresponding SDD phase.

Each prompt MUST include: (a) Phase Contract listing executable SDD phases for that role; (b) Context Budget instruction of ~8k tokens max per agent session; (c) Reactivation Contract describing how to continue a session after interruption; (d) Variable interpolation support for `{{change_name}}`, `{{phase}}`, `{{artifacts}}`, `{{mission_id}}`, `{{role}}`, `{{session_id}}`.

#### Scenario: Director prompt enables SDD phases

- GIVEN Director is launched with `{{change_name}}=auth-overhaul`
- WHEN prompt is interpolated
- THEN Director sees phase contract: can execute sdd-explore, sdd-propose, sdd-design
- AND can trigger sdd-spec, sdd-tasks, sdd-apply via worker agents

#### Scenario: Coder prompt enables apply phase

- GIVEN Coder is launched with `{{phase}}=sdd-apply` and `{{artifacts}}=spec/design`
- WHEN context manager injects spec and design artifacts
- THEN Coder executes implementation following TDD cycle

#### Scenario: Prompt variable interpolation

- GIVEN swarm role prompt contains `{{mission_id}}` and `{{session_id}}`
- WHEN agent is launched via `buildAgentLaunchCommand`
- THEN all variables are resolved before prompt delivery

### Requirement: M2 — Context Manager for Role-Specific Artifact Injection

The system MUST provide a Context Manager module that injects ONLY relevant artifacts per role. The module MUST support variable interpolation, enforce ~8k token context budget, and provide 200–400 token summary handoffs between phases.

#### Scenario: Architect receives only design-relevant artifacts

- GIVEN `{{role}}=architect` and `{{phase}}=sdd-design`
- WHEN Context Manager resolves artifacts
- THEN only proposal and spec are injected
- AND total context stays under 8k tokens

#### Scenario: QA receives verify-relevant artifacts

- GIVEN `{{role}}=qa` and `{{phase}}=sdd-verify`
- WHEN Context Manager resolves artifacts
- THEN only spec, design, tasks are injected
- AND 200-400 token summary of previous phase is prepended

### Requirement: M3 — Reactivation System with Persistent Session

The system MUST add `--session` flag to `buildAgentLaunchCommand` in `src/lib/agentLaunchCommand.js`, generate a persistent sessionId per agent, and provide `POST /api/agenthub/swarm/{missionId}/message` endpoint for Director handoff between phases.

The system MUST persist agent status in Engram and provide a Director handoff protocol that transfers context between SDD phases without losing work.

#### Scenario: Agent resumes with existing session

- GIVEN agent was interrupted during `sdd-apply` with `session_id=abc123`
- WHEN agent is reactivated with `--session abc123`
- THEN agent resumes from last checkpoint with full context

#### Scenario: Director sends message to worker

- GIVEN Director completes `sdd-propose` and needs to hand off to Coder for `sdd-apply`
- WHEN Director POSTs to `/api/agenthub/swarm/{missionId}/message` with `recipient=swarm-coder`
- THEN Coder receives interpolated prompt with phase context and session continuity

### Requirement: M4 — Worktree Sync Between SDD Phases

The system MUST maintain a `phase_branch_map` table in SQLite and implement git merge logic so that when the architect completes `sdd-design` and the coder starts `sdd-apply`, the coder's worktree reflects the design artifacts.

The system MUST auto-cleanup worktrees post-archive.

#### Scenario: Worktree branch advances with phase

- GIVEN architect finishes `sdd-design` and phase changes to `sdd-apply`
- WHEN Director triggers worktree sync
- THEN coder's worktree branch is updated with design artifacts
- AND git state reflects new phase

#### Scenario: Post-archive worktree cleanup

- GIVEN SDD change is archived via `sdd-archive`
- WHEN cleanup runs
- THEN all phase worktrees are removed
- AND `phase_branch_map` entries are deleted

### Requirement: M5 — Model Consolidation to opencode-go/minimax-m2.7

The system MUST consolidate all swarm profile model aliases to `opencode-go/minimax-m2.7`, detect TDD mode via test runner discovery, and include TDD cycle evidence in `apply-progress`.

#### Scenario: All swarm profiles use unified model

- GIVEN swarm launches with any role (director, coder, architect, etc.)
- WHEN agent launches via `buildAgentLaunchCommand`
- THEN model resolves to `opencode-go/minimax-m2.7` for all 8 profiles

#### Scenario: TDD detection in apply phase

- GIVEN `sdd-apply` runs and `strict_tdd=true` in openspec/config.yaml
- WHEN apply executes
- THEN test runner is discovered (Jest/Playwright)
- AND RED-GREEN-REFACTOR cycle evidence is captured in `apply-progress.md`

### Requirement: M6 — DevHub UI Phase Tracking

The DevHub UI MUST display phase badges on agent cards, provide a Reactivate button that POSTs to the message endpoint, list artifacts per change, show a task timeline with SDD phases, and indicate agent status (idle/active/completed).

#### Scenario: Agent card shows phase badge

- GIVEN swarm is running with active agents
- WHEN Swarm Control UI renders
- THEN each agent card shows current SDD phase badge (e.g., "sdd-design", "sdd-apply")
- AND status indicator reflects agent state

#### Scenario: Reactivate button sends message

- GIVEN agent is idle but session exists
- WHEN operator clicks Reactivate on agent card
- THEN POST to `/api/agenthub/swarm/{missionId}/message` with `session_id` and continuation prompt
- AND agent resumes with context budget

#### Scenario: Artifact list view

- GIVEN change has proposal, spec, design, tasks artifacts
- WHEN operator opens change detail
- THEN all artifacts are listed with type, phase, and timestamp
- AND clicking navigates to relevant artifact