# Director Coordination Plan — RESUME-SWARM Feature Delivery

**Date:** 2026-05-23
**Director:** opencode (self)
**Plan doc:** `docs/27_Session_Resume_Swarm_Stability_Plan.md`
**Worktree:** `.plyrium-forge/worktrees/swarm-feature-delivery`
**Branch:** `main` @ `1b78c8f`

---

## Task Assignment Matrix

| # | Task | Priority | Score | Assigned To | Rationale |
|---|------|----------|-------|-------------|-----------|
| 01 | Crear diagnóstico unificado de runtime | critical | 4.603 | **Coder** | Implementation-heavy: new API endpoint, log parsing, crash dump aggregation |
| 02 | Normalizar estados de terminal/agente/proceso | critical | 4.303 | **Architect** | Design-heavy: state machine definition, canonical states, cross-component contract |
| 03 | Diseñar e implementar Restore Manifest versionado | critical | 4.603 | **Coder** | Implementation: schema, atomic writer, debounce, serialization tests |
| 04 | Persistir identidad panel-terminal-agente | high | 3.903 | **DevOps** | Infrastructure: durable mapping layer, DB schema, migration from localStorage |
| 05 | Implementar Startup Restore Coordinator | critical | 4.603 | **Coder** | Implementation: boot sequence, manifest loader, reconciliation logic |

## Dependency Graph (execution order)

```
PHASE 1 (parallel):
  ├─ RESUME-SWARM-01 (Coder) — diagnóstico runtime
  └─ RESUME-SWARM-02 (Architect) — estados canónicos

PHASE 2 (depends on Phase 1):
  ├─ RESUME-SWARM-03 (Coder) — restore manifest (needs 01 + 02)
  └─ RESUME-SWARM-04 (DevOps) — identidad durable (needs 02)

PHASE 3 (depends on Phase 2):
  └─ RESUME-SWARM-05 (Coder) — startup coordinator (needs 03 + 04)
```

## Agent Roles & Responsibilities

### Director (self)
- Coordinate phases, resolve blockers
- Collect handoff evidence from each agent
- Write final delivery report
- Gate each phase transition (no Phase 2 until Phase 1 evidence received)

### Coder
- **RESUME-SWARM-01**: Create `/api/runtime/diagnostic` endpoint (read-only snapshot)
- **RESUME-SWARM-03**: Implement RestoreManifest schema + atomic writer + tests
- **RESUME-SWARM-05**: Build StartupRestoreCoordinator hook/module
- Deliverables: code changes, unit tests, API response samples

### Architect
- **RESUME-SWARM-02**: Define canonical state enum, state transition rules, cross-component contract
- Deliverables: state machine spec, type definitions, migration guide for existing components

### Auditor (standby — validation phase)
- Validate each deliverable against acceptance criteria from plan doc
- Check for regression in existing terminal/swarm behavior
- Verify no duplicate process creation risk
- Deliverables: audit reports per phase

### DevOps
- **RESUME-SWARM-04**: Implement durable identity mapping in DB, migrate from localStorage
- Validate worktree isolation, branch naming, CI pipeline
- Deliverables: migration script, env validation report

## Evidence Collection Protocol

Each agent must write evidence to `data/` before phase gate:

| Agent | Evidence File |
|-------|---------------|
| Coder-01 | `data/evidence-resume-swarm-01.md` |
| Architect-02 | `data/evidence-resume-swarm-02.md` |
| Coder-03 | `data/evidence-resume-swarm-03.md` |
| DevOps-04 | `data/evidence-resume-swarm-04.md` |
| Coder-05 | `data/evidence-resume-swarm-05.md` |
| Auditor | `data/auditor-evidence-resume-swarm-{phase}.md` |

Evidence must include:
- Files changed (paths)
- Acceptance criteria check (pass/fail)
- Git checkpoint commit sha
- Known issues or deferred items

## Phase Gates

**Gate 1 → 2:** Both 01 and 02 evidence received + Auditor sign-off
**Gate 2 → 3:** Both 03 and 04 evidence received + Auditor sign-off
**Final:** 05 evidence received + full Auditor validation + Director delivery report

## Constraints

- All work on worktree `swarm-feature-delivery`
- No direct commits to `main`
- No code changes outside assigned task scope
- Phase gates are hard barriers — no skipping

---

## Status: READY

Director is ready to receive reports from workers.
Awaiting Phase 1 kickoff signals from Coder (01) and Architect (02).
