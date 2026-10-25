/*
# M0 Baseline: Identity and Tenancy Foundation

## Purpose
Creates the foundational schema for DevPulse AI, a multi-tenant SaaS platform
demonstrating the Hybrid Agile-Innovation Software Development Model (HAISDM).

This migration establishes the identity and tenancy layer that all other modules
build upon. Every tenant-owned table carries organization_id for isolation.

## New Tables

1. `organization` — Top-level tenant entity.
   - id (uuid PK)
   - name (text, not null)
   - ai_enabled (boolean, default false) — per-org opt-in for AI features
   - ai_requests_this_period (int, default 0) — counter for AI quota tracking
   - ai_quota_reset_at (timestamptz, nullable) — when the quota counter resets
   - created_at, updated_at (timestamptz)

2. `app_user` — Application user profile. Links to Supabase auth.users.
   - id (uuid PK, references auth.users ON DELETE CASCADE)
   - email (text, unique, not null)
   - display_name (text, nullable)
   - created_at, updated_at (timestamptz)

3. `membership` — Joins users to organizations with a role.
   - id (uuid PK)
   - organization_id (uuid FK -> organization)
   - user_id (uuid FK -> app_user)
   - role (text, not null) — OWNER, ADMIN, MEMBER, VIEWER
   - created_at, updated_at (timestamptz)
   - Unique constraint on (organization_id, user_id)

## Security

- RLS enabled on all three tables.
- Grants: SELECT/INSERT/UPDATE/DELETE to authenticated on all tables.
- Policies: users can only access organizations they are a member of.
  - organization: access scoped through membership existence check.
  - app_user: users can read/update their own profile.
  - membership: users can read memberships for orgs they belong to;
    insert/update restricted to org owners/admins.

## Important Notes

1. This is a multi-tenant app with sign-in required. All policies target
   the `authenticated` role only — `anon` has no access.
2. The `app_user.id` references `auth.users(id)` so Supabase auth sessions
   map directly to application profiles.
3. Role values are validated with a CHECK constraint enforcing the allowed set.
4. The `ai_enabled` flag defaults to false — organizations must explicitly
   opt in before any AI features are available.
*/

-- ============================================================
-- Tables (created first so policy subqueries can reference them)
-- ============================================================

CREATE TABLE IF NOT EXISTS organization (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  ai_enabled boolean NOT NULL DEFAULT false,
  ai_requests_this_period integer NOT NULL DEFAULT 0,
  ai_quota_reset_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_user (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS membership (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

-- ============================================================
-- RLS + Grants
-- ============================================================

ALTER TABLE organization ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_user ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON organization TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON app_user TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON membership TO authenticated;

-- ============================================================
-- Policies: organization
-- ============================================================

DROP POLICY IF EXISTS "select_own_orgs" ON organization;
CREATE POLICY "select_own_orgs" ON organization FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM membership m
      WHERE m.organization_id = organization.id
      AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "insert_orgs" ON organization;
CREATE POLICY "insert_orgs" ON organization FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_own_orgs" ON organization;
CREATE POLICY "update_own_orgs" ON organization FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM membership m
      WHERE m.organization_id = organization.id
      AND m.user_id = auth.uid()
      AND m.role IN ('OWNER', 'ADMIN')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM membership m
      WHERE m.organization_id = organization.id
      AND m.user_id = auth.uid()
      AND m.role IN ('OWNER', 'ADMIN')
    )
  );

DROP POLICY IF EXISTS "delete_own_orgs" ON organization;
CREATE POLICY "delete_own_orgs" ON organization FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM membership m
      WHERE m.organization_id = organization.id
      AND m.user_id = auth.uid()
      AND m.role = 'OWNER'
    )
  );

-- ============================================================
-- Policies: app_user
-- ============================================================

DROP POLICY IF EXISTS "select_own_profile" ON app_user;
CREATE POLICY "select_own_profile" ON app_user FOR SELECT
  TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "insert_own_profile" ON app_user;
CREATE POLICY "insert_own_profile" ON app_user FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "update_own_profile" ON app_user;
CREATE POLICY "update_own_profile" ON app_user FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "delete_own_profile" ON app_user;
CREATE POLICY "delete_own_profile" ON app_user FOR DELETE
  TO authenticated USING (auth.uid() = id);

-- ============================================================
-- Policies: membership
-- ============================================================

DROP POLICY IF EXISTS "select_own_memberships" ON membership;
CREATE POLICY "select_own_memberships" ON membership FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM membership m2
      WHERE m2.organization_id = membership.organization_id
      AND m2.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "insert_memberships" ON membership;
CREATE POLICY "insert_memberships" ON membership FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM membership m2
      WHERE m2.organization_id = membership.organization_id
      AND m2.user_id = auth.uid()
      AND m2.role IN ('OWNER', 'ADMIN')
    )
  );

DROP POLICY IF EXISTS "update_memberships" ON membership;
CREATE POLICY "update_memberships" ON membership FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM membership m2
      WHERE m2.organization_id = membership.organization_id
      AND m2.user_id = auth.uid()
      AND m2.role IN ('OWNER', 'ADMIN')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM membership m2
      WHERE m2.organization_id = membership.organization_id
      AND m2.user_id = auth.uid()
      AND m2.role IN ('OWNER', 'ADMIN')
    )
  );

DROP POLICY IF EXISTS "delete_memberships" ON membership;
CREATE POLICY "delete_memberships" ON membership FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM membership m2
      WHERE m2.organization_id = membership.organization_id
      AND m2.user_id = auth.uid()
      AND m2.role = 'OWNER'
    )
  );

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_membership_org ON membership(organization_id);
CREATE INDEX IF NOT EXISTS idx_membership_user ON membership(user_id);

-- ============================================================
-- updated_at triggers
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_organization_updated ON organization;
CREATE TRIGGER trg_organization_updated
  BEFORE UPDATE ON organization
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_app_user_updated ON app_user;
CREATE TRIGGER trg_app_user_updated
  BEFORE UPDATE ON app_user
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_membership_updated ON membership;
CREATE TRIGGER trg_membership_updated
  BEFORE UPDATE ON membership
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
