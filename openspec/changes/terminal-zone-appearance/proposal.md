# Proposal: Terminal Zone Appearance

## Intent

Add per-terminal visual customization (header style, accent bar, terminal background theming) decoupled from app-level theme. Users get Carlys-like aesthetics — dragon imagery in headers, gradient backgrounds, accent bars — without touching Tauri transparency or app-level morphology.

**Why**: TerminalThemeSync.js already reads `--terminal-bg`, `--terminal-fg`, `--terminal-header-bg` but these vars fall back to `--surface-app` because no terminal-specific vars are defined in any theme block. This change defines those vars per theme and adds a Settings UI to control them.

## Scope

### In Scope

- Define `--terminal-header-bg`, `--terminal-header-gradient`, `--terminal-accent-bar` per theme in globals.css
- Extend morphology system with terminal header style variants (dragon, minimal, gradient, plain)
- Add "Terminal Zone" section in Settings → Appearance (header style selector + accent bar toggle)
- Wire vars into terminal chrome components (terminalChromeStyles.js, TerminalWorkspacesManager headers)
- Add terminal background palettes to themes.js

### Out of Scope

- Tauri transparency settings
- Terminal backend/PTY logic
- PR creation — all work on current branch

## Capabilities

### New Capabilities

- `terminal-appearance`: Per-terminal visual config (header style, accent bar, background) separate from app-level theme

### Modified Capabilities

- `morphology-system`: Extend with terminal-header-style variants and terminal chrome CSS tokens

## Approach

1. **CSS vars**: Add `[data-terminal-header-style='dragon|minimal|gradient|plain']` blocks in globals.css alongside existing morphology blocks. Each defines `--terminal-header-bg`, `--terminal-header-gradient`, `--terminal-accent-bar`.
2. **themes.js**: Add `terminalBackground` palettes per theme (e.g., `terminalBg: { bg: '#0D1117', fg: '#F0F6FC', headerBg: '#161B22' }`).
3. **TerminalThemeSync.js**: Extend `buildXtermTheme()` to pull from `--terminal-bg/--terminal-fg` instead of falling back; add `buildTerminalChromeVars()` for header vars.
4. **terminalChromeStyles.js**: Accept header style param and apply appropriate CSS class/var set.
5. **Settings UI**: Add Terminal Zone section in `src/app/settings/appearance/page.jsx` with header style radio group and accent bar toggle.

## Affected Areas

| Area                                                | Impact   | Description                                     |
| --------------------------------------------------- | -------- | ----------------------------------------------- |
| `src/app/globals.css`                               | Modified | Terminal header style blocks with CSS vars      |
| `src/lib/theme/themes.js`                           | Modified | Add terminalBackground palettes per theme       |
| `src/components/terminal/TerminalThemeSync.js`      | Modified | Read terminal-specific vars; expose header vars |
| `src/components/terminal/terminalChromeStyles.js`   | Modified | Accept header style variant                     |
| `src/components/terminal/TerminalWorkspacesManager` | Modified | Apply header style to workspace headers         |
| `src/app/settings/appearance/page.jsx`              | Modified | Terminal Zone section UI                        |

## Risks

| Risk                                                      | Likelihood | Mitigation                                                   |
| --------------------------------------------------------- | ---------- | ------------------------------------------------------------ |
| CSS var conflicts with existing `--surface-app` fallbacks | Low        | Ensure terminal vars always override; test each header style |
| xterm.js theme doesn't pick up new vars                   | Medium     | Add unit tests in TerminalThemeSync.test.js                  |
| Settings UI state not persisted                           | Low        | Use existing persist mechanism from TerminalSettingsModal    |

## Rollback Plan

1. Remove terminal header style blocks from globals.css
2. Revert themes.js terminalBackground additions
3. Restore TerminalThemeSync.js to read only from --surface-app fallbacks
4. Remove Terminal Zone section from Settings page
5. Revert terminalChromeStyles.js to use existing chrome-\* vars only

## Dependencies

- Existing TerminalThemeSync.js and TerminalSettingsModal persist mechanism

## Success Criteria

- [ ] Four header styles render correctly: dragon (gradient + accent bar), minimal (flat + no bar), gradient (header gradient, no dragon imagery), plain (flat bg, no bar)
- [ ] Accent bar toggle shows/hides the colored bar under terminal headers
- [ ] Terminal background color changes per selected palette without affecting app chrome
- [ ] TerminalThemeSync unit tests pass with new vars
- [ ] Settings UI persists terminal appearance choices across sessions
- [ ] No regressions in existing morphology/themes
