CREATE POLICY "Members can view project_members" ON project_members FOR SELECT USING (user_id = auth.uid() OR project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid()));
CREATE POLICY "Admins can insert members" ON project_members FOR INSERT WITH CHECK (project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admins can update members" ON project_members FOR UPDATE USING (project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admins can delete members" ON project_members FOR DELETE USING (project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid() AND role = 'admin'));

-- Adaptación a Projects: Creador principal = Admin? O el user_id. 
-- El user_id original del proyecto debe insertarse en project_members como Admin.
