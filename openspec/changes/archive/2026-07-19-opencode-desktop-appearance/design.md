# Design: opencode-desktop-appearance

## Technical Approach

Ship an OpenCode Desktop–inspired **appearance pair** on the existing orthogonal axes: theme owns color, morphology owns chrome shape. No factory rewrite. Optional one-click preset applies theme `opencode` + morphology `opencode-desktop` + density `compact` with an explicit undo path. Delivery is a feature-branch chain (PR-1…PR-3, optional PR-4).

Maps to proposal capabilities `opencode-theme`, `opencode-desktop-morphology`, `opencode-desktop-appearance-preset`, and delta on `morphology-system` (five→six).

## Architecture Decisions

| Decision | Options / tradeoff | Choice |
|----------|-------------------|--------|
| Axis model | Couple vs independent | **Independent** `data-theme` + `data-morphology` (same as cursor/switchyard/brutalist). Preset is convenience only. |
| Theme tokens | Live-bridge `opencode-vars.css` vs standalone | **Standalone** `[data-theme='opencode']` DevHub semantic vars. OC dark is sample reference only (comments may map OC names). Avoids OS `prefers-color-scheme` bleed. |
| Accent | Amber (cursor clash) vs cool blue | **Cool interactive blue** `#9dbefe` family → `--accent-primary` / shadcn primary in theme block. |
| Morphology accent | Lock like cursor/switchyard vs omit | **Omit** `--accent-primary` in morphology so theme owns accent. Product lock overrides skill checklist accent step. |
| Chrome geometry | New factories vs tokens | **Tokens only** — factories/`ChromeSurface`/`terminalChromeStyles` already consume `--chrome-*` / `--terminal-chrome-*`. |
| Density UX | Preset-only vs control | Preset sets `compact` via `applyAppearanceSettings`; PR-3 adds **minimal density toggle or preset reset** so compact is reversible without devtools. |
| Motion | Solid `motion` vs CSS quiet | Keep **framer-motion**. Optional PR-4: morphology-scoped quieter `.dh-panel-in` / `.dh-tab-in` / `.dh-pill-in`; honor `data-motion-mode` + `prefers-reduced-motion`. |

## Orthogonal Axes

```
html[data-theme]          → --surface-* --text-* --border-* --accent-* --warning  (color)
html[data-morphology]     → --chrome-*  [--terminal-chrome-*]                     (shape)
html[data-density]        → --density-row-*                                        (spacing)
html[data-accent]         → optional accent override (unchanged; theme default = theme)
html[data-motion-mode]    → --motion-dur-* gates                                   (motion)
```

Selecting theme does **not** set morphology (and vice versa). Preset is the only multi-axis writer.

## Token Mapping Strategy

### Theme `opencode` (PR-1)

Hand-author full block in `globals.css` like existing themes (deep-sea/switchyard pattern):

| DevHub token family | Sample OC dark reference | Notes |
|---------------------|--------------------------|-------|
| `--surface-app` / card / elevated / muted / hover | `#101010` / `#161616` ladder | Near-black, low chroma |
| `--text-primary` / secondary / muted | OC text-strong → muted | High legibility on near-black |
| `--border-subtle` / strong | Soft gray borders | No heavy chrome |
| `--accent-primary` (+ secondary, rgb, shadow, glow) | Cool blue `#9dbefe` family | Avoids cursor amber |
| shadcn HSL slots (`--background`, `--primary`, …) | Align to same ladder | Keep shadcn consumers consistent |
| `--warning` + `WARNING.opencode` in `themes.js` | Warm yellow oklch (dark-theme family) | Required by cssTokens contract |
| `THEME_OPTIONS` `terminalBg` | `{ bg, fg, headerBg }` near-black | xterm palette hint only |

**Do not** `var()` into `opencode-vars.css`. File stays imported but unused by shell (reference inventory).

### Morphology `opencode-desktop` (PR-2)

Append after cursor block. Target quiet OC chrome:

