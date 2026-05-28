## Brutalist Stage — session handoff

This doc is the fast resume point for the next session.

Current branch: `task/2a14962d-swarm-control-panel-polish`

## Quick path

1. Read this file first.
2. Trust `openspec/changes/brutalist-stage-morphology/{proposal,design,verify-report}.md` over stale task checkboxes.
3. Ignore unrelated swarm/session noise on the branch.
4. Continue `brutalist-stage-morphology` with visible SDD-aligned work only.

## Goal

Bring DevHub much closer to the **Brutalist Tech** preview as a real product morphology system, not just border tweaks.

The intended sequence is still:

1. remove hardcoded morphology/chrome decisions
2. centralize morphology in tokens + shared primitives
3. migrate shared/product surfaces onto that system
4. push a stronger Brutalist Stage pass across key pages
5. keep terminal guardrails intact

## User intent that must survive

- Brutalist Tech should feel meaningfully closer to the HTML preview.
- Current morphology toggle is too subtle; only some borders change.
- Terminal page is protected:
  - keep layout
  - keep button/icon positions
  - keep top workspace zone
  - do not redesign terminal structure
- Use visible SDD-aligned continuation only.
- Do **not** use `general` agents or hidden delegation-style flows for the real implementation path.
- Ignore unrelated branch noise from other agent work.

## OpenSpec source of truth

Change name: `brutalist-stage-morphology`

Primary artifacts:

- `openspec/changes/brutalist-stage-morphology/proposal.md`
- `openspec/changes/brutalist-stage-morphology/design.md`
- `openspec/changes/brutalist-stage-morphology/tasks.md`
- `openspec/changes/brutalist-stage-morphology/verify-report.md`
- `openspec/changes/brutalist-stage-morphology/implementation-handoff.md`
- `docs/40_Brutalist_Stage_Morphology_Proposal.md`

Capabilities:

- `workspace-morphology-system`
- `terminal-shell-morphology-guardrails`

## What is REALLY done

These are real advances already in the branch:

| Area | Status | Evidence |
|---|---|---|
| Morphology axis | Done | `src/lib/theme/themes.js` has `devhub:morphology`, `MORPHOLOGIES`, apply/get/set helpers |
| Morphology token layer | Done | `src/app/globals.css` has default + `brutalist-stage` chrome tokens |
| Shared chrome primitive | Done | `src/components/ui/chrome-surface.jsx` |
| Shared button/sidebar/title tokenization | Partial-real | `src/components/ui/button.jsx`, `WorkspaceSidebar.jsx`, `WorkspacePageTitle.jsx`, `workspaceSidebarUtils.js` |
| Representative page chrome | Partial-real | `src/views/workspacePageChrome.js`, adoption in `ProjectDashboard.jsx`, `Tareas.jsx`, `SwarmControl.jsx` |
| Appearance morphology selection | Done | `src/app/settings/appearance/page.jsx`, `src/views/Ajustes.jsx` |
| Swarm launch modal chrome | Partial-real | `src/components/control-room/SwarmLaunchWizardModal.jsx` |
| Terminal shell tokenization | Partial-real | `src/App.js`, `src/components/TerminalWorkspacesManager.jsx`, `src/components/TerminalTTY.jsx` |

## What was fixed late in this session

Two real terminal visual fixes landed:

### 1. Split visibility flattening

- File: `src/components/terminal/terminalChromeStyles.js`
- File: `src/components/TerminalWorkspacesManager.jsx`
- Fix: nested panel bodies can opt out of morphology background fill via `getWorkspaceShellChromeStyle({ withBackground: false })`
- Reason: nested chrome fills were flattening contrast and visually erasing split boundaries.

### 2. Native VTE divider overpaint after swarm launch

- File: `src/components/TerminalTTY.jsx`
- Fix: native VTE open/show/resize/observe now prefer the real `.devhub-xterm-container` bounds before `terminal-content-body`
- Reason: native surface was likely sizing to a too-large wrapper and visually covering the divider after swarm-created native panels appeared.

Focused evidence from end of session:

- `TerminalTTY.test.js` PASS
- `TerminalWorkspacesManager.split-layout.test.jsx` PASS
- focused terminal run: `96 passed, 96 total`

## What is NOT done yet

This is the most important truth: **Brutalist Tech is not implemented strongly yet.**

