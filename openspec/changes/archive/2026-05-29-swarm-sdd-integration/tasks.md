# Tasks: Swarm-SDD Integration

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~3,200 (1,600 new + 1,600 modified) |
| 400-line budget risk | High |
| Chained PRs recommended | No |
| Suggested split | Single PR — direct commits to current branch |
| Delivery strategy | single-pr |
| Chain strategy | size:exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size:exception
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Branch | Notes |
|------|------|--------|-------|
| 1 | Foundation + Swarm Core + UI + Prompts | same branch | All milestones in one PR; user confirmed single branch |

## Phase 1: SDD Library Foundation (M1–M4 Core)

- [x] 1.1 Create `src/lib/sdd/SwarmPromptEngine.js` — `buildPhaseContractPrompt(role, phase, vars)` with variable interpolation for `{{change_name}}`, `{{phase}}`, `{{artifacts}}`, `{{mission_id}}`, `{{role}}`, `{{session_id}}`; Phase Contract sections per role
- [x] 1.2 Create `src/lib/sdd/ContextManager.js` — `filterArtifacts(role, phase, tokenBudget)`, `countTokens(content)`, `produceSummaryHandoff(artifacts)`; 8k token budget enforcement; role-specific artifact filtering per spec M2
- [x] 1.3 Create `src/lib/sdd/SessionPersistence.js` — `persistSession({sessionId, agentId, phase, artifacts})`, `reactivateSession({sessionId})`; SQLite `swarm_sessions` table schema; Engram sync for agent_context
- [x] 1.4 Create `src/lib/sdd/WorktreeSyncer.js` — `syncPhaseBranch({launchId, phase, worktreePath})`, `mergeWorktrees({integrationPath, roleBranches})`; `phase_branch_map` table operations; auto-cleanup post-archive
- [x] 1.5 Create `src/lib/sdd/ModelConsolidator.js` — `resolveModelAlias(alias)` → `opencode-go/minimax-m2.7`; `canImplementTDD(modelId)` via test runner discovery; `formatTDDEvidence(artifacts)` for apply-progress

## Phase 2: Swarm Core Integration (M3 + M5)

- [x] 2.1 Modify `src/lib/agentLaunchCommand.js` — add `--session {sessionId}` flag to opencode case; pass sessionId from options; call `SessionPersistence.persistSession()` on launch
- [x] 2.2 Modify `src/lib/operations/swarmControl.js` — add `buildRoleAgentProfile(role, changeName, phase)` mapping to SwarmPromptEngine; wire phase-specific prompt interpolation into `buildAgentLaunchCommand`
- [x] 2.3 Add `SDD_ENABLED=true` env-var guard in `buildAgentLaunchCommand` so swarm prompts remain standard unless SDD is active; implement feature-flag per launch

## Phase 3: DevHub UI (M6)

- [x] 3.1 Create `src/app/api/swarm-phase-events/route.js` — SSE endpoint streaming `phase_transition`, `agent_status`, `artifact_saved` events; fallback to 5s polling via `useswarmPhaseEvents` hook
- [x] 3.2 Create `src/components/SwarmPhaseBadge.jsx` — React badge showing current SDD phase (e.g. "sdd-design", "sdd-apply"); color-coded by phase type; accepts `phase`, `status` props
- [x] 3.3 Create `src/components/SwarmReactivateButton.jsx` — React button POSTing to `/api/agenthub/swarm/{missionId}/message` with `session_id` + continuation prompt; disabled when no session exists
- [x] 3.4 Modify `src/views/workspacePageChrome.js` — add phase timeline widget showing all 6 SDD phases in order; artifact list per change with type/phase/timestamp; agent status indicators (idle/active/completed) on swarm cards

**Note:** 3.4 also includes creation of `src/app/api/agenthub/swarm/[missionId]/message/route.js` for the reactivation endpoint, and style helpers in `workspacePageChrome.js`. Full agent card integration with `SwarmPhaseBadge` requires data model changes to the control room snapshot (agent phase field not yet in snapshot data).

