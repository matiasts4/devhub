# MIGRATION: devhub-cloud-foundation (Path A — full multi-tenant)

**Goal**: Activate the complete foundation built in the SDD cycle so that DevHub becomes a real multi-tenant system (workspaces, memberships, invitations, policy enforcement, swappable auth/email/db) with minimal ongoing intervention from you.

You already have Supabase connected for the old MCP path. We are now wiring the **new** hexagonal ports, tenancy, workspace context, 6 dedicated MCP tools, and web flow on top of (or replacing) that connection.

## Prerequisites (you already have most)

- Existing Supabase project + keys (the one you use for the current MCP).
- Repo on branch `feature/terminal-renderer-xterm-webgl` (stay here).
- The cloud-foundation code is already in the tree (auth ports, email service, postgres-generic driver, policy + withWorkspaceContext, 6 workspace tools, UI pages using only morphology primitives, migrations 0001/0002, tests, etc.).
- Node, pnpm/npm, etc. as usual.

## Step-by-step (do this once — then it stays on)

1. **Create your local env from the safe example**

   ```bash
   cp .env.example .env.local
   ```

   Open `.env.local` and fill:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or better `SUPABASE_SERVICE_ROLE_KEY` for MCP/server)
   - Leave the `DEVHUB_OPERATION_MODE`, `DEVHUB_AUTH_PROVIDER`, `DEVHUB_DB_DRIVER` as set in the example (cloud + supabase).

   **Important**: Never commit real keys. `.env.local` is already in `.gitignore`.

2. **Restart everything**
   - Stop any running `npm run dev`
   - Stop the MCP server
   - `npm run dev` (web)
   - In another terminal: `node devhub-mcp/server.js` (or `cd devhub-mcp && npm start`)

3. **Verify the new system is active**
   - In the MCP server output you should see logs like the postgres-generic one but for supabase/auth.
   - Open http://localhost:3000/login and /signup — magic link flow.
   - In your MCP client (OpenCode etc.) you should now see the 6 new tools:
     - `workspace.list`
     - `workspace.create`
     - `workspace.members`
     - `workspace.add_member`
     - `workspace.update_member_role`
     - `workspace.remove_member`
   - No `*invite*` tools appear on the MCP surface (by design — invitations are web-only).

4. **Seed your first workspace (from your current data)**
   - After first login with your owner email (`NEXT_PUBLIC_OWNER_EMAIL`), the system will treat you as owner.
   - Use the web UI (Settings → Members or the new WorkspaceSwitcher) or call the MCP tools directly.
   - Existing projects/tasks can be associated to a workspace via `workspace_id` (the migrations added the column + RLS policies).
   - A one-time migration script or manual `UPDATE projects SET workspace_id = 'your-ws-id'` will be needed for old rows (we can run this together after the first workspace is created).

5. **Test the core contracts (you can run these anytime)**

   ```bash
   # Adapter isolation (no stray supabase/resend/pg imports outside providers)
   pnpm test -- adapter-isolation

   # No more hardcoded 'local-user' literals in devhub-mcp source
   pnpm test -- hardcoded-local-user

   # Catalog guard: only the 6 workspace tools, zero invite tools on MCP
   pnpm test -- catalog-no-invite

   # Workspace tools contract (harness)
   pnpm test -- workspaces
   ```

## What the new system actually gives you now

- Hexagonal AuthProvider (local + supabase adapters, lazy loaded — swappable later).
- EmailService port (log for dev, supabase-invite, resend).
- Tenancy tables + policy module (`can` / `assertCan`) + `withWorkspaceContext` wrapper (SQLite parity) + full RLS policies (Postgres).
- 6 new MCP workspace tools with per-call membership validation and audit.
- Web-only invitation flow (7-day tokens, magic-link style, accept landing) — completely separate from MCP.
- WorkspaceSwitcher + Members UIs built 100% on existing morphology (panelStyle, inputStyle, btnPrimaryStyle, data-chrome-surface — no new tokens or base components).
- 3 operation modes (local-dev / self-hosted / cloud) with env derivation.
- Strict TDD evidence, adapter isolation tests, catalog-no-invite guard, morphology smoke test (source-level hard gate).
- All old tools continue to work; new context is applied gradually.

## Current limitations / things we will improve next (documented in verify + archive)

- ESLint `no-restricted-imports` for vendors and ui/ are still comments + test/grep enforcement (not a real flat-config rule yet). We can promote them in the next pass.
- morphology-smoke.test.tsx is Playwright but Jest can't parse .tsx in current runner — gate is correct in source.
- Full live 3-driver parity + real RLS harness + complete E2E auth/invite/project flows require a clean Postgres (DATABASE_URL) + fixed better-sqlite3 bindings in this env. Structure + unit parity + isolation tests pass today.
- Some per-tool audit logging and advanced hooks were partial at apply time.
- Legacy `DEVHUB_PROJECTS_V2=false` shim + old EquipoSettings + undocumented `/api/projects/:id/invite` kept for one release (delete note in the PR7 tasks).
- No real Next.js middleware auth wall yet (per-page guards in PR5; middleware is v2 follow-up).
- Pre-existing: 4 supervisor tests failing + high baseline lint (not worsened by this change).

