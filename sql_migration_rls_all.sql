-- We need to enable RLS and set policies based on project_members.
-- tasks table
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view tasks" ON tasks;
DROP POLICY IF EXISTS "Users can insert tasks" ON tasks;
DROP POLICY IF EXISTS "Users can update tasks" ON tasks;
DROP POLICY IF EXISTS "Users can delete tasks" ON tasks;

CREATE POLICY "Members can view tasks" ON tasks FOR SELECT USING (
  EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = tasks.project_id AND pm.user_id = auth.uid())
);
CREATE POLICY "Admins and Workers can insert tasks" ON tasks FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = tasks.project_id AND pm.user_id = auth.uid() AND pm.role IN ('admin', 'worker'))
);
CREATE POLICY "Admins and Workers can update tasks" ON tasks FOR UPDATE USING (
  EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = tasks.project_id AND pm.user_id = auth.uid() AND pm.role IN ('admin', 'worker'))
);
CREATE POLICY "Admins and Workers can delete tasks" ON tasks FOR DELETE USING (
  EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = tasks.project_id AND pm.user_id = auth.uid() AND pm.role IN ('admin', 'worker'))
);

-- milestones table
ALTER TABLE milestones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view milestones" ON milestones;
DROP POLICY IF EXISTS "Users can CRUD milestones" ON milestones;

CREATE POLICY "Members can view milestones" ON milestones FOR SELECT USING (
  EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = milestones.project_id AND pm.user_id = auth.uid())
);
CREATE POLICY "Admins and Workers can insert milestones" ON milestones FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = milestones.project_id AND pm.user_id = auth.uid() AND pm.role IN ('admin', 'worker'))
);
CREATE POLICY "Admins and Workers can update milestones" ON milestones FOR UPDATE USING (
  EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = milestones.project_id AND pm.user_id = auth.uid() AND pm.role IN ('admin', 'worker'))
);
CREATE POLICY "Admins and Workers can delete milestones" ON milestones FOR DELETE USING (
  EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = milestones.project_id AND pm.user_id = auth.uid() AND pm.role IN ('admin', 'worker'))
);

-- projects table
-- Allow reading if user is a member
DROP POLICY IF EXISTS "Users can view own projects" ON projects;
CREATE POLICY "Members can view project details" ON projects FOR SELECT USING (
  EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = id AND pm.user_id = auth.uid())
);
-- Allow updating if admin
DROP POLICY IF EXISTS "Users can update own projects" ON projects;
CREATE POLICY "Admins can update projects" ON projects FOR UPDATE USING (
  EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = id AND pm.user_id = auth.uid() AND pm.role = 'admin')
);
-- Allow deleting if admin
DROP POLICY IF EXISTS "Users can delete own projects" ON projects;
CREATE POLICY "Admins can delete projects" ON projects FOR DELETE USING (
  EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = id AND pm.user_id = auth.uid() AND pm.role = 'admin')
);
