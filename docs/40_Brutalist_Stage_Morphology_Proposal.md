# Brutalist Stage Morphology Proposal

Add a reusable morphology layer so DevHub can switch chrome language without cloning the app. Keep theme as color-only. Keep the terminal contract protected.

## Quick path

1. Remove hardcoded morphology decisions from shared chrome.
2. Add a persisted morphology axis beside theme.
3. Introduce `brutalist-stage` from the original brutalist preview shell.
4. Let terminal chrome change through tokens only; do not move terminal structure.

## Scope

| In scope                                             | Out of scope                        |
| ---------------------------------------------------- | ----------------------------------- |
| Morphology registry + storage                        | Terminal runtime rewrite            |
| Shared chrome tokens/primitives                      | Repositioning terminal controls     |
| Brutalist Stage lane                                 | Full per-page bespoke redesign pass |
| Shared adoption across dashboard/task/swarm surfaces | New backend contracts               |

## Capability contract

### New capabilities

- `workspace-morphology-system` — independent morphology registry, persistence, document attribute, and reusable chrome tokens/primitives.
- `terminal-shell-morphology-guardrails` — terminal shell styling may vary by morphology, but layout, button positions, icon positions, workspace top-zone structure, and interaction model stay fixed.

### Modified capabilities

- None

## Affected areas

| Area                                                                                           | Change                                              |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `src/lib/theme/themes.js`                                                                      | Add morphology registry/storage helpers             |
| `src/app/globals.css`                                                                          | Add morphology token layer                          |
| `src/components/ui/button.jsx`                                                                 | Split color variants from morphology variants       |
| `src/components/WorkspaceSidebar.jsx`                                                          | Move sidebar chrome to shared morphology primitives |
| `src/components/workspace/WorkspacePageTitle.jsx`                                              | Tokenize title/pill chrome                          |
| `src/components/control-room/SwarmSurfaceCard.jsx`                                             | Use as Brutalist Stage seed surface                 |
| `src/components/control-room/SwarmLaunchWizardModal.jsx`                                       | Adopt shared morphology modal language              |
| `src/App.js`, `src/components/TerminalWorkspacesManager.jsx`, `src/components/TerminalTTY.jsx` | Tokenize terminal shell without layout drift        |

## Risks

| Risk                      | Mitigation                                                      |
| ------------------------- | --------------------------------------------------------------- |
| Terminal drift            | Freeze protected structure in spec/tests before visual swap     |
| Theme/morphology coupling | Separate storage, attrs, and token ownership                    |
| Large diff                | Tokenize first, then restyle page surfaces in reviewable slices |

## Rollback

Remove morphology wiring, keep current theme-only shell, and hide `brutalist-stage` until shared primitives are stable.

## Success checks

- [ ] Morphology can switch without duplicating the app shell.
- [ ] Terminal contract remains unchanged except for chrome tokens.
- [ ] Shared chrome primitives replace targeted hardcoded surfaces.
- [ ] Work stays reviewable within the 400-line budget.

## Next step

Write delta specs for the new morphology system and terminal guardrails, then split implementation into tokenization-first tasks.
