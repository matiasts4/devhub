# RESUME-SWARM-02 — Architect Deliverable: Canonical State Model

**Date:** 2026-05-23
**Agent:** Architect (swarm-feature-delivery)
**Task:** Normalizar estados de terminal/agente/proceso

---

## 1. Canonical State Enum

The system has THREE entity types, each with its own state machine. All states are defined in `src/lib/swarm/runtimeStatus.js` as `RUNTIME_STATUS`.

### 1.1 Terminal States

| State | Meaning | Detection | Transition To |
|-------|---------|-----------|---------------|
| `active` | PTY alive, WebSocket connected, socketCount > 0 | `alive=true && socketCount>0` | `reattachable`, `terminated` |
| `reattachable` | PTY alive but no WebSocket clients | `alive=true && socketCount=0` | `active` (reconnect), `terminated` (PTY dies) |
| `orphaned-terminal` | PTY dead but process still running | `alive=false && hasMatchingProcess=true` | `terminated` (process killed) |
| `terminated` | PTY dead, no process | `alive=false && !hasMatchingProcess` | — (terminal state) |
| `quota-blocked` | Terminal alive but OpenCode blocked by quota | quota signals in logs | `active` (quota renewed), `terminated` |
| `unknown` | Cannot determine state | missing data | any |

### 1.2 Process States

| State | Meaning | Detection | Transition To |
|-------|---------|-----------|---------------|
| `active` | OpenCode process running, terminal attached, registry aware | `hasTerminal=true && hasRegistryAgent=true` | `orphaned-process`, `stale-registry` |
| `orphaned-process` | Process running but no terminal | `!hasTerminal` | `active` (terminal reattached), killed |
| `quota-blocked` | Process alive but hitting quota limits | quota signals in logs | `active` (quota renewed) |
| `unknown` | Process reference exists but data incomplete | `!process` | any |

### 1.3 Registry States

| State | Meaning | Detection | Transition To |
|-------|---------|-----------|---------------|
| `active` | Registry entry matches live process | `hasProcess=true` | `stale-registry` (process dies) |
| `stale-registry` | Registry says agent exists but no process | `!hasProcess && (hasActiveRun || status=idle)` | `terminated` (cleanup), `active` (process restarts) |
| `unknown` | No registry entry or incomplete data | `!agent` | any |

---

## 2. State Transition Diagram

```
TERMINAL:
  active ──(WS disconnect)──→ reattachable ──(WS reconnect)──→ active
     │                            │
     │(PTY dies)                  │(PTY dies)
     ↓                            ↓
  orphaned-terminal ──────────→ terminated
     │
     │(process killed)
     ↓
  terminated

PROCESS:
  active ──(terminal detached)──→ orphaned-process ──(killed)──→ [gone]
     │                               │
     │(quota hit)                    │(terminal reattached)
     ↓                               ↓
  quota-blocked ──(quota renewed)──→ active

REGISTRY:
  active ──(process dies)──→ stale-registry ──(cleanup)──→ [removed]
                                │
                                │(process restarts)
                                ↓
                             active
```

---

## 3. Cross-Component Contract

All components that read or display runtime state MUST use `RUNTIME_STATUS` from `src/lib/swarm/runtimeStatus.js`. No component should define its own state strings.

### 3.1 Consumers

| Component | File | States Used |
|-----------|------|-------------|
| Runtime Diagnostics API | `src/app/api/swarm/runtime-diagnostics/route.js` | all |
| Startup Restore Coordinator | `src/lib/terminal/startupRestoreCoordinator.js` | terminal states |
| Swarm Control Panel | `src/components/SwarmControl.jsx` (implicit) | all |
| TerminalWorkspacesManager | `src/components/TerminalWorkspacesManager.jsx` | terminal states |
| Agent Registry Live | `src/lib/agentRegistryLive.js` | registry states |

### 3.2 Migration Guide

For components that currently define their own state strings:

1. Replace inline state strings with `RUNTIME_STATUS.*` imports
2. Update any `switch` statements to cover all enum values
3. Add `unknown` as default/fallback case

---

## 4. Relationship with Restore Actions

The `RESTORE_ACTION` enum in `startupRestoreCoordinator.js` is NOT the same as `RUNTIME_STATUS`. They serve different purposes:

- `RUNTIME_STATUS` = what IS the current state of an entity
- `RESTORE_ACTION` = what SHOULD we DO about it during restore

Mapping:

| RUNTIME_STATUS | RESTORE_ACTION |
|----------------|----------------|
| `active` | `restore-ready` |
| `reattachable` | `reattach-live-terminal` |
| `orphaned-terminal` | `process-orphan` |
| `terminated` | `terminated` |
| `quota-blocked` | `quota-blocked` |
| (has opencodeSessionId, no terminal) | `resume-opencode-session` |
| (no runtime evidence) | `metadata-stale` |

---

## 5. Observations

1. **RESUME-SWARM-01 already implements the state classification** — `classifyTerminal`, `classifyProcess`, `classifyRegistry` functions exist in `runtimeStatus.js` and cover all required states.

2. **RESTORE_ACTION already maps to RUNTIME_STATUS** — the startup restore coordinator uses the same detection logic.

3. **Gap: no state machine enforcement** — the states are classified but there's no enforcement that transitions follow the diagram above. This is a future hardening item.

4. **Gap: no shared type definitions** — the states are runtime constants, not TypeScript types. Adding JSDoc `@typedef` would help IDE support.

---

## 6. Acceptance Criteria Verification

- [x] Canonical states defined for terminals, processes, and registry
- [x] State transition rules documented
- [x] Cross-component contract specified (single source of truth)
- [x] Migration guide for existing components
- [x] Relationship with restore actions clarified

---

## 7. Recommendations for Next Phases

1. **P0 (from Auditor):** Unify `persistAgentRunMetadata` — the hook version tracks 6 more fields than the manager version. This creates inconsistent metadata.

2. **P1 (from Auditor):** Add `flushingRef` guard to prevent concurrent swarm launches creating overlapping workspaces.

3. **Future:** Add JSDoc type definitions for `RUNTIME_STATUS` to improve IDE support.

4. **Future:** Consider a state machine library (xstate) for enforcement of valid transitions.
