# opencode-theme Specification

## Purpose

Dark-only theme id `opencode`: near-black OpenCode Desktop–inspired palette as standalone DevHub semantic tokens (no live `opencode-vars.css` bridge).

## Requirements

### Requirement: OPENCODE theme registry entry

The system MUST add `OPENCODE: 'opencode'` to `THEMES` and a `THEME_OPTIONS` entry (label describing OpenCode Desktop dark). The system MUST register `WARNING.opencode` so every theme continues to define `--warning`.

#### Scenario: Theme option appears

- GIVEN Ajustes Appearance is loaded
- WHEN the theme section renders
- THEN `THEME_OPTIONS` includes `opencode`
- AND selecting it calls `setTheme('opencode')`

#### Scenario: WARNING token registered

- GIVEN theme registry is loaded
- WHEN `WARNING.opencode` is read
- THEN it is a non-empty CSS color string

### Requirement: Standalone `[data-theme='opencode']` token block

The system MUST define `[data-theme='opencode']` in `globals.css` with standalone values for `--surface-*`, `--text-*`, `--border-*`, `--accent-*`, terminal background (`terminalBg` / `--terminal-*` as existing themes do), and `--warning`. Values MUST sample OC dark (`#101010`/`#161616` family). Accent MUST be cool interactive blue (`#9dbefe` family), not Cursor amber. The block MUST NOT `var()`-reference `opencode-vars.css` or depend on `prefers-color-scheme`.

#### Scenario: Tokens resolve without OS scheme

- GIVEN `html[data-theme='opencode']` is set
- WHEN CSS variables resolve under light and dark OS preference
- THEN surface/text/border/accent/warning values are identical in both cases
- AND no rule chains into `opencode-vars.css`

#### Scenario: Accent is cool blue

- GIVEN `data-theme='opencode'` is active
- WHEN `--accent-primary` resolves
- THEN it is in the cool interactive blue family (not warm amber)

### Requirement: Existing themes unchanged

The system MUST NOT modify token values of any pre-existing theme blocks.

#### Scenario: Prior themes stable

- GIVEN any theme other than `opencode` is active
- WHEN its CSS tokens are inspected
- THEN values match the pre-change baseline
