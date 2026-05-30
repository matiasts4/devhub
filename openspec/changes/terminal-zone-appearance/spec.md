# Delta: Terminal Zone Appearance

## ADDED Requirements

### Requirement: Terminal Appearance Config

The system SHALL provide per-terminal visual customization that operates independently of app-level theme settings.

The system MUST support three terminal appearance controls:

- Header style selection (dragon, minimal, gradient, plain)
- Accent bar toggle (visible/hidden)
- Terminal background palette selection

**Files**: `src/components/terminal/TerminalThemeSync.js`, `src/app/settings/appearance/page.jsx`

#### Scenario: Terminal Zone section visible in Settings

- GIVEN the user navigates to Settings → Appearance
- WHEN the page loads
- THEN a "Terminal Zone" section appears below the Morphology selector
- AND it contains a header style radio group with four options
- AND an accent bar toggle switch

#### Scenario: Terminal appearance persists across sessions

- GIVEN the user has selected "dragon" header style with accent bar enabled
- WHEN the user restarts the application
- THEN the terminal headers render with dragon style and accent bar visible
- AND the Settings UI shows those same selections as active

---

### Requirement: Four Terminal Header Style Variants

The system MUST support four header style variants controlled by `data-terminal-header-style` on the terminal chrome element:

| Style    | Header Background                    | Accent Bar | Visual Treatment       |
| -------- | ------------------------------------ | ---------- | ---------------------- |
| dragon   | Gradient with dragon texture overlay | Visible    | Carlys-style aesthetic |
| minimal  | Flat solid color                     | Hidden     | Clean, understated     |
| gradient | Header gradient, no imagery          | Hidden     | Modern terminal look   |
| plain    | Flat solid bg                        | Hidden     | Basic terminal chrome  |

**Files**: `src/app/globals.css`, `src/components/terminal/terminalChromeStyles.js`

#### Scenario: Dragon style renders with gradient and accent bar

- GIVEN `data-terminal-header-style='dragon'` is set on the terminal chrome element
- WHEN the terminal renders
- THEN `--terminal-header-gradient` applies a gradient background
- AND `--terminal-accent-bar` renders as a visible colored bar below the header
- AND dragon texture overlay is applied if defined in theme

#### Scenario: Minimal style renders flat without accent bar

- GIVEN `data-terminal-header-style='minimal'` is set
- WHEN the terminal renders
- THEN `--terminal-header-bg` applies as a flat solid color
- AND no accent bar is rendered below the header

#### Scenario: Gradient style shows header gradient without dragon imagery

- GIVEN `data-terminal-header-style='gradient'` is set
- WHEN the terminal renders
- THEN `--terminal-header-gradient` applies to the header
- AND no dragon texture overlay is rendered
- AND no accent bar is rendered

#### Scenario: Plain style shows flat bg without decoration

- GIVEN `data-terminal-header-style='plain'` is set
- WHEN the terminal renders
- THEN `--terminal-header-bg` applies as flat solid color
- AND no gradient, imagery, or accent bar is rendered

---

### Requirement: Terminal Background Palettes Per Theme

The system MUST define terminal-specific background colors per theme in `themes.js`. Each theme provides a `terminalBackground` object with:

```
terminalBg: {
  bg: string,      // Main terminal background
  fg: string,      // Terminal foreground/text color
  headerBg: string // Header background color
}
```

**Files**: `src/lib/theme/themes.js`

#### Scenario: Theme defines terminal background palette

- GIVEN a theme configuration exists
- WHEN the theme is active
- THEN `terminalBg.bg` resolves to the terminal background color
- AND `terminalBg.fg` resolves to the terminal foreground color
- AND `terminalBg.headerBg` resolves to the terminal header background

---

### Requirement: CSS Variable Override for Terminal Colors

The system MUST set `--terminal-bg`, `--terminal-fg`, `--terminal-header-bg`, `--terminal-header-gradient`, and `--terminal-accent-bar` CSS variables on the terminal element. These MUST override any fallback to `--surface-app` variables.

**Files**: `src/components/terminal/TerminalThemeSync.js`

#### Scenario: Terminal uses terminal-specific CSS vars instead of fallbacks

- GIVEN a terminal is active with a theme that defines `terminalBackground`
- WHEN the terminal chrome renders
- THEN `--terminal-bg` resolves to the theme's `terminalBg.bg` value
- AND `--terminal-fg` resolves to the theme's `terminalBg.fg` value
- AND `--terminal-header-bg` resolves to the theme's `terminalBg.headerBg` value

#### Scenario: xterm.js theme reads from terminal-specific vars

- GIVEN TerminalThemeSync.js calls `buildXtermTheme()`
- WHEN the theme is built
- THEN it reads from `--terminal-bg` and `--terminal-fg` instead of falling back to `--surface-app`
- AND the resulting xterm theme reflects the terminal-specific palette

---

### Requirement: buildTerminalChromeVars() for Header Styling

The system MUST expose a `buildTerminalChromeVars()` function in TerminalThemeSync.js that generates the header styling variables based on the selected header style.

**Files**: `src/components/terminal/TerminalThemeSync.js`

#### Scenario: buildTerminalChromeVars returns correct vars per style

- GIVEN `data-terminal-header-style='dragon'` is the selected style
- WHEN `buildTerminalChromeVars('dragon')` is called
- THEN it returns an object with `--terminal-header-bg`, `--terminal-header-gradient`, `--terminal-accent-bar` appropriate for dragon style

- GIVEN `data-terminal-header-style='minimal'` is the selected style
- WHEN `buildTerminalChromeVars('minimal')` is called
- THEN it returns `--terminal-header-bg` with no gradient or accent bar vars

---

### Requirement: terminalChromeStyles.js Accepts Header Style Parameter

The `terminalChromeStyles.js` module MUST accept a header style parameter and apply the corresponding CSS class or var set to terminal chrome elements.

**Files**: `src/components/terminal/terminalChromeStyles.js`

#### Scenario: Header style param applies correct CSS class

- GIVEN `headerStyle='dragon'` is passed to terminalChromeStyles
- WHEN styles are computed
- THEN the output includes appropriate styling for dragon header treatment

---

## MODIFIED Requirements

### Requirement: Morphology System Extended with Terminal Header Style Variants

The morphology system MUST be extended to support terminal header style variants via `[data-terminal-header-style]` attribute selectors in globals.css. Each morphology block already defines `--chrome-*` tokens; the new `[data-terminal-header-style]` blocks define `--terminal-header-*` tokens that apply to terminal chrome independently of app-level morphology.

(Previously: morphology system defined only app-level panel styling tokens)

**Files**: `src/app/globals.css`

#### Scenario: Terminal header style independent of app morphology

- GIVEN `data-morphology='switchyard'` is active on the app
- WHEN `data-terminal-header-style='dragon'` is set on a terminal element
- THEN the terminal header uses dragon-style vars while the rest of the app uses switchyard morphology tokens
- AND changing terminal header style does not affect app-level morphology

---

## REMOVED Requirements

None.

---

## Summary Table

| Requirement                        | Type     | Scenarios |
| ---------------------------------- | -------- | --------- |
| Terminal Appearance Config         | ADDED    | 2         |
| Four Header Style Variants         | ADDED    | 4         |
| Terminal Background Palettes       | ADDED    | 1         |
| CSS Variable Override              | ADDED    | 2         |
| buildTerminalChromeVars()          | ADDED    | 2         |
| terminalChromeStyles accepts param | ADDED    | 1         |
| Morphology System Extension        | MODIFIED | 1         |
