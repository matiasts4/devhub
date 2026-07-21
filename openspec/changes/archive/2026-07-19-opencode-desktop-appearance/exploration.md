# Exploration: opencode-desktop-appearance

## Exploration: OpenCode Desktop appearance pair (theme + morphology)

### Current State

DevHub already separates **color** from **chrome shape**:

| Axis | Attribute / storage | Owner tokens | UI wiring |
|------|---------------------|--------------|-----------|
| Theme | `html[data-theme]`, `devhub:theme` | `--surface-*`, `--text-*`, `--border-*`, `--accent-*`, shadcn HSL slots | `Ajustes.jsx` theme cards → `setTheme()` |
| Morphology | `html[data-morphology]`, `devhub:morphology` | `--chrome-radius-*`, `--chrome-border-*`, `--chrome-shadow-*`, `--chrome-*-fill`, optional `--terminal-chrome-*` | `Ajustes.jsx` morphology cards → `setMorphology()` |
| Palette | `body[data-palette]`, `devhub:palette` | Switchyard-only accent/background variants | Switchyard morphology only |
| Accent override | `html[data-accent]`, `devhub:accent` | Overrides `--accent-primary` when not `theme` | Ajustes accent grid |
| Motion mode | `html[data-motion-mode]`, `devhub:motion-mode` | `--motion-dur-*` + reduced-motion gates | Ajustes Motion toggle (`reduced` / `normal` / `amplified`) |
| Density | `html[data-density]`, inside `devhub:appearance` JSON | `--density-row-padding-*`, `--density-row-gap` | **Helpers exist** (`applyAppearanceSettings`); **no selector in Ajustes today** |

**Registry today** (`src/lib/theme/themes.js`):

- Themes: `deep-sea`, `nord`, `dracula`, `light`, `catppuccin`, `tokyo-night`, `monokai`, `synthwave`, `brutalist-stage`, `switchyard`
- Morphologies: `default`, `brutalist-stage`, `aura`, `switchyard`, `cursor`

**Chrome pipeline** is stable and reusable:

1. `[data-morphology='…']` sets `--chrome-*` in `src/app/globals.css`
2. `src/chrome/morphology.js` factories + `ChromeSurface` / `chromeSurfaceStyle` consume those vars
3. Terminal shell uses `src/components/terminal/terminalChromeStyles.js`, which already falls back through `--terminal-chrome-*` → `--chrome-*` (layout frozen; tokens only — `terminal-shell-morphology-guardrails`)

**OpenCode token file already present but unused by shell:**

- `src/app/globals.css` imports `./opencode-vars.css`
- That file defines OC-2 design language (`--background-base`, `--text-strong`, `--surface-raised-*`, gray/cobalt/yuzu scales, etc.)
- Dark values switch via `@media (prefers-color-scheme: dark)`, **not** `data-theme`
- DevHub shell reads `--surface-app`, `--text-primary`, `--accent-primary`, etc. — **zero name overlap** with OC semantic tokens
- Conclusion: `opencode-vars.css` is reference inventory / future bridge material, not a live theme

**Appearance UI:**

- Canonical wiring: `src/views/Ajustes.jsx` (`renderThemeTab`, test id `ajustes-appearance-shell`)
- Deprecated `src/app/settings/appearance/page.jsx` is **gone** (confirmed; skill still correct)
- Theme and morphology are **independent** clicks; no preset / “apply pair” helper exists
- Naming collision precedent: `brutalist-stage` and `switchyard` exist as **both** theme id and morphology id, but selecting one does **not** auto-select the other

**Motion:**

- App uses `framer-motion` + CSS motion kit (`--motion-dur-*`, `.dh-panel-in`, `.dh-tab-in`, `.dh-pill-in`, `.dh-reveal`)
- In-app `data-motion-mode='reduced'` already quiets structural CSS motion
- No SolidJS `motion` package; do not add it

**Prior art for this class of change:**

- `openspec/changes/brutalist-stage-morphology/*`, `docs/40_Brutalist_Stage_Morphology_Proposal.md`
- `openspec/changes/cursor-morphology/*` (fifth morphology via tokens-only; factories unchanged)
- `openspec/changes/archive/2026-05-29-switchyard-fourth-theme-system/*`
- Skill recipe: `skills/devhub-morphology/SKILL.md`

