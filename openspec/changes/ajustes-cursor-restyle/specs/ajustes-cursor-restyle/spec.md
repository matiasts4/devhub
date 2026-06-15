# Spec: ajustes-cursor-restyle

> **Consolidated delta** per the dispatcher convention
> `openspec/changes/<name>/specs/<name>/spec.md`. Contains the full
> MODIFIED/ADDED/REMOVED blocks inline so `sdd-archive` can apply
> each delta to its target canonical spec without loss. If a future
> change wants per-domain split, mirror the inline blocks into
> `openspec/changes/ajustes-cursor-restyle/specs/{morphology-system,terminal-renderer-default,settings-route-canonicalization}/spec.md`.

## Purpose

Make legacy `Ajustes` (`/project/:id/ajustes`, 7 working tabs) consume
the active `[data-morphology]` token layer via `chromeSurfaceStyle`
and `morphology.js` factories; port the six terminal sub-controls
(renderer, typography, header style, accent bar, restore policies,
zoom) from the deprecated new page into the Apariencia tab; remove
the App-Router page, `SettingsLayoutRouter`, and the canonical
settings redirect. The default morphology block MUST set
`--chrome-radius-panel: 0` so Ajustes renders square under default and
rounded under `cursor`/`switchyard`/`aura`. No backend, IPC, or schema
changes.

## Modified Specs

| Canonical spec | Req | Change |
|---|---|---|
| `morphology-system` | R5 | Extend chrome-token coverage to Ajustes (7 tabs) |
| `morphology-system` | R6 | Relax: default MAY set `--chrome-radius-panel: 0` |
| `terminal-renderer-default` | TRD-4 | Location moves to Ajustes Apariencia |
| `settings-route-canonicalization` | R1 | REMOVED — superseded |

## New Specs

| Canonical spec | New req | Content |
|---|---|---|
| `terminal-renderer-default` | TRD-5 | Apariencia persists typography, header style, accent bar, restore policies, zoom |

## Requirements

### R1 — Apariencia renders morphology-aware chrome

Apariencia chrome (panel radius, control radius, shadow, border) MUST
resolve from `--chrome-*` variables or `morphology.js` factories.

- **GIVEN** `data-morphology='cursor'` is active
- **WHEN** Apariencia panel and tab-nav render
- **THEN** panel `border-radius` is `18px` and control is `8px`
- **AND** panel `box-shadow` resolves to `var(--chrome-shadow-panel)`

### R2 — No hardcoded brutalist overrides in Ajustes

`Ajustes.jsx` MUST NOT contain `borderRadius: 0` on chrome surfaces
or `'4px 4px 0 0 var(--border-strong)'` shadows. The three helpers
`getSettingsShellStyle`, `getSettingsControlStyle`,
`getSettingsAccentOptionStyle` MUST be deleted; their call sites MUST
use `chromeSurfaceStyle()` / `panelStyle()` / `pillStyle()` /
`btnPrimaryStyle()` directly.

- **GIVEN** `Ajustes.jsx` source is read
- **WHEN** scanning for chrome overrides
- **THEN** no line matches `borderRadius: 0` on a chrome surface
- **AND** the three helpers are not exported

### R3 — Terminal sub-controls port + persist

Apariencia MUST expose and persist all six terminal sub-controls via
their existing helpers: renderer mode (`terminalRendererPreferences`),
typography (`terminalTypographyPreferences`), header style
(`themes.js` `TERMINAL_HEADER_STYLES`), accent bar toggle
(`setStoredTerminalAccentBarVisible`), restore policies
(`restorePreferences`), and zoom (`setZoom`/`getStoredZoom`).

- **GIVEN** the user changes the renderer to `xterm`
- **WHEN** the page reloads
- **THEN** `readTerminalRendererDefaultModeSetting()` returns `'xterm'`
- **AND** the select shows `xterm` as the active option

### R4 — Routing revert

`WorkspaceSidebar` Ajustes link and `UserProfile` account nav MUST
both point to `/project/:id/ajustes`. The App-Router `settings/*`
route block MUST be removed; the `ajustes → ../settings/appearance`
redirect MUST be replaced with `<Route path="ajustes" element={<Ajustes />} />`.

