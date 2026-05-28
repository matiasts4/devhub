# Proposal: Morphology System Refactor

## Intent

Fix the broken morphology token system. Currently `morphology.js` hardcodes brutalist values (e.g., `borderRadius: '0'`, `boxShadow: '3px 3px 0 0 var(--accent-shadow)'`) in shared factories, so switching to a non-brutalist morphology breaks all button styles. The fix is to make every factory reference `data-morphology` CSS variables, then define three distinct morphology token sets: Default (soft rounded), Brutalist Stage (refined brutalist from brutalist-oxide-console.html), and Aura (glassmorphism).

## Scope

### In Scope

1. **Refactor `morphology.js`** — Every factory function (panelStyle, btnPrimaryStyle, etc.) must use `var(--chrome-*)` CSS tokens. Remove hardcoded `borderRadius: '0'` and `boxShadow: '3px 3px 0 0'` from primary/secondary buttons. Make brutalist variants use morphology tokens instead of inlined literals.

2. **Create Default morphology** — Soft rounded corners, 1px borders, `shadow-soft` from theme. Reference `nordic-arctic.html` for feel.
   - `--chrome-radius-panel: 1rem`
   - `--chrome-radius-control: 999px`
   - `--chrome-border-width: 1px`
   - `--chrome-border-color: var(--border-subtle)`
   - `--chrome-shadow-panel: var(--shadow-soft)`

3. **Improve Brutalist Stage** — Based on `brutalist-oxide-console.html` refined brutalist:
   - `--chrome-radius-panel: 0`
   - `--chrome-radius-control: 0`
   - `--chrome-shadow-panel: 4px 4px 0 0 var(--border-strong)`
   - Better color palette and visual hierarchy

4. **Create third morphology: Aura** — Glassmorphism with backdrop-blur, semi-transparent surfaces, soft glow effects. Premium and modern.
   - `--chrome-radius-panel: 1rem`
   - `--chrome-radius-control: 999px`
   - `--chrome-blur: 20px`
   - `--chrome-glass-bg: rgba(15,23,42,0.45)`

5. **Fix critical hardcodes** — ProjectDashboard.jsx (local brutalist functions), Roadmap hardcodes, SwarmTopologyGraph hardcoded colors (#27272a).

### Out of Scope

- Fixing all 200+ hardcoded morphology styles across 15 files — this change fixes the infrastructure only
- New capability specs beyond the morphology-system itself
- Terminal geometry or workspace layout changes

## Capabilities

### New Capabilities

- `morphology-system-refactor`: Refactored morphology infrastructure with three distinct morphologies (default, brutalist-stage, aura) all driven by CSS tokens.

### Modified Capabilities

- None — this is a pure refactor of the existing morphology system; no new capabilities added

## Approach

Extend `src/lib/theme/themes.js` morphology registry to include DEFAULT, BRUTALIST_STAGE, and AURA. Add `data-morphology` CSS blocks in `src/app/globals.css` with the token sets above. Refactor `morphology.js` factories to use `var(--chrome-*)` tokens. Fix critical hardcodes in ProjectDashboard.jsx, Roadmap, and SwarmTopologyGraph. Keep delivery inside 400-line PR budget by focusing on infrastructure and critical fixes only.

## Affected Areas

| Area                                                 | Impact   | Description                                                                            |
| ---------------------------------------------------- | -------- | -------------------------------------------------------------------------------------- |
| `src/lib/theme/themes.js`                            | Modified | Add AURA to MORPHOLOGIES registry                                                      |
| `src/app/globals.css`                                | Modified | Three `[data-morphology]` token blocks                                                 |
| `src/chrome/morphology.js`                           | Modified | Refactor factories to use var(--chrome-\*) tokens; remove hardcoded brutalist literals |
| `src/views/ProjectDashboard.jsx`                     | Modified | Remove local brutalist style functions, use shared morphology.js                       |
| `src/views/Roadmap.jsx`                              | Modified | Replace hardcoded borderRadius/shadow with morphology tokens                           |
| `src/components/control-room/SwarmTopologyGraph.jsx` | Modified | Replace #27272a hardcodes with var(--chrome-border-color)                              |

## Risks

| Risk                                                              | Likelihood | Mitigation                                                                                                     |
| ----------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------- |
| Button styles break across morphologies during refactor           | High       | TDD: write visual regression tests first, verify morphology.js factories produce correct tokens per morphology |
| Aura morphology may be too expensive for mobile/low-power devices | Med        | Make backdrop-blur a token that can be set to none; test on target devices                                     |

## Rollback Plan

Revert `morphology.js` to pre-change state (factories using hardcoded values) and revert `globals.css` morphology token blocks. This restores the current broken-but-functional brutalist-only state.

## Dependencies

- `public/previews/brutalist-oxide-console.html` — refined brutalist reference
- `public/previews/nordic-arctic.html` — soft rounded reference
- Existing `brutalist-stage-morphology` design.md

## Success Criteria

- [ ] `morphology.js` factories use only `var(--chrome-*)` tokens — zero hardcoded border-radius or box-shadow in shared factories
- [ ] DevHub can switch between DEFAULT, BRUTALIST_STAGE, and AURA morphologies via settings
- [ ] ProjectDashboard.jsx no longer has local brutalist style functions
- [ ] SwarmTopologyGraph uses CSS tokens for colors, not `#27272a`
- [ ] PR stays within 400-line review budget by focusing on infrastructure + critical fixes only