### Affected Areas

- `src/lib/theme/themes.js` — add `THEMES.OPENCODE`, `MORPHOLOGIES.OPENCODE_DESKTOP`, options, `WARNING['opencode']`; optional `applyAppearancePreset()` helper
- `src/app/globals.css` — `[data-theme='opencode']` color block; `[data-morphology='opencode-desktop']` chrome (+ terminal chrome token overrides); optional quieter motion under morphology
- `src/app/opencode-vars.css` — **read-only reference** in this change (do not rewire shell to OC names)
- `src/views/Ajustes.jsx` — morphology/theme cards auto-appear from options arrays; add optional one-click preset control; optionally surface density if preset needs compact
- `src/chrome/morphology.js` — **no factory change expected** (token consumers only)
- `src/components/ui/chrome-surface.jsx` — no change expected
- `src/components/terminal/terminalChromeStyles.js` — no structural change; benefits from morphology terminal token overrides
- `src/components/TitleBar.jsx` — **out of core scope** (follow-up chrome diet); tokens may still tint it via surfaces
- Tests:
  - `src/lib/theme/__tests__/themes.test.js` — registry + token block assertions (cursor/switchyard pattern)
  - `src/chrome/__tests__/morphology.five-morphologies.test.js` — rename/extend expected radius map (becomes six morphologies)
  - `src/components/__tests__/cssTokens.test.js` — every `[data-theme]` must define `--warning`
  - Existing terminal chrome / morphology e2e specs if present (smoke only)

### Approaches

#### A) Scope of axes: theme-only vs morphology-only vs pair

1. **Theme-only `opencode`**
   - Pros: smallest diff; pure color swap
   - Cons: misses quiet rounded chrome that defines OpenCode Desktop feel; pair intent unsatisfied
   - Effort: Low

2. **Morphology-only `opencode-desktop`**
   - Pros: chrome geometry without new palette
   - Cons: OC near-black surfaces + text hierarchy still missing; looks like “rounded Deep Sea”
   - Effort: Low–Medium

3. **Paired theme + morphology (recommended)**
   - Pros: matches user intent; mirrors brutalist/switchyard dual-axis pattern without forcing same key; independent mix still possible
   - Cons: two registry+CSS blocks + preset UX; slightly larger review surface
   - Effort: Medium

#### B) Token source strategy for theme colors

1. **Bridge `opencode-vars.css` live into DevHub `--surface-*`**
   - Map OC `--background-base` → `--surface-app`, etc., under `[data-theme='opencode']` via `var(--background-base)`
   - Pros: single source if OC file updates
   - Cons: OC dark depends on **OS** `prefers-color-scheme`, not DevHub theme; light OS + dark DevHub theme breaks; couples shell to 1.3k-line foreign token dump; risk of accidental global bleed (vars already on `:root`)
   - Effort: Medium, risk High

2. **Standalone `[data-theme='opencode']` block; sample OC dark values as reference (recommended)**
   - Hand-author DevHub semantic tokens from OC dark palette (near-black `#101010` / `#121212` / `#161616` surfaces, soft white text hierarchy, muted borders, brand/interactive accent — OC dark brand skews warm sand `#fab283` / interactive blue `#9dbefe`; pick one primary accent and document)
   - Pros: matches every other theme block; theme switch is self-contained; no OS color-scheme dependency; reviewable ~40–60 CSS lines
   - Cons: values can drift from upstream OC file (acceptable — inspiration, not pixel-clone)
   - Effort: Low–Medium

3. **Hybrid: standalone theme + comment map to OC token names**
   - Same as (2) with source comments (`/* OC --background-base */`) for maintainability
   - Pros: audit trail without runtime bridge
   - Cons: comments only
   - Effort: Low (additive to 2)

#### C) Coupling UX: auto-suggest vs independent + preset

1. **Hard couple theme ↔ morphology**
   - Selecting `opencode` forces `opencode-desktop` and vice versa
   - Pros: always “correct” pair
   - Cons: breaks axis independence proven by tests (`setMorphology` must not mutate theme); fights product model
   - Effort: Low, design cost High

2. **Soft suggest (toast / “also apply morphology?”)**
   - Pros: educates without forcing
   - Cons: extra UX states; easy to ignore; more Ajustes code
   - Effort: Medium

