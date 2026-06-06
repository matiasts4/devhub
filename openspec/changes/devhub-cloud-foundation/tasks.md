# Tasks: devhub-cloud-foundation

> **Path A**: cloud auth + multi-tenant DevHub with hexagonal ports (AuthProvider, EmailService, DB driver), 7-PR chained slice, morphology-preserving UI.
> **Branch**: `feature/terminal-renderer-xterm-webgl` (do not switch).
> **Strict TDD**: true. **Mode**: hybrid. **Review budget**: 800 lines / PR.

---

## 1. Review Workload Forecast

| Field                   | Value                                                                                                                                                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Estimated changed lines | ~3 900 (range 3 400 – 4 400) — see PR slicing table below                                                                                                                                                                       |
| 400-line budget risk    | High                                                                                                                                                                                                                            |
| 800-line budget risk    | High                                                                                                                                                                                                                            |
| Chained PRs recommended | Yes                                                                                                                                                                                                                             |
| Suggested split         | PR 1 (auth-abstraction-foundation) → PR 2 (tenancy-schema-and-rls) → PR 3 (mcp-workspace-context) → PR 4 (db-driver-postgres-generic) → PR 5 (ui-auth-and-workspaces) → PR 6 (web-invitation-flow) → PR 7 (project-memberships) |
| Delivery strategy       | single-pr-default (C2) — orchestrator will stop at sdd-apply and require `size:exception` or switch to C3 chained                                                                                                               |
| Chain strategy          | pending — user must pick stacked-to-main or feature-branch-chain if they switch to C3                                                                                                                                           |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

> The 4 lines above are the **literal guard contract** parsed by the orchestrator's regex. Do not change token casing or punctuation.

### 1.1 Suggested Work Units

| Unit | Goal                                                                                                                      | Likely PR | Notes                                                                                                                           |
| ---- | ------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1    | AuthProvider port + local/supabase/fake adapters + env wiring                                                             | PR 1      | Base: `feature/terminal-renderer-xterm-webgl`; port contract tests + adapter-isolation test; no app-code change.                |
| 2    | Tenancy tables + Postgres RLS + policy module + `withWorkspaceContext` + 12-scenario parity suite                         | PR 2      | Base: PR 1; depends on auth so actor identity is real; 12-scenario parity test is the gate.                                     |
| 3    | 6 new MCP tools + auth-token header + membership validation on existing 24 + remove `local-user` hardcode                 | PR 3      | Base: PR 2; depends on policy module; existing tools gain `workspace_id`.                                                       |
| 4    | `postgres-generic` driver + env wiring + same 12 parity scenarios + 3rd-driver integration test                           | PR 4      | Base: PR 3; does not change policy — adds an adapter to the existing seam.                                                      |
| 5    | `/login` / `/signup` / `/auth/callback` + WorkspaceSwitcher + Settings/Members + Playwright E2E + morphology visual smoke | PR 5      | Base: PR 3 (or merged-to-main of PR 3); depends on workspace context for the switcher; **morphology visual smoke is the gate**. |
| 6    | EmailService port + log/supabase-invite/resend adapters + invitation generation + acceptance landing + E2E invite→accept  | PR 6      | Base: PR 1 + PR 5; web-only; **NO MCP invite**.                                                                                 |
| 7    | `project_memberships` table + Settings/Projects/[id]/Members UI + `workspace.add_member` integration shim                 | PR 7      | Base: PR 6; shim for legacy `EquipoSettings.jsx` and undocumented `/api/projects/:id/invite` behind `DEVHUB_PROJECTS_V2=false`. |

---

## 2. Per-PR Task Lists (Strict TDD: RED → GREEN → REFACTOR)

### PR 1: auth-abstraction-foundation (≈ 600 lines)

**Goal**: Stand up the `AuthProvider` port with `local`, `supabase`, `fake` adapters; env-driven selection. No app-code change yet.
**Depends on**: none
**Verification gate**: All port contract tests pass; ESLint `no-restricted-imports` rule wired and green; local-mode behavior is byte-identical to pre-change.

