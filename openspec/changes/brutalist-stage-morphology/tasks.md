# Tasks: Brutalist Stage Morphology

## Review Workload Forecast

| Field                   | Value                                                     |
| ----------------------- | --------------------------------------------------------- |
| Estimated changed lines | 750-1100                                                  |
| 400-line budget risk    | High                                                      |
| Chained PRs recommended | Yes                                                       |
| Suggested split         | PR 1 → PR 2 → PR 3 fallback; single PR only with approval |
| Delivery strategy       | size:exception (approved)                                 |
| Chain strategy          | single-pr                                                 |

Decision resolved: size:exception approved by maintainer.
Chained PRs recommended: Yes
Chain strategy: single-pr
400-line budget risk: High
Apply status: implementation complete; scoped verification green; branch-level verify pending scope cleanup.

### Suggested Work Units

| Unit | Goal                                               | Likely PR | Notes                                          |
| ---- | -------------------------------------------------- | --------- | ---------------------------------------------- |
| 1    | Morphology registry, tokens, shared surface        | PR 1      | Smallest safe base; tests included             |
| 2    | Settings wiring and representative page adoption   | PR 2      | Depends on Unit 1; still reviewable            |
| 3    | Terminal shell tokenization and guardrail coverage | PR 3      | Last slice; top-zone/control invariants locked |

## Phase 1: Infrastructure

- [x] 1.1 RED: create `src/lib/theme/__tests__/themes.test.js` and extend `src/app/settings/appearance/__tests__/page.test.jsx` for independent morphology persistence and safe fallback normalization.
- [x] 1.2 GREEN: extend `src/lib/theme/themes.js` with `MORPHOLOGIES`, `devhub:morphology` storage, normalization helpers, and `<html data-morphology>` sync beside theme.
- [x] 1.3 GREEN: add morphology token families to `src/app/globals.css`; keep default parity and tokenize chrome before any page restyle.
- [x] 1.4 REFACTOR: create `src/components/ui/chrome-surface.jsx` and update `src/components/control-room/SwarmSurfaceCard.jsx` to consume shared surface chrome.

## Phase 2: Implementation

- [x] 2.1 RED/GREEN: update `src/components/ui/button.jsx`, `src/components/WorkspaceSidebar.jsx`, and `src/components/workspace/WorkspacePageTitle.jsx` to read morphology tokens instead of hardcoded chrome.
- [x] 2.2 GREEN: wire morphology selection into `src/app/settings/appearance/page.jsx` and `src/views/Ajustes.jsx` without coupling it to theme selection.
- [x] 2.3 GREEN: restyle `src/views/ProjectDashboard.jsx`, `src/views/Tareas.jsx`, `src/views/SwarmControl.jsx`, and `src/components/control-room/SwarmLaunchWizardModal.jsx` only through shared primitives/tokens.
- [x] 2.4 RED/GREEN/REFACTOR: tokenize wrappers in `src/App.js`, `src/components/TerminalWorkspacesManager.jsx`, and `src/components/TerminalTTY.jsx`; preserve layout, control order, top-zone structure, and test IDs.

## Phase 3: Testing

- [x] 3.1 GREEN: extend `src/components/__tests__/TerminalThemeSync.test.js` to prove theme colors stay separate from morphology chrome.
- [x] 3.2 GREEN: extend `src/components/__tests__/TerminalTTY.test.js` and `src/components/__tests__/TerminalWorkspacesManager.split-layout.test.jsx` for safe-zone, control-order, and interaction invariants across morphologies.
- [x] 3.3 GREEN: add Playwright morphology smoke for dashboard, swarm, and terminal scenarios from `workspace-morphology-system` and `terminal-shell-morphology-guardrails`.

## Phase 4: Cleanup / Documentation

- [x] 4.1 Update `docs/40_Brutalist_Stage_Morphology_Proposal.md` with final rollout note: `brutalist-stage` stays gated until terminal guardrail checks pass.
- [x] 4.2 Document work-unit commit order in the implementation handoff; do not start `sdd-apply` until user approves single-PR exception or alternate split.
