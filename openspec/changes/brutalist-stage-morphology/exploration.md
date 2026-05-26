# Exploration: brutalist-stage-morphology

## Current State

Color theme is a first-class axis in `src/lib/theme/themes.js` + `src/app/globals.css` (`data-theme`, palette tokens, theme storage). Morphology/chrome is still mostly hardcoded per component: `button.jsx` has `devhubPrimary/devhubGlass/devhubGhost`, `WorkspaceSidebar.jsx` and `WorkspacePageTitle.jsx` carry layout-specific chrome, and the product views (`ProjectDashboard.jsx`, `Tareas.jsx`, `SwarmControl.jsx`) use many inline borders/shadows/radii.

The terminal is a protected surface. `App.js` hardcodes the terminal route shell, while `TerminalWorkspacesManager.jsx` and `TerminalTTY.jsx` own the layout/interaction contract. They already separate runtime behavior from shell chrome, but the shell chrome is still visually hardcoded in multiple places. `SwarmLaunchWizardModal.jsx` and `SwarmSurfaceCard.jsx` show an amber-specific surface language that can become the seed for a reusable morphology lane.

The previews confirm the reference intent: `public/previews/brutalist-tech.html` is the original brutalist shell; `brutalist-amber-command.html` and `brutalist-oxide-console.html` are same-shell variants with different surface languages; `nordic-arctic.html` is a separate non-brutalist lane.

## Affected Areas

- `src/lib/theme/themes.js` — currently color theme only; needs a separate morphology registry/storage path.
- `src/app/globals.css` — global token layer can host morphology vars (`radius`, `border`, `panel`, `modal`, `control`), not just theme palettes.
- `src/App.js` — terminal route shell/background is hardcoded and should consume morphology chrome tokens.
- `src/components/ui/button.jsx` — variant system mixes color + shape + surface decisions; needs split between color and morphology.
- `src/components/WorkspaceSidebar.jsx` — sidebar chrome is heavily hardcoded, especially active states and panel surfaces.
- `src/components/workspace/WorkspacePageTitle.jsx` — title/pill chrome is currently component-specific.
- `src/components/TerminalWorkspacesManager.jsx` — terminal panel chrome, headers, and modal/surface framing need tokenization; layout itself is protected.
- `src/components/TerminalTTY.jsx` — terminal viewport/header/overlay chrome is inline-styled; protected geometry must stay fixed.
- `src/components/control-room/SwarmLaunchWizardModal.jsx` — modal chrome is a good candidate for the Brutalist Stage lane.
- `src/components/control-room/SwarmSurfaceCard.jsx` — existing shared surface wrapper is the best starting point for reusable morphology.
- `src/views/ProjectDashboard.jsx`, `src/views/Tareas.jsx`, `src/views/SwarmControl.jsx` — representative product pages with repeated hardcoded chrome that should move to shared primitives.
- `docs/40_*.md` — next numbered docs slot for the initiative.

## Approaches

1. **Shared morphology axis** — add a second persisted document attribute (`data-morphology`) and a token map that drives reusable chrome vars across the app.
   - Pros: clean separation of color vs shape/surface; reusable across pages; supports fast switching without duplicating the app.
   - Cons: requires touching shared primitives and several page shells.
   - Effort: Medium

2. **Per-component brutalist restyle** — restyle each page/component directly for Brutalist Stage without adding a morphology layer.
   - Pros: faster short-term visual change.
   - Cons: duplicates chrome logic; terminal protection becomes fragile; switchability later is expensive.
   - Effort: Medium

## Recommendation

Do the shared morphology axis. Keep theme = color only, morphology = chrome/surface language. Seed the new lane from the original Brutalist preview shell, then let shared chrome primitives consume morphology vars while terminal layout/controls stay locked.

## Risks

- Terminal drift: if the shell is restyled per-component, button positions, icon positions, and the workspace top zone can move accidentally.
- Overcoupling: mixing theme colors with morphology will make future switches brittle.
- Diff size: touching sidebar, modal, terminal, and dashboard chrome in one PR can exceed review budget if not tokenized first.

## Ready for Proposal

Yes — next step is a proposal/spec that defines the morphology token axis, the protected terminal contract, and the Brutalist Stage lane.
