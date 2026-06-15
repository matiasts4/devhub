# Archive Report — ajustes-cursor-restyle

**Change**: `ajustes-cursor-restyle`
**Archived on**: 2026-06-15
**Branch base**: `task/terminal-pizarra-zed-polish`
**Worktree**: `.worktrees/ajustes-pr1` (branch `feat/ajustes-cursor-restyle-pr1`, 9 commits at `bfbbb90`)
**Mode**: Hybrid (filesystem archive + Engram observation)
**Stack**: PR-1 (restyle + port + spec delta) → PR-2 (cleanup + dead-code removal + archive + skill)
**Chain strategy**: stacked-to-main, base = `task/terminal-pizarra-zed-polish`

---

## Cycle Summary

The `ajustes-cursor-restyle` change restyled the working legacy
settings page (`src/views/Ajustes.jsx`, 7 tabs) to consume the
`[data-morphology]` chrome token layer via `chromeSurfaceStyle`,
`panelStyle`, `pillStyle`, and `btnPrimaryStyle`; ported the six
terminal sub-controls (renderer, typography, header style, accent
bar, restore policies, zoom) from the deprecated new
`src/app/settings/appearance/page.jsx` into the Apariencia tab in
Ajustes; reverted the App-Router settings route block; deleted 1,916
LOC of dead code (9 files); archived the obsolete
`settings-route-canonicalization` spec; and updated the
`devhub-morphology` skill to list Ajustes as the single wiring
point. The change landed as a stacked PR pair (PR-1 + PR-2) inside
a single worktree on `task/terminal-pizarra-zed-polish`.

## Specs Synced

| Canonical spec                    | Req   | Action                                                                                                               |
| --------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------- |
| `morphology-system`               | R5    | MODIFIED — chrome-token coverage extended to Ajustes (7 tabs); three local helpers forbidden; new scenario added     |
| `morphology-system`               | R6    | MODIFIED — default-radius exception added (`--chrome-radius-panel: 0`); original default scenario rewritten          |
| `terminal-renderer-default`       | TRD-4 | MODIFIED — location moved to Ajustes Apariencia; previous `src/app/settings/appearance/page.jsx` location REMOVED    |
| `terminal-renderer-default`       | TRD-5 | ADDED — Ajustes Apariencia exposes 5 persisted terminal sub-controls behind a feature flag (renderer lives in TRD-4) |
| `settings-route-canonicalization` | R1    | REMOVED — archived to `openspec/changes/archive/settings-route-canonicalization/` with supersession report           |

## Source of Truth Updated

The following canonical specs now reflect the new behavior:

- `openspec/specs/morphology-system/spec.md` — R5 covers Ajustes; R6 carries the default-radius exception footer; MODIFIED Requirements footer now records the 2026-06-15 amendment.
- `openspec/specs/terminal-renderer-default/spec.md` — TRD-4 reads "Ajustes Apariencia"; TRD-5 added with flag-gated sub-section scenarios (TRD-S10/11/12).
- `openspec/specs/settings-route-canonicalization/` — directory removed; spec lives only in `openspec/changes/archive/settings-route-canonicalization/spec.md` as audit trail.

## Archive Contents

The change folder moves to
`openspec/changes/archive/2026-06-15-ajustes-cursor-restyle/`:

- `proposal.md` ✅
- `explore.md` ✅
- `design.md` ✅
- `specs/ajustes-cursor-restyle/spec.md` ✅ (consolidated delta with 8 net-new requirements + 2 modified deltas + REMOVED block)
- `tasks.md` ✅ (38/38 tasks complete; 19 PR-1 + 19 PR-2)
- `apply-progress.md` ✅ (PR-2 19/19 with strict TDD evidence matrix)
- `verify-report.md` ✅ (verdict PASS, 13/13 deltas satisfied, 22/22 PR-affected tests green)
- `archive-report.md` ✅ (this file)

## Task Completion

- **Total tasks**: 38
- **Marked complete**: 38/38 ✅
- **PR-1 tasks**: 19/19 (Phases 1–4) — RED tests, GREEN implementation, spec delta, verification
- **PR-2 tasks**: 19/19 (Phases 5–8) — RED rewrites, routing revert, dead-code deletion, spec archive, skill update, gates

## Verification Evidence (from verify-report)

| Layer                        | Result                                                                                                                 |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Spec coverage                | 13/13 (8 net-new + 5 modified/removed)                                                                                 |
| PR-affected unit + component | 22/22 green across 9 suites                                                                                            |
| Collateral route tests       | 3/3 green (`App.routes`, `WorkspaceSidebar.routes`, `UserProfile.routes`)                                              |
| PR-2 grep gates              | 0 production matches for `SettingsLayoutRouter` / `AppearancePage` / `AppearanceSection` and for the 3 deleted helpers |
| e2e contract                 | source updated; contract green; browser run scheduled for PR review                                                    |

## Pre-merge Gates

- `grep -rE "SettingsLayoutRouter|AppearancePage|AppearanceSection" src/ tests/` → 0 production matches; remaining matches are `.not.toMatch(...)` absence-assertions in `App.routes.test.jsx`.
- `grep -rE "getSettingsShellStyle|getSettingsControlStyle|getSettingsAccentOptionStyle" src/ tests/` → 0 production matches; remaining matches are absence-assertions in `Ajustes.test.jsx` and `morphology.five-morphologies.test.js`.

## Sidebar

The current working tree on `task/terminal-pizarra-zed-polish`
carries unrelated modifications from
`terminal-opencode-modal-bootstrap-fix` and other concurrent
slices. The archive commit for this change touches only the
`openspec/` tree and the archive report files. No production
source, test, or skill file outside `openspec/` is included in
this commit.

## Follow-up (out of archive scope)

`src/components/ui/system/__tests__/ui-shell-views.test.jsx` line
109 imports `require('../../../../app/settings/layout').default`,
which no longer resolves after PR-2 deleted
`src/app/settings/layout.jsx`. The 1-line test fix (remove the
import and prune the two usage sites at lines 190 and 210) is a
test-internal follow-up recorded in the verify-report's Note 1
and apply-progress's pre-existing-issues section. It is out of
scope for the archive commit.

## Engram Persistence

- topic_key: `sdd/ajustes-cursor-restyle/archive-report`
- type: `architecture`
- capture_prompt: false (SDD artifact)

## SDD Cycle Complete

The `ajustes-cursor-restyle` change has been fully planned,
implemented across two stacked PRs, verified against all 13
deltas, and archived with full supersession reports. The
source-of-truth tree is up to date. The
`devhub-morphology` skill now lists Ajustes as the single wiring
point.

Ready for the next change.