```css
[data-morphology='opencode-desktop'] {
  --chrome-radius-panel: 12px;
  --chrome-radius-control: 8px;
  --chrome-border-width: 1px;
  --chrome-border-color: color-mix(in srgb, var(--border-subtle) 88%, transparent);
  --chrome-shadow-panel: 0 8px 20px rgba(0, 0, 0, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.02);
  --chrome-shadow-control: 0 2px 8px rgba(0, 0, 0, 0.14);
  --chrome-panel-fill: color-mix(in srgb, var(--surface-card) 98%, transparent);
  --chrome-panel-fill-emphasis: color-mix(in srgb, var(--surface-elevated) 96%, transparent);
  --chrome-control-fill: color-mix(in srgb, var(--surface-card) 92%, transparent);
  --chrome-control-fill-hover: color-mix(in srgb, var(--surface-elevated) 94%, transparent);
  --chrome-press-offset: 0px;
  /* terminal chrome only — layout frozen */
  --terminal-chrome-border-width: 1px;
  --terminal-chrome-border-color: color-mix(in srgb, var(--border-subtle) 70%, transparent);
  --terminal-chrome-shadow-panel: none;
  --terminal-header-divider-width: 1px;
  --terminal-header-divider-color: color-mix(in srgb, var(--border-subtle) 55%, transparent);
  /* NO --accent-primary here */
}
```

Exact hex/oklch may refine in apply; radii ~12/8 and “no accent lock” are fixed.

## Preset Helper API + Density + Undo (PR-3)

Add to `src/lib/theme/themes.js` (names may be slightly adjusted at apply):

```js
export const OPENCODE_DESKTOP_PRESET = {
  theme: 'opencode',
  morphology: 'opencode-desktop',
  density: 'compact',
};

/** @returns snapshot for undo */
export function applyOpenCodeDesktopPreset() {
  const before = {
    theme: getStoredTheme(),
    morphology: getStoredMorphology(),
    appearance: getStoredAppearance(),
  };
  setTheme(OPENCODE_DESKTOP_PRESET.theme);
  setMorphology(OPENCODE_DESKTOP_PRESET.morphology);
  const nextAppearance = { ...before.appearance, density: 'compact' };
  setStoredAppearance(nextAppearance);
  applyAppearanceSettings(nextAppearance);
  return before;
}

export function restoreAppearanceSnapshot(snapshot) { /* setTheme/setMorphology + appearance */ }

export function setDensity(density) {
  const appearance = { ...getStoredAppearance(), density };
  setStoredAppearance(appearance);
  applyAppearanceSettings(appearance);
  return appearance.density;
}
```

**Ajustes** (`renderThemeTab` / `ajustes-appearance-shell`):

1. One-click “OpenCode Desktop” control → `applyOpenCodeDesktopPreset()`, keep last snapshot in component state (or session key).
2. Undo → `restoreAppearanceSnapshot(snapshot)` when available; else reset density to `comfortable` via `setDensity`.
3. Minimal density control (compact | comfortable) so compact is always reversible without the preset.

Theme/morphology cards still map from `THEME_OPTIONS` / `MORPHOLOGY_OPTIONS` automatically once registry grows — no hard-couple.

## Data Flow

```
[Preset click]
   ├─ setTheme('opencode')           → html[data-theme] + WARNING + localStorage
   ├─ setMorphology('opencode-desktop') → html[data-morphology] + localStorage
   └─ appearance.density='compact'   → html[data-density] + devhub:appearance JSON

[Independent card click]
   theme card     → setTheme only
   morphology card → setMorphology only

CSS cascade
   theme colors ──► surfaces/text/accent
   morphology  ──► --chrome-* / --terminal-chrome-*
   factories   ◄── var() consumers (unchanged)
```

## File Changes

### Touch

| File | Action | Description |
|------|--------|-------------|
| `src/lib/theme/themes.js` | Modify | `THEMES.OPENCODE`, `MORPHOLOGIES.OPENCODE_DESKTOP`, options, `WARNING.opencode`, preset + density helpers |
| `src/app/globals.css` | Modify | `[data-theme='opencode']`; `[data-morphology='opencode-desktop']`; optional PR-4 motion quiet |
| `src/views/Ajustes.jsx` | Modify | Preset control + density undo path (PR-3) |
| `src/lib/theme/__tests__/themes.test.js` | Modify | Registry, independence, preset/undo, WARNING |
| `src/chrome/__tests__/morphology.five-morphologies.test.js` | Modify | Six-map: add `'opencode-desktop': '12px'`; comment five→six |
| `src/components/__tests__/cssTokens.test.js` | Modify | Assert `--warning` in opencode theme block (existing loop covers if block complete) |

### Non-touch (explicit)

