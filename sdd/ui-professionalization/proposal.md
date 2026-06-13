# Proposal: `ui-professionalization`

**Change:** `sdd/ui-professionalization`
**Phase:** propose
**Date:** 2026-06-11
**Owner:** Agente 4 — Diseño / UI Professionalization
**Status:** ready for spec

---

## Why

DevHub's morphology system is **live** — `chrome-surface.jsx`,
`chrome/morphology.js`, `globals.css` `[data-morphology]` blocks, and the
`UiShell`/`UiHeader` primitives are in the tree. The brutalist-stage visuals
are still subtle in the product, but the contract is real
(`openspec/changes/morphology-system-refactor/verify-report.md: PASS WITH WARNINGS`).

What's missing is everything **around** that contract:

1. **Two CSS entries** (`src/app/globals.css` + the CRA legacy `src/index.css`)
   define the same `--chrome-*` tokens and morphology blocks; values have
   already drifted (`index.css:32-33` vs `globals.css:30`).
2. **Two appearance surfaces** (`src/app/settings/appearance/page.jsx` App
   Router + `src/views/Ajustes.jsx` legacy block) maintain parallel theme,
   morphology, accent, palette, and zoom state — see
   `docs/41_Brutalist_Stage_Session_Handoff.md:65-66`.
3. **Bespoke headers in 7 pilot views** (`Dashboard`, `Proyectos`,
   `ProjectHub`, `Roadmap`, `Historial`, `Conexiones`, `CodeEditor`,
   `Ajustes`) reimplement the same `core-sticky-header` / `bg-surface-app/95`
   / `backdrop-blur` pattern that `UiHeader` already provides.
4. **Typography is hardcoded** in 16 places across `ProjectDashboard.jsx`,
   `Roadmap.jsx`, and `ProjectHub.jsx` (`text-[10px]`/`text-[11px]`); the
   `TerminalWorkspacesManager.jsx` alone has 9 more.
5. **Token gaps**: `morphology.js:196` uses `var(--warning, #e3b341)` with a
   hex fallback because no flat `--warning` is defined; `data-density` is
   written by `themes.js:63` but no CSS reads it; `tailwind.config.js`
   redefines `colors.accent` twice (lines 27 and 48), the second silently
   overwriting the first.
6. **shadcn `components.json:8`** still points at the legacy `src/index.css`.
7. **Bookkeeping drift**: `morphology-system-refactor/tasks.md` is stale
   relative to its verify-report; `terminal-zone-appearance/verify-report.md`
   doesn't exist at all.

These are the deliverable surfaces for `ui-professionalization`. None of them
reimplement morphology — they consume it.

## What changes

| Work unit | Maps to | Scope |
|-----------|---------|-------|
| **WU-1** Single CSS entry                          | FR-D01 | Make `globals.css` the canonical token source; convert `index.css` to a thin re-export; fix `components.json`. |
| **WU-2** Settings appearance consolidation          | FR-D02 | One App Router surface (`/settings/appearance`); deprecate `Ajustes.jsx` appearance block with a redirect banner. |
| **WU-3** Pilot migration to `UiShell`/`UiHeader`    | FR-D03 | Migrate `Settings layout`, `Dashboard`, `Proyectos`, `ProjectHub`, `Roadmap` to the shared shell. |
| **WU-4** Typography scale + tokenization            | FR-D04 | New `src/lib/ui-tokens.js` (or extension of `opencode-vars.css`); retire `text-[10px]/[11px]` in the three pilot views. |
| **WU-5** Terminal chrome + pizarra (touch only)     | FR-D05 | **Stay out** of `TerminalTTY.jsx`, `pizarra/*`, `ZedAmbientOverlay.jsx` (other agents). Only verify no new hex is added in the views we migrate. |
| **WU-6** Tokens: `--warning`, `data-density`, accent| FR-D06 | Add `--warning` to `:root` and per-theme; add `[data-density]` rules; split `tailwind.config.js` `accent` keys. |
| **WU-7** shadcn wiring                              | FR-D07 | `components.json` → `src/app/globals.css`. |
| **WU-8** Bookkeeping                                | FR-D08 | Reconcile `morphology-system-refactor/tasks.md`; create `terminal-zone-appearance/verify-report.md`. |

Plus a thin doc: `docs/DESIGN.md` (NFR-D03) summarizing
**Theme × Morphology × Accent × Terminal chrome** and the relationship
between them — this is the artifact a future agent reads to understand the
visual model.

## Approach

1. **Incremental, not big-bang.** Each WU ships a PR ≤400 LOC
   (NFR-D02). The pilot migration is split per-view so a single regression
   blocks at most one view.
