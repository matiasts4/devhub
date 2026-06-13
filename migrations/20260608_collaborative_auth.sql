-- Migration: Collaborative auth for DevHub multi-tenant workspaces
-- Date: 2026-06-08
-- Issue: "Database error saving new user" blocks all non-owner signups
-- Goal: Allow invited collaborators to register and auto-join workspaces/projects

-- ── 1. Replace owner-only signup guard with invitation-aware guard ────────────
CREATE OR REPLACE FUNCTION restrict_signup_to_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner_email TEXT;
  has_invite BOOLEAN;
BEGIN
  owner_email := current_setting('app.owner_email', true);
  IF owner_email IS NULL OR owner_email = '' THEN
    owner_email := 'matiastobarsilva12344321@gmail.com';
  END IF;

  -- Owner can always register / sign in
  IF lower(NEW.email) = lower(owner_email) THEN
    RETURN NEW;
  END IF;

  -- Allow users with a pending workspace invitation
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_invitations wi
    WHERE lower(wi.email) = lower(NEW.email)
      AND wi.status = 'pending'
      AND wi.expires_at > NOW()
  ) INTO has_invite;

  IF has_invite THEN
    RETURN NEW;
  END IF;

  -- Allow users with a pending project invitation (cloud-foundation table)
  SELECT EXISTS (
    SELECT 1
    FROM public.project_invitations pi
    WHERE lower(pi.email) = lower(NEW.email)
      AND pi.status = 'pending'
      AND pi.expires_at > NOW()
  ) INTO has_invite;

  IF has_invite THEN
    RETURN NEW;
  END IF;

  -- Legacy project_members invite rows (invited_email + not yet accepted)
  SELECT EXISTS (
    SELECT 1
    FROM public.project_members pm
    WHERE lower(pm.invited_email) = lower(NEW.email)
      AND pm.accepted_at IS NULL
  ) INTO has_invite;

  IF has_invite THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Registro cerrado. Necesitas una invitación de un administrador para unirte a DevHub.';
END;
$$;

-- ── 2. Idempotent profile bootstrap + invitation acceptance ───────────────────
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Accept pending project invitations → legacy project_members rows
  INSERT INTO public.project_members (project_id, user_id, role, invited_at, accepted_at, invited_by)
  SELECT
    pi.project_id,
    NEW.id,
    CASE WHEN pi.role = 'member' THEN 'worker' ELSE pi.role END,
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

-- ── 3. Backfill workspace_id on legacy rows (safe, idempotent) ────────────────
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

-- ── 4. Workspace-scoped RLS for shared Kanban (additive, idempotent) ──────────
-- Keep UUID return types (live Supabase schema uses uuid, not text).
CREATE OR REPLACE FUNCTION devhub_current_user_id() RETURNS uuid AS $$
  SELECT COALESCE(auth.uid(), NULLIF(current_setting('devhub.user_id', true), '')::uuid);
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION devhub_is_member(p_workspace_id uuid) RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = p_workspace_id
      AND wm.user_id = devhub_current_user_id()
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public;

-- projects: members of the workspace can read/write shared projects
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS projects_workspace_read ON public.projects;
CREATE POLICY projects_workspace_read ON public.projects FOR SELECT
  USING (
    user_id = devhub_current_user_id()
    OR devhub_is_member(workspace_id)
    OR workspace_id IS NULL
  );
DROP POLICY IF EXISTS projects_workspace_write ON public.projects;
CREATE POLICY projects_workspace_write ON public.projects FOR ALL
  USING (user_id = devhub_current_user_id() OR devhub_is_member(workspace_id))
  WITH CHECK (user_id = devhub_current_user_id() OR devhub_is_member(workspace_id));

-- tasks: workspace members see the same Kanban cards
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tasks_workspace_read ON public.tasks;
CREATE POLICY tasks_workspace_read ON public.tasks FOR SELECT
  USING (
    user_id = devhub_current_user_id()
    OR devhub_is_member(workspace_id)
    OR workspace_id IS NULL
  );
DROP POLICY IF EXISTS tasks_workspace_write ON public.tasks;
CREATE POLICY tasks_workspace_write ON public.tasks FOR ALL
  USING (user_id = devhub_current_user_id() OR devhub_is_member(workspace_id))
  WITH CHECK (user_id = devhub_current_user_id() OR devhub_is_member(workspace_id));

-- milestones: same workspace scope
ALTER TABLE public.milestones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS milestones_workspace_read ON public.milestones;
CREATE POLICY milestones_workspace_read ON public.milestones FOR SELECT
  USING (
    user_id = devhub_current_user_id()
    OR devhub_is_member(workspace_id)
    OR workspace_id IS NULL
  );
DROP POLICY IF EXISTS milestones_workspace_write ON public.milestones;
CREATE POLICY milestones_workspace_write ON public.milestones FOR ALL
  USING (user_id = devhub_current_user_id() OR devhub_is_member(workspace_id))
  WITH CHECK (user_id = devhub_current_user_id() OR devhub_is_member(workspace_id));