| File / area | Why |
|-------------|-----|
| `src/app/opencode-vars.css` | Reference only; no live bridge |
| `src/chrome/morphology.js` | Token consumer; no new chrome type |
| `src/components/ui/chrome-surface.jsx` | Unchanged |
| `src/components/terminal/terminalChromeStyles.js` | Already falls back `--terminal-chrome-*` → `--chrome-*` |
| `src/components/TitleBar.jsx` | Out of scope (tint via theme only) |
| Terminal layout / button positions | Guardrails; tokens only |
| Existing theme/morphology token values | No regressions |
| framer-motion call sites / Solid | No rewrite; no Solid port |

## Interfaces / Contracts

```js
// ids
THEMES.OPENCODE === 'opencode'
MORPHOLOGIES.OPENCODE_DESKTOP === 'opencode-desktop'

// normalize unknown → defaults (existing behavior)
normalizeTheme('opencode') // 'opencode'
normalizeMorphology('opencode-desktop') // 'opencode-desktop'
normalizeTheme('garbage') // 'deep-sea'
normalizeMorphology('garbage') // 'default'

// density already valid in normalizeAppearance: 'compact' | 'comfortable'
```

Storage keys unchanged: `devhub:theme`, `devhub:morphology`, `devhub:appearance`.

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit | Registry + normalize + independent persist | `themes.test.js` — OPENCODE / OPENCODE_DESKTOP options; setMorphology does not change theme; preset snapshot restore |
| Unit | CSS morphology radii map | `morphology.five-morphologies.test.js` — six entries incl. `opencode-desktop: 12px`; no chrome `borderRadius: 0` regressions |
| Unit | `--warning` per theme | `cssTokens.test.js` — every `[data-theme]` block including `opencode` |
| Unit | Density tokens | Existing density compact assertions remain green |
| E2E (optional smoke) | Ajustes appearance shell | If suite exists: select theme/morphology/preset; assert `data-*` attributes. Skip if no harness. |

`strict_tdd: true` — RED tests in each PR before GREEN implementation.

## Chained PR Plan (≤800 LOC; prefer ~400)

| PR | Branch target | Scope | Verify |
|----|---------------|-------|--------|
| **PR-1 Theme** | feature tracker | `THEMES.OPENCODE`, THEME_OPTIONS, WARNING, `[data-theme='opencode']`, themes + cssTokens tests | theme selectable; no morphology yet |
| **PR-2 Morphology** | PR-1 | `MORPHOLOGIES.OPENCODE_DESKTOP`, options, morphology CSS + terminal chrome tokens, six-map test | morphology selectable alone; no accent lock |
| **PR-3 Preset + density** | PR-2 | helpers + Ajustes preset + density undo + tests | one-click pair+compact; undo works |
| **PR-4 Motion quiet (optional)** | PR-3 | morphology-scoped quieter structural CSS only | reduced-motion still wins; defer if pair already calm |

Each PR independently revertable. No schema migrations.

## Migration / Rollout

No migration required. Unknown stored ids already normalize to defaults. Feature ships behind normal localStorage appearance keys.

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Live OC vars ↔ OS color-scheme | Rejected; standalone theme block |
| Morphology accent fights theme | No `--accent-primary` in morphology |
| Compact density stuck | PR-3 density control or preset undo |
| five→six test fails | Update expected map in PR-2 |
| Terminal structural edits | CSS tokens only; non-touch list |
| Review budget overrun | Auto-chain PR-1…PR-3 (+ optional PR-4) |
| Pixel-clone pressure | Reference vibe only; React/token architecture |
| Dirty electron worktree | Implement on clean slice branch |

## Explicit Non-Goals

- TitleBar structural diet (tokens may tint only)
- Icon sprites / custom file-provider SVGs
- SolidJS, Kobalte, OC component port; pixel-clone
- Live bridge of `opencode-vars.css` into shell tokens
- Solid `motion` package; framer-motion call-site rewrite
- Terminal layout / structure / button positions
- Changing existing morphology or theme token values
- Morphology forcing `--accent-primary`

## Open Questions

- [ ] Exact oklch/hex ladder for surfaces (apply may sample OC dark once more)
- [ ] Density UI: dual-toggle vs preset-undo-only (prefer dual-toggle if LOC allows)
- [ ] Ship PR-4 or defer after visual QA of pair

## Rollback

Per-PR revert of registry + CSS + Ajustes + tests. Full remove: drop `opencode` / `opencode-desktop` entries and CSS blocks + preset helper. Stored unknowns fall back via `normalizeTheme` / `normalizeMorphology`.
