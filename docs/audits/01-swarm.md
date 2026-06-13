# Audit Report: SWARM Agent System

**Audited**: 2026-05-30
**Auditor**: Workflow — 4 sub-agents, 295k tokens
**Status**: 🔴 Critical bugs found

---

## Files Analyzed

| File                                                 | Purpose                                              |
| ---------------------------------------------------- | ---------------------------------------------------- |
| `src/lib/sdd/SwarmPromptEngine.js`                   | Dual-mode prompt engine (Standard vs Phase Contract) |
| `src/lib/swarm/queue.js`                             | Hybrid in-memory + SQLite durable queue              |
| `src/lib/swarm/integrationWorktree.js`               | Temporary git worktrees for merge/review             |
| `src/lib/swarm/terminateLaunch.js`                   | Session termination and cleanup                      |
| `src/lib/swarm/missionClose.js`                      | Mission completion with evidence enforcement         |
| `src/lib/operations/swarmControl.js`                 | Control room status operations                       |
| `src/views/SwarmControl.jsx`                         | SwarmControl React view                              |
| `src/components/control-room/SwarmTopologyGraph.jsx` | Agent topology visualization                         |
| `src/components/SwarmReactivateButton.jsx`           | Session reactivation button                          |
| `src/lib/agentLaunchCommand.js`                      | Agent launch command builder                         |
| `src/views/AgentHub.jsx`                             | AgentHub main view                                   |

---

## 🔴 CRITICAL — Reactivation Contract Placeholders Never Interpolated

**File**: `src/lib/sdd/SwarmPromptEngine.js`
**Lines**: ~97-115, ~142-148

### Root Cause

`buildPhaseContractSection()` injects `contract.reactivationContract` as a **raw string** without calling `interpolate()`. Since `buildPhaseContractPrompt()` only interpolates the `preamble`, all `{{mission_id}}` and `{{session_id}}` placeholders in reactivation contracts remain as literal text in the final prompt.

### Evidence

```javascript
// buildPhaseContractSection (lines 97-115)
function buildPhaseContractSection(role, phase) {
  const contract = PHASE_CONTRACTS[role] || PHASE_CONTRACTS.coder;
  // ...
  let section = `...Reactivation: ${contract.reactivationContract}`; // raw, no interpolate()
  return section; // NOT interpolated
}

// buildPhaseContractPrompt calls interpolate only on preamble:
const interpolatedPreamble = interpolate(preamble, interpolatedVars);
// contractSection is NOT interpolated:
const contractSection = buildPhaseContractSection(role, phase);
```

`PHASE_CONTRACTS.director.reactivationContract`:

```javascript
reactivationContract: 'Re-resolve {{mission_id}} and continue from last checkpoint. Check session_id for prior context.',
```

`{{mission_id}}` and `{{session_id}}` appear **verbatim** in reactivation prompts.

### Impact

When a swarm agent is reactivated from a checkpoint, it receives a prompt where the mission and session IDs are literally the strings `{{mission_id}}` and `{{session_id}}` instead of their actual values. The agent cannot determine its mission context or prior session — **complete context loss on reactivation**.

### Fix

Pass `interpolatedVars` to `buildPhaseContractSection()` and call `interpolate()` on `contract.reactivationContract`:

```javascript
function buildPhaseContractSection(role, phase, interpolatedVars) {
  const contract = PHASE_CONTRACTS[role] || PHASE_CONTRACTS.coder;
  // ...
  const reactivationContract = interpolate(contract.reactivationContract, interpolatedVars);
  let section = `...Reactivation: ${reactivationContract}`;
  return section;
}
```

---

## 🟡 Medium — Dead Zed Identity Placeholder Comment

**File**: `src/lib/sdd/SwarmPromptEngine.js`, lines ~112-113

```javascript
// T-9: Prepend Zed identity block when role is zed
// (Zed role removed — block kept as placeholder for future roles needing identity injection)
```

The Zed role was removed from `PHASE_CONTRACTS` (not present in the enum). The identity block code is gone, but the comment remains as noise. Either implement proper identity injection or remove the comment.

---

## 🟡 Medium — Silent Fallback to `coder` Contract for Unknown Roles

**File**: `src/lib/sdd/SwarmPromptEngine.js`

`buildPhaseContractSection()` falls back to `PHASE_CONTRACTS.coder` for unknown roles silently:

```javascript
const contract = PHASE_CONTRACTS[role] || PHASE_CONTRACTS.coder;
```

A role like `"zed"` (which appears in `SWARM_ROLE_DEFAULT_MODELS` and `buildRoleAgentProfile` mapping) would get the coder contract with no warning. No validation that required PHASE_CONTRACTS entries exist before use.

**Impact**: Wrong agent profile loaded without any indication.

---

## 🟡 Medium — Context Budget Hardcoded in Two Places

**File**: `src/lib/sdd/SwarmPromptEngine.js`, line ~138-139

```javascript
const contextBudgetSection = `## Context Budget\n\nYou MUST keep total prompt + context under ~8000 tokens...`;
```

But `PHASE_CONTRACTS[role].contextBudget` is also set (to 8000) in each contract. If `contextBudget` is ever changed in `PHASE_CONTRACTS`, the prompt text will not reflect it — the values will drift.

---

## 🟡 Medium — `{{session_id}}` Placeholder Used as Literal String

**File**: `src/lib/operations/swarmControl.js`, line ~1857

```javascript
session_id: '{{session_id}}',
```

This placeholder is intended to be resolved by the agent runtime or a downstream interpolation step. But `SwarmPromptEngine.interpolate()` leaves unknown vars as-is, so `{{session_id}}` appears literally in the preamble template. This is fragile and relies on implicit downstream resolution — no explicit contract for who resolves this placeholder.

---

## Architecture Strengths

- **Clean separation** between Standard mode and Phase Contract mode
- **Durable queue** with in-memory + SQLite hybrid — survives restarts
- **Evidence enforcement** in `missionClose.js` — never completes without merge/handoff decision
- **Integration worktree isolation** — each agent gets an isolated git worktree
- **Role metadata extraction** (`swarmRoleMeta.js`) — no React dependencies, pure helpers

---

## Recommendations

1. **Fix reactivation contract interpolation** (CRITICAL — blocks reactivation from working)
2. Remove dead T-9 comment or implement proper identity injection
3. Add validation/warning for unknown roles falling back to coder
4. Extract context budget to a single source of truth
5. Document the `{{session_id}}` resolution contract explicitly
6. Add integration test for reactivation flow with actual `{{mission_id}}`/`{{session_id}}` values
