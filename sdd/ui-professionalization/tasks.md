# Tasks: `ui-professionalization`

**Change:** `sdd/ui-professionalization`
**Phase:** tasks
**Date:** 2026-06-11
**Style:** work-unit commits, RED → GREEN → REFACTOR

> **Convention.** Each task is self-contained and shippable. The ID maps
> to the work unit (`WU-n` from `proposal.md`) and to the FR it
> resolves. `LOC est.` is a hard ceiling for the PR. `depends_on` is
> minimal: tasks that share a real *code* dependency, not just a
> thematic one. `RED test` names the failing assertion that lands
> first; `GREEN impl` is the change that flips it. `Refactor notes`
> flag any cleanup that can ride along without scope creep.
>
> **Bookkeeping.** The git gate from `AGENTS.md` requires
> `git status --short` + a local checkpoint commit + a
> `[git:checkpoint]` DevHub MCP comment with
> `commit=<sha|none>`, docs, checks, and working-tree status. Every
> task that touches code carries that gate in its `Refactor notes`.

---

## Task 1 — `WU-1` Single CSS entry

**Title:** Make `globals.css` the only token owner; demote `index.css` to a thin re-export.

**Files:**
- `src/index.css` (rewrite; keep `#root` and scrollbar baseline)
- `src/app/globals.css` (no change; verifies it stays canonical)
- `src/components/__tests__/cssTokens.test.js` (add RED test)

**LOC est.:** 40 (index.css) + 12 (test) ≤ 60
**depends_on:** none
**FR:** FR-D01
**NFR:** NFR-D01, NFR-D02

**Acceptance criteria:**
- `index.css` first non-comment line is `@import './app/globals.css';` or equivalent relative import.
- `index.css` no longer defines `:root { --accent-primary … }` or any `--chrome-*` token.
- `index.css` still contains `data-morphology` (via the import; the test matches the substring on the imported content).
- `index.css` still contains the desktop-only `#root` window chrome and the `::-webkit-scrollbar` baseline.
- `npm test -- --testPathPattern=cssTokens` stays green.

**RED test (add to `cssTokens.test.js`):**
```js
test('index.css re-exports globals.css and does not redefine chrome tokens', () => {
  const indexCss = fs.readFileSync(INDEX_CSS_PATH, 'utf8');
  expect(indexCss).toMatch(/@import.*globals\.css/);
  expect(indexCss).not.toMatch(/--chrome-radius-panel\s*:/);
  expect(indexCss).not.toMatch(/--accent-primary\s*:/);
});
```

**GREEN impl:**
1. Replace `src/index.css` body with the re-export + desktop-only chrome (see `design.md` §2.2).
2. Run the test; it must pass.

**Refactor notes:**
- `git status --short` must show only `src/index.css` (and the test).
- Local commit message: `chore(css): index.css becomes a thin re-export of globals.css`.
- `[git:checkpoint]` DevHub MCP comment with `commit=<sha>`, `docs=spec.md FR-D01`, `checks=cssTokens PASS`, `tree=clean`.

---

## Task 2 — `WU-6` Token gaps: `--warning`, `data-density`, tailwind `accent`

**Title:** Close the three token gaps in one PR.

**Files:**
- `src/app/globals.css` (add `--warning` and `[data-density='compact']` rules)
- `src/lib/theme/themes.js` (add `WARNING` map + `applyWarning()` helper called from `setTheme`)
- `tailwind.config.js` (split `colors.accent` into `colors.shadcn.accent` and `colors.accent.{primary,secondary}`)
- `src/app/globals.css` (add `bg-app-accent` defensive shim)
- `src/lib/theme/__tests__/themes.test.js` (add RED test)
- `src/components/__tests__/tailwindAccent.test.js` (new; ensures no class-site regression)

**LOC est.:** ≤ 220
**depends_on:** none (parallelizable with WU-1)
**FR:** FR-D06
**NFR:** NFR-D01, NFR-D02, NFR-D04