## Rollback (instant)

Just remove or comment the three `DEVHUB_*` lines in `.env.local` (or set them back to local-dev/sqlite). MCP and app revert to the exact pre-foundation behavior. No data is mutated by the mode flag itself.

## After this migration lands

- Real team/parallel work: multiple users, multiple workspaces, project membership as strict subset of workspace membership.
- Next SDD cycles can build actual collaboration features on this foundation (or we can do v2 external sync — Linear etc. — later as Path B).
- You can decide when to delete the legacy shims.

## Approval needed from you (explicit)

Before I commit and push the final wiring + docs:

1. Provide the real values for `.env.local` (or confirm you will fill them yourself and I should not touch the file with secrets).
2. Confirm you want me to `git commit` the changes (work-unit conventional style, no AI attribution, with [git:checkpoint] notes).
3. Confirm you want me to `git push` (or you will do the push yourself after review).
4. Any other constraint (e.g. "only commit the migration files, leave the terminal-renderer changes alone for now").

Once you say "dale, aprobá y subí" (or similar), I will:

- Make the final targeted edits to wire AuthProvider + context into the MCP server (keeping legacy supabase path as transition).
- Run the targeted tests.
- Stage only the migration-related files.
- Create the commit(s).
- Push if you said yes.
- Report the PR link or branch status.

## References (full audit trail)

- Archived SDD: `openspec/changes/archive/2026-06-06-devhub-cloud-foundation/`
- Main specs now live: the 11 new ones + the 2 modified (mcp-public-contract, team-chat-targeting).
- Engram: `sdd/devhub-cloud-foundation/{proposal,spec,design,tasks,apply-progress,archive-report,...}`
- Design decisions #1 (ports), #2 (operation modes), #4 (MCP 6-tool surface only), #7 (web-only invites), #10 (morphology contract).

This is the controlled "inmigración total" start. Everything else (actual data migration script, removing shims, hardening ESLint, full parity in CI, team features on top) can be the next small slices.

Ready when you are — just reply with the approvals + keys (or "llénalo vos" if you prefer to edit .env.local yourself).

---

## Activation wiring complete (this session — minimal diff per constraints)

The smallest possible diff that makes the new system active when vars are present (local behavior 100% preserved when unset):

**Files changed for runtime:**

- devhub-mcp/server.js: import getAuthProvider, createStubSupabaseClient for harness TDD, comments on legacy Supabase client + transition note, authProvider + async getActor in deps (CRIT-001 style, operation-modes respected).
- devhub-mcp/tools/workspaces.js: createRequire for tenancy/policy (no stray @supabase), wire 6 tools to resolve actor from deps.getActor() / authProvider and pass it, make helpers async + full supabase branches (query workspace_members + workspaces by actor.user.id, attach role), create/update/remove now use withWorkspaceContext (sqlite path) + ensureActorWithMemberships + assertCan (cloud service path) — policy enforcement started for new tools. Exported helpers for TDD. nowIso used for timestamps.
- devhub-mcp/tests/integration/workspaces.test.js: added TDD direct tests for the new cloud helper logic (list + create with rich supabase mock + actor) — written first (failing on import/return-[]), then impl made them pass. Harness its (local path + with wiring) also exercised.

**Docs / config (placeholders only):**

- .env.local: added detailed DEVHUB\_\* section + comments explaining Path A, modes, rollback=unset, "fill real keys".
- .env.example: enhanced cloud section with operation-modes respect, CRIT-001 note, "ask user", rollback.
- README.md: new "Cloud Foundation Migration (Path A)" subsection with vars, quick switch, tests list, link to migration doc.
- MIGRATION_CLOUD_FOUNDATION.md: this section added (activation summary + files).

**Tests run (all green, no PG needed):**

- adapter-isolation: PASS (6/6)
- hardcoded-local-user: PASS (defensive fallbacks still <=2)
- catalog-no-invite: PASS (no _invite_ tools)
- workspaces (mcp harness + new TDD cloud helpers): 8/8 PASS (local path + withWorkspaceContext for mutators + supabase actor branches)
- src/lib/db/workspaces.test: PASS (7/7)

**En gram saves:** decision on minimal plan + this summary (see protocol).

**What still needs user approval (explicit, per this doc):**

1. Fill real Supabase keys in your .env.local (or confirm "llénalo vos" and I leave placeholders).
2. `git commit` of the activation files only (work-unit conventional, [git:checkpoint], no AI co-author).
3. `git push` (or you do after review).
4. Any constraint on scope (e.g. only these files; leave other pending renderer work alone).

Before commit I ran `git status --short` (tree was dirty from other work — we will `git add` only the 6-7 activation files + docs).

Once approved, the foundation is live for you to test with real keys. Rollback is one comment.

**Summary of changes at end of session:** see the list in the final response + engram.
