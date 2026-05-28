# Exploration: Session Resume + Swarm Stability

## Context

Source plan: docs/27_Session_Resume_Swarm_Stability_Plan.md.

The plan identifies three mixed state domains that currently drift independently:
- UI workspace state
- terminal runtime state
- agent/swarm runtime state

## Current State (verified)

- Workspace layout persistence exists in `TerminalWorkspacesManager` and local state helpers.
- Reboot-safe OpenCode resume already has a dedicated change (`terminal-session-restore-post-reboot`) and tests.
- Runtime process visibility exists in `/api/swarm/processes`.
- Terminal visibility exists in `/api/terminal/sessions`.
- No single endpoint gives a reconciled snapshot with canonical statuses across terminals/processes/registry/runs/missions.

## Gaps

1. Observability gap: debugging requires checking multiple endpoints/logs manually.
2. Status vocabulary drift: each surface interprets "alive" differently.
3. Reconciliation gap: topology/control cannot reliably explain white/blank terminal panels.

## First Slice Decision

Start with Milestone 1 only:
- RESUME-SWARM-01: unified runtime diagnostics endpoint.
- RESUME-SWARM-02: canonical status normalization utility.

This is low-risk and unlocks every later milestone (manifest, startup coordinator, auto-resume policies).

## Notes

Strict-TDD-compatible slice: implement pure status classifier + thin API route with mocked dependencies.
