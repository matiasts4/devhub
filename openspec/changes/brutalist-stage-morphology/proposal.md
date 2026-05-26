# Proposal: Brutalist Stage Morphology

## Intent

Separate chrome/morphology from color theme so DevHub can switch to `brutalist-stage` without duplicating screens. Preserve the terminal contract: layout, button/icon positions, workspace top-zone structure, and interaction model stay fixed.

## Scope

### In Scope

- Add an independent morphology axis, storage path, and document attribute beside theme.
- Extract shared chrome tokens/primitives from hardcoded buttons, sidebar, titles, cards, and modals.
- Introduce `brutalist-stage` from the original brutalist preview shell.

### Out of Scope

- Reworking terminal runtime behavior, workspace layout, or terminal interactions.
- Full bespoke redesigns per page outside shared primitive adoption.

## Capabilities

### New Capabilities

- `workspace-morphology-system`: morphology registry, storage, document attribute, and shared chrome tokens separate from theme colors.
- `terminal-shell-morphology-guardrails`: terminal chrome may vary by morphology, but protected geometry and interactions stay unchanged.

### Modified Capabilities

- None

## Approach

Add `data-morphology` beside `data-theme`, move shape/surface tokens into the global layer, split color from morphology in shared primitives, then seed `brutalist-stage` from the preview shell. Roll primitives across general pages first; terminal surfaces consume tokens only.

## Affected Areas

| Area                                                                                                         | Impact   | Description                                                    |
| ------------------------------------------------------------------------------------------------------------ | -------- | -------------------------------------------------------------- |
| `src/lib/theme/themes.js`                                                                                    | Modified | Morphology registry, normalization, storage, document helpers  |
| `src/app/globals.css`                                                                                        | Modified | Morphology tokens for radius, border, panel, modal, controls   |
| `src/components/ui/button.jsx`                                                                               | Modified | Split reusable chrome from color variants                      |
| `src/components/WorkspaceSidebar.jsx`, `src/components/workspace/WorkspacePageTitle.jsx`                     | Modified | Replace hardcoded chrome with shared primitives                |
| `src/App.js`, `src/components/TerminalWorkspacesManager.jsx`, `src/components/TerminalTTY.jsx`               | Modified | Tokenize terminal shell chrome without moving protected layout |
| `src/components/control-room/SwarmSurfaceCard.jsx`, `src/components/control-room/SwarmLaunchWizardModal.jsx` | Modified | Seed Brutalist Stage surfaces                                  |
| `src/views/ProjectDashboard.jsx`, `src/views/Tareas.jsx`, `src/views/SwarmControl.jsx`                       | Modified | Adopt shared morphology layer                                  |
| `docs/40_Brutalist_Stage_Morphology_Proposal.md`                                                             | New      | Repo-facing proposal summary                                   |

## Risks

| Risk                                      | Likelihood | Mitigation                                                        |
| ----------------------------------------- | ---------- | ----------------------------------------------------------------- |
| Terminal chrome changes move protected UI | Med        | Guardrails + focused terminal regression coverage before restyle  |
| Theme and morphology stay coupled         | Med        | Separate storage keys, document attrs, and token responsibilities |
| Review budget overruns                    | Med        | Tokenization-first slices; avoid page-by-page bespoke rewrites    |

## Rollback Plan

Revert morphology registry/document-attribute wiring and fall back to the current theme-only chrome path. Keep `brutalist-stage` hidden until shared primitives are stable.

## Dependencies

- `public/previews/brutalist-tech.html` and related preview references
- Existing appearance/settings flow in `src/views/Ajustes.jsx`
- Terminal regression coverage around `TerminalWorkspacesManager.jsx`

## Success Criteria

- [ ] DevHub can switch morphologies without duplicating routes/components.
- [ ] Terminal page preserves layout, button/icon positions, workspace top-zone structure, and interaction model across morphologies.
- [ ] Targeted shared components/pages consume morphology primitives instead of hardcoded chrome.
- [ ] Implementation can be sliced to stay inside the 400-line review budget.
