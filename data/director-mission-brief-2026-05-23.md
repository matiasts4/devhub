# Director Mission Brief — Feature Delivery Swarm

**Date:** 2026-05-23
**Mission ID:** launch-swarm-delivery-20260523
**Workspace:** `/home/matias/ArxonLabs/devhub`
**Director:** opencode (self) — gentle-orchestrator

## Roster

| Role | Agent Type | Focus Area |
|------|-----------|------------|
| **Director** | gentle-orchestrator (self) | Coordination, evidence collection, handoff |
| **Coder** | swarm-coder | Validate workspace routing, scaffold feature delivery |
| **Auditor** | swarm-reviewer | Audit readiness, detect regressions, report |
| **DevOps** | swarm-explorer | Validate env: git, DB, services, worktrees |
| **Architect** | swarm-explorer | Validate architecture, workspace isolation, routing |

## Mission Objective

Validate that each agent terminal opens in the correct workspace (`/home/matias/ArxonLabs/devhub`), confirm swarm delivery infrastructure is operational, and leave durable handoff evidence.

## Constraint

- All agents report **workspace path** and **cwd** in their evidence
- Evidence must be written to `data/` directory
- Director collects all evidence, validates handoff, and closes mission

## Phase Gates

1. **Phase 1 — Briefing** (✅ THIS DOCUMENT)
2. **Phase 2 — Delegation** → Launch Coder, Auditor, DevOps, Architect in parallel
3. **Phase 3 — Evidence Collection** → Collect reports, validate workspace correctness
4. **Phase 4 — Handoff** → Write final handoff evidence

---

**Status:** 🟢 MISSION BRIEFED — Awaiting worker delegation