2. **Reuse, do not reimplement.** All `chrome-*` tokens, `[data-morphology]`
   blocks, `chrome-surface.jsx`, and `morphology.js` factories are taken
   as-is. The only new factories are two header helpers
   (`getShellHeaderStripStyle`, `getShellSubtitleStyle`) and a typography
   token module.
3. **Token-first.** WU-4 (typography) and WU-6 (warning/density/accent) land
   before the pilot migrations in WU-3, so the views migrate *onto* the
   new tokens, not alongside them.
4. **One canonical appearance surface.** WU-2 deprecates the legacy
   `Ajustes.jsx` appearance tab with a non-destructive redirect banner that
   preserves user state in localStorage. The legacy `Ajustes.jsx` other
   tabs (LLM, project, prefs) stay untouched.
5. **Strict TDD.** Every WU lists a RED test that fails on `main` and a
   GREEN impl that flips it. The pilot views get a shared
   `core-shell-render.test.jsx` that asserts each pilot's `UiShell`
   composition.

## Out of scope

- `src/components/TerminalTTY.jsx` (Agente 1).
- `src/components/ZedAmbientOverlay.jsx` (Agente 3).
- `src/components/pizarra/**` (Agente 3).
- `src/lib/asistente/**` (Agente 2).
- Swarm/orchestration work; `devhub_multi-pillar_roadmap` orchestration
  remains paused (`docs/delegation/00-shared-context.md:14`).
- Re-implementing morphology from scratch (the contract is already in
  place — see `morphology-system-refactor/verify-report.md`).
- Stronger brutalist visual deltas in the Brutalist Tech preview
  (`docs/41_Brutalist_Stage_Session_Handoff.md:97-103` lists that as
  follow-up, not this package).

## Risks

| Risk | Mitigation |
|------|------------|
| `index.css` re-export breaks a CRA code path the Tauri shell depends on | Keep `#root` window styling and the `::-webkit-scrollbar` baseline in the re-export body; verify with the desktop bundle. |
| `tailwind.config.js` `accent` rename breaks `bg-accent` / `border-accent` class sites | `rg` first to enumerate call sites; add a shim `bg-app-accent: hsl(var(--accent))` for explicit shadcn usage. |
| `data-density` rules fight inline `padding`/`gap` on existing views | Apply only to dense rows in `Roadmap` / `ProjectDashboard`; document opt-in via `data-density="compact"` on the row container. |
| Pilot view migration touches >400 LOC | Split per view; one PR per view; reserve a follow-up PR for the typography pass. |
| Deprecating `Ajustes.jsx` appearance block silently breaks a deep link | Keep the legacy `data-testid="ajustes-appearance-shell"` mount; render a redirect banner *inside* it. |
| `components.json` shadcn update regenerates config and overwrites `prefix` / aliases | Hand-edit only the `tailwind.css` field; verify with `npx shadcn diff` (if available) or dry-run. |

## Non-goals

- A new theme or morphology preset.
- Theming the terminal canvas (xterm palettes are out of scope; only the
  terminal *chrome* — the surrounding `TerminalWorkspacesManager` panel
  and the workspace bar — may pick up morphology tokens, and only via
  existing factories).
- Replacing `next-themes` with the in-house theme system. The
  `ThemeProvider` is *not* wired today (`docs/41_Brutalist_Stage_Session_Handoff.md:14`);
  we keep the in-house `data-theme` system.
- Removing the existing `chrome-surface.jsx` `asChild` API.
- Resolving the two pre-existing failing tests called out in
  `morphology-system-refactor/verify-report.md:47-48` — those are
  tracked separately.

## Acceptance at apply

- All four SDD artifacts (`proposal.md`, `spec.md`, `design.md`,
  `tasks.md`) plus this audit exist under
  `sdd/ui-professionalization/`.
- `docs/DESIGN.md` exists, ≤ 80 lines, links the four matrices.
- ≥3 pilot views render through `UiShell` + `UiHeader`.
- `npm test -- --testPathPattern=cssTokens|ui-tokens|themes-appearance` is
  green.
- `npx playwright test tests/e2e/05_workspace_morphology_smoke.spec.ts`
  remains green.
- A `[git:checkpoint]` DevHub MCP comment is added per task that touches
  `globals.css`, `tailwind.config.js`, or any pilot view.

## Open questions for spec

1. Should `data-density` rules affect `font-size` in addition to
   paddings/gaps? (default: paddings + gaps only — keep the typography
   scale in `ui-tokens.js`.)
2. Is the redirect banner **inline** inside the legacy appearance block
   or a **route-level redirect** from `/ajustes/appearance` to
   `/settings/appearance`? (default: inline banner; route changes are
   harder to test and ship.)
3. Does the accent collision get fixed by splitting to
   `colors.shadcn.accent` and `colors.accent-{primary,secondary}` or by
   keeping one block and adding a single shim class? (default: split —
   the two blocks already serve different concerns.)
