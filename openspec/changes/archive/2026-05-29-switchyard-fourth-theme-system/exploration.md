# Exploration: switchyard-fourth-theme-system

## Current State

DevHub has a layered appearance system:

1. **Theme** (`data-theme`) — color palette only, 9 options (Deep Sea, Nord, Dracula, Light, Catppuccin, Tokyo Night, Monokai, Synthwave, Brutalist Stage). Drives `--accent-primary`, `--surface-*`, `--text-*`, `--border-*` tokens.
2. **Morphology** (`data-morphology`) — chrome shape language. Three options already live:
   - `default` — 1rem radius, soft shadows, pill controls
   - `brutalist-stage` — 0 radius, 2px borders, 4px hard-offset shadows, flat fills
   - `aura` — 1.25rem radius, accent-tinted glassmorphism panels
3. **Accent** (`data-accent`) — accent color override (10 stand-alone options independent of theme palette).

Settings UI at `src/app/settings/appearance/page.jsx` exposes all three axes simultaneously. `src/lib/theme/themes.js` owns registry + persistence. `src/app/globals.css` owns the token layer for themes and morphologies. `src/chrome/morphology.js` and `src/components/ui/chrome-surface.jsx` own shared chrome primitives consumed by all components.

The Switchyard preview (`public/previews/devhub-command-switchyard.html`) is a standalone HTML page using Chakra Petch + IBM Plex Mono fonts, a structured teal-on-dark color system, 18px radius panels, 3px inner border glow on cards, metallic gradient fills, and a CSS-only palette switcher (mineral / cobalt / alloy) driven by `body[data-palette='...']`.

## Affected Areas

- `src/lib/theme/themes.js` — add `SWITCHYARD = 'switchyard'` to `MORPHOLOGIES`, add option to `MORPHOLOGY_OPTIONS`, wire storage/persistence
- `src/app/globals.css` — add `[data-morphology='switchyard']` block with dedicated `--chrome-*` token set
- `src/components/ui/chrome-surface.jsx` — extend `chromeSurfaceStyle()` / `ChromeSurface` to handle Switchyard-specific radius (18px) and shadow treatment
- `src/chrome/morphology.js` — review factory functions for compatibility with Switchyard's metallic gradient fills and glow treatment; may need no changes
- `src/app/settings/appearance/page.jsx` — add SWITCHYARD to `MORPHOLOGY_OPTIONS` with description
- `openspec/changes/switchyard-fourth-theme-system/exploration.md` — this document
- `openspec/changes/switchyard-fourth-theme-system/proposal.md` — next phase output

## Design Decomposition from Preview

### Morphology layer (shape + surface language)
These traits are morphology-determining, not palette-specific:
- **18px panel radius** — largest in the system (Aura uses 1.25rem / 20px; Default uses 1rem / 16px)
- **3px inset border on card surfaces** — `inset 0 0 0 1px rgba(255,255,255,0.03)` per card
- **Metallic gradient fills** — `linear-gradient(180deg, rgba(18,28,33,0.98), rgba(10,16,19,0.98))` with subtle inner highlight
- **Body background with grid overlay** — radial gradient halos + 24px grid lines (`background-image: radial-gradient(...), linear-gradient(...)x2`)
- **Diagonal highlight sweep** on card `::after` pseudo-element — `linear-gradient(135deg, rgba(228,255,251,0.04), transparent 42%)`
- **Hard press offset** on buttons — `translateY(-1px)` on hover, `translateY(0)` on active via `::before` tint layer
- **Nav chips use uppercase tracking + border + background transitions**
- **Sidebar shell** with dark surface + teal-tinted borders

### Theme/atmosphere layer (color roles)
The preview defines three palette directions via `body[data-palette]`:
- **mineral** (default): teal accent `#63d0c0`, cold-mineral dark surface (`#091014` base), blue-violet secondary `rgba(79,131,212)`
- **cobalt**: blue accent `#7a93ff`, navy-dark surface, warm-white text
- **alloy**: sand/bronze accent `#d4a16a`, warmer dark surface

These map cleanly to the existing `data-accent` axis. The preview uses `data-palette` on `<body>` but the in-app equivalent is `data-accent` — the mineral baseline uses the teal which is already the default for Brutalist Stage accent, cobalt maps to the existing ACENTS.CYAN+custom tone, and alloy would need a new accent definition or a custom tone via existing amber.

### Color roles within Switchyard
- `--accent: #63d0c0` (mineral teal) / `#7a93ff` (cobalt) / `#d4a16a` (alloy)
- `success: #43d19e` (mint — used for live/status indicators)
- `warn: #ef6b7b` (rose — used for warn/contention states)
- Grid/texture overlay uses subtle `rgba(228,255,251,0.02)` hairline grid

### Font pairing (Morphology? — likely independent)
- Display/UI: Chakra Petch (geometric, slightly futuristic)
- Monospace/terminal: IBM Plex Mono
- This is a font-pair choice, not morphology-per se, but the Brutalist Stage handoff showed font choice can be morphology-scoped.

## Implementation Approaches

### 1. Conservative / Palette Extension (Lowest Risk)
Treat Switchyard's mineral/cobalt/alloy as accent color variations INSIDE an existing morphology (e.g. as a new palette variant under Brutalist Stage aesthetics). Result: SWITCHYARD is not a separate morphology; it is an enhanced Brutalist Stage visual direction.
- **Approach**: No new `data-morphology` entry. Instead extend the Brutalist Stage `brutalist-stage` morphology with an optional `data-palette='mineral|cobalt|alloy'` layer that overrides accent, background halos, and grid tint. Add nothing to `MORPHOLOGIES`, only wire the `body[data-palette]` pattern into the CSS variable system.
- **Pros**: Minimal delta; uses existing infrastructure; the mineral/cobalt/alloy system is achieved through accent-only changes.
- **Cons**: Not a true fourth morphology; dilutes the distinction the user asked for ("fourth real visual system"); the 18px radius and shimmer effects would need to be retrofitted onto Brutalist Stage's 0-radius language.
- **Effort**: Low-Medium
- **Review budget**: Low (adds CSS custom property layer + settings option)

