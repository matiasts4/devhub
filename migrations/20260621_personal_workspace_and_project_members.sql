-- Migration: Personal workspaces + project-level sharing
-- Date: 2026-06-21
-- Goal: Every user gets a personal cloud workspace for RLS, while sharing happens via project_members.

-- ── 1. Ensure profiles table exists (self-contained migration) ────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 2. Helper: create a personal workspace for a user idempotently ────────────
CREATE OR REPLACE FUNCTION devhub_ensure_personal_workspace(p_user_id uuid, p_email text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id uuid;
  v_workspace_slug text;
BEGIN
  v_workspace_slug := 'personal-' || p_user_id::text;

  INSERT INTO public.workspaces (id, name, slug, owner_id)
  VALUES (
    gen_random_uuid(),
    COALESCE(p_email, 'Personal'),
    v_workspace_slug,
    p_user_id
  )
  ON CONFLICT (slug) DO NOTHING
  RETURNING id INTO v_workspace_id;

  IF v_workspace_id IS NULL THEN
    SELECT id INTO v_workspace_id
    FROM public.workspaces
    WHERE slug = v_workspace_slug;
  END IF;

  INSERT INTO public.workspace_members (workspace_id, user_id, role, joined_at)
  VALUES (v_workspace_id, p_user_id, 'owner', NOW())
  ON CONFLICT (workspace_id, user_id) DO NOTHING;

  RETURN v_workspace_id;
END;
$$;

-- ── 3. Helper: get current user's role in a project (NULL if not a member) ───
CREATE OR REPLACE FUNCTION devhub_project_role(p_project_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.project_members
  WHERE project_id = p_project_id
    AND user_id = devhub_current_user_id()
  UNION ALL
  SELECT 'owner'::text
  WHERE EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = p_project_id AND p.user_id = devhub_current_user_id()
  )
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION devhub_is_project_member(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = p_project_id
      AND user_id = devhub_current_user_id()
  ) OR EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = p_project_id AND p.user_id = devhub_current_user_id()
  );
$$;

-- ── 4. Update new-user trigger to create personal workspace and accept invites ─
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_personal_workspace_id uuid;
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
    updated_at = NOW();

  -- Personal workspace for RLS
  v_personal_workspace_id := devhub_ensure_personal_workspace(NEW.id, NEW.email);

  -- Backfill existing projects created before this migration
  UPDATE public.projects
  SET workspace_id = v_personal_workspace_id
  WHERE user_id = NEW.id
    AND workspace_id IS NULL;

  -- Ensure owner project_membership for all projects they own
  INSERT INTO public.project_members (project_id, user_id, role, joined_at)
  SELECT id, NEW.id, 'owner', NOW()
  FROM public.projects
  WHERE user_id = NEW.id
    AND NOT EXISTS (
      SELECT 1 FROM public.project_members pm
      WHERE pm.project_id = public.projects.id AND pm.user_id = NEW.id
    );

  -- Accept pending workspace invitations
  INSERT INTO public.workspace_members (workspace_id, user_id, role, joined_at)
  SELECT wi.workspace_id, NEW.id, wi.role, NOW()
  FROM public.workspace_invitations wi
  WHERE lower(wi.email) = lower(NEW.email)
    AND wi.status = 'pending'
    AND wi.expires_at > NOW()
  ON CONFLICT (workspace_id, user_id) DO NOTHING;

  UPDATE public.workspace_invitations wi
  SET status = 'accepted', updated_at = NOW()
  WHERE lower(wi.email) = lower(NEW.email)
    AND wi.status = 'pending'
    AND wi.expires_at > NOW();

  -- Accept pending project invitations → project_members rows
  INSERT INTO public.project_members (project_id, user_id, role, invited_at, accepted_at, invited_by)
  SELECT
    pi.project_id,
    NEW.id,
    pi.role,
    NOW(),
    NOW(),
    pi.invited_by
  FROM public.project_invitations pi
  WHERE lower(pi.email) = lower(NEW.email)
    AND pi.status = 'pending'
    AND pi.expires_at > NOW()
    AND NOT EXISTS (
      SELECT 1 FROM public.project_members pm
      WHERE pm.project_id = pi.project_id AND pm.user_id = NEW.id
    );

  UPDATE public.project_invitations pi
  SET status = 'accepted', updated_at = NOW()
  WHERE lower(pi.email) = lower(NEW.email)
    AND pi.status = 'pending'
    AND pi.expires_at > NOW();

  -- Legacy project_members rows keyed by invited_email
  UPDATE public.project_members pm
  SET
    user_id = NEW.id,
    accepted_at = NOW(),
    invited_email = NULL,
    invite_token = NULL
  WHERE lower(pm.invited_email) = lower(NEW.email)
    AND pm.accepted_at IS NULL;

  RETURN NEW;
END;
$$;

-- ── 5. Backfill existing users (idempotent) ───────────────────────────────────
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT u.id, u.email
    FROM auth.users u
    WHERE NOT EXISTS (
      SELECT 1 FROM public.workspace_members wm
      JOIN public.workspaces w ON w.id = wm.workspace_id
      WHERE wm.user_id = u.id AND w.slug = 'personal-' || u.id::text
    )
  LOOP
    PERFORM devhub_ensure_personal_workspace(rec.id, rec.email);

    UPDATE public.projects
    SET workspace_id = (
      SELECT id FROM public.workspaces WHERE slug = 'personal-' || rec.id::text
    )
    WHERE user_id = rec.id AND workspace_id IS NULL;

    INSERT INTO public.project_members (project_id, user_id, role, joined_at)
    SELECT id, rec.id, 'owner', NOW()
    FROM public.projects
    WHERE user_id = rec.id
      AND NOT EXISTS (
        SELECT 1 FROM public.project_members pm
        WHERE pm.project_id = public.projects.id AND pm.user_id = rec.id
      )
    ON CONFLICT (project_id, user_id) DO NOTHING;
  END LOOP;
