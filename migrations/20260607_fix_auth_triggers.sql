-- Migration: Fix auth triggers for DevHub owner-only auth
-- Date: 2026-06-07
-- Issue: "Database error saving new user" when sending magic link
-- Root cause: restrict_signup_to_owner relied on app.owner_email GUC setting which
--             was NULL (permission denied to set it via ALTER DATABASE), so it
--             fell through to the bootstrap guard and blocked all INSERTs because
--             auth.users already had 1 row.

-- Fix 1: Rewrite restrict_signup_to_owner to embed hardcoded fallback owner email
--        so it works even when the GUC is not set at the database level.
CREATE OR REPLACE FUNCTION restrict_signup_to_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  owner_email TEXT;
BEGIN
  -- Try to get from GUC first, fall back to hardcoded owner
  owner_email := current_setting('app.owner_email', true);
  IF owner_email IS NULL OR owner_email = '' THEN
    owner_email := 'matiastobarsilva12344321@gmail.com';
  END IF;

  IF NEW.email != owner_email THEN
    RAISE EXCEPTION 'Registro cerrado. Este es un software privado. Solo el propietario puede registrarse.';
  END IF;

  RETURN NEW;
END;
$$;

-- Fix 2: Make handle_new_user idempotent with ON CONFLICT DO UPDATE
--        so it never fails if the profile row already exists.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
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
  RETURN NEW;
END;
$$;
