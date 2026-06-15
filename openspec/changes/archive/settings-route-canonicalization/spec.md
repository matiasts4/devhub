# Spec: settings-route-canonicalization

> **Source of truth**: promoted from `openspec/changes/cursor-morphology/specs/cursor-morphology/spec.md` (R6) on 2026-06-14 (archive of `cursor-morphology`).
> **Status**: active. Owned by DevHub settings team.
> **Origin**: `cursor-morphology` Slice B.

## Purpose

Make the canonical settings pages under `src/app/settings/` reachable through the runtime `HashRouter`, redirect the legacy `/project/:projectId/ajustes` route to the canonical appearance page, and update `WorkspaceSidebar` and `UserProfile` navigation links so the app no longer points users at two conflicting settings surfaces.

## Requirements

### Requirement: Canonical settings routes, legacy redirect, and updated nav links

The system MUST mount `/project/:projectId/settings/appearance`, `/project/:projectId/settings/llm-providers`, and `/project/:projectId/settings/account` under `HashRouter` via a `react-router-dom`-compatible settings layout wrapper (`SettingsLayoutRouter`). The system MUST redirect `/project/:projectId/ajustes` to `/project/:projectId/settings/appearance`. `WorkspaceSidebar`'s `Ajustes` link MUST point to the canonical settings route and MUST be active for any `/settings` sub-route. `UserProfile`'s account settings navigation MUST navigate to `/project/:projectId/settings/account`.

**Files**: `src/App.js`, `src/components/settings/SettingsLayoutRouter.jsx`, `src/components/WorkspaceSidebar.jsx`, `src/components/UserProfile.jsx`

#### Scenario: Canonical settings routes are reachable

- GIVEN a workspace is open
- WHEN the user navigates to `/project/:id/settings/appearance`
- THEN the canonical appearance settings page renders

#### Scenario: Legacy /ajustes redirects to canonical settings

- GIVEN a workspace is open
- WHEN the user navigates to `/project/:id/ajustes`
- THEN the location becomes `/project/:id/settings/appearance`

#### Scenario: Sidebar Ajustes link is canonical and stays active on /settings sub-routes

- GIVEN the sidebar is rendered for an open workspace
- WHEN the user is on any `/project/:id/settings/*` page
- THEN the sidebar `Ajustes` link is highlighted as active

#### Scenario: Profile account link points to canonical account settings

- GIVEN the user profile is rendered for an open workspace
- WHEN the user clicks `Ajustes de Cuenta`
- THEN the location becomes `/project/:id/settings/account`