### 2. Full Fourth Morphology (Recommended)
Add Switchyard as `MORPHOLOGIES.SWITCHYARD = 'switchyard'` with its own `[data-morphology='switchyard']` CSS block. Its character is derived from the HTML preview: 18px radius, shimmer pseudo-elements, metallic fills, teal-on-dark palette, font pair Chakra Petch + IBM Plex Mono.
- **Pros**: Clean architectural extension; matches exactly how Aura and Brutalist Stage were added; becomes a persistent user-selectable option (4th morphology); mineral/cobalt/alloy palette variants can be expressed via a new `data-palette` axis that does not conflict with any existing attribute.
- **Cons**: Requires CSS work in globals.css; settings UI update; chrome-surface.js primitives may need extension for 18px radius + shimmer effect.
- **Effort**: Medium
- **Review budget**: Medium — plan for 400-line budget, may need chained PRs

### 3. Hybrid Architecture (Aura-like Glow + Mineral Palette)
Make Switchyard a lightweight morphology variant that reuses Aura's glass/shimmer approach (Aura has smooth radius and translucent fills, Switchyard has the teal metallic palette + grid texture). This keeps the shimmer pseudo-element pattern already present in Aura.
- **Pros**: Reuses shimmer pattern already in Aura; teal metallic fill is a color change from Aura's accent-tinted glass.
- **Cons**: Switchyard's background grid texture is unique; Aura's morphology semantics (`glassmorphism`) would be confused by a metallic-grid variant; not a clean semantic fit.
- **Effort**: Medium
- **Review budget**: Similar to Approach 2

## Recommendation

**Approach 2 — Full Fourth Morphology** is the correct path.

Reasoning:
1. The user explicitly asked for a fourth real visual system, not a palette tweak inside Brutalist Stage.
2. The architecture is already proven: Brutalist Stage (0-radius hard-shadow) and Aura (glassmorphism) added as parallel morphology options with zero friction. Doing the same for Switchyard is entirely additive.
3. The mineral/cobalt/alloy color variations map cleanly to a `data-palette` axis (already expressed in the HTML preview as `body[data-palette='mineral|cobalt|alloy']`). When the user selects Switchyard as their morphology, they get the full shape language. Then within that morphology, a separate palette picker can offer the three color directions — this is NOT a conflict.
4. The 18px radius is distinctly larger than all existing morphologies (Aura at 20px soft, Default at 16px, Brutalist Stage at 0) — this is a genuine new morphology character, not a trivial variant.
5. Font pairing (Chakra Petch + IBM Plex Mono) can be introduced as a morphology-scoped typographic reflow — similar in spirit to how Brutalist Stage sometimes overrides with uppercase tracking. Document this as a separate axis if needed.

### Implementation Plan Sketch
1. Add `SWITCHYARD` to `MORPHOLOGIES` in `themes.js` + option for `MORPHOLOGY_OPTIONS`
2. Add `[data-morphology='switchyard']` block in `globals.css` with distinctive `--chrome-*` vars
3. Extend `chromeSurfaceStyle()` in `chrome-surface.jsx` (or add a new factory) to support Switchyard shimmer + 18px radius
4. Optionally scope font-family swap via morphism-scoped `--font-family-switchyard` token
5. Wire up palette swap: add `PALETTE_OPTIONS` + `data-palette` persistence + `applyPaletteToDocument()` — same pattern as theme/morphology, separate axis
6. Add SWITCHYARD card in appearance settings, with sub-palette selector inside it
7. Write proposal and design following standard SDD flow

## Risks

1. **CSS token inflation** — adding `--chrome-*` for a fourth morphology alongside existing Aura + Brutalist Stage adds ~15-20 lines per morphology to globals.css; manageable but must stay clean.
2. **Font scope creep** — introducing Chakra Petch + IBM Plex Mono as Switchyard-specific fonts requires verifying the fonts load correctly in the Next.js app context and that font-display is handled. Existing app uses Geist + JetBrains Mono.
3. **Palette-axis confusion** — if mineral/cobalt/alloy are introduced as a separate picker inside the SWITCHYARD morphology slot in settings, this creates a two-level picker (morphology → palette) that the settings UI hasn't been designed for. Needs careful UX scoping.
4. **Duplicate shimmer cost** — Aura already uses shimmer pseudo-elements; if Switchyard also uses them, confirm whether a shared utility class can be extracted or if the duplicate CSS is acceptable.
5. **Branch constraint** — the constraint says "stay on current branch." All implementation work is future-only; this exploration is purely analysis.

## Ready for Proposal

**Yes.** The scope is clear: add SWITCHYARD as `data-morphology='switchyard'` with dedicated CSS token layer, wire into settings UI, add palette variation axis. Next step is a structured proposal covering the exact CSS token additions, settings UI changes, test strategy for the new morphology axis, and the relationship between `\data-palette` (color direction) and `\data-morphology` (shape language).

The key architectural question to resolve in proposal: **should the mineral/cobalt/alloy palette variants be a first-class axis selectable alongside the SWITCHYARD morphology, or should they be encoded as accent overrides?** The preview treats them as built-in switching (via `body[data-palette]`), which suggests they belong in the same picker level — but this creates a two-axis appearance UX that the current UI doesn't support.