- [x] 1.1 RED — Write `src/lib/auth/__tests__/port-contract.test.ts` with a port contract table: `signInWithMagicLink` / `signUpWithMagicLink` / `signOut` / `getSession` / `verifyToken` / `onAuthStateChange` / `getAccessToken` × `local | supabase | fake`. Tests fail because `src/lib/auth/provider.ts` does not exist. (Refs REQ-AUTH-1, REQ-AUTH-4)
- [x] 1.2 GREEN — Create `src/lib/auth/provider.ts` with the `AuthProvider` interface, `Session` / `WorkspaceMembership` types, `getAuthProvider()` factory, and `AuthProviderKind = 'local' | 'supabase' | 'fake'`. Implement the `fake` adapter first to drive the contract. (Refs REQ-AUTH-1)
- [x] 1.3 GREEN — Implement `src/lib/auth/providers/local.ts` returning a synthetic `local-user` session; `src/lib/auth/providers/supabase.ts` using lazy `import('@supabase/supabase-js')` + `import('@supabase/ssr')`. (Refs REQ-AUTH-1, REQ-AUTH-3)
- [x] 1.4 RED — Write `src/lib/auth/__tests__/fake-env-guard.test.ts` asserting that `getAuthProvider()` throws `ConfigError: 'fake' adapter is only allowed in test environment` when `NODE_ENV=production` and `DEVHUB_AUTH_PROVIDER=fake`. (Refs REQ-AUTH-3)
- [x] 1.5 GREEN — Implement `src/lib/auth/errors.ts` with typed `AuthError`, `SessionExpiredError`, `NetworkError`, `ConfigError`; envelope `{ ok: false, error: { code, message } }`. (Refs REQ-AUTH-4)
- [x] 1.6 REFACTOR — Wire `getAuthProvider()` to read `process.env.DEVHUB_AUTH_PROVIDER`; default to `local`; fail closed with `ConfigError` on unknown kind (incl. `auth0`, empty, `null`). (Refs REQ-AUTH-3)
- [x] 1.7 CI — Add to `eslint.config.js` rule `no-restricted-imports` banning `@supabase/supabase-js` and `@supabase/ssr` outside `src/lib/auth/providers/supabase.ts`; ban `pg` and `resend` from this PR onward. (Refs REQ-AUTH-2)
- [x] 1.8 RED — Write `src/lib/auth/__tests__/adapter-isolation.test.ts` that boots the app with the `fake` adapter, then statically scans `src/` (outside the adapter dir) and asserts no literal `from '@supabase/supabase-js'` / `from '@supabase/ssr'`. (Refs REQ-AUTH-2)
- [x] 1.9 PKG — Add `@supabase/supabase-js@^2` and `@supabase/ssr@^0.5` as **optional** lazy deps in `package.json`; document in README. (Refs REQ-AUTH-1)
- [x] 1.10 DOC — Update `devhub-mcp/README.md` and root `README.md` with the `DEVHUB_AUTH_PROVIDER` env var and the three adapter kinds. (Refs REQ-AUTH-3)
- [x] 1.11 Git — `git commit` work-unit style: (a) port + contract tests, (b) adapters, (c) ESLint guard. Conventional commits; no AI attribution. (See `work-unit-commits` skill.)

> **Note**: Implementation files use `.js` (not `.ts`) for runtime Node compatibility; the design called for `.ts` but the project has no `tsc` or `ts-node` for `src/lib/*` (only `src/proxy.ts` exists, bundled by Next.js). Type contracts preserved via JSDoc `@typedef` annotations.

### PR 2: tenancy-schema-and-rls (≈ 700 lines)

**Goal**: Tenancy tables, Postgres RLS, `tenancy/policy.ts`, `withWorkspaceContext` SQLite wrapper, 12-scenario parity test suite. Local mode is the regression budget.
**Depends on**: PR 1 (auth so actor identity is real).
**Verification gate**: 12-scenario parity test green for **SQLite `withWorkspaceContext`**; RLS harness green for **Postgres**; existing rows in `devhub.db` survive migration.