END;
$$;

-- ── 6. Update backfill for tasks/milestones (idempotent) ──────────────────────
UPDATE public.tasks t
SET workspace_id = p.workspace_id
FROM public.projects p
WHERE t.project_id = p.id
  AND t.workspace_id IS NULL
  AND p.workspace_id IS NOT NULL;

UPDATE public.milestones m
SET workspace_id = p.workspace_id
FROM public.projects p
WHERE m.project_id = p.id
  AND m.workspace_id IS NULL
  AND p.workspace_id IS NOT NULL;

-- ── 7. Harden RLS: project-based sharing with workspace fallback ──────────────
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS projects_workspace_read ON public.projects;
DROP POLICY IF EXISTS projects_workspace_write ON public.projects;

CREATE POLICY projects_select ON public.projects FOR SELECT
  USING (
    user_id = devhub_current_user_id()
    OR devhub_is_project_member(id)
    OR devhub_is_member(workspace_id)
  );

CREATE POLICY projects_insert ON public.projects FOR INSERT
  WITH CHECK (devhub_current_user_id() IS NOT NULL);

CREATE POLICY projects_update ON public.projects FOR UPDATE
  USING (
    user_id = devhub_current_user_id()
    OR devhub_project_role(id) IN ('owner', 'admin')
  )
  WITH CHECK (
    user_id = devhub_current_user_id()
    OR devhub_project_role(id) IN ('owner', 'admin')
  );

CREATE POLICY projects_delete ON public.projects FOR DELETE
  USING (devhub_project_role(id) IN ('owner', 'admin'));

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tasks_workspace_read ON public.tasks;
DROP POLICY IF EXISTS tasks_workspace_write ON public.tasks;

CREATE POLICY tasks_select ON public.tasks FOR SELECT
  USING (
    user_id = devhub_current_user_id()
    OR devhub_is_project_member(project_id)
    OR devhub_is_member(workspace_id)
  );

CREATE POLICY tasks_insert ON public.tasks FOR INSERT
  WITH CHECK (
    devhub_project_role(project_id) IN ('owner', 'admin', 'member')
    OR user_id = devhub_current_user_id()
  );

CREATE POLICY tasks_update ON public.tasks FOR UPDATE
  USING (
    devhub_project_role(project_id) IN ('owner', 'admin', 'member')
    OR user_id = devhub_current_user_id()
  )
  WITH CHECK (
    devhub_project_role(project_id) IN ('owner', 'admin', 'member')
    OR user_id = devhub_current_user_id()
  );

CREATE POLICY tasks_delete ON public.tasks FOR DELETE
  USING (
    devhub_project_role(project_id) IN ('owner', 'admin', 'member')
    OR user_id = devhub_current_user_id()
  );

ALTER TABLE public.milestones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS milestones_workspace_read ON public.milestones;
DROP POLICY IF EXISTS milestones_workspace_write ON public.milestones;

CREATE POLICY milestones_select ON public.milestones FOR SELECT
  USING (
    user_id = devhub_current_user_id()
    OR devhub_is_project_member(project_id)
    OR devhub_is_member(workspace_id)
  );

CREATE POLICY milestones_insert ON public.milestones FOR INSERT
  WITH CHECK (
    devhub_project_role(project_id) IN ('owner', 'admin', 'member')
    OR user_id = devhub_current_user_id()
  );

CREATE POLICY milestones_update ON public.milestones FOR UPDATE
  USING (
    devhub_project_role(project_id) IN ('owner', 'admin', 'member')
    OR user_id = devhub_current_user_id()
  )
  WITH CHECK (
    devhub_project_role(project_id) IN ('owner', 'admin', 'member')
    OR user_id = devhub_current_user_id()
  );

CREATE POLICY milestones_delete ON public.milestones FOR DELETE
  USING (
    devhub_project_role(project_id) IN ('owner', 'admin', 'member')
    OR user_id = devhub_current_user_id()
  );

-- ── 8. Align task_comments with local SQLite schema (track author) ────────────
DO $$
BEGIN
  ALTER TABLE public.task_comments ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN
  -- already migrated
END;
$$;

-- ── 9. Enable Realtime for collaborative tables ───────────────────────────────
ALTER TABLE public.projects REPLICA IDENTITY FULL;
ALTER TABLE public.tasks REPLICA IDENTITY FULL;
ALTER TABLE public.milestones REPLICA IDENTITY FULL;
ALTER TABLE public.task_comments REPLICA IDENTITY FULL;
ALTER TABLE public.project_members REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.projects;
EXCEPTION WHEN duplicate_table THEN
  -- already published
END;
$$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
EXCEPTION WHEN duplicate_table THEN
  -- already published
END;
$$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.milestones;
EXCEPTION WHEN duplicate_table THEN
  -- already published
END;
$$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.task_comments;
EXCEPTION WHEN duplicate_table THEN
  -- already published
END;
$$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.project_members;
EXCEPTION WHEN duplicate_table THEN
  -- already published
END;
$$;
