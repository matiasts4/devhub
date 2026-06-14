---
name: devhub-morphology
description: 'Trigger: add a morphology to DevHub. Guide the registry entry, CSS token block, selector wiring, factory usage, tests, and common pitfalls.'
license: MIT
metadata:
  author: gentleman-programming
  version: '1.0'
---

## Activation Contract

Use this skill when asked to add, remove, or modify a DevHub morphology. A morphology is a chrome-shape dialect (default, brutalist-stage, aura, switchyard, cursor, etc.) independent of theme color.

## Hard Rules

- Morphologies MUST be added to `MORPHOLOGIES` and `MORPHOLOGY_OPTIONS` in `src/lib/theme/themes.js`.
- Chrome geometry MUST come from `--chrome-*` CSS variables consumed by `src/chrome/morphology.js` factories and `ChromeSurface`.
- The new selector MUST be wired into both `src/app/settings/appearance/page.jsx` and `src/views/Ajustes.jsx`.
- Never hardcode Tailwind radii, shadows, or border values for chrome surfaces; use token variables.
- Never change existing morphology token values unless the task explicitly targets them.

## Decision Gates

| Situation                                                   | Action                                                                                 |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| New morphology needs special palette axis (like Switchyard) | Add palette handling in `themes.js` and a `body[data-palette]` block in `globals.css`. |
| New morphology only changes chrome shape/accent             | Add a single `[data-morphology='{key}']` block with `--chrome-*` overrides.            |
| Terminal/kanban/pizarra surfaces look wrong                 | Check `--terminal-*` and surface-specific overrides; do not break other morphologies.  |

## Checklist

1. **Registry**: add `{KEY}: '{key}'` to `MORPHOLOGIES` and an entry to `MORPHOLOGY_OPTIONS` in `src/lib/theme/themes.js`.
2. **Tokens**: append `[data-morphology='{key}']` to `src/app/globals.css` after existing blocks. Define at least `--chrome-radius-panel`, `--chrome-radius-control`, `--chrome-border-width`, `--chrome-border-color`, `--chrome-shadow-panel`, `--chrome-shadow-control`, `--chrome-panel-fill`, `--chrome-panel-fill-emphasis`, `--chrome-control-fill`, `--chrome-control-fill-hover`, `--chrome-press-offset`, and `--accent-primary`.
3. **Selectors**: map the option in `src/app/settings/appearance/page.jsx` and `src/views/Ajustes.jsx`; clicking it must call `setMorphology('{key}')`.
4. **Factories**: verify `src/chrome/morphology.js` panel/button/input styles derive from `--chrome-*` tokens; no factory change needed unless a new chrome type is required.
5. **Tests**: extend `src/lib/theme/__tests__/themes.test.js` to assert the new morphology option exists, tokens resolve, and existing blocks are unchanged.
6. **Visual QA**: check the terminal header, kanban columns, and pizarra canvas under the new morphology; watch for hardcoded radii or shadows.

## Common Pitfalls

- Hardcoded Tailwind `rounded-*` or `shadow-*` classes on chrome surfaces bypass the token system.
- `borderRadius: 0` overrides in `Ajustes.jsx` factories are intentional for brutalist-stage only; do not copy them to other morphologies.
- Switchyard sets `--accent-primary` per palette; cursor sets a single warm amber.
- Terminal surfaces use `--terminal-header-divider-*` and `--terminal-chrome-*` overrides; missing them falls back to defaults that may look off.
- Pizarra/kanban surfaces read `--chrome-panel-fill` and `--chrome-radius-panel`; verify they still render after adding the morphology.

## Output Contract

Return:

- Files changed and why.
- Token values added.
- Tests added or updated.
- Any surface-specific overrides required.

## References

- `src/lib/theme/themes.js` — morphology registry.
- `src/app/globals.css` — morphology token blocks.
- `src/chrome/morphology.js` — chrome factory functions.
- `src/app/settings/appearance/page.jsx` — canonical appearance settings.
- `src/views/Ajustes.jsx` — legacy appearance settings.
- `src/lib/theme/__tests__/themes.test.js` — morphology unit tests.
