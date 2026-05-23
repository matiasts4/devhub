# Archive Report: cli-1-scaffold-entrypoint

**Change**: cli-1-scaffold-entrypoint
**Archived**: 2026-05-23
**Archived to**: `openspec/changes/archive/2026-05-23-cli-1-scaffold-entrypoint/`
**Mode**: Hybrid (Engram + OpenSpec filesystem)
**Verdict**: PASS

## Summary

Created minimal CLI scaffold (`devhub-cli/`) for DevHub Fase 14. Provides arg parsing via Commander, version/help output, exit code contract (0/1/2), terminal formatter with TTY detection, and barrel re-export of shared durable-read core. All commands are stubs — no command logic implemented.

## Specs Synced

| Domain | Action | Details |
|--------|--------|---------|
| cli-entrypoint | Created | 8 requirements, 13 scenarios — new capability, no merge needed |

## Archive Contents

| Artifact | Status |
|----------|--------|
| proposal.md | ✅ |
| specs/cli-entrypoint/spec.md | ✅ |
| design.md | ✅ |
| tasks.md | ✅ (14/14 complete) |
| verify-report.md | ✅ |

## Verification Summary

- **Tests**: 9/9 passing (Jest + spawnSync)
- **Spec scenarios**: 13/13 covered
- **TDD compliance**: 6/6 checks passed (strict RED→GREEN confirmed)
- **Tasks**: 14/14 complete
- **CRITICAL issues**: 0
- **WARNING**: 1 (ESLint config gap for CommonJS sub-package — non-blocking)

## Source of Truth Updated

- `openspec/specs/cli-entrypoint/spec.md` — created (new domain)

## Engram Observation IDs (traceability)

| Artifact | Obs ID |
|----------|--------|
| proposal | #5320 |
| spec | #5321 |
| design | #5322 |
| tasks | #5323 |
| apply-progress | #5324 |
| verify-report | #5325 |

## Lessons Learned

1. **Subprocess testing limits coverage tracking**: Using `child_process.spawnSync` for exit-code verification means Jest coverage cannot track `cli.js` execution. This is expected and correct — runtime behavior is fully verified.
2. **CommonJS sub-package needs ESLint isolation**: Root ESLint config is ESM and produces false-positive `no-undef` errors on CommonJS globals (`require`, `module`, `process`). Solution: ignore `devhub-cli/` in root config or add local config.
3. **Barrel re-export pattern works cleanly**: Single-line `module.exports = require(...)` successfully re-exports all 5 functions from shared core with zero added logic.

## SDD Cycle Complete

The change has been fully planned, implemented, verified, and archived.
Ready for the next change.
