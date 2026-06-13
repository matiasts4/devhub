# Spec: `ui-professionalization`

**Change:** `sdd/ui-professionalization`
**Phase:** spec
**Date:** 2026-06-11
**Format:** OpenSpec delta specs

> **Constraint carried by every requirement below:** morphology chrome is
> already in code. The contract from
> `openspec/changes/morphology-system-refactor/verify-report.md` (PASS WITH
> WARNINGS) is held. The two outstanding warnings — `Roadmap.jsx:85`,
> `Roadmap.jsx:338` `borderRadius: '0'` literals, and the
> `brutalPanelStyle`/`brutalProgressTrackStyle` backward-compat wrappers —
> are resolved in this change's pilot migration (D7) and a documented
> deprecation (D9), respectively. Re-implementing morphology is **not** a
> permitted solution path.

---

## Requirement: FR-D01 Single CSS entry

The product must have exactly one canonical global stylesheet
(`src/app/globals.css`) that owns the morphology token layer. The legacy
CRA `src/index.css` must become a thin re-export that imports the
canonical file plus any desktop-shell-only window styling required by
`#root` and the scrollbar baseline. `components.json` must point to the
canonical file.

### Scenario: FR-D01.S1 globals.css is the only token owner

**Given** `src/app/globals.css` defines `--chrome-radius-panel`,
`--chrome-shadow-panel`, `--chrome-border-width`,
`--chrome-press-offset`, and the four `[data-morphology]` blocks
**And** `src/index.css` exists for the Tauri `#root` window chrome

**When** the test `src/components/__tests__/cssTokens.test.js:138-148`
runs

**Then** `index.css` must not redefine `--accent-primary` or any
`--chrome-*` token
**And** `index.css` must contain the substring `data-morphology|globals.css`
**And** `src/index.css` must import `../app/globals.css` at the top of
the file so the token layer is the single source of truth.

### Scenario: FR-D01.S2 shadcn config points at the canonical file

**Given** shadcn CLI and `components.json` are the wiring layer for
`npx shadcn add`

**When** a developer inspects `components.json:8`

**Then** `tailwind.css` must equal `"src/app/globals.css"`
**And** `npm test` must remain green
**And** `npx shadcn diff` (if available) must not flag the file as
unmanaged.

---

## Requirement: FR-D02 Settings appearance has one surface

All theme, morphology, accent, palette, zoom, density, font, terminal
header style, terminal accent bar, terminal typography, terminal
renderer default, and terminal restore preferences must be editable on
exactly one App Router surface: `/settings/appearance`. The legacy
`Ajustes.jsx` appearance block is deprecated in place; it must not
present its own controls and must not be deleted (other settings tabs
depend on it).

### Scenario: FR-D02.S1 legacy appearance block renders redirect banner

**Given** a user navigates to `/ajustes` and lands on the legacy
`Ajustes.jsx` appearance tab
**And** `data-testid="ajustes-appearance-shell"` is the legacy
container (`src/views/Ajustes.jsx:947`)

**When** the page mounts

**Then** the legacy theme/morphology/accent/palette controls inside
that block must not be interactive
**And** a redirect banner must render at the top of the block with copy
that points to `/settings/appearance`
**And** the banner must contain a working link/button that calls
`navigate('/settings/appearance')` (existing React Router navigation
in `Ajustes.jsx:3`).

### Scenario: FR-D02.S2 App Router surface is the source of truth

**Given** the App Router surface
`src/app/settings/appearance/page.jsx` exposes all preferences

**When** a user changes the morphology to `aura`

**Then** `document.documentElement` must set
`data-morphology="aura"` within one frame
**And** `localStorage.getItem('devhub:morphology')` must equal `"aura"`
**And** reloading the page must restore `aura` as the active
morphology.

### Scenario: FR-D02.S3 legacy block reads but does not write

**Given** the deprecation banner is active

**When** a user opens the legacy block's tab and reads the displayed
active theme/morphology/accent

**Then** the values must match what
`getStoredTheme()`/`getStoredMorphology()`/`getStoredAccent()` return
(so the read is preserved for users who land on the legacy tab first).

---

## Requirement: FR-D03 Pilot views use `UiShell` + `UiHeader`

`Dashboard`, `Proyectos`, `ProjectHub`, the `Settings` layout, and
`Roadmap` must render their top-level page chrome through
`src/components/ui/system/ui-shell.jsx` and
`src/components/ui/system/ui-header.jsx`. The shared
`core-sticky-header` style and the bespoke
`sticky top-0 z-10 ... bg-surface-app/95` divs in those views are
replaced.

### Scenario: FR-D03.S1 UiHeader renders on every pilot view

**Given** the five pilot views mount through `src/App.js`

**When** a Playwright smoke test queries the page for the testid
`data-testid="ui-header"`

**Then** Dashboard, Proyectos, ProjectHub, Settings (any subroute),
and Roadmap must each contain exactly one `ui-header` element
**And** the header must expose a `<h1>` title via `UiHeader.Title` and
an actions slot via `UiHeader.Actions`.