What exists now is infrastructure + partial adoption.
What is missing is the strong product-wide transformation.

Big remaining gaps:

1. many hardcoded morphology/surface decisions still exist
2. morphology adoption is still uneven
3. the visual difference in settings is still too subtle
4. several surfaces still look like the old shell with minor border/shadow changes

## Known incomplete areas

Start here next:

| Priority | Files / area | Why it matters |
|---|---|---|
| High | `src/views/Ajustes.jsx` | Still contains many hardcoded rounded/border/shadow/card decisions; morphology migration incomplete |
| High | `src/app/settings/appearance/page.jsx` | Morphology works functionally, but visual transformation still weak |
| High | `src/views/ProjectDashboard.jsx` | Key page for preview parity; current adoption is still modest |
| High | `src/views/Tareas.jsx` | Key page for preview parity; needs much stronger chrome/surface treatment |
| High | `src/views/SwarmControl.jsx` | Important for Brutalist Tech feel; adoption exists but still light |
| Medium | `src/components/control-room/SwarmLaunchWizardModal.jsx` | Improved, but not yet a strong brutalist expression |
| Medium | `src/components/ui/button.jsx` | Tokenized, but variants still visually conservative |
| Medium | `src/components/WorkspaceSidebar.jsx` + `workspaceSidebarUtils.js` | More shell identity can be pushed here |

## What to ignore

Ignore this noise unless explicitly asked later:

- `src/lib/swarm/terminateLaunch.js`
- `src/lib/terminal/closeTerminalSession.js`
- `src/app/api/agenthub/operations/health/route.js`
- `src/app/api/agenthub/sessions/[sessionId]/abort/route.js`
- `src/app/api/terminal/session/route.js`
- `End swarm` behavior mixed into `TerminalWorkspacesManager.jsx`

These were previously identified as out-of-scope for morphology work.

## Current verification truth

Do **not** trust the optimistic header in `tasks.md`.

Formal state from `openspec/changes/brutalist-stage-morphology/verify-report.md`:

- Final verdict: **FAIL**

Why FAIL:

1. out-of-scope swarm/session noise exists in the branch
2. durable `apply-progress` / strict TDD evidence is missing
3. an independent terminal test still fails:
   - `src/components/__tests__/TerminalWorkspacesManager.shortcuts.test.jsx`
   - failing case: `Ctrl+Shift+PageUp wraps to the previous workspace in reordered state order`
   - expected `Workspace 3`, received `Workspace 1`

Important: this shortcut failure is separate from the divider visual bug that was fixed.

## Recommended next slice

Best next continuation slice:

### Slice A — finish the morphology migration properly

Owner focus:

- inventory remaining hardcoded chrome
- replace them with shared primitives/helpers/tokens
- strengthen visible Brutalist Stage deltas on key pages

Suggested order:

1. `Ajustes.jsx`
2. `app/settings/appearance/page.jsx`
3. `ProjectDashboard.jsx`
4. `Tareas.jsx`
5. `SwarmControl.jsx`
6. polish shared primitives (`button.jsx`, sidebar, modal chrome)

### Slice B — then clean verification debt

1. isolate/fix `TerminalWorkspacesManager.shortcuts.test.jsx`
2. separate morphology truth from branch noise during verify
3. generate durable apply/verify evidence correctly

## Practical resume checklist for next session

- [ ] Read this doc
- [ ] Read `proposal.md`, `design.md`, `verify-report.md`
- [ ] Ignore swarm/session noise unless explicitly requested
- [ ] Continue from morphology adoption, not from zero
- [ ] Treat current state as “infrastructure + partial adoption”, not “done”
- [ ] Keep terminal structure frozen
- [ ] Push stronger Brutalist Tech on Dashboard / Tareas / Swarm Control / Ajustes
- [ ] Re-verify after the next real slice

## Useful commands

```bash
git status --short --branch
git diff --stat
npm test -- --runInBand src/components/__tests__/TerminalTTY.test.js src/components/__tests__/TerminalWorkspacesManager.split-layout.test.jsx
npm test -- --runInBand src/components/__tests__/TerminalWorkspacesManager.shortcuts.test.jsx
```

## Bottom line

We are **not in zero**, but we are also **not near the final Brutalist Tech result**.

The base system exists.
The next session should use that base to push a much stronger, more obvious morphology migration across the real product surfaces.
