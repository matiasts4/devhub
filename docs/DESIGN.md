# Design: Theme × Morphology × Accent × Density

Cross-cutting reference for the four token layers that drive DevHub's
visual identity. Every cell is a CSS selector; open it in DevTools to
inspect the resolved value. Source-of-truth files:

- `src/lib/theme/themes.js` — theme / morphology / accent / density registry
- `src/chrome/morphology.js` — `panelStyle`, `pillStyle`, `btnPrimaryStyle` factories
- `src/app/globals.css` — the four token layers
- `src/lib/ui-tokens.js` — typography scale (planned; not yet present)

## 1. Theme × Morphology

Every theme is a flat color palette; every morphology is a flat chrome
shape. They compose independently. 10 themes × 4 morphologies = 40
combinations, all preserved by NFR-D04. Each cell below is
`[data-theme=X] + [data-morphology=Y]` in `globals.css`.

| Morphology      | deep-sea | nord    | dracula | light   | catppuccin | tokyo-night | monokai | synthwave | brutalist-stage | switchyard |
| --------------- | -------- | ------- | ------- | ------- | ---------- | ----------- | ------- | --------- | --------------- | ---------- |
| default         | 333+34   | 380+34  | 426+34  | 472+34  | 518+34     | 564+34      | 610+34  | 656+34    | 702+34          | 748+34     |
| brutalist-stage | 333+56   | 380+56  | 426+56  | 472+56  | 518+56     | 564+56      | 610+56  | 656+56    | 702+56          | 748+56     |
| aura            | 333+87   | 380+87  | 426+87  | 472+87  | 518+87     | 564+87      | 610+87  | 656+87    | 702+87          | 748+87     |
| switchyard      | 333+111  | 380+111 | 426+111 | 472+111 | 518+111    | 564+111     | 610+111 | 656+111   | 702+111         | 748+111    |

Chrome tokens (`--chrome-radius-panel`, `--chrome-border-width`,
`--chrome-shadow-panel`, `--chrome-press-offset`) are written by the
morphology block; theme blocks change only color tokens.

## 2. Morphology × Accent

Accent is morphology-agnostic. It writes `--accent-primary` /
`--accent-secondary`; morphology blocks consume those via `color-mix()`
or `var()` directly. Only the _base_ of the mix changes per morphology.

| Morphology      | Accent carrier                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------------- |
| default         | `var(--accent-primary)` directly. See `[data-morphology='default']` in `globals.css`.                 |
| brutalist-stage | `color-mix(in srgb, var(--accent-primary) 14%, var(--chrome-control-fill))` (see `Ajustes.jsx`).      |
| aura            | `color-mix(in srgb, var(--accent-primary) 22%, var(--chrome-panel-fill-emphasis))` (`morphology.js`). |
| switchyard      | `color-mix(in srgb, var(--accent-primary) 28%, var(--border-subtle))` (see `layout.jsx`).             |

The 12 accent ids come from `ACCENT_OPTIONS` in `themes.js`:
`theme`, `amber`, `mint`, `violet`, `orange`, `rose`, `cyan`, `blue`,
`red`, `white`, `lime`, `orange-light`. The `ACCENTS` registry is the
single source of truth for ids.

## 3. Accent × Terminal chrome

The terminal container re-skins itself with `--terminal-*` tokens. The
accent bar is the only token that consumes `var(--accent-primary)`
directly. Source: `globals.css` L194-241. The
`[data-terminal-accent-bar='visible'|'hidden']` toggle overrides the
bar regardless of header style. `--terminal-bg` and `--terminal-fg`
consume `var(--surface-app)` and `var(--text-primary)`.

| Header style | `--terminal-header-bg` | `--terminal-header-gradient`           | `--terminal-accent-bar` |
| ------------ | ---------------------- | -------------------------------------- | ----------------------- |
| dragon       | `var(--surface-card)`  | gradient via `var(--surface-elevated)` | `var(--accent-primary)` |
| minimal      | `var(--surface-card)`  | `var(--surface-card)` (flat)           | `transparent`           |
| gradient     | `var(--surface-card)`  | linear gradient                        | `transparent`           |
| plain        | `var(--surface-card)`  | `var(--surface-card)` (flat)           | `transparent`           |

## 4. Density × Spacing

Density is layout-only — it never touches `font-size` (lives in
`ui-tokens.js` once it ships, gated by `var(--font-scale)`). Source:
`globals.css` L22-31. Default `comfortable` is written to `<html>` by
`themes.js`. Pilot opt-ins: `Roadmap.jsx` milestone rows,
`ProjectDashboard.jsx` task rows set `data-density="compact"`.

| Density     | `--density-row-padding-y` | `--density-row-padding-x` | `--density-row-gap` |
| ----------- | ------------------------- | ------------------------- | ------------------- |
| comfortable | `0.5rem`                  | `0.75rem`                 | `0.5rem`            |
| compact     | `0.25rem`                 | `0.5rem`                  | `0.25rem`           |