### Scenario: FR-D03.S2 panel style flows from morphology

**Given** a pilot view's `UiHeader` is wrapped in a `panelStyle()` strip
helper

**When** the user toggles morphology between `default` and
`brutalist-stage` via `/settings/appearance`

**Then** the header strip's `borderRadius` and `boxShadow` must change
according to the active `[data-morphology]` block in `globals.css`
**And** the change must apply without a page reload.

### Scenario: FR-D03.S3 Roadmap borderRadius literals are removed

**Given** `src/views/Roadmap.jsx:85` and `src/views/Roadmap.jsx:338`
contain `borderRadius: '0'` literals (residual from
`morphology-system-refactor/verify-report.md:103-107`)

**When** the D7 migration lands

**Then** the literals must be removed
**And** the elements must derive their style from
`panelStyle({ tone: 'accent' })` and `progressFillStyle()`
**And** toggling morphology to `default` must produce a non-zero
`border-radius` on those elements.

### Scenario: FR-D03.S4 PR size is bounded

**Given** NFR-D02 caps each migrated view at ≤400 LOC

**When** a PR touches any of the five pilot views

**Then** `git diff --stat` for the PR must show ≤400 LOC net
**And** if a view needs more, it ships as two PRs in sequence.

---

## Requirement: FR-D04 Typography scale is tokenized

A single typography scale must live in
`src/lib/ui-tokens.js` (or as an extension to
`src/app/opencode-vars.css`; the design decision is recorded in
`design.md` §3). The scale exposes named sizes that the pilot views
consume. `text-[10px]`, `text-[11px]`, `text-[12px]`, and
`text-[13px]` arbitrary values are replaced by named token classes in
the three pilot views (`ProjectDashboard.jsx`, `Roadmap.jsx`,
`ProjectHub.jsx`).

### Scenario: FR-D04.S1 token module exposes the scale

**Given** `src/lib/ui-tokens.js` exports
`TYPOGRAPHY_SCALE` with named entries `caption-xs`, `caption-sm`,
`caption-md`, `label`, `body`, `title`, `display`

**When** a unit test reads the module

**Then** every entry must include `{ fontSize, lineHeight, letterSpacing }`
**And** every `fontSize` value must be a string ending in `px` or `rem`
(arbitrary values like `text-[10px]` are not allowed inside the scale).

### Scenario: FR-D04.S2 pilot views drop arbitrary 10/11/12/13 px values

**Given** the typography pass is complete

**When** `rg 'text-\[1[0-3]px\]' src/views/Dashboard.jsx src/views/Proyectos.jsx src/views/ProjectHub.jsx src/views/Roadmap.jsx src/app/settings`

**Then** the count must be 0
**And** the count in `src/components/TerminalWorkspacesManager.jsx` must
drop below 4 (terminal chrome is out of scope but the most egregious
labels can be retired when the views around them move).

### Scenario: FR-D04.S3 Geist family stays the UI font

**Given** `tailwind.config.js:8` maps `fontFamily.sans` to
`var(--font-family-ui)` and `themes.js:62` writes `--font-family-ui`
from the stored appearance

**When** a user picks `Geist` in the new typography scale

**Then** the document must resolve `--font-family-ui: Geist`
**And** the next render must apply the new family without a hard
reload.

---

## Requirement: FR-D05 Terminal chrome uses CSS variables (constraint only)

Terminal chrome and pizarra are owned by other agents. This change must
not introduce new hardcoded hex in those files, must not change the
xterm viewport rules covered by `cssTokens.test.js:73-108`, and must
not touch `src/components/TerminalTTY.jsx`,
`src/components/ZedAmbientOverlay.jsx`, or
`src/components/pizarra/*`.

### Scenario: FR-D05.S1 pilot migrations add no terminal hex

**Given** the pilot views are migrated

**When** `rg '#[0-9a-fA-F]{6}'` runs over the post-migration views

