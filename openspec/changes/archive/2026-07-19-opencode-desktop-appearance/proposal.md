# Proposal: opencode-desktop-appearance

## Intent

Add an OpenCode Desktop–inspired **appearance pair**: theme `opencode` (near-black color) + morphology `opencode-desktop` (quiet chrome). Axes stay orthogonal; an optional one-click preset applies the pair + density `compact`. Why now: OC Desktop is the reference vibe for agent-first chrome, and DevHub already has the theme/morphology pipeline (`cursor`, `switchyard`, `brutalist-stage`) — only the pair and preset are missing.

## Scope

### In Scope
- Theme `opencode`: registry + standalone `[data-theme='opencode']` DevHub semantic tokens (sample OC dark; comments may map OC names)
- Morphology `opencode-desktop`: registry + `[data-morphology='opencode-desktop']` chrome (+ optional `--terminal-chrome-*` token overrides)
- Optional preset control in Ajustes: theme + morphology + density `compact`, with clear undo/reset
- Minimal density control or explicit reset path so compact is reversible without devtools
- Motion criteria only: optional morphology-scoped quieter structural CSS; keep framer-motion
- Unit tests: themes, cssTokens (`WARNING.opencode`), morphology map five→six
- Chained delivery: PR-1 theme → PR-2 morphology → PR-3 preset/density → optional PR-4 motion quiet

### Out of Scope
- TitleBar structural diet (tokens may tint only; follow-up)
- Icon sprites / custom file-provider SVGs (phase 2)
- SolidJS, Kobalte, OC component port; pixel-clone
- Live bridge of `opencode-vars.css` into shell tokens
- Solid `motion` package; framer-motion call-site rewrite
- Terminal layout/structure/button positions
- Changing existing morphology or theme token values
- Morphology forcing `--accent-primary` (theme owns color)

## Capabilities

### New Capabilities
- `opencode-theme`: dark-only theme id `opencode` — surfaces, text, borders, accent, `terminalBg`, `WARNING`
- `opencode-desktop-morphology`: sixth morphology — quiet radii/borders/shadows/fills; terminal chrome tokens only; **no accent lock**
- `opencode-desktop-appearance-preset`: one-click preset + density apply/undo in Ajustes

### Modified Capabilities
- `morphology-system`: allow sixth morphology; broaden no-regression invariant to pre-`opencode-desktop` set (incl. `cursor`); factories remain token consumers

## Approach

1. **Theme**: Hand-author `[data-theme='opencode']` in `globals.css` mapping to `--surface-*` / `--text-*` / `--border-*` / `--accent-*`. Sample OC dark (`#101010`/`#161616` family). Accent: **cool interactive blue** (`#9dbefe` family) to avoid Cursor amber collision. Do **not** `var()`-bridge `opencode-vars.css` (OS `prefers-color-scheme` risk).
2. **Morphology**: Append `[data-morphology='opencode-desktop']` with ~12px panel / ~8px control, 1px soft borders, low shadows, quiet fills. Optional `--terminal-chrome-*` only. **Omit** morphology `--accent-primary` override.
3. **Preset**: `applyOpenCodeDesktopPreset()` (or generic helper) in `themes.js`; Ajustes one-click + undo. Axes remain independently selectable.
4. **Motion**: Optional PR-4 CSS diet under morphology for `.dh-panel-in` / `.dh-tab-in` / `.dh-pill-in`; honor `data-motion-mode` + `prefers-reduced-motion`.
5. **Delivery**: Feature-branch chain, ≤800 lines/PR (prefer ~400). `strict_tdd: true`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/lib/theme/themes.js` | Modified | `THEMES.OPENCODE`, `MORPHOLOGIES.OPENCODE_DESKTOP`, options, WARNING, preset helper |
| `src/app/globals.css` | Modified | theme + morphology (+ optional motion) blocks |
| `src/app/opencode-vars.css` | None | read-only reference |
| `src/views/Ajustes.jsx` | Modified | preset control; density undo path |
| `src/chrome/morphology.js` | Verify | no factory change expected |
| `src/components/terminal/terminalChromeStyles.js` | None | token fallback already correct |
| `src/components/TitleBar.jsx` | None | out of scope (tint via theme only) |
| `src/lib/theme/__tests__/themes.test.js` | Modified | registry + preset tests |
| `src/chrome/__tests__/morphology.five-morphologies.test.js` | Modified | six-morphology map |
| `src/components/__tests__/cssTokens.test.js` | Modified | `--warning` for `opencode` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Live OC vars bridge couples to OS color-scheme | High if chosen | Rejected; standalone theme block only |
| Morphology accent lock fights theme | Med | No `--accent-primary` in morphology block |
| Density compact stuck without UI | Med | PR-3 minimal density control or preset reset |
| five→six morphology tests fail | High (expected) | Update map in PR-2 |
| Terminal non-token edits | Med | CSS tokens only; layout frozen |
| Review budget overrun if single PR | Med | Auto-chain PR-1…PR-3 (+ optional PR-4) |
| Pixel-clone pressure | Low | Reference only; React/chrome-token architecture |

## Rollback Plan

- Per PR: revert that slice’s registry + CSS + Ajustes + tests.
- Full: remove `opencode` / `opencode-desktop` registry entries and CSS blocks; delete preset helper. Unknown stored theme/morphology normalize to defaults via existing `normalizeTheme` / `normalizeMorphology`.
- No schema/migrations; localStorage keys unchanged.

## Dependencies

- Existing appearance pipeline: `setTheme` / `setMorphology` / `applyAppearanceSettings`
- Chrome factories already consume `--chrome-*`
- Prior art: `cursor-morphology`, `brutalist-stage-morphology`, `switchyard-fourth-theme-system`
- Skill: `skills/devhub-morphology/SKILL.md` (note: this morphology **skips** skill checklist accent requirement by product lock)

## Assumptions

- Accent for `opencode` = cool interactive blue (design may refine exact oklch/hex)
- Radii ≈ 12px panel / 8px control
- Density UI: at least undo path in PR-3 (full density picker optional)
- Quieter motion is optional PR-4; may defer if pair already feels calm
- Implement on clean slice branch (not dirty electron host worktree)

## Success Criteria

- [ ] Theme `opencode` selectable; standalone tokens; no OS color-scheme dependency
- [ ] Morphology `opencode-desktop` selectable; quiet chrome; no accent lock
- [ ] Axes independent; preset applies theme + morphology + density compact with undo
- [ ] Existing themes/morphologies unchanged
- [ ] Terminal geometry unchanged; chrome tokens only
- [ ] `WARNING.opencode` + cssTokens/themes/morphology tests green
- [ ] Each chained PR ≤800 lines and independently verifiable

## Ready for Specs

Yes — `sdd-spec` next for `opencode-theme`, `opencode-desktop-morphology`, `opencode-desktop-appearance-preset`, and delta on `morphology-system`.
