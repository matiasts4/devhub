# Tasks: opencode-desktop-appearance

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~450–750 total; PR-1 ~180–250; PR-2 ~100–160; PR-3 ~180–280; PR-4 opt ~40–80 |
| 400-line budget risk | High (single PR); Low per chained slice |
| Session review budget | 800 lines/PR (prefer ~400) |
| Chained PRs recommended | Yes |
| Suggested split | PR-1 → PR-2 → PR-3 → optional PR-4 |
| Delivery strategy | auto-chain |
| Chain strategy | feature-branch-chain (design); stacked-to-main acceptable if orchestrator prefers speed |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Theme `opencode` + tests | PR 1 | Base = feature/tracker; strict_tdd RED→GREEN |
| 2 | Morphology `opencode-desktop` + six-map | PR 2 | Base = PR-1 branch; no accent lock; terminal tokens only |
| 3 | Preset + density undo UI + tests | PR 3 | Base = PR-2 branch; axes stay independent |
| 4 | Quieter motion CSS (optional) | PR 4 | Base = PR-3; defer after visual QA |

**strict_tdd: true** — each PR: failing tests first, then implementation.
**Terminal guardrails:** CSS `--terminal-chrome-*` / `--chrome-*` tokens only. No layout/structure/button-position tasks.

---

## Phase 1: PR-1 Theme `opencode`

- [x] 1.1 RED: extend `src/lib/theme/__tests__/themes.test.js` — `THEMES.OPENCODE`, `THEME_OPTIONS` entry, `WARNING.opencode` non-empty, `normalizeTheme('opencode')`
- [x] 1.2 RED: extend `src/components/__tests__/cssTokens.test.js` — `[data-theme='opencode']` defines `--warning` (+ surface/text/accent coverage if loop requires full block)
- [x] 1.3 GREEN: add `THEMES.OPENCODE`, `THEME_OPTIONS` (label + `terminalBg` near-black), `WARNING.opencode` in `src/lib/theme/themes.js`
- [x] 1.4 GREEN: hand-author standalone `[data-theme='opencode']` in `src/app/globals.css` — surfaces `#101010`/`#161616` family, cool blue accent `#9dbefe`, shadcn slots, `--warning`; no `var()` into `opencode-vars.css`
- [x] 1.5 Verify: existing theme token values unchanged; Ajustes theme cards pick up option via `THEME_OPTIONS` (no hard-couple)

## Phase 2: PR-2 Morphology `opencode-desktop`

- [x] 2.1 RED: extend `src/lib/theme/__tests__/themes.test.js` — `MORPHOLOGIES.OPENCODE_DESKTOP`, sixth `MORPHOLOGY_OPTIONS` entry, `normalizeMorphology`, setMorphology does not change theme
- [x] 2.2 RED: update `src/chrome/__tests__/morphology.five-morphologies.test.js` — six-map includes `'opencode-desktop': '12px'`; prior five radii unchanged; comment five→six
- [x] 2.3 GREEN: add `MORPHOLOGIES.OPENCODE_DESKTOP` + `MORPHOLOGY_OPTIONS` in `src/lib/theme/themes.js`
- [x] 2.4 GREEN: append `[data-morphology='opencode-desktop']` in `src/app/globals.css` after cursor — radii ~12/8, soft borders/shadows/fills, optional `--terminal-chrome-*`; **omit** `--accent-primary` / `--accent-glow`
- [x] 2.5 Verify: factories in `src/chrome/morphology.js` remain token consumers (no JS branch); no terminal layout edits; no existing morphology token regressions

## Phase 3: PR-3 Preset + density undo

- [x] 3.1 RED: `themes.test.js` — `OPENCODE_DESKTOP_PRESET`, `applyOpenCodeDesktopPreset()` sets theme+morphology+density compact and returns snapshot; `restoreAppearanceSnapshot`; `setDensity`; post-preset independent theme change leaves morphology/density
- [x] 3.2 GREEN: implement preset helpers in `src/lib/theme/themes.js` (`OPENCODE_DESKTOP_PRESET`, `applyOpenCodeDesktopPreset`, `restoreAppearanceSnapshot`, `setDensity`) via existing `setTheme`/`setMorphology`/`applyAppearanceSettings`
- [x] 3.3 GREEN: Ajustes appearance (`src/views/Ajustes.jsx`) — one-click “OpenCode Desktop” preset, undo from snapshot, minimal density control (compact|comfortable)
- [x] 3.4 Verify: no TitleBar/icon/Solid scope; theme and morphology cards still independent after preset

## Phase 4: PR-4 Optional quieter motion

- [ ] 4.1 (Optional) Morphology-scoped quieter CSS for `.dh-panel-in` / `.dh-tab-in` / `.dh-pill-in` under `[data-morphology='opencode-desktop']` in `globals.css`
- [ ] 4.2 (Optional) Honor `data-motion-mode` + `prefers-reduced-motion`; keep framer-motion call sites unchanged
- [ ] 4.3 Defer if pair already feels calm after PR-3 visual QA

## Out of scope (do not task)

- Terminal layout/structure/button positions; TitleBar diet; icon sprites; `opencode-vars.css` live bridge; factory rewrite; existing theme/morphology value edits; Solid/`motion` port
