-- migrations/sql/0001_workspaces.sql
--
-- devhub-cloud-foundation (PR 2): tenancy tables + RLS policies.
-- Source of truth for the Postgres path. REQ-TEN-1, REQ-TEN-2.
--
-- The role hierarchy is the single source of truth — see
-- src/lib/tenancy/policy.js (ROLE_HIERARCHY = ['owner','admin','member','viewer']).
-- The wrapper path (SQLite) and the RLS path (Postgres) BOTH derive from this
-- policy module. Migrations are forward-only and additive (REQ-TEN-4).

BEGIN;

-- Tenancy tables. Mirrors the SQLite schema in src/lib/db/schema.js.
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  owner_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','admin','member','viewer')),
  joined_at TIMESTAMP NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON workspace_members(user_id);

CREATE TABLE IF NOT EXISTS project_members (
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','admin','member','viewer')),
  joined_at TIMESTAMP NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members(user_id);

CREATE TABLE IF NOT EXISTS workspace_invitations (
  workspace_id TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','member','viewer')),
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','accepted','expired','revoked')) DEFAULT 'pending',
  invited_by TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, email)
);
CREATE INDEX IF NOT EXISTS idx_workspace_invitations_token ON workspace_invitations(token);

CREATE TABLE IF NOT EXISTS project_invitations (
  project_id TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','member','viewer')),
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','accepted','expired','revoked')) DEFAULT 'pending',
  invited_by TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, email)
);
CREATE INDEX IF NOT EXISTS idx_project_invitations_token ON project_invitations(token);

-- devhub_audit_log: append-only audit trail (REQ-MCPCTX-3).
CREATE TABLE IF NOT EXISTS devhub_audit_log (
  audit_id TEXT PRIMARY KEY,
  tool TEXT NOT NULL,
  actor TEXT,
  workspace_id TEXT,
  project_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('ok', 'error')),
  error_code TEXT,
  error_message TEXT,
  metadata TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_tool ON devhub_audit_log(tool, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON devhub_audit_log(actor, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_workspace ON devhub_audit_log(workspace_id, created_at DESC);

-- Enable RLS on every tenancy table. The actor identity is read from
-- `current_setting('devhub.user_id', true)`, which the postgres-generic
-- driver (PR 4) sets per-transaction before executing the query.
--
-- Note: `workspace_members` is intentionally NOT RLS'd. It is the
-- membership lookup table — its RLS-free state is required so the
-- `devhub_is_member` helper can iterate memberships without recursing
-- into its own policy. Membership writes are gated at the application
-- layer (admin-only mutations are enforced by the policy module, not
-- RLS). All resource tables (workspaces, projects, tasks, etc.) ARE
-- RLS'd and call `devhub_is_member` to filter.
--
-- We use `FORCE ROW LEVEL SECURITY` on the resource tables so the
-- table OWNER is also subject to the policies. Without FORCE, the
-- owner bypasses RLS — fine for a service role that intentionally has
-- bypass, but the harness needs to exercise the policy path against
-- the same user that owns the tables.
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces FORCE ROW LEVEL SECURITY;
ALTER TABLE workspace_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_invitations FORCE ROW LEVEL SECURITY;
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members FORCE ROW LEVEL SECURITY;
ALTER TABLE project_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_invitations FORCE ROW LEVEL SECURITY;
ALTER TABLE devhub_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE devhub_audit_log FORCE ROW LEVEL SECURITY;

-- Helper: read the current actor's user_id from the session GUC. Returns
-- NULL when unset (anonymous / system).
CREATE OR REPLACE FUNCTION devhub_current_user_id() RETURNS TEXT AS $$
  SELECT NULLIF(current_setting('devhub.user_id', true), '');
$$ LANGUAGE SQL STABLE;

-- Helper: is the current user a member of the workspace? REQ-TEN-2.
--
-- `workspace_members` is intentionally NOT RLS'd (see comment above) so
-- this function can iterate the membership table freely. Membership
-- writes are gated at the application layer.
CREATE OR REPLACE FUNCTION devhub_is_member(p_workspace_id TEXT) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = p_workspace_id
      AND user_id = devhub_current_user_id()
  );
$$ LANGUAGE SQL STABLE;

-- RLS policies: workspace-scoped tables.
DROP POLICY IF EXISTS workspace_member_read ON workspaces;
CREATE POLICY workspace_member_read ON workspaces FOR SELECT
  USING (owner_id = devhub_current_user_id() OR devhub_is_member(id));

DROP POLICY IF EXISTS workspace_owner_write ON workspaces;
CREATE POLICY workspace_owner_write ON workspaces FOR ALL
  USING (owner_id = devhub_current_user_id())
  WITH CHECK (owner_id = devhub_current_user_id());

DROP POLICY IF EXISTS workspace_member_invite_read ON workspace_invitations;
CREATE POLICY workspace_member_invite_read ON workspace_invitations FOR SELECT
  USING (devhub_is_member(workspace_id));

DROP POLICY IF EXISTS workspace_admin_invite_write ON workspace_invitations;
CREATE POLICY workspace_admin_invite_write ON workspace_invitations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = workspace_invitations.workspace_id
        AND wm.user_id = devhub_current_user_id()
        AND wm.role IN ('owner','admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = workspace_invitations.workspace_id
        AND wm.user_id = devhub_current_user_id()
        AND wm.role IN ('owner','admin')
    )
  );

