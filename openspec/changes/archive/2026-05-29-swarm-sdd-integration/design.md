# Design: Swarm-SDD Integration

## Technical Approach

Enable swarm roles (Director, Builder, QA, etc.) to execute SDD phases natively by redesigning prompts, injecting role-specific artifacts, adding session persistence, syncing worktrees across phases, and consolidating to MiniMax 2.7 with DevHub UI for phase tracking.

## Architecture Decisions

### Decision: Dual-mode prompt structure

**Choice**: Standard prompt (standard SDD workflow) vs Phase Contract prompt (role-specific SDD phase)
**Alternatives considered**: Single unified prompt with conditional branches — rejected; creates fragile interpolation order
**Rationale**: Phase Contract separates what the role MUST do from what it MAY do, enabling role-specific injection without complexity

### Decision: ContextManager as token-budget enforcer

**Choice**: Centralized ContextManager class that counts tokens, filters artifacts by role, and produces a compressed summary handoff
**Alternatives considered**: Distribute filtering logic across skill files — rejected; creates inconsistent behavior across roles
**Rationale**: Enforces MiniMax 2.7's ~8k token budget consistently; role-specific filtering ensures each agent gets only what it needs

### Decision: Session persistence via `--session` flag + SQLite + Engram

**Choice**: Agents launched with `--session {sessionId}`; session state stored in `swarm_sessions` table; Engram stores agent_context for handoff
**Alternatives considered**: Store all session state in SQLite only — rejected; Engram provides cross-session recall for role handoffs
**Rationale**: The existing `resumableSessionFixtures.js` already defines the schema; extending it with sessionId aligns with current patterns

### Decision: Phase-branch map for worktree isolation + sync

**Choice**: `phase_branch_map` table in SQLite tracks which worktree has which SDD phase's changes; Director merges via integration worktree
**Alternatives considered**: Shared filesystem between worktrees — rejected; isolation is a hard constraint
**Rationale**: `integrationWorktree.js` already implements merge logic; adding phase tracking extends it without reinventing

### Decision: Model consolidation via alias resolution layer

**Choice**: `model_alias_map` table + `resolveModelAlias()` function; strict TDD detection via `can_implement_tdd()` capability check
**Alternatives considered**: Hard-code model selection per role in prompt templates — rejected; inflexible and duplicative
**Rationale**: `agentLaunchCommand.js` line 37 already defaults to `sdd-orchestrator`; adding alias resolution there is a minimal change

### Decision: DevHub UI using SSE for real-time agent status

**Choice**: `swarm-phase-events` SSE endpoint streams phase transitions to React components; fallback to 5s polling
**Alternatives considered**: Polling-only — rejected; UX quality requires near-real-time updates for agent status
**Rationale**: `events/route.js` already exists in the codebase; extending it for phase events is a minimal addition

## Data Flow

```
Swarm Launch → buildRoleAgentProfile() → SDD Phase Contract Prompt
                                        ↓
                               ContextManager.inject(role)
                                        ↓
                               Agent executes phase → artifact saved
                                        ↓
                               Director merges worktrees via integrationWorktree.js
                                        ↓
                               DevHub UI polls /api/swarm-phase-events for status
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/lib/sdd/SwarmPromptEngine.js` | Create | Builds Phase Contract prompts per role; handles variable interpolation |
| `src/lib/sdd/ContextManager.js` | Create | Token budget, artifact filtering, summary handoff |
| `src/lib/sdd/SessionPersistence.js` | Create | `--session` flag, SQLite schema, Engram state sync |
| `src/lib/sdd/WorktreeSyncer.js` | Create | phase_branch_map, merge workflow, conflict resolution |
| `src/lib/sdd/ModelConsolidator.js` | Create | model_alias_map, TDD capability detection, evidence format |
| `src/lib/swarmControl.js` | Modify | Add `buildRoleAgentProfile()` for SDD role→profile mapping |
| `src/lib/agentLaunchCommand.js` | Modify | Add `--session` support; model alias resolution |
| `src/app/api/swarm-phase-events/route.js` | Create | SSE endpoint for real-time phase status |
| `src/components/SwarmPhaseBadge.js` | Create | React badge for current SDD phase |
| `src/components/SwarmReactivateButton.js` | Create | React button to reactivate a session |
| `src/views/workspacePageChrome.js` | Modify | Add phase timeline and artifact list |

## Interfaces / Contracts

```js
// ContextManager
class ContextManager {
  filterArtifacts(role, artifacts, tokenBudget) {}
  countTokens(content) {}
  produceSummaryHandoff(artifacts) {}
}

// SessionPersistence
async function persistSession({ sessionId, agentId, phase, artifacts }) {}
async function reactivateSession({ sessionId }) {}

// WorktreeSyncer
async function syncPhaseBranch({ launchId, phase, worktreePath }) {}
async function mergeWorktrees({ integrationPath, roleBranches }) {}

// ModelConsolidator
function resolveModelAlias(alias) {}
function canImplementTDD(modelId) {}
function formatTDDEvidence(artifacts) {}
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | ContextManager token counting, ModelConsolidator alias resolution | Vitest with fixture files |
| Integration | Session persistence + Engram sync, worktree merge | Integration tests with temp worktrees |
| E2E | Full swarm launch with SDD phase execution | Playwright swarm launch test |

## Migration / Rollout

No migration required. New files only. Feature-flag per swarm launch via `SDD_ENABLED=true` env var until validated.

## Open Questions

- [ ] Should Phase Contract prompts be stored in SQLite or Engram?
- [ ] What is the max token budget per role? Proposal says ~8k for MiniMax 2.7 but needs confirmation.
- [ ] Who approves the Director's merge decision — human or QA agent?