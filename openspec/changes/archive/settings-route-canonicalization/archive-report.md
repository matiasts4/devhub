# Archive Report — settings-route-canonicalization

**Archived by**: `ajustes-cursor-restyle` (PR-2, archive step)
**Archive date**: 2026-06-15
**Prior location**: `openspec/specs/settings-route-canonicalization/spec.md`
**New location**: `openspec/changes/archive/settings-route-canonicalization/spec.md`

## Supersession

The `settings-route-canonicalization` spec is REMOVED from the
source-of-truth tree because the routing decision it describes is
reversed by `ajustes-cursor-restyle`. The spec required
`/project/:id/ajustes` to redirect to
`/project/:id/settings/appearance` and required
`SettingsLayoutRouter` to host the canonical App-Router settings
pages. The current change restores Ajustes (`/project/:id/ajustes`)
as the canonical settings surface, removes the
`/ajustes → /settings/appearance` redirect, deletes
`SettingsLayoutRouter` and the App-Router settings pages, and
re-points `WorkspaceSidebar` and `UserProfile` back at Ajustes.

## Migration

Consumers of the prior spec migrate to:

- **`ajustes-cursor-restyle` R4 (Routing revert)** — Ajustes is
  mounted at `<Route path="ajustes" element={<Ajustes />} />`;
  `WorkspaceSidebar` and `UserProfile` point to
  `/project/${id}/ajustes`.
- **`ajustes-cursor-restyle` R5 (Dead code removal)** — the
  `SettingsLayoutRouter`, the `AppearanceSection`, the App-Router
  `settings/appearance/page.jsx`, `settings/layout.jsx`,
  `settings/account/page.jsx`, and `settings/llm-providers/page.jsx`
  are deleted (1,916 LOC across 9 files).
- **`ajustes-cursor-restyle` R6 (Default `--chrome-radius-panel: 0`)**
  — preserves the legacy square Ajustes look under the default
  morphology.

## What was deleted in this archive

- `openspec/specs/settings-route-canonicalization/spec.md` (2,392
  bytes; single R1 requirement: "Canonical settings routes, legacy
  redirect, and updated nav links")

## Audit trail

- `openspec/changes/ajustes-cursor-restyle/specs/ajustes-cursor-restyle/spec.md`
  REMOVED block (settings-route-canonicalization R1) carries the
  inline supersession note pointing at R4 + R5 of this change.
- `openspec/changes/ajustes-cursor-restyle/apply-progress.md`
  records the move as PR-2 task 7.1 with grep-gate evidence (zero
  production references to `SettingsLayoutRouter` / `AppearancePage`
  / `AppearanceSection`).
- `openspec/changes/ajustes-cursor-restyle/verify-report.md`
  marks R7 (settings-route-canonicalization archived) as
  satisfied.

## Status

REMOVED. The spec is no longer authoritative and is preserved here
as audit trail only.