- **GIVEN** the sidebar is rendered
- **WHEN** the user clicks the Ajustes link
- **THEN** the location becomes `/project/:id/ajustes`
- **AND** visiting `/project/:id/settings/appearance` does not match any route

### R5 — Dead code removal, zero remaining consumers

The following files MUST be deleted with no remaining imports or
references: `src/app/settings/appearance/page.jsx` (1106 LOC) and its
test, `src/components/settings/SettingsLayoutRouter.jsx` (210 LOC) and
its test, `src/components/settings/AppearanceSection.jsx` (372 LOC),
`src/app/settings/layout.jsx`, `src/app/settings/account/page.jsx` and
its test, `src/app/settings/llm-providers/page.jsx`.

- **GIVEN** the dead code is removed
- **WHEN** `pnpm test` and `grep -r "SettingsLayoutRouter\|AppearancePage\|AppearanceSection" src/` run
- **THEN** no test fails and no source file references removed symbols

### R6 amendment — Default morphology `--chrome-radius-panel: 0`

Default morphology MUST set `--chrome-radius-panel: 0` in
`globals.css` to preserve the legacy Ajustes look. All other
default-morphology tokens remain locked to their pre-`cursor` values.
morphology-system R6 no-regression invariant is relaxed for this
specific token only.

- **GIVEN** `data-morphology='default'` is active
- **WHEN** the browser resolves `--chrome-radius-panel`
- **THEN** it equals `0`
- **AND** cursor/switchyard/aura/brutalist-stage blocks remain unchanged

### R7 — settings-route-canonicalization archived

`openspec/specs/settings-route-canonicalization/spec.md` MUST be
archived on the PR that removes the App-Router route block. Reason:
the routing it describes is reversed by this change. Migration: R4
above + Ajustes restoration as canonical surface.

- **GIVEN** PR-2 lands
- **WHEN** `sdd-archive` runs
- **THEN** the spec is no longer in the source-of-truth tree
- **AND** the archive report records the supersession

### R8 — All five morphologies render Ajustes correctly

Switching across `default`, `brutalist-stage`, `aura`, `switchyard`,
`cursor` MUST visibly change Ajustes geometry for all 7 tabs and the
Apariencia panel. Cursor/switchyard token values introduced by
upstream changes remain unchanged.

- **GIVEN** the user activates each of the five morphologies in turn
- **WHEN** Apariencia renders
- **THEN** `--chrome-radius-panel` resolves to: default 0, brutalist-stage 0, aura 1rem, switchyard 18px, cursor 18px
- **AND** no chrome surface renders with a hardcoded `0` override

## MODIFIED — morphology-system R5 (full block, post-archive replacement)

### Requirement: Shared primitives consume chrome tokens or morphology factories

Card, Input, Switch, Dialog, Select, Button, AND the Ajustes settings
page (`src/views/Ajustes.jsx`, all 7 tabs) MUST derive chrome
geometry (border radius, border width, shadow) from `--chrome-*` CSS
variables or from `src/chrome/morphology.js` factory functions. The
Ajustes page MUST NOT ship `borderRadius: 0` overrides or
`4px 4px 0 0 var(--border-strong)` shadows on chrome surfaces.

> **Partial coverage note (2026-06-15)**: Ajustes now consumes chrome
> tokens directly. `Button` consumes via `morphology.js` factories.
> `Card` and `Input` (shadcn primitives) still use Tailwind
> `rounded-xl`/`rounded-md`. Pre-existing gap, tracked separately.

#### Scenario: Radius follows morphology on shared primitives

- **GIVEN** `data-morphology='cursor'` is active
- **WHEN** Card and Button render
- **THEN** Card radius resolves from `--chrome-radius-panel`
- **AND** Button radius resolves from `--chrome-radius-control`

#### Scenario: Ajustes Apariencia honors cursor chrome

- **GIVEN** `data-morphology='cursor'` is active
- **WHEN** Apariencia panel renders
- **THEN** `--chrome-radius-panel` is `18px`
- **AND** Apariencia's computed `border-radius` is `18px`