**Acceptance criteria:**
- `--warning` defined in `:root` and in each `[data-theme='…']` block in `globals.css`.
- `[data-density='compact']` rules exist in `globals.css` and adjust `--density-row-padding-{y,x}` and `--density-row-gap`.
- `tailwind.config.js` no longer has two `accent` keys; `colors.shadcn.accent` and `colors.accent.{primary,secondary}` resolve independently.
- `npm test -- --testPathPattern=themes` adds a new case asserting `--warning` is read by `applyTheme` for any theme.
- `npm run build` succeeds with no Tailwind duplicate-key warning.
- 10 themes × 4 morphologies continue to resolve their color tokens (existing tests still pass).

**RED test (add to `themes.test.js`):**
```js
test('applyWarning resolves --warning for the active theme', () => {
  for (const theme of Object.values(THEMES)) {
    setTheme(theme);
    const value = getComputedStyle(document.documentElement).getPropertyValue('--warning');
    expect(value.trim()).not.toBe('');
  }
});
```

**GREEN impl:**
1. Add `--warning` to `:root` and each `[data-theme='…']` block in `globals.css` (the 10 themes are already defined; add the variable alongside `--danger`/`--success`).
2. Add `[data-density='compact']` rule in `globals.css` (see `design.md` §5.1).
3. Add `WARNING` map in `themes.js`, call `applyWarning()` from `setTheme()`.
4. Split `tailwind.config.js` `colors.accent` (see `design.md` §6).
5. Add `bg-app-accent: var(--accent-primary)` shim in `globals.css` under `@layer utilities`.

**Refactor notes:**
- `rg '\b(bg|text|border|ring)-accent\b' src/components src/views` before the split; document any site that resolves to the shadcn slot and switch it to `bg-app-accent`.
- Local commit message: `feat(tokens): add --warning, data-density, fix tailwind accent collision`.
- `[git:checkpoint]` DevHub MCP comment.

---

## Task 3 — `WU-7` `components.json` shadcn wiring

**Title:** Point `components.json` at `src/app/globals.css`.

**Files:**
- `components.json` (one field edit)

**LOC est.:** 1
**depends_on:** none (independent of WU-1 — the shim in `index.css` keeps shadcn working until this lands)
**FR:** FR-D07

**Acceptance criteria:**
- `components.json:8` `"css"` value is `"src/app/globals.css"`.
- `components.json` is valid JSON.
- `npm test` is green (no test reads `components.json` directly today; this is a guardrail task).

**RED test (add to `src/components/__tests__/cssTokens.test.js` or new file):**
```js
test('components.json points at the canonical globals.css', () => {
  const cfg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../components.json'), 'utf8'));
  expect(cfg.tailwind.css).toBe('src/app/globals.css');
});
```

**GREEN impl:**
- Edit `components.json`.

**Refactor notes:**
- This is a bookkeeping task; no `[git:checkpoint]` required (no code change) unless combined with Task 1.

---

## Task 4 — `WU-3` `docs/DESIGN.md`

**Title:** Author the cross-cutting design doc.

**Files:**
- `docs/DESIGN.md` (new; ≤ 80 lines)

**LOC est.:** 80
**depends_on:** none
**NFR:** NFR-D03

**Acceptance criteria:**
- The doc links the four matrices: **Theme × Morphology**, **Morphology × Accent**, **Accent × Terminal chrome**, **Density × Spacing**.
- Each matrix is a small table (≤ 10 rows) with cells pointing to the source-of-truth file.
- The doc references `src/lib/theme/themes.js`, `src/chrome/morphology.js`, `src/app/globals.css`, `src/lib/ui-tokens.js`, and the new `data-density` rules.

**RED test:** none — this is a docs task.
**GREEN impl:** author the doc per the criteria.

**Refactor notes:**
- The doc is human-readable prose. Use English (matches the repo style for design docs).
- No `[git:checkpoint]` required (no code change).

