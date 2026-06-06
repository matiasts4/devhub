-- migrations/sql/0002_tenancy_policies.sql
--
-- devhub-cloud-foundation (PR 2): RLS for existing project / task / agent /
-- mission tables. Adds a `workspace_id` column to each (nullable for
-- legacy data) and a policy that gates reads/writes on
-- `devhub_is_member(workspace_id)`.
--
-- REQ-TEN-2.

BEGIN;

-- projects: needs workspace_id
ALTER TABLE projects ADD COLUMN IF NOT EXISTS workspace_id TEXT;
CREATE INDEX IF NOT EXISTS idx_projects_workspace ON projects(workspace_id);
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS projects_workspace_read ON projects;
CREATE POLICY projects_workspace_read ON projects FOR SELECT
  USING (devhub_is_member(workspace_id) OR workspace_id IS NULL);
DROP POLICY IF EXISTS projects_workspace_write ON projects;
CREATE POLICY projects_workspace_write ON projects FOR ALL
  USING (devhub_is_member(workspace_id))
  WITH CHECK (devhub_is_member(workspace_id));

-- tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS workspace_id TEXT;
CREATE INDEX IF NOT EXISTS idx_tasks_workspace ON tasks(workspace_id);
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tasks_workspace_read ON tasks;
CREATE POLICY tasks_workspace_read ON tasks FOR SELECT
  USING (
    workspace_id IS NULL
    OR devhub_is_member(workspace_id)
  );
DROP POLICY IF EXISTS tasks_workspace_write ON tasks;
CREATE POLICY tasks_workspace_write ON tasks FOR ALL
  USING (devhub_is_member(workspace_id))
  WITH CHECK (devhub_is_member(workspace_id));

-- milestones
ALTER TABLE milestones ADD COLUMN IF NOT EXISTS workspace_id TEXT;
CREATE INDEX IF NOT EXISTS idx_milestones_workspace ON milestones(workspace_id);
ALTER TABLE milestones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS milestones_workspace_read ON milestones;
CREATE POLICY milestones_workspace_read ON milestones FOR SELECT
  USING (workspace_id IS NULL OR devhub_is_member(workspace_id));
DROP POLICY IF EXISTS milestones_workspace_write ON milestones;
CREATE POLICY milestones_workspace_write ON milestones FOR ALL
  USING (devhub_is_member(workspace_id))
  WITH CHECK (devhub_is_member(workspace_id));

-- agent_runs
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS workspace_id TEXT;
CREATE INDEX IF NOT EXISTS idx_agent_runs_workspace_id ON agent_runs(workspace_id);
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agent_runs_workspace_read ON agent_runs;
CREATE POLICY agent_runs_workspace_read ON agent_runs FOR SELECT
  USING (workspace_id IS NULL OR devhub_is_member(workspace_id));
DROP POLICY IF EXISTS agent_runs_workspace_write ON agent_runs;
CREATE POLICY agent_runs_workspace_write ON agent_runs FOR ALL
  USING (devhub_is_member(workspace_id))
  WITH CHECK (devhub_is_member(workspace_id));

-- agent_artifacts (inherits from agent_runs)
ALTER TABLE agent_artifacts ADD COLUMN IF NOT EXISTS workspace_id TEXT;
CREATE INDEX IF NOT EXISTS idx_agent_artifacts_workspace_id ON agent_artifacts(workspace_id);
ALTER TABLE agent_artifacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agent_artifacts_workspace_read ON agent_artifacts;
CREATE POLICY agent_artifacts_workspace_read ON agent_artifacts FOR SELECT
  USING (workspace_id IS NULL OR devhub_is_member(workspace_id));
DROP POLICY IF EXISTS agent_artifacts_workspace_write ON agent_artifacts;
CREATE POLICY agent_artifacts_workspace_write ON agent_artifacts FOR ALL
  USING (devhub_is_member(workspace_id))
  WITH CHECK (devhub_is_member(workspace_id));

-- supervisor_snapshots
ALTER TABLE supervisor_snapshots ADD COLUMN IF NOT EXISTS workspace_id TEXT;
CREATE INDEX IF NOT EXISTS idx_supervisor_snapshots_workspace_id ON supervisor_snapshots(workspace_id);
ALTER TABLE supervisor_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS supervisor_snapshots_workspace_read ON supervisor_snapshots;
CREATE POLICY supervisor_snapshots_workspace_read ON supervisor_snapshots FOR SELECT
  USING (workspace_id IS NULL OR devhub_is_member(workspace_id));
DROP POLICY IF EXISTS supervisor_snapshots_workspace_write ON supervisor_snapshots;
CREATE POLICY supervisor_snapshots_workspace_write ON supervisor_snapshots FOR ALL
  USING (devhub_is_member(workspace_id))
  WITH CHECK (devhub_is_member(workspace_id));

-- swarm_missions
ALTER TABLE swarm_missions ADD COLUMN IF NOT EXISTS workspace_id TEXT;
CREATE INDEX IF NOT EXISTS idx_swarm_missions_workspace_id ON swarm_missions(workspace_id);
ALTER TABLE swarm_missions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS swarm_missions_workspace_read ON swarm_missions;
CREATE POLICY swarm_missions_workspace_read ON swarm_missions FOR SELECT
  USING (workspace_id IS NULL OR devhub_is_member(workspace_id));
DROP POLICY IF EXISTS swarm_missions_workspace_write ON swarm_missions;
CREATE POLICY swarm_missions_workspace_write ON swarm_missions FOR ALL
  USING (devhub_is_member(workspace_id))
  WITH CHECK (devhub_is_member(workspace_id));

-- mission_messages
ALTER TABLE mission_messages ADD COLUMN IF NOT EXISTS workspace_id TEXT;
CREATE INDEX IF NOT EXISTS idx_mission_messages_workspace_id ON mission_messages(workspace_id);
ALTER TABLE mission_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mission_messages_workspace_read ON mission_messages;
CREATE POLICY mission_messages_workspace_read ON mission_messages FOR SELECT
  USING (workspace_id IS NULL OR devhub_is_member(workspace_id));
DROP POLICY IF EXISTS mission_messages_workspace_write ON mission_messages;
CREATE POLICY mission_messages_workspace_write ON mission_messages FOR ALL
  USING (devhub_is_member(workspace_id))
  WITH CHECK (devhub_is_member(workspace_id));

-- operator_inbox
ALTER TABLE operator_inbox ADD COLUMN IF NOT EXISTS workspace_id TEXT;
CREATE INDEX IF NOT EXISTS idx_operator_inbox_workspace_id ON operator_inbox(workspace_id);
ALTER TABLE operator_inbox ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS operator_inbox_workspace_read ON operator_inbox;
CREATE POLICY operator_inbox_workspace_read ON operator_inbox FOR SELECT
  USING (workspace_id IS NULL OR devhub_is_member(workspace_id));
DROP POLICY IF EXISTS operator_inbox_workspace_write ON operator_inbox;
CREATE POLICY operator_inbox_workspace_write ON operator_inbox FOR ALL
  USING (devhub_is_member(workspace_id))
  WITH CHECK (devhub_is_member(workspace_id));

COMMIT;