**Then** the hex count in `ProjectHub.jsx` must drop from 31 to ≤8
(only the `ACCENT_COLORS` array fallback in `ProjectHub.jsx:120` may
remain until D5's full tokenization lands)
**And** the hex count in `Proyectos.jsx` must drop from 4 to 0
**And** the hex count in `Roadmap.jsx` and `Dashboard.jsx` must remain
0.

### Scenario: FR-D05.S2 xterm tests still pass

**Given** the four xterm-viewport assertions in
`cssTokens.test.js:73-108`

**When** `npm test -- --testPathPattern=cssTokens` runs after the
migration

**Then** all four xterm assertions must pass
**And** `npx playwright test tests/e2e/05_workspace_morphology_smoke.spec.ts`
must remain green.

---

## Requirement: FR-D06 Token gaps: `--warning`, `data-density`, tailwind `accent`

Three known token gaps close in this change.

### Scenario: FR-D06.S1 `--warning` is a first-class token

**Given** `src/chrome/morphology.js:196-198` references
`var(--warning, #e3b341)` with a hex fallback

**When** `:root` and each theme block in `src/app/globals.css` define
`--warning`

**Then** `pillStyle({ tone: 'warning' })` must resolve to the
theme-defined warning color (no fallback used)
**And** the `var(--warning, #e3b341)` fallback in `morphology.js` can
be dropped (or kept as a safety net — the design decision is in
`design.md` §5).

### Scenario: FR-D06.S2 `data-density` rules apply

**Given** `themes.js:63` writes
`data-density="compact|comfortable"` on `<html>`

**When** the rules in `globals.css` define density-aware paddings and
gaps for `[data-density='compact']`

**Then** opt-in containers that set `data-density="compact"` on
themselves must apply the compact padding/gap
**And** other containers must remain at the `comfortable` default
**And** the change must be reversible by setting
`data-density="comfortable"`.

### Scenario: FR-D06.S3 tailwind `accent` collision is fixed

**Given** `tailwind.config.js:27` and `tailwind.config.js:48` both
extend `colors.accent`

**When** the `accent` block is split into
`colors.shadcn.accent` (for `hsl(var(--accent))` shadcn usage) and
`colors.accent.{primary,secondary}` (for the existing in-house
semantic accent)

**Then** `bg-accent-primary` must resolve to
`var(--accent-primary)`
**And** `bg-shadcn-accent` (or a documented alias) must resolve to
`hsl(var(--accent))` for any shadcn class site that depended on the
collision behavior
**And** `npm run build` must succeed with no Tailwind class-resolution
warnings about duplicate keys.

---

## Requirement: FR-D07 `components.json` wiring

`components.json` must point at `src/app/globals.css` and must remain
shadcn-compatible (no missing fields).

### Scenario: FR-D07.S1 components.json points to the canonical file

**Given** `components.json:8` currently reads `"css": "src/index.css"`

**When** the change applies

**Then** `"css"` must equal `"src/app/globals.css"`
**And** `npx shadcn add button --dry-run` (when the CLI is reachable)
must not report an unmanaged path
**And** the file must remain valid JSON.

---

## Requirement: FR-D08 Bookkeeping

`openspec/changes/morphology-system-refactor/tasks.md` must be
reconciled with its verify-report, and
`openspec/changes/terminal-zone-appearance/verify-report.md` must be
created if it does not already exist.

### Scenario: FR-D08.S1 morphology-system-refactor tasks are reconciled

**Given** `openspec/changes/morphology-system-refactor/verify-report.md`
records `DONE` / `ACCEPTABLE` for every phase 1.x-7.x task

**When** `openspec/changes/morphology-system-refactor/tasks.md` is
updated

**Then** every task that the verify-report marks `DONE` or
`ACCEPTABLE` must be marked `[x]` in `tasks.md`
**And** every `WARNING` item (Roadmap literals, brutalist wrappers)
must be marked `[ ]` and cross-linked to the WU that resolves it in
this change (`sdd/ui-professionalization/tasks.md`).

### Scenario: FR-D08.S2 terminal-zone-appearance verify-report exists

**Given** the change shipped code but no `verify-report.md`

**When** D10 lands

**Then** `openspec/changes/terminal-zone-appearance/verify-report.md`
must exist
**And** it must record the test evidence already cited in
`docs/41_Brutalist_Stage_Session_Handoff.md:91-93`
**And** it must explicitly call out the independent
`TerminalWorkspacesManager.shortcuts.test.jsx` failure inherited from
`brutalist-stage-morphology/verify-report.md:148-152` as
**out-of-scope** for this change.

---

## Cross-cutting NFRs

### NFR-D01 cssTokens + E2E remain green

All `cssTokens.test.js` cases (token presence, xterm viewport, kanban
scrollbar, blue hex absence) and the morphology smoke spec remain
green. They are the regression gate for the entire package.

### NFR-D02 PRs ≤400 LOC per migrated view

Each pilot view migration ships as its own PR. If a view needs more
than 400 LOC, it ships as two PRs in sequence. CI must not block a
single view because of a stacked diff.

### NFR-D03 docs/DESIGN.md

A new `docs/DESIGN.md` (≤ 80 lines) exists and links the four
matrices: **Theme × Morphology**, **Morphology × Accent**,
**Accent × Terminal chrome**, and **Density × Spacing**.

### NFR-D04 10 themes × 4 morphologies preserved

The migration must not remove any theme preset (`deep-sea`, `nord`,
`dracula`, `light`, `catppuccin`, `tokyo-night`, `monokai`,
`synthwave`, `brutalist-stage`, `switchyard`) or any morphology
(`default`, `brutalist-stage`, `aura`, `switchyard`). Tests must
continue to cycle through all 40 combinations where applicable.

---

## Out-of-scope requirements (carried forward)

- Theming the terminal canvas (xterm palette is owned by Agente 1).
- Animations on the pizarra (Agente 3).
- Asistente prompt/summarize work (Agente 2).
- Swarm orchestration. The orchestration layer is paused
  (`docs/delegation/00-shared-context.md:14`).
- Stronger Brutalist Tech visual deltas in the preview
  (`docs/41_Brutalist_Stage_Session_Handoff.md:97-103`). This package
  pushes consistency, not a stronger brutalist expression.