DROP POLICY IF EXISTS project_member_read ON project_members;
CREATE POLICY project_member_read ON project_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.user_id = project_members.user_id
        AND wm.workspace_id IN (
          SELECT workspace_id FROM projects WHERE id = project_members.project_id
        )
    )
  );

DROP POLICY IF EXISTS project_admin_write ON project_members;
CREATE POLICY project_admin_write ON project_members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = project_members.project_id
        AND pm.user_id = devhub_current_user_id()
        AND pm.role IN ('owner','admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = project_members.project_id
        AND pm.user_id = devhub_current_user_id()
        AND pm.role IN ('owner','admin')
    )
  );

DROP POLICY IF EXISTS project_admin_invite_write ON project_invitations;
CREATE POLICY project_admin_invite_write ON project_invitations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = project_invitations.project_id
        AND pm.user_id = devhub_current_user_id()
        AND pm.role IN ('owner','admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = project_invitations.project_id
        AND pm.user_id = devhub_current_user_id()
        AND pm.role IN ('owner','admin')
    )
  );

-- devhub_audit_log: append-only, read-allowed-for-self. Service role
-- bypasses RLS via SET devhub.user_id TO NULL for cross-tenant audit
-- reads; for the regular path, audit rows are visible to the actor who
-- wrote them.
DROP POLICY IF EXISTS audit_actor_read ON devhub_audit_log;
CREATE POLICY audit_actor_read ON devhub_audit_log FOR SELECT
  USING (actor = devhub_current_user_id() OR devhub_current_user_id() IS NULL);

DROP POLICY IF EXISTS audit_self_insert ON devhub_audit_log;
CREATE POLICY audit_self_insert ON devhub_audit_log FOR INSERT
  WITH CHECK (actor = devhub_current_user_id() OR devhub_current_user_id() IS NULL);

-- Audit log is append-only: forbid UPDATE / DELETE via RLS. (Service role
-- bypasses RLS for the cleanup path; the regular path can never mutate.)
DROP POLICY IF EXISTS audit_no_update ON devhub_audit_log;
CREATE POLICY audit_no_update ON devhub_audit_log FOR UPDATE
  USING (false);
DROP POLICY IF EXISTS audit_no_delete ON devhub_audit_log;
CREATE POLICY audit_no_delete ON devhub_audit_log FOR DELETE
  USING (false);

COMMIT;
