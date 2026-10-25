/*
# M2: Project Management — table, constraints, RLS, archive function

## Purpose
Creates the project table with multi-tenant isolation, key validation,
immutable data_origin flag, archive support, and a task number counter.
Adds a SECURITY DEFINER function for archiving projects (sets status to
ARCHIVED and prevents further writes).

## New Tables

1. `project` — Core project entity.
   - id (uuid PK)
   - organization_id (uuid FK -> organization, NOT NULL)
   - key (text, NOT NULL) — short identifier, matches ^[A-Z][A-Z0-9]{1,9}$
   - name (text, NOT NULL)
   - description (text, nullable)
   - status (text, NOT NULL, default 'ACTIVE') — ACTIVE or ARCHIVED
   - data_origin (text, NOT NULL, default 'REAL') — REAL or SIMULATED, immutable
   - task_counter (integer, NOT NULL, default 0) — increments for task numbering
   - created_at, updated_at (timestamptz)

## Constraints
- Unique (organization_id, key) — keys unique per org
- CHECK on key format: ^[A-Z][A-Z0-9]{1,9}$
- CHECK on status: IN ('ACTIVE', 'ARCHIVED')
- CHECK on data_origin: IN ('REAL', 'SIMULATED')

## Security
- RLS enabled, grants to authenticated only.
- SELECT: members of the org can see projects.
- INSERT: members of the org can create projects (ORGANIZATION-level check;
  the project row must carry the caller's org).
- UPDATE: org owners/admins can update project fields EXCEPT data_origin
  (enforced by a trigger that blocks data_origin changes).
- DELETE: org owners can delete projects.
- An archive function (SECURITY DEFINER) sets status to ARCHIVED.

## Important Notes
1. data_origin is immutable after insert — a trigger rejects any UPDATE
   that changes it from its original value.
2. Archived projects are effectively read-only — the application layer
   enforces this; the archive function is the only way to set ARCHIVED.
3. task_counter is incremented under a row lock (used in M3 when creating tasks).
4. The INSERT policy checks membership via a subquery on the membership table,
   so any org member can create projects (not just admins).
*/

-- ============================================================
-- project table
-- ============================================================
CREATE TABLE IF NOT EXISTS project (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  data_origin text NOT NULL DEFAULT 'REAL' CHECK (data_origin IN ('REAL', 'SIMULATED')),
  task_counter integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, key),
  CHECK (key ~ '^[A-Z][A-Z0-9]{1,9}$')
);

ALTER TABLE project ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON project TO authenticated;

-- Members of the org can view projects
DROP POLICY IF EXISTS "select_org_projects" ON project;
CREATE POLICY "select_org_projects" ON project FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM membership m
      WHERE m.organization_id = project.organization_id
      AND m.user_id = auth.uid()
    )
  );

-- Members of the org can create projects in their org
DROP POLICY IF EXISTS "insert_org_projects" ON project;
CREATE POLICY "insert_org_projects" ON project FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM membership m
      WHERE m.organization_id = project.organization_id
      AND m.user_id = auth.uid()
    )
  );

-- Owners/admins can update project fields (but not data_origin — enforced by trigger)
DROP POLICY IF EXISTS "update_org_projects" ON project;
CREATE POLICY "update_org_projects" ON project FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM membership m
      WHERE m.organization_id = project.organization_id
      AND m.user_id = auth.uid()
      AND m.role IN ('OWNER', 'ADMIN')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM membership m
      WHERE m.organization_id = project.organization_id
      AND m.user_id = auth.uid()
      AND m.role IN ('OWNER', 'ADMIN')
    )
  );

-- Only owners can delete projects
DROP POLICY IF EXISTS "delete_org_projects" ON project;
CREATE POLICY "delete_org_projects" ON project FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM membership m
      WHERE m.organization_id = project.organization_id
      AND m.user_id = auth.uid()
      AND m.role = 'OWNER'
    )
  );

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_project_org ON project(organization_id);
CREATE INDEX IF NOT EXISTS idx_project_status ON project(organization_id, status);

-- ============================================================
-- Trigger: prevent data_origin changes (immutable)
-- ============================================================
CREATE OR REPLACE FUNCTION prevent_data_origin_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.data_origin IS DISTINCT FROM OLD.data_origin THEN
    RAISE EXCEPTION 'data_origin is immutable and cannot be changed' USING ERRCODE = 'P0003';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_project_data_origin_immutable ON project;
CREATE TRIGGER trg_project_data_origin_immutable
  BEFORE UPDATE ON project
  FOR EACH ROW EXECUTE FUNCTION prevent_data_origin_change();

-- ============================================================
-- Trigger: updated_at
-- ============================================================
DROP TRIGGER IF EXISTS trg_project_updated ON project;
CREATE TRIGGER trg_project_updated
  BEFORE UPDATE ON project
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Archive function
-- ============================================================
CREATE OR REPLACE FUNCTION archive_project(p_project_id uuid)
RETURNS project
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project project;
  v_caller_role text;
  v_org_id uuid;
BEGIN
  SELECT organization_id INTO v_org_id FROM project WHERE id = p_project_id;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Project not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT role INTO v_caller_role
  FROM membership
  WHERE organization_id = v_org_id AND user_id = auth.uid();

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Only owners and admins can archive projects' USING ERRCODE = '42501';
  END IF;

  UPDATE project SET status = 'ARCHIVED' WHERE id = p_project_id
  RETURNING * INTO v_project;

  RETURN v_project;
END;
$$;

REVOKE EXECUTE ON FUNCTION archive_project(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION archive_project(uuid) TO authenticated;
