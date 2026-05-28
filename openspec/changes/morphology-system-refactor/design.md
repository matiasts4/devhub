# Design: Morphology System Refactor

## Technical Approach

Refactor the broken morphology token system so every factory in `morphology.js` consumes `--chrome-*` CSS tokens instead of hardcoded literals. Define three morphology token sets in `globals.css` (`[data-morphology='default']`, `brutalist-stage`, `aura`), extend the `MORPHOLOGIES` registry in `themes.js` to include `AURA`, and fix the three critical hardcode files (ProjectDashboard, Roadmap, SwarmTopologyGraph) to use morphological tokens instead of inline literals.

## Architecture Decisions

| Decision                             | Choice                                                                                                                                                                                   | Alternatives considered                                           | Rationale                                                                                                                                                              |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Token contract location              | `--chrome-*` tokens redefined per `[data-morphology]` block in `globals.css`                                                                                                             | Per-component inline CSS vars                                     | The existing `[data-morphology]` block pattern in globals.css is already wired to `themes.js`; extending it avoids new infrastructure                                  |
| btnPrimaryStyle fix                  | Replace `borderRadius: '0'` → `var(--chrome-radius-control)`, `boxShadow: '3px 3px 0 0 var(--accent-shadow)'` → `var(--chrome-shadow-control)`                                           | Keep hardcoded values, use a separate brutalist-primary factory   | Consistent with the token consumption goal; brutalist primary IS consuming the `--chrome-shadow-control` token in the spec                                             |
| Brutalist factories in morphology.js | Keep `brutalPanelStyle`, `brutalProgressTrackStyle` as thin wrappers around the chrome token API                                                                                         | Remove them entirely and force everything through `ChromeSurface` | They exist in morphology.js already; refactor to also consume `var(--chrome-border-color)` instead of inlining `var(--border-strong)` so they work across morphologies |
| ProjectDashboard hardcode fix        | Remove local `brutalPanelStyle()`, `brutalPanelActiveStyle()`, `brutalBtnPrimaryStyle()`, `brutalProgressTrackStyle()` and replace usages with `ChromeSurface` + `morphology.js` imports | Import the existing local functions                               | Eliminates duplicate brutalist-specific logic; `ChromeSurface` consumes `--chrome-*` tokens directly                                                                   |
| SwarmTopologyGraph hardcode fix      | Replace `#27272a` with `var(--chrome-border-color)`, `#141416` with `var(--chrome-panel-fill)`                                                                                           | Use hardcoded dark hex values                                     | The proposal explicitly targets `#27272a` hardcode; token substitution follows spec requirement                                                                        |
| Aura morphology option               | Add to `MORPHOLOGIES` in themes.js and `MORPHOLOGY_OPTIONS` in appearance page                                                                                                           | Only add to globals.css                                           | Both sides of the pipe must agree; settings page controls the selector UI                                                                                              |

## Data Flow

```
AppearancePage
  └─> setMorphology(id)  ──> applyMorphologyToDocument()
       │
themes.js                 document.documentElement
  │                              │
  │                              v
  │                    <html data-morphology="aura">
  │                              │
  └──────────────────────────────┘
                   globals.css
                   [data-morphology='aura'] { --chrome-*: ... }
                              │
                   morphology.js factories
                   (panelStyle, btnPrimaryStyle, ...)
                              │
                   ChromeSurface / inline style objects
                              │
                   DOM elements with morphological chrome
```

Theme (`data-theme`) and morphology (`data-morphology`) are independent axes applied to the same root element. CSS variable scope resolution means morphology tokens resolve on the root and do not interfere with `--surface-*`, `--terminal-*`, or `--text-*` tokens owned by themes.

## File Changes