## Phase 4: Swarm Prompts Redesign (M1)

- [x] 4.1 Rewrite `~/.config/opencode/prompts/swarm/swarm-director.md` — remove "Do NOT start SDD workflows"; add Phase Contract (sdd-explore, sdd-propose, sdd-design executable; sdd-spec, sdd-tasks, sdd-apply via workers); add Context Budget (~8k tokens), Reactivation Contract, `{{mission_id}}`/`{{session_id}}` interpolation
- [x] 4.2 Rewrite `swarm-architect.md` — add Phase Contract (sdd-design primary; can trigger sdd-spec via Director); remove SDD prohibition; add `{{change_name}}`, `{{artifacts}}` interpolation
- [x] 4.3 Rewrite `swarm-coder.md` — add Phase Contract (sdd-apply primary; RED-GREEN-REFACTOR cycle support); remove SDD prohibition; add `{{phase}}`, `{{artifacts}}` interpolation; TDD evidence capture
- [x] 4.4 Rewrite `swarm-explorer.md` — add Phase Contract (sdd-explore primary; returns compressed handoff); remove SDD prohibition; add `{{change_name}}` interpolation
- [x] 4.5 Rewrite `swarm-qa.md` — add Phase Contract (sdd-verify primary; can audit any phase); remove SDD prohibition; add `{{phase}}`, `{{artifacts}}` interpolation
- [x] 4.6 Rewrite `swarm-reviewer.md` — add Phase Contract (sdd-verify review subtask; post-apply code review); remove SDD prohibition; add artifact context interpolation
- [x] 4.7 Rewrite `swarm-devops.md` — add Phase Contract (sdd-apply worktree management; post-archive cleanup); remove SDD prohibition; add worktree/phase sync awareness
- [x] 4.8 Rewrite `swarm-auditor.md` — add Phase Contract (cross-phase audit; sdd-archive readiness check); remove SDD prohibition; add artifact review interpolation

## Phase 5: Testing + Verification

- [x] 5.1 Unit: `src/lib/sdd/__tests__/SwarmPromptEngine.test.js` — variable interpolation, Phase Contract generation per role
- [x] 5.2 Unit: `src/lib/sdd/__tests__/ContextManager.test.js` — token counting, artifact filtering, summary handoff under 8k budget
- [x] 5.3 Unit: `src/lib/sdd/__tests__/ModelConsolidator.test.js` — alias resolution to minimax-m2.7, TDD capability detection
- [x] 5.4 Integration: `src/lib/sdd/__tests__/SessionPersistence.integration.test.js` — SQLite persist + Engram sync, session reactivation
- [x] 5.5 Integration: `src/lib/sdd/__tests__/WorktreeSyncer.integration.test.js` — phase branch map, worktree merge, cleanup
- [x] 5.6 E2E: `tests/e2e/swarm-sdd-launch.test.js` — Playwright test suite covering SSE events, reactivation endpoint, phase contracts, context injection, worktree path, prompt loading

## Phase 6: Cleanup

- [x] 6.1 Wire `engramSync` stub in SessionPersistence — Created `src/lib/sdd/engramSync.js` with `engram_mem_save`, `engram_mem_search`, `engram_mem_get_observation`, `engram_mem_session_summary`; connects to Engram MCP via `POST /api/mcp/engram` proxy; SessionPersistence.syncSessionToEngram() now calls the real Engram MCP instead of a stub
- [x] 6.2 Add `phase` field to control room snapshot data model — Added `phase: agent.phase || null` to `normalizeAgent()` in `swarmControl.js`; added `phase` to roster items in `buildActiveRoster()` for both participant and agent-card paths; enables `SwarmPhaseBadge` on agent cards in DevHub UI
- [x] 6.3 Update DevHub MCP tasks/milestones — Marked all 6 DevHub MCP milestones as "completed" (M1 prompts, M2 reactivate, M2 context manager, M3 model consolidation, M4 worktree sync, M4 DevHub view); swarm-SDD integration feature work is complete
