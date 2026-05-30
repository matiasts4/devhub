# Design: Terminal Zone Appearance

## Technical Approach

Add per-terminal visual customization — header style (dragon/minimal/gradient/plain), accent bar toggle, and terminal background palette — operating independently of app-level theme. Three new files + modifications to 4 existing files. State persisted via localStorage.

## Architecture Decisions

### Decision: CSS Variable Layer for Terminal Theming

**Choice**: Set `--terminal-bg`, `--terminal-fg`, `--terminal-header-bg`, `--terminal-header-gradient`, `--terminal-accent-bar` on the terminal element via `buildTerminalChromeVars()`.
**Alternatives considered**: Inline style objects per component; xterm.js theme rebuild on every style change.
**Rationale**: CSS vars are the existing theming pattern in this codebase (`--surface-app`, `--accent-primary`). Attribute-driven `[data-terminal-header-style]` selectors allow morphology-like isolation without touching app-level tokens.

### Decision: Attribute-Driven Header Style Selection

**Choice**: `data-terminal-header-style` attribute on terminal chrome element controls which `--terminal-header-*` vars apply.
**Alternatives considered**: Prop drilling header style through component tree; React context.
**Rationale**: Matches the existing morphology pattern (`data-morphology`, `data-theme`) already proven in globals.css. Zero React re-renders needed when switching styles — just DOM attribute + CSS.

### Decision: buildTerminalChromeVars() Returns a Flat Object

**Choice**: `buildTerminalChromeVars(style)` returns `{ '--terminal-header-bg': '...', '--terminal-header-gradient': '...', '--terminal-accent-bar': '...' }`.
**Alternatives considered**: Return CSS string for direct injection; return JSX style object.
**Rationale**: Flat object is directly compatible with `element.style.setProperty()`. Easy to test. Consistent with how xterm.js theme objects are already built in TerminalThemeSync.

### Decision: Terminal Palette in themes.js as terminalBg Object

**Choice**: Each theme definition in themes.js gets a `terminalBg: { bg, fg, headerBg }` sub-object.
**Alternatives considered**: Separate `terminalPalettes.js` file; inline computed values per component.
**Rationale**: Colocating terminal bg with the rest of the theme definition is consistent with how palettes (mineral/cobalt/alloy) are already handled under `data-palette`. No new file needed.

## Data Flow

```
Settings UI ──writes──> localStorage ('devhub:terminal-header-style')
                              │
                              ▼
              TerminalZoneSettings reads stored value
                              │
                              ▼
         TerminalChrome reads attr ──applies──> DOM element
         data-terminal-header-style="dragon"           │
                                                      ▼
                    globals.css [data-terminal-header-style='dragon'] {
                      --terminal-header-bg: ...;
                      --terminal-header-gradient: linear-gradient(...);
                      --terminal-accent-bar: var(--accent-primary);
                    }
```

```
themes.js terminalBg ──merged──> TerminalThemeSync.buildXtermTheme(getVar)
                                          │
                                          ▼
                                   xterm.js ITheme object
```

## File Changes

| File                                              | Action | Description                                                                                                                               |
| ------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/terminal/TerminalThemeSync.js`    | Modify | Add `buildTerminalChromeVars(style)`; add `setTerminalChromeVars(el, style)` helper; extend `buildXtermTheme` to read `--terminal-*` vars |
| `src/app/globals.css`                             | Modify | Add `[data-terminal-header-style='dragon/minimal/gradient/plain']` blocks with `--terminal-*` vars; add base `--terminal-*` fallbacks     |
| `src/components/terminal/terminalChromeStyles.js` | Modify | Add `headerStyle` param to `getTerminalTitleBarStyle()`; add `getTerminalAccentBarStyle()`                                                |
| `src/app/settings/appearance/page.jsx`            | Modify | Add Terminal Zone section: header style radio group + accent bar toggle                                                                   |
| `src/lib/theme/themes.js`                         | Modify | Add `TERMINAL_HEADER_STYLES` const; add `terminalBg` to each theme definition; add storage key + accessors                                |

## Interfaces / Contracts

### themes.js additions

```js
export const TERMINAL_HEADER_STYLES = {
  DRAGON: 'dragon',   // gradient + accent bar + texture
  MINIMAL: 'minimal', // flat, no accent bar
  GRADIENT: 'gradient', // gradient, no accent bar
  PLAIN: 'plain',     // flat solid, no accent bar
};

