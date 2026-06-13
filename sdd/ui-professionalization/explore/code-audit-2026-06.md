# Code Audit — `sdd/ui-professionalization` (2026-06-11)

Snapshot of the actual codebase ahead of the propose/spec/design pass. This is a focused
audit, not a re-exploration; facts are gathered via `rg` and `Read` against the
exploration already in `explore/exploration.md`.

---

## 1. Hardcoded `text-[10px]` / `text-[11px]` in pilot views (FR-D04)

| File                                                | 10px | 11px | Notes |
|-----------------------------------------------------|-----:|-----:|-------|
| `src/components/TerminalWorkspacesManager.jsx`      |   5  |   4  | Out of pilot scope this round, but biggest offender in the app (see file 2 of the audit). **Touched only if D8 stays in scope.** |
| `src/views/ProjectDashboard.jsx`                    |  11  |   0  | Tag rows, progress rows, footer captions. |
| `src/views/Roadmap.jsx`                             |   0  |   2  | Line 310 (`text-[11px]` caption), line 518 (CTA). |
| `src/views/Proyectos.jsx`                           |   0  |   0  | Already clean on this metric. |
| `src/views/Dashboard.jsx`                           |   0  |   0  | Already clean on this metric. |
| `src/views/ProjectHub.jsx`                          |   0  |   1  | Line 470 (`text-[11px]` type chip). |

> The full `rg --count` over `src/views` and `src/components` is in
> `sdd/ui-professionalization/explore/exploration.md` (line 13). Pilot migration must
> retire the 16 occurrences in `ProjectDashboard.jsx`, `Roadmap.jsx`, and
> `ProjectHub.jsx` via the new typography scale (see `design.md` §3).

## 2. Header duplication (FR-D03)

`rg 'core-sticky-header' src/views src/components` — 7 hits across 7 files, but only
**1** page uses the shared `UiHeader` primitive (`src/components/ui/system/ui-header.jsx:16`).

| File                              | Pattern present                                       |
|-----------------------------------|-------------------------------------------------------|
| `src/views/Dashboard.jsx`         | bespoke sticky div, no `UiHeader`                     |
| `src/views/Proyectos.jsx`         | bespoke sticky div, no `UiHeader`                     |
| `src/views/Roadmap.jsx:270`       | `sticky top-0 z-10 core-sticky-header border-b ...`   |
| `src/views/Historial.jsx`         | bespoke                                               |
| `src/views/Conexiones.jsx`        | bespoke                                               |
| `src/views/CodeEditor.jsx`        | bespoke                                               |
| `src/views/Ajustes.jsx`           | `WorkspacePageTitle` wrapper, custom chrome           |
| `src/components/ui/system/ui-header.jsx` | canonical, only 1 consumer of the `sticky` variant |

Pilot migration plan replaces each bespoke header with `<UiHeader>` + a `panelStyle()`
header strip so the four morphology states remain visually consistent.

## 3. `index.css` vs `globals.css` (FR-D01)

| Concern                                | `src/index.css` (CRA legacy) | `src/app/globals.css` (canonical) |
|----------------------------------------|------------------------------|-----------------------------------|
| Font import                            | JetBrains Mono (line 1)      | Geist + JetBrains Mono (line 1)   |
| Tailwind directive                     | `@tailwind base/components/utilities` (v3 syntax, lines 3-5) | `tailwindcss` v4 (line 5) |
| `:root` chrome tokens                  | redefined (lines 8-23)       | redefined (lines 8-22)            |
| `[data-morphology='default']`          | differs (lines 25-43)        | present (lines 24-44)             |
| `[data-morphology='brutalist-stage']`  | differs (lines 45-76)        | present (lines 46-75)             |
| `html, body, #root` window styling     | yes (lines 79-103)           | not present                       |
| Scrollbar baseline                     | yes (lines 109-122)          | present, different values         |
| `:root` shadcn `--background/-foreground/...` HSL palette | yes (lines 124-147) | not present (consumed from `opencode-vars.css`) |
| Final size                             | 448 lines                    | 1,616 lines                       |

**Net duplication:** both files define `--chrome-*` tokens and the same morphology
blocks; the values **already drifted** (compare `default` shadow recipe in each file:
`index.css:32-33` uses a 2-stop inset, `globals.css:30` uses `var(--shadow-soft)`).
Tests in `src/components/__tests__/cssTokens.test.js:131-149` already assert that
`index.css` must not redefine `--accent-primary` and must reference
`data-morphology|globals.css`, so the contract for the thin re-export is already
encoded.

## 4. `Roadmap.jsx` `borderRadius: '0'` (FR-D03, residual from morphology-system-refactor)

