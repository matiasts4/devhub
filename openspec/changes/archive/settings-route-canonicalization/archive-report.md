# Archive Report — settings-route-canonicalization

**Superseded by**: `ajustes-cursor-restyle` (PR-2, 2026-06-15)
**Reason**: PR-2 reverts the canonical-routing decision. The App-Router
`/project/:id/settings/*` block, `SettingsLayoutRouter`, and the
`/ajustes → /settings/appearance` redirect are all removed. Ajustes
is restored as the canonical settings surface at
`/project/:id/ajustes`. `WorkspaceSidebar` and `UserProfile` are
flipped back to `/ajustes`.

**Migration**: see R4 (routing revert) and R5 (dead code removal) in
`openspec/changes/ajustes-cursor-restyle/specs/ajustes-cursor-restyle/spec.md`.

**R1 superseded by**: `ajustes-cursor-restyle` R4 (route revert) +
R5 (dead-code removal) + R6 amendment (default morphology radius)
+ R7 (this archive).

**Files removed in PR-2** (1,916 LOC):
- `src/app/settings/appearance/page.jsx` (1106 LOC)
- `src/app/settings/appearance/__tests__/page.test.jsx`
- `src/components/settings/SettingsLayoutRouter.jsx` (210 LOC)
- `src/components/settings/__tests__/SettingsLayoutRouter.test.jsx`
- `src/components/settings/AppearanceSection.jsx` (372 LOC)
- `src/app/settings/layout.jsx` (203 LOC)
- `src/app/settings/account/page.jsx` (18 LOC)
- `src/app/settings/account/__tests__/page.test.jsx`
- `src/app/settings/llm-providers/page.jsx` (7 LOC)

**R1 (canonical settings routes) is now REMOVED** per
`ajustes-cursor-restyle` R5.