// Each theme definition:
{
  ...existing fields...,
  terminalBg: {
    bg: '#0d1117',       // --terminal-bg
    fg: '#f0f6fc',       // --terminal-fg
    headerBg: '#161b22', // --terminal-header-bg
  }
}
```

### TerminalThemeSync.js additions

```js
/**
 * @param {'dragon'|'minimal'|'gradient'|'plain'} style
 * @returns {{ [key: string]: string }} CSS var object
 */
export function buildTerminalChromeVars(style) { ... }

/**
 * @param {Element} el
 * @param {string} style
 */
export function setTerminalChromeVars(el, style) { ... }
```

### globals.css additions

```css
/* Base fallbacks — applied before any data-terminal-header-style */
[data-terminal-container] {
  --terminal-bg: var(--surface-app);
  --terminal-fg: var(--text-primary);
  --terminal-header-bg: var(--surface-card);
  --terminal-header-gradient: var(--surface-elevated);
  --terminal-accent-bar: transparent;
}

[data-terminal-header-style='dragon'] {
  --terminal-header-gradient: linear-gradient(
    180deg,
    var(--surface-elevated),
    var(--chrome-panel-fill)
  );
  --terminal-accent-bar: var(--accent-primary);
}

[data-terminal-header-style='minimal'] {
  --terminal-header-bg: var(--surface-card);
  --terminal-header-gradient: var(--surface-card);
}

[data-terminal-header-style='gradient'] {
  --terminal-header-gradient: linear-gradient(180deg, var(--surface-elevated), var(--surface-card));
}

[data-terminal-header-style='plain'] {
  --terminal-header-bg: var(--surface-card);
  --terminal-header-gradient: var(--surface-card);
}
```

## Testing Strategy

| Layer       | What to Test                                                                   | Approach                                                                            |
| ----------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Unit        | `buildTerminalChromeVars()` returns correct vars per style                     | Vitest: 4 cases (dragon/minimal/gradient/plain), assert returned object keys/values |
| Unit        | `buildXtermTheme()` reads `--terminal-bg` and `--terminal-fg`                  | Vitest: mock getVar, verify `--terminal-bg` is checked before `--surface-app`       |
| Unit        | themes.js: each theme has `terminalBg` with `{bg, fg, headerBg}`               | Vitest: iterate THEMES, assert structure                                            |
| Integration | Settings UI: selecting header style persists to localStorage                   | Playwright: click each radio, assert storage value                                  |
| Integration | Terminal chrome element gets correct `data-terminal-header-style` attr on load | Playwright: navigate to settings, verify DOM attr                                   |

## Migration / Rollout

No migration required. New feature only — no existing data to transform.

Default terminal header style: `dragon` (matches the Carlys-style aesthetic mentioned in spec). Default accent bar: `visible`.

When the user first loads after this change, existing terminals will render with no `data-terminal-header-style` attribute and fall back to base `--terminal-*` vars (which equal `--surface-app` etc.), producing a subtle visual shift. Mitigate by having `buildTerminalChromeVars('dragon')` applied as default on terminal mount until user explicitly sets a preference.

## Open Questions

- [ ] Should `dragon` style's texture overlay use a CSS `background-image` URL or a CSS-only noise pattern? (Spec mentions "dragon texture overlay" but no file path is specified)
- [ ] Is there an existing storage key prefix convention for terminal-specific settings, or should `devhub:terminal-*` follow the pattern already used (`devhub:theme`, `devhub:morphology`)?
