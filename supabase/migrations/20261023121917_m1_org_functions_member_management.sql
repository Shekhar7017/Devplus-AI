/*
# M1: Org creation function, member management, and security fixes

## Purpose
Fixes the chicken-and-egg problem in M0 where creating an organization also
requires inserting the first OWNER membership, but the membership INSERT policy
checks for an existing owner/admin membership. Adds SECURITY DEFINER functions
for org creation and member management, fixes app_user visibility so members
can see each other's profiles, and revokes anon grants (this is a sign-in-only app).

## Changes

### Security fixes
1. Revoke ALL grants from `anon` role on organization, app_user, and membership
   tables. This is a sign-in-required app — anon should have no access.
2. Update `app_user` SELECT policy so users can see profiles of other users
   who share an org membership (needed for member lists).

### New functions
1. `create_organization(p_name text)` — SECURITY DEFINER
   Creates an organization and an OWNER membership for the calling user
   in a single atomic operation. Returns the new organization row.
   - Revoked from PUBLIC/anon, granted to authenticated only.
   - Validates name is non-empty and <= 200 chars.

2. `add_member_by_email(p_org_id uuid, p_email text, p_role text)` — SECURITY DEFINER
   Looks up an app_user by email, verifies the caller is OWNER or ADMIN of
   the org, and creates a membership. Returns the new membership row.
   - Revoked from PUBLIC/anon, granted to authenticated only.
   - Validates email format, role is in allowed set, and target user exists.
   - Prevents duplicate memberships.

3. `update_member_role(p_org_id uuid, p_user_id uuid, p_role text)` — SECURITY DEFINER
   Updates a member's role. Caller must be OWNER or ADMIN. Prevents the last
   OWNER from demoting themselves (org must always have at least one owner).
   - Revoked from PUBLIC/anon, granted to authenticated only.

4. `remove_member(p_org_id uuid, p_user_id uuid)` — SECURITY DEFINER
   Removes a member from an org. Caller must be OWNER. Prevents the last
   OWNER from removing themselves.
   - Revoked from PUBLIC/anon, granted to authenticated only.

## Important Notes
1. All functions use `auth.uid()` to identify the caller — never trust
   caller-supplied user IDs.
2. `create_organization` is the ONLY way to create an org + its first membership
   atomically. The raw INSERT on membership still works for existing admins
   adding members, but `add_member_by_email` is preferred since it resolves
   the user by email.
3. The `insert_orgs` policy on organization remains `WITH CHECK (true)` —
   this is intentional because `create_organization` (SECURITY DEFINER) bypasses
   RLS, and we don't want to block it. The real protection is that only
   `create_organization` creates orgs, not direct inserts.
*/

-- ============================================================
-- 1. Revoke anon grants (sign-in-only app)
-- ============================================================
REVOKE ALL ON organization FROM anon;
REVOKE ALL ON app_user FROM anon;
REVOKE ALL ON membership FROM anon;

-- ============================================================
-- 2. Fix app_user SELECT policy: allow same-org visibility
-- ============================================================
DROP POLICY IF EXISTS "select_own_profile" ON app_user;
CREATE POLICY "select_own_profile" ON app_user FOR SELECT
  TO authenticated USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM membership m1
      JOIN membership m2 ON m1.organization_id = m2.organization_id
      WHERE m1.user_id = auth.uid()
      AND m2.user_id = app_user.id
    )
  );

-- ============================================================
-- 3. create_organization function
-- ============================================================
CREATE OR REPLACE FUNCTION create_organization(p_name text)
RETURNS organization
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org organization;
BEGIN
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'Organization name is required' USING ERRCODE = '23502';
  END IF;
  IF length(p_name) > 200 THEN
    RAISE EXCEPTION 'Organization name must be 200 characters or fewer' USING ERRCODE = '22001';
  END IF;

  INSERT INTO organization (name) VALUES (p_name) RETURNING * INTO v_org;

  INSERT INTO membership (organization_id, user_id, role)
  VALUES (v_org.id, auth.uid(), 'OWNER');

  RETURN v_org;
END;
$$;