---

## Task 5 — `WU-2` Settings appearance consolidation

**Title:** Deprecate `Ajustes.jsx` appearance block; route to App Router surface.

**Files:**
- `src/views/Ajustes.jsx` (replace the appearance tab controls with the banner from `design.md` §4.1)
- `src/views/__tests__/Ajustes.appearance.test.jsx` (new)

**LOC est.:** ≤ 150
**depends_on:** WU-1, WU-2, WU-3 (so the App Router surface is canonical and the `--warning`/`density`/`accent` tokens exist)
**FR:** FR-D02

**Acceptance criteria:**
- `Ajustes.jsx` appearance tab no longer renders the theme/morphology/accent/palette form controls.
- A deprecation banner renders inside the `data-testid="ajustes-appearance-shell"` container.
- The banner exposes a button that calls `navigate('/settings/appearance')`.
- The read-only summary (active theme, morphology, accent, palette) still shows.
- The `Ajustes.test.jsx` (existing) keeps passing.
- `cssTokens.test.js` stays green.

**RED test (new file `src/views/__tests__/Ajustes.appearance.test.jsx`):**
```jsx
test('Ajustes appearance tab shows a deprecation banner pointing to /settings/appearance', () => {
  render(<Ajustes />);
  fireEvent.click(screen.getByRole('tab', { name: /appearance|tema/i }));
  const banner = screen.getByTestId('ajustes-appearance-deprecation-banner');
  expect(banner).toBeInTheDocument();
  const cta = within(banner).getByRole('button', { name: /open new settings/i });
  fireEvent.click(cta);
  expect(mockNavigate).toHaveBeenCalledWith('/settings/appearance');
});
```

**GREEN impl:**
1. Extract the appearance tab body in `Ajustes.jsx` (around `renderThemeTab`) and replace it with the banner.
2. Keep the read-only summary (one line per stored value) for users who land on the legacy tab first.

**Refactor notes:**
- `git status --short` must show only `src/views/Ajustes.jsx` and the new test.
- Local commit message: `refactor(settings): deprecate Ajustes appearance block, route to App Router surface`.
- `[git:checkpoint]` DevHub MCP comment.

---

## Task 6 — `WU-3` Pilot view: Settings layout

**Title:** Migrate `src/app/settings/layout.jsx` to `UiShell` + `UiHeader`.

**Files:**
- `src/app/settings/layout.jsx`

**LOC est.:** ≤ 60
**depends_on:** WU-1, WU-3
**FR:** FR-D03

**Acceptance criteria:**
- The layout wraps children in `UiShell`.
- The page header is `<UiHeader sticky><UiHeader.Title>Settings</UiHeader.Title></UiHeader>` (or per-subroute title).
- The existing sub-routes (`/settings/appearance`, etc.) continue to mount and pass their existing tests.

**RED test (extend `src/components/ui/system/__tests__/ui-shell-views.test.jsx`):**
```jsx
test('settings layout mounts UiHeader', () => {
  render(<SettingsLayout><div>child</div></SettingsLayout>);
  expect(screen.getByTestId('ui-header')).toBeInTheDocument();
});
```

**GREEN impl:** wrap the layout body in `UiShell` + `UiHeader`.

**Refactor notes:** none.

---

## Task 7 — `WU-3` Pilot view: Dashboard

**Title:** Migrate `src/views/Dashboard.jsx` to `UiShell` + `UiHeader`.

**Files:**
- `src/views/Dashboard.jsx`