3. **Independent axes + optional one-click preset (recommended)**
   - Axes stay orthogonal (existing storage/attrs)
   - New control e.g. “OpenCode Desktop” preset applies: `theme=opencode` + `morphology=opencode-desktop` + `density=compact` (+ optional `accent=theme`, leave motion mode alone unless product asks)
   - Pros: matches user request; preserves mix-and-match; small helper in `themes.js` is unit-testable
   - Effort: Low–Medium

#### D) TitleBar / chrome diet scope

1. **Include TitleBar redesign in this change**
   - Pros: fuller OC desktop vibe
   - Cons: layout/interaction risk; blows review budget; couples visual diet to token work
   - Effort: High

2. **Token-only impact now; TitleBar diet follow-up (recommended)**
   - TitleBar already inherits surface/text/border tokens → theme alone retints it
   - Morphology may soften radii/borders if TitleBar uses chrome factories; do **not** restructure TitleBar, traffic lights, or drag regions here
   - Effort: None in core slices; follow-up PR if needed

### Recommendation

Ship a **paired appearance** with **orthogonal axes** and an **optional preset**:

| Piece | Key | Role |
|-------|-----|------|
| Theme | `opencode` | Near-black OC-inspired surfaces, text hierarchy, accent, `terminalBg` in `THEME_OPTIONS` |
| Morphology | `opencode-desktop` | Quiet chrome: modest radius (~10–14px panel, ~6–8px control), 1px soft borders, low shadows, subtle panel fills; terminal chrome token overrides only |
| Preset | `opencode-desktop` (UI label) | One click → theme + morphology + density `compact` |
| Motion | criteria only | Prefer quieter structural motion under morphology via CSS token/duration overrides and/or documenting that `reduced`/`normal` is enough; **no** new motion library |
| Icons | unchanged | Lucide chrome icons stay; custom file/provider sprites = **phase 2 / out of scope** |

**Token strategy:** standalone `[data-theme='opencode']` in `globals.css`, values inspired by OC dark section of `opencode-vars.css`, **not** a live `var()` bridge.

**Do not:**

- Port SolidJS, Kobalte, or OpenCode UI components
- Add Solid `motion` package
- Change terminal layout/structure/button positions
- Modify existing morphology token values
- Touch product code on dirty `feature/electron-desktop-host` until apply phase on a clean slice branch

**Suggested token targets (design phase to lock exact values):**

Theme `opencode` (dark-only theme id; not a light mode):

- `--surface-app` ≈ `#101010` / oklch near-black
- `--surface-card` ≈ `#161616`
- `--surface-elevated` ≈ `#1c1c1c`
- `--text-primary` high-contrast soft white (~0.94 alpha white)
- `--text-secondary` / `--text-muted` stepped down opacity whites
- `--border-subtle` / `--border-strong` low-contrast white alphas
- `--accent-primary`: prefer OC interactive blue-leaning (`#9dbefe` family) **or** warm brand sand (`#fab283`) — **decision for propose/design**; recommendation lean **cool interactive blue** so it does not collide with Cursor morphology’s forced amber
- `THEME_OPTIONS.terminalBg`: `{ bg, fg, headerBg }` aligned to surfaces
- `WARNING.opencode` entry required (cssTokens + setTheme path)

Morphology `opencode-desktop`:

- `--chrome-radius-panel: 12px` (quieter than aura 1.25rem / switchyard 18px; not brutalist 0)
- `--chrome-radius-control: 8px`
- `--chrome-border-width: 1px`
- Soft border color mix from `--border-subtle`
- Low shadow panel (subtle depth, no hard offset, no heavy glow)
- Panel fills close to surface tokens (quiet, not glass-heavy like aura)
- `--terminal-chrome-border-width/color/shadow` light overrides (brutalist-stage pattern)
- Optional: `--chrome-press-offset: 0px`
- Do **not** force `--accent-primary` inside morphology (unlike cursor/switchyard) so theme accent remains authoritative when pair is used; keeps axes clean

**Motion criteria (no new package):**

- Under `[data-morphology='opencode-desktop']`, optionally shorten structural CSS durations or reduce translate distances for `.dh-panel-in` / `.dh-tab-in` / `.dh-pill-in` only
- Respect existing `data-motion-mode` and `prefers-reduced-motion`
- framer-motion call sites unchanged unless a later slice finds a single shared transition constant