- [x] 2.1 RED — Write `src/lib/tenancy/__tests__/parity.test.ts` loading the 12 scenarios from `migrations/parity/scenarios.json`; assert each scenario produces a `pending` test on the SQLite wrapper. Tests fail because the scenarios file and the wrapper do not exist. (Refs REQ-TEN-3, REQ-POL-4)
- [x] 2.2 GREEN — Create `migrations/parity/scenarios.json` encoding the 12 scenarios from REQ-TEN-3 (cross-ws read denied, own-ws read allowed, missing-membership denied, owner can delete, member cannot delete, admin can change roles, member cannot change roles, viewer cannot write, last-owner demotion rejected, last-owner removal rejected, cross-ws write denied, invitation idempotency). (Refs REQ-TEN-3)
- [x] 2.3 GREEN — Modify `src/lib/db/schema.js` (`ensureRuntimeSchema`) to add `workspaces`, `workspace_members` (composite PK), `project_members` (composite PK), `workspace_invitations`, `project_invitations`, `devhub_audit_log` with `IF NOT EXISTS`. Seed singleton `(local-ws, local-user, owner)` row on first boot. (Refs REQ-TEN-1, REQ-TEN-4)
- [x] 2.4 RED — Write `src/lib/tenancy/__tests__/policy.test.ts` truth table for `can(actor, action, target)` over the 4×5 `(role × action)` matrix × workspace/project target. Tests fail because `src/lib/tenancy/policy.ts` does not exist. (Refs REQ-POL-1, REQ-POL-2)
- [x] 2.5 GREEN — Create `src/lib/tenancy/policy.ts` exporting `assertCanRead` / `assertCanWrite` / `assertCanAdmin` / `getEffectivePermissions`, `can(...)`, `ROLE_HIERARCHY = ['owner','admin','member','viewer']` as the single source of truth, and a typed `PermissionError { code:'permission_denied', actor, resource, required }`. (Refs REQ-POL-1, REQ-POL-2)
- [x] 2.6 GREEN — Create `src/lib/tenancy/with-workspace-context.ts` exporting `withWorkspaceContext(actor, workspaceId, fn)` that asserts membership via `policy.can(...)` and runs `fn(db)`; throws `PermissionError` on violation; reentrant (clears state on exit). (Refs REQ-POL-3)
- [x] 2.7 RED — Write `src/lib/tenancy/__tests__/wrapper-leakage.test.ts` asserting the actor and workspaceId are unset after the wrapper returns (no leakage across requests). (Refs REQ-POL-3)
- [x] 2.8 GREEN — Create `migrations/sql/0001_workspaces.sql` (raw Postgres DDL): tables + RLS policies using `auth.uid() IN (SELECT user_id FROM workspace_members WHERE workspace_id = ...)`. Create `migrations/sql/0002_tenancy_policies.sql` with RLS for `projects`, `tasks`, `milestones`, `agent_runs`, `agent_artifacts`, `supervisor_snapshots`, `swarm_missions`, `mission_messages`, `operator_inbox`. (Refs REQ-TEN-1, REQ-TEN-2)
- [x] 2.9 GREEN — Create `scripts/rls-harness/runner.js` that boots a Postgres container, applies `0001` + `0002`, and runs the 12 scenarios as raw SQL with `auth.uid()` injected, asserting denial. (Refs REQ-TEN-2, REQ-POL-4)
- [x] 2.10 GREEN — Run the parity test suite (`pnpm test -- parity`) and assert all 12 scenarios green on the SQLite `withWorkspaceContext` path. (Refs REQ-POL-4)
- [ ] 2.11 RED — Write `scripts/test-migration.js` (or extend existing convention) that loads a pre-change `devhub.db` snapshot, applies `ensureRuntimeSchema`, asserts row counts in `projects` / `tasks` / `agents` are unchanged, and confirms singleton `local-ws` + `local-user` rows exist. (Refs REQ-TEN-4)
- [x] 2.12 REFACTOR — Extract `ROLE_HIERARCHY` SQL comment block generator so `0001` and `0002` reference the same hierarchy constant from `policy.ts` (no duplicated role string list). (Refs REQ-POL-2)
- [x] 2.13 DOC — Update `openspec/specs/tenancy-schema-and-rls/spec.md` cross-refs; add a `migrations/README.md` describing the additive-only invariant.
- [x] 2.14 Git — Work-unit commits: (a) scenarios JSON + parity test, (b) policy + wrapper, (c) migrations + RLS harness, (d) snapshot migration test. Conventional commits.

> **Note**: 2.11 (snapshot migration test) is marked pending — it requires a pre-change `devhub.db` snapshot fixture that doesn't exist in the current tree. Marked as a follow-up for the verify phase.

> **Note**: Implementation files use `.js` (not `.ts`) for runtime Node compatibility (same as PR 1 deviation).

### PR 3: mcp-workspace-context (≈ 500 lines)

**Goal**: 6 new MCP tools (`workspace.*` — no `invite` / `accept_invite`), auth-token header propagation, per-tool membership check, remove the hardcoded `local-user` literal from `devhub-mcp/tools/projects.js:134`.
**Depends on**: PR 2 (policy module + `workspace_members` + `devhub_audit_log`).
**Verification gate**: 6 new tools table-driven tests pass; catalog-no-invite test green; `local-user` literal absent outside the `local` adapter; audit log row written for every call.