(Previously: Ajustes rendered with hardcoded `borderRadius: 0` and
`4px 4px 0 0` shadow regardless of active morphology.)

## MODIFIED — morphology-system R6 (full block, post-archive replacement)

### Requirement: All existing morphologies unchanged (default-radius exception)

The system MUST NOT modify any token for Brutalist Stage, Aura,
Switchyard, or Cursor blocks. Default MUST NOT modify any token
EXCEPT `--chrome-radius-panel`, which it MAY set to `0` to preserve
the legacy Ajustes look under default.

#### Scenario: Brutalist Stage radius unchanged

- **GIVEN** Brutalist Stage is active
- **WHEN** the test runs
- **THEN** `--chrome-radius-panel` is `0`
- **AND** `--chrome-shadow-panel` is `4px 4px 0 0 var(--border-strong)`

#### Scenario: Default radius is 0 by design

- **GIVEN** Default is active
- **WHEN** the browser resolves `--chrome-radius-panel`
- **THEN** it equals `0`
- **AND** all other default-morphology tokens remain at pre-`cursor` values

#### Scenario: Switchyard radius and accent unchanged

- **GIVEN** Switchyard (Mineral palette) is active
- **WHEN** the user selects Switchyard
- **THEN** `--chrome-radius-panel` is `18px`
- **AND** `--accent-primary` is `#63d0c2`

(Previously: default `--chrome-radius-panel` was locked to `1rem`.)

## MODIFIED — terminal-renderer-default TRD-4 (full block, post-archive replacement)

### Requirement: TRD-4 — Settings UI Surfaces the New Default (Ajustes Apariencia)

The system MUST surface `xterm-webgl` as the pre-selected option in
**Ajustes → Apariencia → Terminal renderer**
(`src/views/Ajustes.jsx` Apariencia tab), and MUST update the subtitle
copy to reference the WebGL renderer. `vte-experimental` and `xterm`
MUST remain selectable. Previous location at
`src/app/settings/appearance/page.jsx` is REMOVED.

#### Scenario: TRD-S8 — Apariencia pre-selects the new default

- **GIVEN** the user opens Ajustes → Apariencia
- **WHEN** the renderer selector renders
- **THEN** `'xterm-webgl'` is pre-selected
- **AND** `'vte-experimental'` and `'xterm'` remain available

(Previously: the selector lived on `src/app/settings/appearance/page.jsx`.)

## ADDED — terminal-renderer-default TRD-5

### Requirement: TRD-5 — Terminal Sub-Controls in Apariencia

Apariencia MUST expose and persist: typography, terminal header style,
accent bar visibility, restore policies (opencode/generic/swarm), and
zoom. Renderer mode is covered by TRD-4.

#### Scenario: All six sub-controls render and persist

- **GIVEN** the user toggles the accent bar off
- **WHEN** the page reloads
- **THEN** `getStoredTerminalAccentBarVisible()` returns `false`
- **AND** typography, header style, restore policy, zoom, and renderer controls are all present

## REMOVED — settings-route-canonicalization R1

### Requirement: Canonical settings routes, legacy redirect, and updated nav links

(Reason: this change reverses the canonical-routing decision. The
App-Router settings page, `SettingsLayoutRouter`, and the
`/ajustes → /settings/appearance` redirect are all removed; Ajustes is
restored as the canonical surface at `/project/:id/ajustes`.)

(Migration: see R4 and R5 in
`openspec/changes/ajustes-cursor-restyle/specs/ajustes-cursor-restyle/spec.md`.)

## Out of Scope

- No new backend endpoints, IPC contracts, or schema migrations.
- No new settings categories beyond the terminal port.
- No migration to a `/settings/*` URL space; `/project/:id/ajustes` stays canonical.
- No new morphology; the five existing morphologies are unchanged in token value (default radius relaxation is the only exception, R6 amendment).
- Card/Input shadcn primitive gap in `morphology-system` partial-coverage note is pre-existing, tracked separately.
- `devhub-morphology` skill update (Ajustes as single wiring point) is a documentation change, not a spec change.
