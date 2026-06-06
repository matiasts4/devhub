# DevHub

DevHub es tu hub centralizado para gestionar proyectos con integración profunda de Inteligencia Artificial (Enjambre de Agentes) y Protocolo de Contexto de Modelos (MCP).

## Características principales

- **Gestión de Proyectos, Tareas e Hitos**: Interfaz unificada construida sobre Next.js + Supabase.
- **Protocolo MCP Integrado**: DevHub funciona no solo como web app sino que provee un MCP (`devhub-mcp`) para agentes como Antigravity, Cline, etc.
- **Swarm Control**: Una cola de despacho que permite administrar un enjambre de sub-agentes asíncronos que pueden leer tu deuda técnica o ejecutar tests.
- **PWA Ready**: Instala DevHub directamente como app en el escritorio (Chrome / Edge / Safari).

## Quick Start

1. Instalar dependencias web: `npm install`
2. Correr entorno local: `npm run dev`
3. MCP Server:
   ```bash
   cd devhub-mcp
   npm ci
   npm start
   ```

## Arquitectura (Next.js 15 App Router + Supabase RLS)

DevHub está construido para escalar con **Server Components**, una API segmentada que funciona como puente para el MCP y **Row Level Security (RLS)** estricto por cada organización / usuario. Usa \`@upstash/ratelimit\` en middleware para frenar el abuso del rate de requests de agentes automatizados.

## Contribuir

Por favor asegúrate de revisar \`docs/\` (fases pasadas) para entender la evolución. Las PRs deben pasar Next build y tests (si se agregan test suites con coverage).

## Environment (cloud-foundation PR4+)

- `DEVHUB_DB_DRIVER=sqlite|supabase|postgres-generic` (default sqlite)
- `DATABASE_URL=postgres://...` (required for postgres-generic)
- `DATABASE_POOL_SIZE=10` (optional, default 10 for pg driver)
- `DATABASE_SSL=true` (optional for self-hosted pg)

### Multi-tenant Cloud Foundation (devhub-cloud-foundation) — NEW

The new system (Path A) turns DevHub into a multi-tenant platform with real auth, workspaces, and membership.

**Local mode (default, zero change to your current flow):**

- No env vars or `DEVHUB_OPERATION_MODE=local-dev`
- `DEVHUB_AUTH_PROVIDER=local`
- `DEVHUB_DB_DRIVER=sqlite`
- Byte-identical: single 'local-ws', synthetic 'local-user', all old tools work, no auth wall.

**Cloud / multi-tenant mode (activate the foundation you just built):**

- `DEVHUB_OPERATION_MODE=cloud`
- `DEVHUB_AUTH_PROVIDER=supabase`
- `DEVHUB_DB_DRIVER=supabase` (or `postgres-generic` later)
- Fill Supabase keys in `.env.local` (same project you already use for the MCP).
- Then: 6 new MCP tools (`workspace.list`, `workspace.create`, `workspace.members`, `workspace.add_member`, `workspace.update_member_role`, `workspace.remove_member`), web auth pages, WorkspaceSwitcher, invitation flow (web-only — no invite tools on MCP surface), tenancy policy + workspace context on all operations.

**Quick switch**

1. `cp .env.example .env.local`
2. Fill your real Supabase URL + keys (service role preferred for MCP).
3. Restart the MCP server and `npm run dev`.
4. Use the web `/login` `/signup` flow or the new workspace tools via MCP.

**Rollback** (instant, no data loss in local):

- Comment out or delete the three `DEVHUB_*` lines above.
- Everything reverts to legacy single-user behavior.

See `MIGRATION_CLOUD_FOUNDATION.md` for the full step-by-step, what the new system gives you, limitations, and how to seed your first workspace from your current data.

The 6 workspace tools are additive only. Existing 24+ tools continue to work (with workspace scoping added gradually under the new context).

## Cloud Foundation Migration (Path A — devhub-cloud-foundation) — NEW section

This is the safe minimal diff that activates the multi-tenant system when the env vars are present (per archived SDD strict constraints).

**Activated when set (local unchanged if unset or =local):**

- Hexagonal AuthProvider port loaded via `getAuthProvider()` (src/lib/auth/provider.js).
- Wired into devhub-mcp/server.js as `deps.authProvider` + async `getActor` (exact post-CRIT-001 pattern).
- 6 `workspace.*` MCP tools receive proper actor + start of `withWorkspaceContext` (local) / `assertCan` (cloud) for tenancy policy.
- DB Supabase: legacy direct client kept with comments + "transition note"; driver-selector marker used where possible.
- Backward compat: no vars → synthetic local-user + local-ws + zero auth wall + all prior behavior.

**Vars (placeholders only in repo; real keys in your .env.local):**

- `DEVHUB_AUTH_PROVIDER=supabase`
- `DEVHUB_DB_DRIVER=supabase` (respect operation-modes: cloud uses supabase+supabase or postgres-generic)
- Fill Supabase URL + keys (service role for MCP). Ask the user to provide real values.

**Rollback:** just unset the three vars (or set local/sqlite). Instant.

**Tests (must pass after):** adapter-isolation, hardcoded-local-user, catalog-no-invite, workspaces (mcp harness), src workspaces/parity (sqlite path, no PG).

Full instructions, what changes, "fill your Supabase keys", and approval items: `MIGRATION_CLOUD_FOUNDATION.md`.

## Contribuir (updated)

Please review `docs/` and the archived `openspec/changes/archive/2026-06-06-devhub-cloud-foundation/` for the complete SDD trace (proposal, 13 specs, design, 89 TDD tasks, apply evidence, verify gates, archive report). All new UI uses the existing morphology system (no new tokens or base components). Strict TDD + adapter isolation enforced.
