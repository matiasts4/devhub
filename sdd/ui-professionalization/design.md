# Design: `ui-professionalization`

**Change:** `sdd/ui-professionalization`
**Phase:** design
**Date:** 2026-06-11

This document is the architecture/approach layer for the spec. It is
deliberately terse; the spec carries the *what*, this carries the *how*.

---

## 1. Migration order

Apply order is sequenced so that **tokens land before consumers** and
**the lowest-risk pilot lands first** for fast feedback.

```
D2 (tokens)        ──┐
D1 (CSS entry)     ──┤── WU-6, WU-1
D7 (components.json)──┘

D3 (docs/DESIGN.md)         ← runs in parallel with D1-D2

D4 (settings unification)   ← consumes D1, D2, D7

D5 (Dashboard + Proyectos)  ← consumes D1, D2, D4
D6 (ProjectHub + Settings)  ← consumes D5 patterns
D7 (Roadmap + borderRadius) ← consumes D5/D6 patterns

D8 (typography pass)        ← consumes D1-D7

D9 (bookkeeping)            ← consumes D5-D7 (Roadmap literals in particular)
D10 (verify-report)         ← last
```

Per-view PR split (NFR-D02 ≤400 LOC):

1. **Settings layout** — small, low-risk, validates the shell+settings
   integration first.
2. **Dashboard** — high-traffic; gives early visual signal.
3. **Proyectos** — adjacent to Dashboard; reuses the same header strip.
4. **ProjectHub** — the biggest hex/tone cleanup; runs after Dashboard
   so the `panelStyle({ tone: 'accent' })` pattern is already proven.
5. **Roadmap** — the `borderRadius: '0'` cleanup lives here
   (`Roadmap.jsx:85`, `Roadmap.jsx:338`).

## 2. Single CSS entry contract (FR-D01)

### 2.1 `src/app/globals.css` is canonical

It already imports `xterm/css/xterm.css`, `opencode-vars.css`, and
Tailwind v4. We keep that shape. The new `--warning` token (FR-D06)
and the `[data-density]` rules (FR-D06) land here.

### 2.2 `src/index.css` thin re-export

`src/index.css` is rewritten to a thin shim:

```css
@import './app/globals.css';

/* Desktop-shell-only chrome kept local. The Tauri #root window and
 * the scrollbar baseline are environment-specific and don't belong
 * in the canonical App Router entry.
 */
html, body { overflow: hidden; }

#root {
  border-radius: 22px;
  overflow: hidden;
  height: 100vh;
  width: 100vw;
}

::-webkit-scrollbar { width: 4px; height: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #21262d; border-radius: 2px; }
::-webkit-scrollbar-thumb:hover { background: #30363d; }
```

This contract satisfies the existing test
`src/components/__tests__/cssTokens.test.js:131-149`, which already
asserts that `index.css` must not redefine `--accent-primary` and must
contain the substring `data-morphology|globals.css` (the substring
flows from the `@import './app/globals.css'` directive landing inline
during preprocessing — verified at apply time).

### 2.3 `components.json` shim

`components.json:8` flips to `"src/app/globals.css"`. The remaining
fields (`style`, `rsc`, `tsx`, `aliases`, `iconLibrary`) are untouched.

## 3. Typography token location (FR-D04)

**Decision: new file `src/lib/ui-tokens.js`.** Rationale:

- The chrome tokens already live in CSS (`globals.css`). Typography
  scale is a *value table* consumed by both CSS (`var(--font-scale)`)
  and JSX (the new `text-` Tailwind class names). A JS module is the
  cheaper integration point.
- `opencode-vars.css` is 1,388 lines and is consumed by both
  `globals.css` and `index.css`. Adding a typography section to it
  blurs the boundary between "theme palette" and "scale".
- Tests can import the JS module directly without parsing CSS.

### 3.1 Scale

```
caption-xs  → 10px / 14px / 0.04em
caption-sm  → 11px / 14px / 0.04em
caption-md  → 12px / 16px / 0.02em
label       → 13px / 18px / 0.02em
body        → 14px / 20px / 0
title       → 18px / 24px / 0
display     → 24px / 32px / -0.01em
```

A matching Tailwind config extension in `tailwind.config.js` exposes
`text-caption-xs` … `text-display` so the class names are stable.
A second, density-aware set
(`text-caption-sm--compact = 11px × 0.92` etc.) is computed at module
load time from `--font-scale` so the user-set font scale applies.

### 3.2 Replacement mapping (pilot views)

| Pilot file | Old arbitrary | New class |
|------------|---------------|-----------|
| `ProjectDashboard.jsx` | `text-[10px]` (×11) | `text-caption-xs` |
| `Roadmap.jsx` | `text-[11px]` (×2) | `text-caption-sm` |
| `ProjectHub.jsx` | `text-[11px]` (×1) | `text-caption-sm` |