| File                                                 | Action | Description                                                                                                                                                                                                                            |
| ---------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/chrome/morphology.js`                           | Modify | Fix `btnPrimaryStyle` to use `var(--chrome-radius-control)` and `var(--chrome-shadow-control)`; refactor `brutalPanelStyle` / `brutalProgressTrackStyle` to use `var(--chrome-border-color)`                                           |
| `src/app/globals.css`                                | Modify | Add `data-morphology='aura'` block (lines 51–); verify `default` and `brutalist-stage` blocks match spec token values                                                                                                                  |
| `src/lib/theme/themes.js`                            | Modify | Add `AURA: 'aura'` to `MORPHOLOGIES`; add `{ id: MORPHOLOGIES.AURA, label: 'Aura', ... }` to `MORPHOLOGY_OPTIONS`                                                                                                                      |
| `src/views/ProjectDashboard.jsx`                     | Modify | Remove local `brutalPanelStyle`, `brutalPanelActiveStyle`, `brutalBtnPrimaryStyle`, `brutalProgressTrackStyle`; replace usages with `ChromeSurface` component and imported morphology factories; fix `StatCard` to use `ChromeSurface` |
| `src/views/Roadmap.jsx`                              | Modify | Replace hardcoded `borderRadius: '0'`, `border: '2px solid var(--border-strong)'`, `boxShadow: '4px 4px 0px 0px var(--border-strong)'` on milestone cards with `panelStyle()` from morphology.js                                       |
| `src/components/control-room/SwarmTopologyGraph.jsx` | Modify | Replace hardcoded `#27272a` with `var(--chrome-border-color)`, `#141416` with panel fill tokens; fix timeline dot boxShadow inline literals; use morphology tokens for node backgrounds                                                |
| `src/app/settings/appearance/page.jsx`               | Modify | Add `Aura` option to `MORPHOLOGY_OPTIONS` grid (no structural change needed; already renders from `MORPHOLOGY_OPTIONS`)                                                                                                                |

## Interfaces / Contracts

### Chrome Token Contract

```js
// Defined in [data-morphology='...'] blocks in globals.css
// All chrome concerns are expressed as --chrome-* tokens:
--chrome - radius - panel; // border-radius for panels/cards
--chrome - radius - control; // border-radius for buttons/controls
--chrome - border - width; // border thickness
--chrome - border - color; // border color
--chrome - shadow - panel; // box-shadow for panels
--chrome - shadow - control; // box-shadow for controls
--chrome - panel - fill; // panel background
--chrome - panel - fill - emphasis;
--chrome - control - fill; // control background
--chrome - control - fill - hover;
--chrome - press - offset; // press-effect translation
```

### MORPHOLOGIES Registry (themes.js)

```js
export const MORPHOLOGIES = {
  DEFAULT: 'default',
  BRUTALIST_STAGE: 'brutalist-stage',
  AURA: 'aura', // <-- ADDED
};
```

### Appearance Settings Morphology Selector

The selector at `src/app/settings/appearance/page.jsx` renders `MORPHOLOGY_OPTIONS`. Adding `AURA` there is the only change needed — no new UI components.

## Testing Strategy

| Layer       | What to test                                                         | Approach                                                                                             |
| ----------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Unit        | `btnPrimaryStyle`, `panelStyle` output uses only `--chrome-*` tokens | Add assertion: `style.borderRadius === 'var(--chrome-radius-control)'`                               |
| Unit        | `normalizeMorphology` passes unknown values to DEFAULT               | `expect(normalizeMorphology('unknown')).toBe('default')`                                             |
| Integration | Switching morphology updates `data-morphology` on document root      | Test `setMorphology('aura')` → `document.documentElement.getAttribute('data-morphology') === 'aura'` |
| Integration | `ProjectDashboard` renders without local brutalist functions         | Verify no `brutalPanelStyle` or `brutalBtnPrimaryStyle` in file after refactor                       |
| E2E         | Switch morphology via Appearance settings, verify visual change      | Playwright: click Aura option, assert no console errors, verify CSS computed styles                  |

## Migration / Rollout

No data migration required. Default morphology remains `default`. Aura is gated behind settings UI only. Rollout sequence:

1. Add `AURA` to `themes.js` registry + `globals.css` block + fix `btnPrimaryStyle` — all morphology.js factories now token-only
2. Verify `default` and `brutalist-stage` still render identically (existing CSS tokens already match spec)
3. Add `Aura` option to appearance page `MORPHOLOGY_OPTIONS`
4. Fix `ProjectDashboard.jsx`, `Roadmap.jsx`, `SwarmTopologyGraph.jsx` hardcodes

## Open Questions

- [ ] Should `brutalPanelStyle` in morphology.js be kept for backwards-compatibility of direct callers, or is removing external usage of these functions sufficient?
- [ ] The `progressFillStyle` in morphology.js uses `borderRadius: '2px'` — should this also become a token or remain as a minor refinement value?
- [ ] Does `btnDangerStyle` need the same treatment as `btnPrimaryStyle` (currently still has hardcoded `borderRadius: 'var(--chrome-radius-control)'`) — appears compliant per spec since it uses the token already.