**LOC est.:** ≤ 120
**depends_on:** WU-1, WU-3, Task 6 (reuses the settings pattern's header strip helper)
**FR:** FR-D03

**Acceptance criteria:**
- The bespoke sticky header is replaced by `<UiHeader sticky>...`.
- `data-testid="ui-header"` is present in the rendered tree.
- The page renders, and any existing Dashboard test still passes.

**RED test:** add the `Dashboard` case to
`ui-shell-views.test.jsx`.

**GREEN impl:** replace the bespoke header div with `UiHeader`; wrap the page body in `UiShell`.

**Refactor notes:** none.

---

## Task 8 — `WU-3` Pilot view: Proyectos

**Title:** Migrate `src/views/Proyectos.jsx` to `UiShell` + `UiHeader`; replace 4 hex literals with theme tokens.

**Files:**
- `src/views/Proyectos.jsx`

**LOC est.:** ≤ 120
**depends_on:** WU-1, WU-2, WU-3, Task 7
**FR:** FR-D03, FR-D05

**Acceptance criteria:**
- Bespoke sticky header replaced with `UiHeader`.
- `Proyectos.jsx:16,27,38,49` hex literals replaced with
  `var(--accent-primary)`, `var(--success)`, `var(--danger)`,
  `var(--warning)`.
- `rg '#[0-9a-fA-F]{6}' src/views/Proyectos.jsx` returns 0.

**RED test:** add the `Proyectos` case to
`ui-shell-views.test.jsx`; add a case asserting the hex count is
zero.

**GREEN impl:** swap the header and the four literals.

**Refactor notes:** none.

---

## Task 9 — `WU-3` Pilot view: ProjectHub

**Title:** Migrate `src/views/ProjectHub.jsx` to `UiShell` + `UiHeader`; collapse 31 hex hits to ≤8 by mapping to `var(--project-type-*)` and `var(--status-*)`.

**Files:**
- `src/views/ProjectHub.jsx`

**LOC est.:** ≤ 350
**depends_on:** WU-1, WU-2, WU-3, Task 8
**FR:** FR-D03, FR-D05

**Acceptance criteria:**
- Bespoke sticky header replaced with `UiHeader`.
- The 31 hex hits collapse to ≤8 (only the `ACCENT_COLORS` array fallback in `ProjectHub.jsx:120` may remain).
- `data-testid="ui-header"` is present.
- `fontSize: '12px'` literal at `ProjectHub.jsx:130` is removed (replaced with the typography token class from Task 11).

**RED test:** add the `ProjectHub` case to `ui-shell-views.test.jsx`; add the hex-count assertion.

**GREEN impl:** swap the header; rewrite the hex literals as `var(--project-type-*)` / `var(--status-*)` references.

**Refactor notes:** if LOC exceeds 350, split into Task 9a (header + status colors) and Task 9b (project-type colors).

---

## Task 10 — `WU-3` Pilot view: Roadmap (and `borderRadius: '0'` cleanup)

**Title:** Migrate `src/views/Roadmap.jsx` to `UiShell` + `UiHeader`; remove the two `borderRadius: '0'` literals flagged in `morphology-system-refactor/verify-report.md:103-107`.

**Files:**
- `src/views/Roadmap.jsx`

**LOC est.:** ≤ 250
**depends_on:** WU-1, WU-2, WU-3, Task 9
**FR:** FR-D03

**Acceptance criteria:**
- `Roadmap.jsx:270` bespoke sticky header replaced with `UiHeader`.
- `Roadmap.jsx:85` literal removed; the workspace section wrapper derives its style from `panelStyle({ tone: 'accent' })`.
- `Roadmap.jsx:338` literal removed; the progress fill derives its style from `progressFillStyle()`.
- `data-testid="ui-header"` is present.
- `text-[11px]` literals at `Roadmap.jsx:310,518` replaced with `text-caption-sm` (or follow-up typography pass if Task 11 lands first).
- Dense milestone rows opt in to `data-density="compact"`.

**RED test:** add the `Roadmap` case to
`ui-shell-views.test.jsx`; add a case asserting no `borderRadius: '0'`
literal exists in the file (regex read).

**GREEN impl:** swap the header, remove the literals, opt in the rows to compact density.

**Refactor notes:** this is the task that closes two `WARNING` items
from the morphology refactor verify-report. Mark those warnings
resolved in `openspec/changes/morphology-system-refactor/tasks.md`.

---

## Task 11 — `WU-4` Typography scale

**Title:** Add `src/lib/ui-tokens.js` with the typography scale; replace arbitrary `text-[10px]/[11px]/[12px]/[13px]` in the three pilot views.

**Files:**
- `src/lib/ui-tokens.js` (new)
- `src/lib/__tests__/ui-tokens.test.js` (new)
- `tailwind.config.js` (extend `theme.fontSize` with named classes)
- `src/views/ProjectDashboard.jsx` (replace 11 arbitrary values)
- `src/views/Roadmap.jsx` (replace 2 arbitrary values; complement Task 10)
- `src/views/ProjectHub.jsx` (replace 1 arbitrary value; complement Task 9)

**LOC est.:** ≤ 250
**depends_on:** WU-1, WU-2, WU-3, Task 10 (so the pilot views are already on `UiHeader` and we can sweep typography last)
**FR:** FR-D04

**Acceptance criteria:**
- `ui-tokens.js` exports `TYPOGRAPHY_SCALE` with 7 entries
  (`caption-xs`, `caption-sm`, `caption-md`, `label`, `body`, `title`, `display`).
- Every entry has `{ fontSize, lineHeight, letterSpacing }`.
- Tailwind exposes `text-caption-xs` … `text-display`.
- `rg 'text-\[1[0-3]px\]' src/views/Dashboard.jsx src/views/Proyectos.jsx src/views/ProjectHub.jsx src/views/Roadmap.jsx src/app/settings` returns 0.
- The `ui-tokens.test.js` passes.

**RED test:**
```js
test('TYPOGRAPHY_SCALE entries are well-formed', () => {
  for (const entry of Object.values(TYPOGRAPHY_SCALE)) {
    expect(entry.fontSize).toMatch(/(px|rem)$/);
    expect(entry.lineHeight).toBeDefined();
    expect(entry.letterSpacing).toBeDefined();
  }
});
```

**GREEN impl:** add the module, extend Tailwind, replace arbitrary values in the three pilot files.

**Refactor notes:** the typography pass also drops `fontSize: '12px'` in `ProjectHub.jsx:130` (covered by Task 9, but a final sweep here makes the policy uniform).

---

## Task 12 — `WU-8` Bookkeeping: morphology-system-refactor + terminal-zone-appearance

**Title:** Reconcile `morphology-system-refactor/tasks.md` with its verify-report; create `terminal-zone-appearance/verify-report.md`.

**Files:**
- `openspec/changes/morphology-system-refactor/tasks.md` (checkbox edits)
- `openspec/changes/terminal-zone-appearance/verify-report.md` (new)
- `openspec/changes/morphology-system-refactor/verify-report.md` (cross-link update; the WARNING items are now resolved by Task 10)

**LOC est.:** ≤ 120
**depends_on:** Task 10 (so the cross-link to the `borderRadius: '0'` resolution is concrete)
**FR:** FR-D08

**Acceptance criteria:**
- Every `DONE` / `ACCEPTABLE` row in the morphology-system-refactor verify-report is `[x]` in its tasks.md.
- The two `WARNING` items (Roadmap literals, brutalist wrappers) are `[ ]` and cross-linked to Task 10 and a follow-up.
- `terminal-zone-appearance/verify-report.md` exists, records the test evidence already cited in `docs/41_Brutalist_Stage_Session_Handoff.md:91-93`, and explicitly calls out the inherited `TerminalWorkspacesManager.shortcuts.test.jsx` failure as out-of-scope for this change (cross-link to `brutalist-stage-morphology/verify-report.md:148-152`).

**RED test (new `openspec/__tests__/bookkeeping.test.js`):**
```js
test('morphology-system-refactor tasks.md is reconciled', () => {
  const tasks = fs.readFileSync('openspec/changes/morphology-system-refactor/tasks.md', 'utf8');
  expect(tasks).toMatch(/\[x\].*panelStyle/);
  expect(tasks).toMatch(/\[x\].*btnPrimaryStyle/);
  // …
});

test('terminal-zone-appearance verify-report exists', () => {
  expect(fs.existsSync('openspec/changes/terminal-zone-appearance/verify-report.md')).toBe(true);
});
```

**GREEN impl:** hand-edit the two files.

**Refactor notes:** the bookkeeping test is optional. The handbook says
"trust code over docs" — so the test is a guardrail, not a gate.

---

## Task 13 — `WU-3` Pilot view: Settings layout *subroute header* (refinement)

**Title:** Wire per-subroute title into `UiHeader.Title`.

**Files:**
- `src/app/settings/layout.jsx`
- `src/app/settings/appearance/page.jsx` (already exposes its own header — verify it nests correctly)

**LOC est.:** ≤ 50
**depends_on:** Task 6
**FR:** FR-D03

**Acceptance criteria:**
- Navigating to `/settings/appearance` shows the `Settings → Appearance` title in the `UiHeader.Title` slot.
- Navigating to a non-existent subroute falls back to the layout default title.

**RED test:** add a case to `ui-shell-views.test.jsx` that renders
the layout at `/settings/appearance` and asserts the title text.

**GREEN impl:** thread the subroute name into the layout via
`usePathname()` and pass it as `UiHeader.Title` children.

**Refactor notes:** if `appearance/page.jsx` already has its own
header, deprecate it and route through the layout.

---

## Task 14 — Verify package-level state

**Title:** Run the full regression gate and write the package-level verify summary.

**Files:**
- `sdd/ui-professionalization/verify-report.md` (new)

**LOC est.:** 60
**depends_on:** Tasks 1-13

**Acceptance criteria:**
- `npm test -- --testPathPattern=cssTokens|ui-tokens|themes-appearance|tailwindAccent|ui-shell-views` is green.
- `npx playwright test tests/e2e/05_workspace_morphology_smoke.spec.ts` is green.
- `npm run build` succeeds.
- The verify-report records the evidence and lists the residual
  follow-ups (the `brutalist-stage-morphology` shortcut test failure
  is **not** a regression of this change).
- Every task that touched code has a `[git:checkpoint]` DevHub MCP
  comment.

**RED test:** none — this is the closing artifact.

**GREEN impl:** run the gates, paste the output, mark
`PASS WITH NOTES` (the inherited shortcut test failure is a known
inherited issue, not this change's regression).

**Refactor notes:** the verify-report is the human gate. If anything
is red, file a follow-up task and stop.

---

## Sequencing summary

```
T1  T2  T3  T4       (parallel; all foundation)
  ↓   ↓
  T6                  (settings layout)
   ↓
   T7 → T8 → T9 → T10 (pilot views, ordered by risk)
                              ↓
                              T11 (typography sweep)
                              T13 (settings subroute title)
                                          ↓
                                          T5  (deprecate Ajustes appearance)
                                          T12 (bookkeeping)
                                                       ↓
                                                       T14 (verify)
```

Total: 14 tasks across 8 work units, plus 1 closing verify. The
foundation tasks (T1-T4) and the design doc (T4) ship in the first
batch. The pilot migrations (T7-T10) ship one view per PR. The
typography pass (T11) and bookkeeping (T12) close the package.

## Out-of-scope (carried forward to other agents)

- `TerminalWorkspacesManager.jsx` typography (9 arbitrary values): tracked here for visibility; consumed by Agente 1's pass.
- `TerminalTTY.jsx`, `ZedAmbientOverlay.jsx`, `pizarra/*`: Agentes 1, 3.
- `src/lib/asistente/**`: Agente 2.
- Brutalist Stage visual deltas: explicit non-goal in
  `docs/41_Brutalist_Stage_Session_Handoff.md:97-103`.
