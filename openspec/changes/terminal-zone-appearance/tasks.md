# Tasks: Terminal Zone Appearance

## Review Workload Forecast

| Field                   | Value                                                                                           |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| Estimated changed lines | ~350–450                                                                                        |
| 400-line budget risk    | Medium                                                                                          |
| Chained PRs recommended | No (800-line review budget supports single PR)                                                  |
| Suggested split         | Single PR (or PR 1: themes.js + globals.css foundations, PR 2: TerminalThemeSync + settings UI) |
| Delivery strategy       | force-chained → stacked-to-main                                                                 |
| Chain strategy          | stacked-to-main                                                                                 |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: stacked-to-main
400-line budget risk: Medium

## Phase 1: Theme Foundation

- [x] 1.1 In `src/lib/theme/themes.js`: add `TERMINAL_HEADER_STYLES` const with `DRAGON`, `MINIMAL`, `GRADIENT`, `PLAIN` values; add storage key `'devhub:terminal-header-style'` and `getTerminnalHeaderStyle()` / `setTerminalHeaderStyle()` accessors
- [x] 1.2 In `src/lib/theme/themes.js`: add `terminalBg: { bg, fg, headerBg }` sub-object to each of the existing theme definitions
- [x] 1.3 In `src/app/globals.css`: add base `--terminal-*` fallbacks on `[data-terminal-container]` selector; add `[data-terminal-header-style='dragon/minimal/gradient/plain']` blocks with style-specific CSS vars per design spec

## Phase 2: Core Implementation

- [x] 2.1 In `src/components/terminal/TerminalThemeSync.js`: add `buildTerminalChromeVars(style)` function returning flat CSS var object; add `setTerminalChromeVars(el, style)` helper
- [x] 2.2 In `src/components/terminal/TerminalThemeSync.js`: extend `buildXtermTheme()` to read `--terminal-bg` / `--terminal-fg` vars (check terminal var before surface-app fallback)
- [x] 2.3 In `src/components/terminal/terminalChromeStyles.js`: add `headerStyle` param to `getTerminalTitleBarStyle()` returning appropriate style object per style; add `getTerminalAccentBarStyle()` returning accent bar visibility + color
- [x] 2.4 In `src/app/settings/appearance/page.jsx`: add Terminal Zone section with header style radio group (4 options) + accent bar toggle; wire to localStorage via themes.js accessors

## Phase 3: Integration / Default wiring

- [x] 3.1 On terminal mount: if no stored preference, call `setTerminalChromeVars(el, 'dragon')` as default — prevents subtle visual shift for existing users
- [x] 3.2 Test: `buildTerminalChromeVars()` returns correct vars for all 4 styles (Vitest)
- [x] 3.3 Test: `buildXtermTheme()` reads `--terminal-bg` before `--surface-app` (Vitest mock getVar)
- [x] 3.4 Test: each theme in themes.js has `terminalBg` structure `{bg, fg, headerBg}` (Vitest)
