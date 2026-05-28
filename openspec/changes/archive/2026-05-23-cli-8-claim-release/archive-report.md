# Archive Report: cli-8-claim-release

**Change**: `cli-8-claim-release`
**Archived**: 2026-05-23
**Mode**: hybrid (openspec + engram)
**Archived by**: sdd-archive sub-agent

## Summary

CLI claim and release commands fully planned, implemented, verified, and archived.
Adds `devhub claim <agent-id>` and `devhub release <task-id> <token> [--outcome]` to manage task lifecycle leases.

## Specs Synced

| Domain | Action | Details |
|--------|--------|---------|
| cli-claim-command | Created | New spec — 6 requirements, 8 scenarios |
| cli-release-command | Created | New spec — 8 requirements, 11 scenarios |
| cli-entrypoint | Updated | Appended 2 ADDED requirements (Claim + Release registration), 6 scenarios total |

## Archive Contents

- proposal.md ✅
- specs/cli-claim-command/spec.md ✅
- specs/cli-release-command/spec.md ✅
- specs/cli-entrypoint/spec.md ✅ (delta)
- design.md ✅
- tasks.md ✅ (54/54 tasks complete)
- verify-report.md ✅

## Verification Summary

- **Verdict**: PASS WITH WARNINGS
- **Tasks**: 54/54 complete
- **Spec compliance**: 14/14 scenarios (100%)
- **New tests**: 28/28 passing in isolation
- **Critical issues**: None
- **Warnings**: W1 — cross-test DB pollution in full suite; W2 — test count below estimate (pre-existing evolution)

## Source of Truth Updated

The following specs now reflect the new behavior:
- `openspec/specs/cli-claim-command/spec.md` (created)
- `openspec/specs/cli-release-command/spec.md` (created)
- `openspec/specs/cli-entrypoint/spec.md` (updated — claim + release registration requirements appended)

## SDD Cycle Complete

The change has been fully planned, implemented, verified, and archived.
Ready for the next change.