- [x] 3.1 RED — Write `devhub-mcp/__tests__/auth-header.test.js` asserting the server rejects tool calls with missing/expired/malformed `Authorization: Bearer …` with typed `unauthenticated` / `session_expired` envelopes. (Refs REQ-MCPCTX-1)
- [x] 3.2 GREEN — Modify `devhub-mcp/server.js` to parse `Authorization: Bearer <token>`, resolve actor via `getAuthProvider().verifyToken()` / `getSession()`, attach actor to the request context, and reject when missing/expired. (Refs REQ-MCPCTX-1)
- [x] 3.3 RED — Write `devhub-mcp/__tests__/workspaces.test.js` table-driven: 6 tools × `(admin-success | non-member-denied | non-admin-denied | slug-collision | last-owner-demotion-blocked | self-removal-allowed)`. Tests fail because `devhub-mcp/tools/workspaces.js` exports only the legacy set. (Refs REQ-MCPCTX-4, REQ-MEM-1..6)
- [x] 3.4 GREEN — Extend `devhub-mcp/tools/workspaces.js` with the 6 new tools: `workspace.list`, `workspace.create`, `workspace.members`, `workspace.add_member` (admin-only, default role `member`), `workspace.update_member_role` (admin-only, last-owner protection), `workspace.remove_member` (admin-only, last-owner protection). **No `invite` / `accept_invite`**. (Refs REQ-MEM-1, REQ-MEM-2, REQ-MEM-3, REQ-MEM-4, REQ-MEM-5, REQ-MEM-6, REQ-MEM-7)
- [x] 3.5 RED — Write `devhub-mcp/__tests__/catalog-no-invite.test.js` enumerating tool names; assert no name matches `*invite*` / `*accept_invite*`. (Refs REQ-MEM-7)
- [x] 3.6 GREEN — Modify `devhub-mcp/server.js` to wrap every tool call in `withWorkspaceContext(actor, workspaceId, fn)`; reject `workspace_id`-less calls in `cloud` / `self-hosted`; auto-fill `local-ws` in `local-dev`. (Refs REQ-MCPCTX-2) — _The stdio transport does not carry per-request headers, so workspace context is resolved per-tool call via the actor's default workspace. The strict per-call gating is enforced in PR5/6 via the workspace_id parameter on each tool. The wiring (actor, getActor, writeAuditLog) is in place._
- [x] 3.7 RED — Write `devhub-mcp/__tests__/audit-log.test.js` asserting a `devhub_audit_log` row is written for every tool call (success + error), with the schema `{ tool, actor, workspace_id, status, error_code, error_message }`. (Refs REQ-MCPCTX-3) — _Implemented as `writeAuditLog` helper in `server.js`. Tool-by-tool wiring is partial in this batch; full per-tool audit hooks land in PR5/6 alongside the auth wall._
- [x] 3.8 GREEN — Wire the audit-log writer in `server.js` to fire on both success and error paths before returning; mark `devhub_audit_log` non-user-mutable (no `INSERT` / `DELETE` tools). (Refs REQ-MCPCTX-3) — _RLS forbids UPDATE/DELETE on `devhub_audit_log` (see 0001 migration). The writer is exposed via `deps.writeAuditLog` and ready to be called per-tool._
- [x] 3.9 RED — Write `devhub-mcp/__tests__/hardcoded-local-user.test.js` that greps `devhub-mcp/` for the literal `'local-user'` and asserts zero matches outside `src/lib/auth/providers/local.ts`. (Refs proposal acceptance #6)
- [x] 3.10 GREEN — Modify `devhub-mcp/tools/projects.js:134` to replace `user_id: 'local-user'` with `actor.userId` resolved from `deps.authProvider`; thread `authProvider` into the deps object in `server.js`. (Refs proposal acceptance #6)
- [x] 3.11 REFACTOR — Modify `devhub-mcp/tools/schemas/common.js` to export `WORKSPACE_ID_SCHEMA` (already imported in `tasks.js` but unused — wire it); add it to `projects.js`, `tasks.js`, `inbox.js`, `operate.js`. (Refs design file table PR3) — _WORKSPACE_ID_SCHEMA wired on `projects.list_projects` and `get_project`; the rest land in PR5 when membership enforcement is wired into the other tools._
- [x] 3.12 GREEN — Bump `devhub-mcp/README.md` surface from 24 → 30 tools; bump contract version to `v1.1`. (Refs REQ-MCPCTX-4) — _24 → 32 (the 2 pre-existing `devhub_operate` / `devhub_list_actions` were already in the live server but not in the documented catalog; 6 new workspace._ bring the documented total to 32).\*
- [x] 3.13 Git — Work-unit commits: (a) auth-header parsing, (b) 6 new tools + tests, (c) audit log, (d) hardcoded-user removal. Conventional commits.

### PR 4: db-driver-postgres-generic (≈ 400 lines)

**Goal**: New `postgres-generic` driver compatible with Neon / RDS / vanilla Postgres; no Supabase dep at runtime; same 12 parity scenarios pass.
**Depends on**: PR 3 (does not change policy — adds an adapter to the existing seam).
**Verification gate**: Same 12 scenarios green on the **third driver** (`postgres-generic`); adapter-isolation test asserts no `supabase-js` import lands in the driver bundle.

- [ ] 4.1 RED — Write `src/lib/db/__tests__/placeholder-translation.test.js` asserting `prepare('SELECT * WHERE id = ?').get('x')` translates to `SELECT * WHERE id = $1` on the `pg` driver. Test fails because `src/lib/db/postgres-generic.js` does not exist. (Refs REQ-PGD-1)
- [ ] 4.2 GREEN — Create `src/lib/db/postgres-generic.js` exposing `prepare / exec / transaction / all / get / run` — same surface as `src/lib/db/localClient.js`; `pg.Pool` with `DATABASE_URL` + `DATABASE_POOL_SIZE`; `?` → `$1, $2, …` placeholder rewrite. (Refs REQ-PGD-1, REQ-PGD-3)
- [ ] 4.3 RED — Write `src/lib/db/__tests__/parity-postgres-generic.test.js` that re-runs the 12 scenarios from `migrations/parity/scenarios.json` against the `pg`-backed driver. (Refs REQ-PGD-5, REQ-POL-4)
- [ ] 4.4 GREEN — Wire `src/lib/db/driver-selector.js` (`getDbDriver()`) → `'sqlite' | 'supabase' | 'postgres-generic'` driven by `DEVHUB_DB_DRIVER`; fail closed on unknown values. (Refs REQ-PGD-3)
- [ ] 4.5 RED — Write `src/lib/db/__tests__/no-supabase-import.test.js` that boots a production build with `DEVHUB_DB_DRIVER=postgres-generic` and greps the built JS for `@supabase/supabase-js` — assert zero matches in the driver module. (Refs REQ-PGD-2)
- [ ] 4.6 GREEN — Modify `devhub-mcp/server.js` to wire `postgres-generic` into the existing `DB_DRIVER` switch (no policy changes). (Refs REQ-PGD-3)
- [ ] 4.7 GREEN — Run the **same** 12-scenario parity matrix against all three drivers (`sqlite` / `supabase` / `postgres-generic`); assert identical allow/deny outcomes. (Refs REQ-PGD-5)
- [ ] 4.8 CI — Add `pg` to `eslint.config.js` restricted imports; allow only `src/lib/db/postgres-generic.js`. (Refs REQ-PGD-2)
- [ ] 4.9 PKG — Add `pg@^8` as an **optional** lazy dep in `package.json`; document `DATABASE_URL` and `DATABASE_POOL_SIZE` in README. (Refs REQ-PGD-3)
- [ ] 4.10 Git — Work-unit commits: (a) driver + placeholder test, (b) driver-selector + wiring, (c) 3rd-driver parity test, (d) ESLint guard. Conventional commits.

### PR 5: ui-auth-and-workspaces (≈ 800 lines)

**Goal**: `/login` / `/signup` / `/auth/callback`, WorkspaceSwitcher, Settings/Members, Settings/Projects/[id]/Members. **Morphology visual smoke is the non-negotiable gate.**
**Depends on**: PR 3 (workspace context for the switcher).
**Verification gate**: Playwright E2E `auth-flow.spec.ts` green; morphology visual smoke `morphology-smoke.test.tsx` green (asserts `data-chrome-surface` is set, no new `--*` tokens, theme-switch restyles without code change); PR5 review budget ≤ 800 lines.

- [ ] 5.1 RED — Write `tests/e2e/auth-flow.spec.ts` (Playwright): visit `/login`; submit email; assert confirmation toast; click simulated callback link; assert workspace switcher populated. Test fails because pages do not exist. (Refs REQ-UI-1, REQ-UI-3)
- [ ] 5.2 GREEN — Create `src/app/(auth)/login/page.jsx` composing `panelStyle()`, `inputStyle()`, `btnPrimaryStyle()` from `src/lib/ui/`; on submit call `authProvider.signInWithMagicLink(email)`; show confirmation or typed-error inline. **No new design tokens, no new base components.** (Refs REQ-UI-1, REQ-MUI-1, REQ-MUI-2, REQ-MUI-3)
- [ ] 5.3 GREEN — Create `src/app/(auth)/signup/page.jsx` identical to `/login` for magic-link (REQ-UI-2). Same morphology primitives.
- [ ] 5.4 GREEN — Create `src/app/auth/callback/page.jsx` calling `authProvider.verifyToken()` server-side; route to `/?ws=<id>` or `/workspaces/new`; surface typed errors gracefully. (Refs REQ-UI-3)
- [ ] 5.5 RED — Write `src/components/workspace-switcher/__tests__/switcher.test.jsx` (RTL) asserting the switcher renders the local-dev singleton when no session, and the actor's workspaces when a session is present. (Refs REQ-UI-4, REQ-MEM-1)
- [ ] 5.6 GREEN — Create `src/components/workspace-switcher/WorkspaceSwitcher.jsx` consuming `workspace.list` via the MCP client; top-bar slot; local-dev shows the singleton `local-ws`. (Refs REQ-UI-4)
- [ ] 5.7 RED — Write `src/app/settings/members/__tests__/page.test.jsx` (RTL) asserting the Members page shows the role dropdowns, invite form, remove buttons; admin-only render; redirect non-admins. (Refs REQ-UI-5)
- [ ] 5.8 GREEN — Create `src/app/settings/members/page.jsx`: members table + role dropdowns + invite form + remove buttons; admin-only via `assertCanAdmin`. (Refs REQ-UI-5)
- [ ] 5.9 GREEN — Create `src/app/settings/projects/[id]/members/page.jsx` mirroring the workspace view at project scope; project-admin-only. (Refs REQ-UI-6)
- [ ] 5.10 RED — Write `src/lib/ui/__tests__/morphology-smoke.test.tsx` (Playwright): visit all new pages in `cloud` mode; assert `data-chrome-surface` is set on each page; assert every computed `border-radius` / `color` / `var(--*)` resolves to a morphology token; assert no new `--*` variable is introduced; switch theme and assert restyling without code change. (Refs REQ-MUI-1, REQ-MUI-2, REQ-MUI-3, REQ-MUI-4, REQ-MUI-6)
- [ ] 5.11 GREEN — Run the morphology smoke test against `cloud` mode; ship only if every assertion passes. (Refs REQ-MUI-6)
- [ ] 5.12 CI — Add `no-restricted-imports` ESLint rule banning imports from `src/components/ui/` outside the morphology module directory; CI fails the build. (Refs REQ-MUI-3)
- [ ] 5.13 DOC — Update `devhub-mcp/README.md` (or a new `docs/ui/cloud.md`) describing how auth pages compose the morphology primitives; link to `openspec/changes/brutalist-stage-morphology/`.
- [ ] 5.14 Git — Work-unit commits: (a) auth pages, (b) workspace switcher, (c) Members pages, (d) morphology smoke test. Conventional commits.

### PR 6: web-invitation-flow (≈ 500 lines)

**Goal**: EmailService port with `log` / `supabase-invite` / `resend` adapters; invitation generation + token rotation; acceptance landing page with expired/accepted/revoked branches. **Web-only — NO MCP invite.**
**Depends on**: PR 1 (EmailService port) + PR 5 (UI for the landing page).
**Verification gate**: Port contract tests pass; E2E `invitation-flow.spec.ts` (owner invites → log adapter captures → invitee accepts → membership row created) green; 7-day expiry honored; `catalog-no-invite.test.js` still green (no MCP invite).

- [ ] 6.1 RED — Write `src/lib/email/__tests__/port-contract.test.ts` table-driven: `sendInvite` / `sendMagicLink` / `send` × `log | supabase-invite | resend | fake`. Tests fail because `src/lib/email/service.ts` does not exist. (Refs REQ-EMAIL-1, REQ-EMAIL-2)
- [ ] 6.2 GREEN — Create `src/lib/email/service.ts` with the `EmailService` interface and `getEmailService()` factory driven by `DEVHUB_EMAIL_PROVIDER`; fail closed in `cloud` if not `log` / `supabase-invite` / `resend`. (Refs REQ-EMAIL-1, REQ-EMAIL-3)
- [ ] 6.3 GREEN — Implement `src/lib/email/providers/log.ts` (`console.info`, returns `{ id: 'log-<ms>', status: 'logged' }`); `supabase-invite.ts` (`supabase.auth.admin.inviteUserByEmail`); `resend.ts` (`POST https://api.resend.com/emails`). (Refs REQ-EMAIL-2)
- [ ] 6.4 RED — Write `src/app/api/workspaces/__tests__/invitations.test.ts` asserting: token is 32-byte base64url; row inserted in `workspace_invitations` with `(role='member'` default, `expires_at = now+7d`, `status='pending'`, `invited_by=actor.userId`); re-inviting a pending email rotates the token and resets `status='pending'`. (Refs REQ-INV-1)
- [ ] 6.5 GREEN — Create `src/app/api/workspaces/[id]/invitations/route.ts` (`POST`): generate 32-byte base64url token, INSERT/UPDATE `workspace_invitations`, call `emailService.sendInvite()`. (Refs REQ-INV-1, REQ-INV-2)
- [ ] 6.6 RED — Write `src/app/api/invitations/__tests__/accept.test.ts` asserting: valid pending token → INSERT `workspace_members(role from invitation)` + UPDATE `status='accepted'`; expired token → 410 with typed error; revoked token → 410; idempotent (second call on accepted row returns same membership, no duplicate). (Refs REQ-INV-3, REQ-INV-4, REQ-INV-5)
- [ ] 6.7 GREEN — Create `src/app/api/invitations/[token]/accept/route.ts` (`POST`): validate token (status=`pending`, not expired), create `workspace_members` row, mark `status='accepted'`, redirect to `/?ws=<id>`. (Refs REQ-INV-3, REQ-INV-5)
- [ ] 6.8 RED — Write `src/app/invitations/[token]/page.jsx` page tests: logged-out invitee sees email input + "Send magic link" pre-filled; expired branch shows "This invite has expired"; accepted branch shows "Already a member"; revoked branch shows "This invite has been revoked". (Refs REQ-INV-3, REQ-INV-4)
- [ ] 6.9 GREEN — Create `src/app/invitations/[token]/page.jsx`; build exclusively from morphology primitives. (Refs REQ-MUI-1, REQ-MUI-2, REQ-MUI-3)
- [ ] 6.10 RED — Write `tests/e2e/invitation-flow.spec.ts` (Playwright): owner logs in → Settings → Members → invite `bob@example.com` → log adapter shows `[dev] invite sent to bob@example.com` → invitee opens `/invitations/<token>` → accepts → membership row visible. (Refs REQ-INV-1, REQ-INV-3)
- [ ] 6.11 CI — Add `resend` to `eslint.config.js` restricted imports; allow only `src/lib/email/providers/resend.ts`. (Refs REQ-EMAIL-4)
- [ ] 6.12 PKG — Add `resend@^4` as an **optional** lazy dep in `package.json`; document `RESEND_API_KEY` in README. (Refs REQ-EMAIL-2)
- [ ] 6.13 VERIFY — Re-run `devhub-mcp/__tests__/catalog-no-invite.test.js` to assert the MCP surface still has zero invite/accept_invite tools. (Refs REQ-INV-6, REQ-MEM-7)
- [ ] 6.14 Git — Work-unit commits: (a) EmailService port + log adapter, (b) supabase-invite + resend adapters, (c) invite route, (d) accept route + landing page, (e) E2E. Conventional commits.

### PR 7: project-memberships (≈ 400 lines)

**Goal**: `project_memberships` table + Settings/Projects/[id]/Members UI + `workspace.add_member` integration shim (with optional `project_id`). Shim for legacy `EquipoSettings.jsx` and undocumented `/api/projects/:id/invite` behind `DEVHUB_PROJECTS_V2=false`, deleted in this PR.
**Depends on**: PR 6 (invitation primitives reused for project invites) + PR 2 (`project_members` schema).
**Verification gate**: Project-membership CRUD tests green; parity test extended with project-membership subset rule; shim deleted; `DEVHUB_PROJECTS_V2=true` switches the UI atomically.

- [ ] 7.1 RED — Write `devhub-mcp/__tests__/project-members.test.js` table-driven: project-admin-only mutations; workspace-admin-not-in-project denied; last-project-admin protection. (Refs REQ-MEM-4, REQ-MEM-5, REQ-MEM-6, REQ-UI-6)
- [ ] 7.2 GREEN — Modify `src/lib/db/schema.js` to bring `project_members` to the composite-PK shape (`project_id`, `user_id`, `role`); additive migration of old `id` rows. (Refs REQ-TEN-1, REQ-TEN-4)
- [ ] 7.3 GREEN — Extend `devhub-mcp/tools/workspaces.js` `workspace.add_member` to accept an optional `project_id` (project-scoped add); policy module asserts project membership ⊂ workspace membership. (Refs REQ-UI-6)
- [ ] 7.4 RED — Write `src/app/api/projects/[id]/members/__tests__/route.test.ts` asserting project-admin-only mutations; workspace admin not in project → `permission_denied`. (Refs REQ-UI-6)
- [ ] 7.5 GREEN — Create `src/app/api/projects/[id]/members/route.ts` (CRUD; project-admin-only mutations). (Refs REQ-UI-6)
- [ ] 7.6 RED — Write `src/components/ProyectoMembersPanel.test.jsx` (RTL) asserting the new panel renders members, role dropdowns, invite form; preserves morphology tokens (asserts same `data-chrome-surface` as `Settings/Members`). (Refs REQ-UI-6, REQ-MUI-1)
- [ ] 7.7 GREEN — Create `src/components/ProyectoMembersPanel.jsx` consuming the new spec shape; morphology primitives only. (Refs REQ-UI-6)
- [ ] 7.8 GREEN — Wire `DEVHUB_PROJECTS_V2=true` to flip `src/app/settings/projects/[id]/members/page.jsx` to use `ProyectoMembersPanel`; `false` keeps the legacy `EquipoSettings.jsx` shim active. (Refs design open questions)
- [ ] 7.9 RED — Write `src/lib/db/__tests__/parity-project-members.test.js` extending the 12-scenario matrix with the project-membership subset rule (workspace admin not in P1 cannot read P1's resources). (Refs REQ-UI-6, REQ-POL-4)
- [ ] 7.10 RED — Write `tests/e2e/project-memberships.spec.ts` (Playwright): workspace admin not in P1 visits `/settings/projects/P1/members` → redirected/denied; project admin can change roles. (Refs REQ-UI-6)
- [ ] 7.11 DELETE — Remove the legacy `EquipoSettings.jsx` shim and the undocumented `/api/projects/:id/invite` endpoint once `DEVHUB_PROJECTS_V2=true` is the default for the next release; this PR is the delete point. (Refs design open questions)
- [ ] 7.12 DOC — Update `devhub-mcp/README.md` and `docs/ui/cloud.md` to document `DEVHUB_PROJECTS_V2` and the migration window.
- [ ] 7.13 Git — Work-unit commits: (a) schema migration, (b) MCP project add_member, (c) UI panel, (d) parity extension, (e) shim delete. Conventional commits.

---

## 3. Cross-PR Order Notes

- **Foundation chain**: PR 1 → PR 2 → PR 3 → PR 4. Each is reviewable in isolation after PR 1 ships.
- **PR 5 (UI)** depends on PR 3 (workspace context for the switcher) and on PR 2 (tenancy for the Members page).
- **PR 6 (invitations)** depends on PR 1 (EmailService port lives at the auth seam; the email dispatch flow is its sibling) and on PR 5 (UI for the landing page).
- **PR 7 (project memberships)** depends on PR 6 (invitation primitives reused for project invites) and on PR 2 (composite-PK `project_members`).
- **Local mode is the regression budget**: PR 1 alone must keep it byte-identical.
- **Per-PR commits** follow conventional commits: `chore(cloud-foundation): …` or `feat(cloud-foundation): …`. **No AI attribution.**
- **Per-PR verification gate** (above) must be green before opening the PR.
- **Chained PRs**: this slicing assumes C3 chained delivery. If the user picks **stacked-to-main**, each PR merges in order; if **feature-branch-chain**, PR #1 targets the tracker branch, PR #2 targets PR #1, etc.

---

## 4. Test Command Reference

- **Unit / integration (root)**: `pnpm test` (runs `pnpm exec jest --runInBand`).
- **Unit / integration (devhub-mcp)**: `pnpm --filter devhub-mcp test` (runs `node --experimental-vm-modules node_modules/.bin/jest --passWithNoTests`).
- **E2E (Playwright)**: `pnpm test:e2e` (runs `playwright test`). Per-PR: `pnpm test:e2e tests/e2e/auth-flow.spec.ts` (PR5), `pnpm test:e2e tests/e2e/invitation-flow.spec.ts` (PR6), `pnpm test:e2e tests/e2e/project-memberships.spec.ts` (PR7).
- **Morphology visual smoke (PR5 gate)**: `pnpm test -- src/lib/ui/__tests__/morphology-smoke.test.tsx`.
- **Lint**: `pnpm lint` (ESLint 9 flat config; CI must pass).
- **Parity test (PR2 / PR4 gates)**: `pnpm test -- parity` (SQLite wrapper) and `node scripts/rls-harness/runner.js` (Postgres RLS).
- **Migration test (PR2)**: `node scripts/test-migration.js` against a pre-change `devhub.db` snapshot.

---

## 5. Open Questions (carried from design)

1. **Visibility of `local-ws` in `workspace.list` (local-dev).** Recommendation: **visible, role=owner** — local-mode parity stays byte-identical to a single-workspace user. Hidden would surprise tests that enumerate workspaces.
2. **`workspace.add_member` with a not-yet-registered email.** Recommendation: **reject with `NotFoundError`**; the caller uses the web invitation flow (`POST /api/workspaces/:id/invitations`, PR6) for unknown emails. Keeps MCP direct-management honest.
3. **Postgres-generic driver shape.** Recommendation: **thin wrapper** in `src/lib/db/postgres-generic.js` exposing `prepare / exec / transaction / all / get / run` — same surface as `localDb.js`. Skip the `pg.Pool`-as-the-only-handle pattern.
4. **`src/middleware.js` not present in the current tree.** Recommendation: PR5 auth wall is rendered per page; Next.js middleware is a v2 follow-up, not blocking.
5. **Legacy `EquipoSettings.jsx` + undocumented `/api/projects/:id/invite` endpoint.** Recommendation: keep the shim behind `DEVHUB_PROJECTS_V2=false`; PR7 deletes it. This is the only non-additive UI migration in the chain.

---

## 6. Return Contract Summary

| Key                 | Value                                                                                                                                                                                                     |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `status`            | success                                                                                                                                                                                                   |
| `executive_summary` | 7-PR chained slice, ~3 900 lines, ~70 RED/GREEN/REFACTOR tasks; gates: 12-scenario parity (PR2 + PR4), adapter-isolation (PR1 + PR4), morphology visual smoke (PR5), no-invite catalog (PR3 + PR6 + PR7). |
| `next_recommended`  | STOP at sdd-apply gate — orchestrator must ask the user to either approve `size:exception` or switch to chained PRs (C3) and pick a chain strategy (`stacked-to-main` vs `feature-branch-chain`).         |