```
src/views/Roadmap.jsx:85   borderRadius: '0',  // workspace section wrapper
src/views/Roadmap.jsx:338  borderRadius: '0',  // progress fill override
```

Both are explicit overrides of `panelStyle()` / `progressFillStyle()` factory values.
Already flagged in `openspec/changes/morphology-system-refactor/verify-report.md:103-107`
as `WARNING`. D7 (Roadmap migration) removes the literals by relying on
`panelStyle({ tone: 'accent' })` and `progressFillStyle()` directly.

## 5. Hardcoded hex in pilot views (FR-D05, scoped subset)

`rg '#[0-9a-fA-F]{6}'` over the four pilot views:

| File                          | Count | Highest concentration | Action |
|-------------------------------|------:|-----------------------|--------|
| `src/views/ProjectHub.jsx`    |    31 | lines 470-800 (status colors, project-type chips) | Replace with `var(--project-type-*)`, `var(--status-*)`, `var(--accent-primary)` and the new `--warning` token (D2). |
| `src/views/Proyectos.jsx`     |     4 | lines 16, 27, 38, 49 (status palette)            | Replace with `var(--status-*)` tokens. |
| `src/views/Roadmap.jsx`       |     0 | n/a                                              | Clean. |
| `src/views/Dashboard.jsx`     |     0 | n/a                                              | Clean. |

`ProjectHub.jsx:120` holds an `ACCENT_COLORS` array of 6 brand hex codes; D5
migrates this constant to a `var(--project-type-*)` lookup.

## 6. `--warning` token state (FR-D06)

- `src/chrome/morphology.js:196-198` already references `var(--warning, #e3b341)`
  with a hex fallback in `pillStyle({ tone: 'warning' })`.
- `src/app/opencode-vars.css` defines only multi-step warning tokens
  (`--surface-warning-base`, `--text-on-warning-*`, `--icon-warning-*`, etc.) — no
  flat `--warning`.
- Tests don't currently assert the presence of a single `--warning` token.

D2 adds `--warning` in `:root` (and per-theme overrides) so the `var()` fallback
in `morphology.js` becomes redundant. Pill `tone: 'warning'` will then resolve
against the live theme.

## 7. `data-density` state (FR-D06)

- `themes.js:63` writes `data-density="comfortable|compact"` to `<html>`.
- `globals.css` has **no** rules keyed on `[data-density]`.
- No component reads `data-density` to adjust paddings, gaps, or font-size
  multipliers.

D2 introduces the rule set (compact ≈ 0.92× paddings, comfortable ≈ 1.00×) and
opts pilot pages into it via a `data-density="compact"` override on dense rows
only.

## 8. Tailwind `accent` collision (FR-D06)

`tailwind.config.js:27` and `tailwind.config.js:48` both define `theme.extend.colors.accent`:

```js
// line 27
accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
// line 48
accent: { primary: 'var(--accent-primary)', secondary: 'var(--accent-secondary)' },
```

The second `accent` key overwrites the first in `extend.colors`. Result: Tailwind
classes `bg-accent`, `text-accent`, `border-accent` resolve against
`var(--accent-primary)`, **not** `hsl(var(--accent))`. Class
`bg-accent-foreground` is broken. D2 splits the keys into `shadcn.accent` and
`accent-{primary,secondary}` (the latter already used in the codebase) and adds
a `bg-app-accent` shim where the shadcn palette was actually expected.

## 9. Pilot views — `data-morphology` / `data-density` consumers

None of the pilot views (`Dashboard`, `Proyectos`, `ProjectHub`, `Roadmap`,
Settings layout) currently reacts to morphology or density attributes.
D5-D7 wire `data-morphology="<current>"` to the page root and add a `data-density`
opt-in on dense list rows in `Roadmap.jsx` and `ProjectDashboard.jsx`.

## 10. Bookkeeping state

| OpenSpec change                  | Artifacts in repo | Gap |
|----------------------------------|-------------------|-----|
| `morphology-system-refactor`     | proposal/design/spec/tasks/verify-report | `tasks.md` checkboxes not all marked `DONE` despite verify-report PASS WITH WARNINGS. |
| `terminal-zone-appearance`       | proposal/design/spec/tasks              | **No `verify-report.md`**. D10 creates it (or notes that it was intentionally merged into the brutalist-stage verify). |
| `brutalist-stage-morphology`     | proposal/design/spec/tasks/verify-report | verify-report FAIL — not in scope here, but D9 notes this in handoff. |

---

End of audit. Anything not listed above is out of scope for this change package.
