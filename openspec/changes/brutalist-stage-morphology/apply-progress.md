# Implementation Progress

**Change**: `brutalist-stage-morphology`
**Mode**: Strict TDD
**Delivery**: `size:exception` approved, `single-pr` on current branch

## Artifact note

This is the first durable `apply-progress.md` for this change.

Early morphology foundation work landed before this file existed, so the Phase 1 / early Phase 2 sections below are reconstructed from:

- landed files and tests in the repo,
- `docs/41_Brutalist_Stage_Session_Handoff.md`,
- `openspec/changes/brutalist-stage-morphology/implementation-handoff.md`,
- passing verification commands rerun in this session.

The later page-polish batches in this session have explicit RED → GREEN → REFACTOR evidence from the apply subagent outputs.

## Completed tasks

- [x] 1.1 RED: morphology persistence tests in `src/lib/theme/__tests__/themes.test.js` and `src/app/settings/appearance/__tests__/page.test.jsx`
- [x] 1.2 GREEN: morphology registry/storage/apply helpers in `src/lib/theme/themes.js`
- [x] 1.3 GREEN: morphology token families in `src/app/globals.css`
- [x] 1.4 REFACTOR: shared chrome primitive in `src/components/ui/chrome-surface.jsx` and adoption in `src/components/control-room/SwarmSurfaceCard.jsx`
- [x] 2.1 RED/GREEN: shared button/sidebar/page-title chrome tokenization in `src/components/ui/button.jsx`, `src/components/WorkspaceSidebar.jsx`, `src/components/workspace/WorkspacePageTitle.jsx`, and `src/components/workspaceSidebarUtils.js`
- [x] 2.2 GREEN: independent morphology selection wiring in `src/app/settings/appearance/page.jsx` and `src/views/Ajustes.jsx`
- [x] 2.3 GREEN: representative page + modal adoption in `src/views/ProjectDashboard.jsx`, `src/views/Tareas.jsx`, `src/views/SwarmControl.jsx`, and `src/components/control-room/SwarmLaunchWizardModal.jsx`
- [x] 2.4 RED/GREEN/REFACTOR: token-only terminal shell wrappers in `src/App.js`, `src/components/TerminalWorkspacesManager.jsx`, and `src/components/TerminalTTY.jsx`
- [x] 3.1 GREEN: theme-vs-morphology separation coverage in `src/components/__tests__/TerminalThemeSync.test.js`
- [x] 3.2 GREEN: terminal guardrail coverage in `src/components/__tests__/TerminalTTY.test.js` and `src/components/__tests__/TerminalWorkspacesManager.split-layout.test.jsx`
- [x] 3.3 GREEN: morphology smoke harness in `tests/e2e/05_workspace_morphology_smoke.spec.ts`
- [x] 4.1 Docs update in `docs/40_Brutalist_Stage_Morphology_Proposal.md`
- [x] 4.2 Work-unit / single-PR exception handoff in `openspec/changes/brutalist-stage-morphology/implementation-handoff.md`

## Cumulative implementation batches

### Batch A — Morphology foundation

- Added independent morphology registry/storage/apply helpers in `src/lib/theme/themes.js`.
- Added `brutalist-stage` token layer in `src/app/globals.css`.
- Introduced shared chrome primitive `src/components/ui/chrome-surface.jsx`.
- Routed shared surface consumers through token-aware chrome.

### Batch B — Shared primitives and product-surface adoption

- Tokenized shared button/sidebar/title chrome.
- Added morphology selection UI in both settings surfaces.
- Added shared page-shell helpers in `src/views/workspacePageChrome.js`.
- Adopted shared chrome across dashboard, tareas, swarm, and launch modal.

### Batch C — Terminal token-only shell adoption

- Tokenized protected terminal wrappers in `src/App.js`, `src/components/TerminalWorkspacesManager.jsx`, and `src/components/TerminalTTY.jsx` without redesigning terminal structure.
- Landed late guardrail-safe fixes for split visibility flattening and native VTE divider overpaint.

### Batch D — Stronger Brutalist Stage continuation (this session)

- Pushed stronger morphology expression into `src/views/Ajustes.jsx` and `src/app/settings/appearance/page.jsx`.
- Deepened inner chrome adoption in `src/views/ProjectDashboard.jsx`.
- Reworked remaining hardcoded chrome in `src/views/Tareas.jsx`.
- Strengthened `src/views/SwarmControl.jsx` shells and control chrome without touching swarm/session logic.
- Sharpened shared button/sidebar/modal chrome in:
  - `src/components/ui/button.jsx`
  - `src/components/WorkspaceSidebar.jsx`
  - `src/components/workspaceSidebarUtils.js`
  - `src/components/control-room/SwarmLaunchWizardModal.jsx`

## TDD cycle evidence