### Phased delivery (auto-chain, ≤800-line review budget)

Session preflight: `delivery_strategy: auto-chain`, `review_budget_lines: 800`. Forecast: **chained PRs recommended**.

| Slice | Name | Contents | Est. churn | Depends |
|-------|------|----------|------------|---------|
| **PR-1** | Theme foundation | `THEMES.OPENCODE` + `THEME_OPTIONS` + `WARNING` + `[data-theme='opencode']` + themes/cssTokens tests | ~150–250 | — |
| **PR-2** | Morphology foundation | `MORPHOLOGIES.OPENCODE_DESKTOP` + options + `[data-morphology='opencode-desktop']` (+ terminal chrome tokens) + morphology tests (update five→six map) | ~150–250 | optional after PR-1 |
| **PR-3** | Appearance preset + density apply | `applyOpenCodeDesktopPreset()` (or generic `applyAppearancePreset`) in `themes.js`; Ajustes one-click control; ensure density compact via existing appearance helpers; unit tests | ~120–220 | PR-1 + PR-2 |
| **PR-4** (optional / thin) | Quieter structural motion criteria | Morphology-scoped CSS motion diet only | ~40–80 | PR-2 |
| **Follow-up (out of change or phase 2)** | TitleBar chrome diet; custom SVG icon sprites | Structural TitleBar; vite sprites for file/provider icons | separate | after pair ships |

**Notes on chaining:**

- PR-1 and PR-2 can be sequential on feature branch `opencode-desktop-appearance` (or stacked); each is independently verifiable
- PR-3 is the user-visible “one click feels like OpenCode Desktop” moment
- Keep each PR under ~400 lines preferred; 800 is hard ceiling per preflight
- strict_tdd: true in `openspec/config.yaml` — write/extend failing registry+token tests first in apply

**Verification per slice:**

- Unit: `themes.test.js`, morphology chrome tests, `cssTokens.test.js`
- Manual visual: Ajustes appearance, dashboard panel, kanban column, terminal header/workspace bar (geometry unchanged)
- No e2e required for PR-1; light morphology smoke optional for PR-2/3 if existing Playwright morphology specs are cheap to extend

### Risks

- **Live bridge to `opencode-vars.css`** would bind theme to OS color-scheme and foreign token names — reject for this change
- **Morphology forcing accent** (cursor/switchyard pattern) would fight theme accent when pair is used — avoid accent lock on `opencode-desktop`
- **Five-morphologies test name/map** will break until updated — expected, include in PR-2
- **Density UI gap**: preset can set compact via API without a full density control; if Ajustes never shows density, users cannot undo compact except by preset reverse or devtools — PR-3 should either expose a minimal density control or reset density when leaving preset / document storage key
- **Same-key confusion**: using distinct ids `opencode` vs `opencode-desktop` avoids brutalist/switchyard dual-meaning; good
- **Dirty tree** on `feature/electron-desktop-host`: exploration only; implement on clean branch cut from agreed base
- **Review budget**: theme CSS block + morphology block + Ajustes preset in one PR risks >800 lines — keep chained
- **Terminal regression**: any non-token terminal edit violates guardrails — factories already tokenized; stay CSS-only for terminal chrome
- **Pixel-clone pressure**: OC Desktop is Solid/Electron reference only; DevHub must keep React/chrome-token architecture

### Ready for Proposal

**Yes.** Orchestrator should run **sdd-propose** for `opencode-desktop-appearance` with:

- In scope: theme `opencode`, morphology `opencode-desktop`, optional preset (+ density compact), motion criteria only, tests, Ajustes wiring
- Out of scope: Solid/Kobalte/OC components, Solid `motion`, icon sprites, TitleBar structural diet, terminal layout changes, live opencode-vars bridge
- Delivery: auto-chain PR-1 → PR-2 → PR-3 (+ optional PR-4)
- Next artifact: `proposal.md` then specs for appearance axes + terminal guardrails compliance

### Open decisions for propose/design (non-blocking)

1. Accent hue for theme `opencode`: cool interactive blue vs warm brand sand (recommend cool blue).
2. Exact radius numbers (recommend 12 / 8).
3. Whether PR-3 exposes density control in Ajustes or only via preset.
4. Whether quieter motion is PR-4 or deferred entirely if preset + morphology already feel calm.