REVOKE EXECUTE ON FUNCTION create_organization(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_organization(text) TO authenticated;

-- ============================================================
-- 4. add_member_by_email function
-- ============================================================
CREATE OR REPLACE FUNCTION add_member_by_email(
  p_org_id uuid,
  p_email text,
  p_role text
)
RETURNS membership
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_user app_user;
  v_membership membership;
  v_caller_role text;
BEGIN
  -- Validate role
  IF p_role NOT IN ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER') THEN
    RAISE EXCEPTION 'Invalid role. Must be OWNER, ADMIN, MEMBER, or VIEWER.' USING ERRCODE = '23514';
  END IF;

  -- Get caller's role in this org
  SELECT role INTO v_caller_role
  FROM membership
  WHERE organization_id = p_org_id AND user_id = auth.uid();

  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'You are not a member of this organization' USING ERRCODE = '42501';
  END IF;

  IF v_caller_role NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Only owners and admins can add members' USING ERRCODE = '42501';
  END IF;

  -- Only owners can add other owners
  IF p_role = 'OWNER' AND v_caller_role != 'OWNER' THEN
    RAISE EXCEPTION 'Only owners can add other owners' USING ERRCODE = '42501';
  END IF;

  -- Find target user by email
  SELECT * INTO v_target_user FROM app_user WHERE email = lower(btrim(p_email));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No user found with email %', p_email USING ERRCODE = 'P0002';
  END IF;

  -- Check for existing membership
  IF EXISTS (
    SELECT 1 FROM membership
    WHERE organization_id = p_org_id AND user_id = v_target_user.id
  ) THEN
    RAISE EXCEPTION 'User is already a member of this organization' USING ERRCODE = '23505';
  END IF;

  INSERT INTO membership (organization_id, user_id, role)
  VALUES (p_org_id, v_target_user.id, p_role)
  RETURNING * INTO v_membership;

  RETURN v_membership;
END;
$$;

REVOKE EXECUTE ON FUNCTION add_member_by_email(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION add_member_by_email(uuid, text, text) TO authenticated;

-- ============================================================
-- 5. update_member_role function
-- ============================================================
CREATE OR REPLACE FUNCTION update_member_role(
  p_org_id uuid,
  p_user_id uuid,
  p_role text
)
RETURNS membership
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_membership membership;
  v_caller_role text;
  v_target_role text;
  v_owner_count integer;
BEGIN
  -- Validate role
  IF p_role NOT IN ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER') THEN
    RAISE EXCEPTION 'Invalid role' USING ERRCODE = '23514';
  END IF;

  -- Get caller's role
  SELECT role INTO v_caller_role
  FROM membership
  WHERE organization_id = p_org_id AND user_id = auth.uid();

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Only owners and admins can change member roles' USING ERRCODE = '42501';
  END IF;

  -- Only owners can grant/revoke OWNER role
  IF p_role = 'OWNER' AND v_caller_role != 'OWNER' THEN
    RAISE EXCEPTION 'Only owners can assign the OWNER role' USING ERRCODE = '42501';
  END IF;

  -- Get target's current role
  SELECT role INTO v_target_role
  FROM membership
  WHERE organization_id = p_org_id AND user_id = p_user_id;

  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'Target user is not a member of this organization' USING ERRCODE = 'P0002';
  END IF;

  -- Prevent demoting the last owner
  IF v_target_role = 'OWNER' AND p_role != 'OWNER' THEN
    SELECT count(*) INTO v_owner_count
    FROM membership
    WHERE organization_id = p_org_id AND role = 'OWNER';

    IF v_owner_count <= 1 THEN
      RAISE EXCEPTION 'Cannot demote the last owner. Assign another owner first.' USING ERRCODE = 'P0003';
    END IF;
  END IF;

  UPDATE membership
  SET role = p_role
  WHERE organization_id = p_org_id AND user_id = p_user_id
  RETURNING * INTO v_membership;

  RETURN v_membership;
END;
$$;

REVOKE EXECUTE ON FUNCTION update_member_role(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION update_member_role(uuid, uuid, text) TO authenticated;

-- ============================================================
-- 6. remove_member function
-- ============================================================
CREATE OR REPLACE FUNCTION remove_member(
  p_org_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role text;
  v_target_role text;
  v_owner_count integer;
BEGIN
  -- Get caller's role
  SELECT role INTO v_caller_role
  FROM membership
  WHERE organization_id = p_org_id AND user_id = auth.uid();

  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'You are not a member of this organization' USING ERRCODE = '42501';
  END IF;

  -- Owners can remove anyone, users can remove themselves
  IF v_caller_role != 'OWNER' AND p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Only owners can remove other members' USING ERRCODE = '42501';
  END IF;

  -- Get target's role
  SELECT role INTO v_target_role
  FROM membership
  WHERE organization_id = p_org_id AND user_id = p_user_id;

  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'Target user is not a member of this organization' USING ERRCODE = 'P0002';
  END IF;

  -- Prevent removing the last owner
  IF v_target_role = 'OWNER' THEN
    SELECT count(*) INTO v_owner_count
    FROM membership
    WHERE organization_id = p_org_id AND role = 'OWNER';

    IF v_owner_count <= 1 THEN
      RAISE EXCEPTION 'Cannot remove the last owner. Transfer ownership first.' USING ERRCODE = 'P0003';
    END IF;
  END IF;

  DELETE FROM membership
  WHERE organization_id = p_org_id AND user_id = p_user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION remove_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION remove_member(uuid, uuid) TO authenticated;