| Work unit | Tasks covered | RED | GREEN | REFACTOR | Evidence |
| --- | --- | --- | --- | --- | --- |
| Morphology foundation | 1.1–1.4 | Recovered from landed RED tests required by tasks (`themes.test.js`, `page.test.jsx`, shared chrome coverage) | Morphology registry, token layer, and `ChromeSurface` landed | Shared surface chrome centralized in `chrome-surface.jsx` | `src/lib/theme/__tests__/themes.test.js`, `src/app/settings/appearance/__tests__/page.test.jsx`, `src/components/control-room/__tests__/SwarmSurfaceCard.test.jsx` |
| Shared primitives + appearance wiring | 2.1–2.2 | Explicit RED-first coverage added for stronger button/sidebar/settings chrome | Shared primitives and settings surfaces now consume morphology tokens/helpers | Shared helper extraction in sidebar utils and settings chrome helpers | `src/components/ui/__tests__/button.test.js`, `src/components/__tests__/WorkspaceSidebar.test.js`, `src/views/__tests__/Ajustes.test.jsx`, `src/app/settings/appearance/__tests__/page.test.jsx` |
| Representative pages + modal | 2.3 | Explicit RED-first coverage added for dashboard/tareas/swarm/modal chrome expectations | Product surfaces migrated onto shared morphology primitives/tokens | Page-local helpers extracted while preserving layout/behavior | `src/views/__tests__/ProjectDashboard.chrome.test.jsx`, `src/views/__tests__/Tareas.test.jsx`, `src/views/__tests__/SwarmControl.chrome.test.js`, `src/views/__tests__/SwarmControl.test.jsx`, `src/components/control-room/__tests__/SwarmLaunchWizardModal.test.jsx` |
| Protected terminal wrappers + guardrails | 2.4, 3.1, 3.2 | Recovered from landed guardrail suites and existing tokenized wrapper tests | Terminal wrapper/token work currently passes repeated guardrail reruns | Late wrapper-only fixes kept terminal layout/control-order contract intact | `src/components/__tests__/TerminalTTY.test.js`, `src/components/__tests__/TerminalThemeSync.test.js`, `src/components/__tests__/TerminalWorkspacesManager.split-layout.test.jsx`, `src/components/__tests__/TerminalWorkspacesManager.right-dock.test.jsx`, `src/components/__tests__/TerminalWorkspacesManager.shortcuts.test.jsx`, `src/components/__tests__/TerminalWorkspacesManager.reopen.test.jsx`, `src/components/__tests__/TerminalWorkspacesManager.panel-subtabs.test.jsx` |
| Morphology smoke + docs/handoff | 3.3, 4.1, 4.2 | Smoke harness/docs tasks originated from spec-driven additions; browser smoke not rerun in this refresh | Smoke harness + docs artifacts exist on branch | Handoff captured approved single-PR order and terminal guardrails | `tests/e2e/05_workspace_morphology_smoke.spec.ts`, `docs/40_Brutalist_Stage_Morphology_Proposal.md`, `openspec/changes/brutalist-stage-morphology/implementation-handoff.md` |

## Verification run in this session

### Repeated terminal guardrail reruns

Command run three times:

- `npm test -- --runInBand src/components/__tests__/TerminalTTY.test.js src/components/__tests__/TerminalThemeSync.test.js src/components/__tests__/TerminalWorkspacesManager.split-layout.test.jsx src/components/__tests__/TerminalWorkspacesManager.right-dock.test.jsx src/components/__tests__/TerminalWorkspacesManager.shortcuts.test.jsx src/components/__tests__/TerminalWorkspacesManager.reopen.test.jsx src/components/__tests__/TerminalWorkspacesManager.panel-subtabs.test.jsx`

Result each run:

- 7 suites passed
- 185 tests passed
- shortcut regression from the older verify report did **not** reproduce

### Comprehensive morphology + terminal verification

Command run:

- `npm test -- --runInBand src/lib/theme/__tests__/themes.test.js src/app/settings/appearance/__tests__/page.test.jsx src/views/__tests__/Ajustes.test.jsx src/components/ui/__tests__/button.test.js src/components/ui/__tests__/chrome-surface.test.jsx src/components/control-room/__tests__/SwarmSurfaceCard.test.jsx src/components/control-room/__tests__/SwarmLaunchWizardModal.test.jsx src/components/__tests__/WorkspaceSidebar.test.js src/components/workspace/__tests__/WorkspacePageTitle.test.jsx src/views/__tests__/workspacePageChrome.test.js src/views/__tests__/ProjectDashboard.chrome.test.jsx src/views/__tests__/Tareas.test.jsx src/views/__tests__/SwarmControl.chrome.test.js src/views/__tests__/SwarmControl.test.jsx src/components/__tests__/TerminalTTY.test.js src/components/__tests__/TerminalThemeSync.test.js src/components/__tests__/TerminalWorkspacesManager.split-layout.test.jsx src/components/__tests__/TerminalWorkspacesManager.right-dock.test.jsx src/components/__tests__/TerminalWorkspacesManager.shortcuts.test.jsx src/components/__tests__/TerminalWorkspacesManager.reopen.test.jsx src/components/__tests__/TerminalWorkspacesManager.panel-subtabs.test.jsx`

Result:

- 21 suites passed
- 273 tests passed

### Non-blocking verification noise

- Existing React outdated JSX transform warnings still print during Jest runs.
- Existing DOM-prop warnings from mocked panel components (`minSize`, `onDragging`) still print in terminal-manager suites.
- Jest still reports an open-handle warning after the large combined terminal batch.

## Remaining branch-level blockers

- Out-of-scope swarm/session code is still present on the branch and remains outside the morphology change contract:
  - `src/lib/swarm/terminateLaunch.js`
  - `src/lib/terminal/closeTerminalSession.js`
  - `src/app/api/agenthub/operations/health/route.js`
  - `src/app/api/agenthub/sessions/[sessionId]/abort/route.js`
  - `src/app/api/terminal/session/route.js`
  - `End swarm` behavior mixed into `src/components/TerminalWorkspacesManager.jsx`
- Because of that branch noise, full change verification is still a **scope-management** problem even though the morphology + terminal guardrail suites above are now green.

## Current status

- Implementation tasks are complete on the current branch.
- Durable apply evidence now exists.
- Scoped morphology + terminal guardrail verification is green.
- Final branch-level signoff still requires either removing/separating the out-of-scope swarm/session changes or explicitly accepting them outside this change.