Terminal chrome (`TerminalWorkspacesManager.jsx` ×9) is **out of scope**
this round, but the token names are stable so a follow-up pass
replaces them cheaply.

## 4. Deprecating `Ajustes.jsx` appearance block (FR-D02)

**Decision: inline redirect banner inside the legacy block.** Rationale:

- A route-level redirect from `/ajustes` → `/settings/appearance` would
  break the other legacy tabs (LLM, project, prefs) that still depend
  on `Ajustes.jsx`.
- The legacy block already reads from the same
  `getStoredTheme()`/`getStoredMorphology()`/`getStoredAccent()`
  helpers (`Ajustes.jsx:34-44`), so the displayed values stay in
  sync with the App Router surface.
- The `data-testid="ajustes-appearance-shell"` is preserved, which
  protects any downstream test or analytics that depends on the
  selector.

### 4.1 Banner shape

```jsx
<ChromeSurface asChild surface="panel" tone="accent">
  <div
    data-testid="ajustes-appearance-deprecation-banner"
    className="flex items-center justify-between gap-3 px-4 py-3"
  >
    <p className="text-caption-md">
      Appearance settings moved to{' '}
      <strong className="text-text-primary">Settings → Appearance</strong>.
    </p>
    <button
      className="text-caption-sm"
      onClick={() => navigate('/settings/appearance')}
    >
      Open new settings →
    </button>
  </div>
</ChromeSurface>
```

The banner replaces the inline controls in `Ajustes.jsx:renderThemeTab`
with a read-only summary (active theme, morphology, accent, palette)
plus the CTA.

### 4.2 State writes stay on the App Router surface

The banner does not call `setTheme()` / `setMorphology()` /
`setAccent()`. The legacy block's existing readers still work, so the
banner's read-only summary is correct, and we avoid two write paths
contending on the same localStorage keys.

## 5. `data-density` rules (FR-D06)

The compact set is opt-in. `themes.js:63` writes the document-level
default; views that want a denser list (e.g. `Roadmap.jsx` rows,
`ProjectDashboard.jsx` card grids) opt in by setting
`data-density="compact"` on the row container.

### 5.1 Rule set (added to `globals.css`)

```css
:root {
  --density-row-padding-y: 0.5rem;
  --density-row-padding-x: 0.75rem;
  --density-row-gap: 0.5rem;
}

[data-density='compact'] {
  --density-row-padding-y: 0.25rem;
  --density-row-padding-x: 0.5rem;
  --density-row-gap: 0.25rem;
}
```

Pilot opt-ins:
- `Roadmap.jsx` milestone rows get `data-density="compact"`.
- `ProjectDashboard.jsx` task row get `data-density="compact"`.
- Everything else inherits the document-level `comfortable` default.

The rules do **not** override `font-size` — that lives in
`ui-tokens.js` and `var(--font-scale)`. Density is layout-only.

## 6. Tailwind `accent` collision fix (FR-D06)

**Decision: split into two namespaces.** The two `accent` blocks in
`tailwind.config.js` (lines 27 and 48) serve different concerns:

- `hsl(var(--accent))` is the shadcn palette slot — used by `bg-accent`
  / `border-accent` / `text-accent-foreground` in any shadcn-imported
  component.
- `var(--accent-primary)` is the in-house semantic accent — already
  consumed by `accent-primary` and `accent-secondary` in the
  codebase.

```js
// tailwind.config.js (post)
colors: {
  // ... existing shadcn palette ...
  shadcn: {
    accent: 'hsl(var(--accent))',
    'accent-foreground': 'hsl(var(--accent-foreground))',
  },
  accent: {
    primary: 'var(--accent-primary)',
    secondary: 'var(--accent-secondary)',
  },
  // ...
}
```

Before the split, `rg '\b(bg|text|border|ring)-accent\b'` enumerates
call sites. A shim class `bg-app-accent: var(--accent-primary)` is
added to `globals.css` for the rare class that expected the
collision behavior. (Default: zero shim sites found in the audit, so
the shim is a defensive measure, not a refactor target.)

## 7. `--warning` token shape (FR-D06)

The flat token takes a per-theme value. `themes.js` already has the
`THEMES` registry and the `applyX()` helpers, so the simplest path
adds a `WARNING` map to `themes.js` and a small `applyWarning()` helper
that `setTheme()` calls. The new token is also written to `data-warning`
on `<html>` so future opt-in containers can style against it.

After the helper is in place, `morphology.js:196-198` keeps the
`var(--warning, …)` fallback as a defense-in-depth measure but the
fallback is unreachable in practice. A follow-up cleanup can drop
the fallback once the green test proves it.

