-- ============================================================
-- XLGantt Web - Admin user management + forced password change
-- Supabase Migration 009
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS force_password_change BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS password_reset_by_admin_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE (
  id UUID,
  email TEXT,
  name TEXT,
  role TEXT,
  approved BOOLEAN,
  avatar_url TEXT,
  force_password_change BOOLEAN,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    p.id,
    COALESCE(au.email, p.email) AS email,
    p.name,
    p.role,
    p.approved,
    p.avatar_url,
    COALESCE(p.force_password_change, false) AS force_password_change,
    COALESCE(au.created_at, p.created_at) AS created_at
  FROM public.profiles p
  JOIN auth.users au ON au.id = p.id
  WHERE EXISTS (
    SELECT 1
    FROM public.profiles me
    WHERE me.id = auth.uid()
      AND me.role = 'admin'
  )
  ORDER BY COALESCE(au.created_at, p.created_at) ASC;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_delete_user(target_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles me
    WHERE me.id = auth.uid()
      AND me.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'cannot delete self';
  END IF;

  DELETE FROM public.profiles
  WHERE id = target_user_id;

  DELETE FROM auth.users
  WHERE id = target_user_id;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_user(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_reset_user_password(
  target_user_id UUID,
  temp_password TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF temp_password IS NULL OR length(temp_password) < 6 THEN
    RAISE EXCEPTION 'password too short';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles me
    WHERE me.id = auth.uid()
      AND me.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  UPDATE auth.users
  SET
    encrypted_password = crypt(temp_password, gen_salt('bf')),
    updated_at = now(),
    email_confirmed_at = COALESCE(email_confirmed_at, now())
  WHERE id = target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user not found';
  END IF;

  UPDATE public.profiles
  SET
    force_password_change = true,
    password_reset_by_admin_at = now(),
    updated_at = now()
  WHERE id = target_user_id;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_reset_user_password(UUID, TEXT) TO authenticated;