## 8. Pilot view diff plan (file-by-file)

### 8.1 `src/app/settings/layout.jsx`

- Wrap the layout in `UiShell`.
- The existing `<PageHeader>` in the layout root is replaced with
  `<UiHeader sticky><UiHeader.Title>Settings</UiHeader.Title></UiHeader>`.
- LOC: ≤60.

### 8.2 `src/views/Dashboard.jsx`

- Replace the bespoke header (audit §2) with `<UiHeader sticky>…`.
- The page body stays as-is; the only structural change is the header.
- LOC: ≤120.

### 8.3 `src/views/Proyectos.jsx`

- Same as Dashboard.
- Replace the four `color: '#00F0FF'` / `#39FF14` / `#FF007F` / `#FFE600`
  literals (`Proyectos.jsx:16,27,38,49`) with
  `var(--accent-primary)`, `var(--success)`, `var(--danger)`,
  `var(--warning)`.
- LOC: ≤120.

### 8.4 `src/views/ProjectHub.jsx`

- Replace the bespoke header.
- The 31 hex hits (audit §5) collapse to ≤8 by mapping to
  `var(--project-type-software|university|research|security|business|creative)`
  — those tokens are already defined in
  `src/app/opencode-vars.css` but are unused; this view is the
  pilot consumer.
- LOC: ≤350 (one PR).

### 8.5 `src/views/Roadmap.jsx`

- Replace the sticky header.
- Remove `borderRadius: '0'` literals at lines 85 and 338 by replacing
  the inline styles with `panelStyle({ tone: 'accent' })` and
  `progressFillStyle()`.
- LOC: ≤250.

### 8.6 `src/views/Ajustes.jsx`

- Replace the appearance tab's controls with the deprecation banner
  (design §4).
- The rest of `Ajustes.jsx` (LLM, project, prefs tabs) is unchanged.
- LOC: ≤150 (one PR).

## 9. Test plan per WU

| WU | RED test | GREEN impl |
|----|----------|------------|
| WU-1 | `cssTokens.test.js` extra case: `index.css` must start with `@import './app/globals.css'` | Rewrite `index.css` as a thin re-export. |
| WU-2 | `src/views/__tests__/Ajustes.appearance.test.jsx` (new): expects deprecation banner with link to `/settings/appearance` | Add the banner; keep readers working. |
| WU-3 | `src/components/ui/system/__tests__/ui-shell-views.test.jsx` (new): asserts `data-testid="ui-header"` on the five pilot views | Migrate one view at a time. |
| WU-4 | `src/lib/__tests__/ui-tokens.test.js` (new): asserts every scale entry has `fontSize`/`lineHeight`/`letterSpacing` | Add the module; add Tailwind classes; replace 16 arbitrary values. |
| WU-5 | `cssTokens.test.js` extra case: hex count in `ProjectHub.jsx` after migration | Migration flips the assertion. |
| WU-6 | `src/lib/theme/__tests__/themes.test.js` extra case: `--warning` resolves against the active theme | Add token, density rules, accent split. |
| WU-7 | `components.json` schema test (jest-json-schema) | Hand-edit. |
| WU-8 | `openspec/changes/.../tasks.md` test (read+match): every DONE/ACCEPTABLE in the verify-report is `[x]` in tasks.md; the new verify-report file exists | Hand-edit. |
| WU-9 | n/a — see WU-3 Roadmap task | D7 (Roadmap) handles the literals. |
| WU-10 | n/a | D9 + D10 create docs and verify-report. |

## 10. Risks carried into apply

- **Splitting `colors.accent`** in `tailwind.config.js` could surface
  rare class-site regressions in components not in the pilot. The
  apply pass runs `npm run build` and `rg '\b(bg|text|border|ring)-accent\b'`
  on `src/components/ui` before flipping the keys.
- **`data-density`** rules need a real pilot row to validate that
  the row spacing matches Brutalist Stage. The `Roadmap.jsx`
  milestone row is the first row to opt in; if it reads as too tight,
  the padding is bumped 1px.
- **`--warning`** is a new flat token; some places (e.g. `pillStyle`
  `tone: 'warning'`) consume it via the existing `var(--warning, #…)`
  fallback, others (e.g. `PillStatus`) consume it via raw color
  values. The apply pass audits both call sites.

## 11. Open decisions deferred to apply

- Whether to drop the `var(--warning, #e3b341)` fallback in
  `morphology.js` once `--warning` is defined (default: keep).
- Whether `data-density` extends to `--font-scale` (default: no —
  density is layout-only).
- Whether the shadcn `bg-app-accent` shim ships (default: ship, even
  if unused, as a documented escape hatch).
