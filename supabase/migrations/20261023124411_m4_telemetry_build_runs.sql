/*
# M4: DevOps Telemetry — build run ingestion, API keys, idempotent writes

## Purpose
Creates the build_run and project_api_key tables. Build runs are ingested
via an edge function webhook using project API keys. Writes are idempotent
based on an external_run_id provided by the CI system.

## New Tables
1. project_api_key — API keys for authenticating build run ingestion (hashed storage)
2. build_run — Individual build/CI run records with idempotent ingestion

## Security
- project_api_key: RLS enabled, org members SELECT, admins INSERT/DELETE
- build_run: RLS enabled, org members SELECT only; ingestion via SECURITY DEFINER function
- ingest_build_run uses no auth context (CI systems use API keys, not JWTs)

## Functions
- hash_api_key(p_key text) — sha256 hex digest using extensions.digest
- create_api_key(p_project_id, p_name) — generates key, stores hash, returns plaintext once
- lookup_api_key(p_key text) — matches plaintext key to stored hash (for edge function)
- ingest_build_run(p_key, ...) — idempotent build run insertion via API key auth

## Idempotency
- UNIQUE(project_id, external_run_id) constraint
- ingest_build_run returns existing row if (project_id, external_run_id) already exists
*/

-- ============================================================
-- project_api_key table
-- ============================================================

CREATE TABLE IF NOT EXISTS project_api_key (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  key_hash text NOT NULL,
  key_prefix text NOT NULL,
  created_by uuid REFERENCES app_user(id) ON DELETE SET NULL,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, key_hash)
);

ALTER TABLE project_api_key ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, DELETE ON project_api_key TO authenticated;

DROP POLICY IF EXISTS "select_api_keys" ON project_api_key;
CREATE POLICY "select_api_keys" ON project_api_key FOR SELECT
  TO authenticated USING (is_org_member(project_api_key.organization_id, auth.uid()));

DROP POLICY IF EXISTS "insert_api_keys" ON project_api_key;
CREATE POLICY "insert_api_keys" ON project_api_key FOR INSERT
  TO authenticated WITH CHECK (is_org_admin(project_api_key.organization_id, auth.uid()));

DROP POLICY IF EXISTS "delete_api_keys" ON project_api_key;
CREATE POLICY "delete_api_keys" ON project_api_key FOR DELETE
  TO authenticated USING (is_org_admin(project_api_key.organization_id, auth.uid()));

CREATE INDEX IF NOT EXISTS idx_api_key_project ON project_api_key(project_id);
CREATE INDEX IF NOT EXISTS idx_api_key_hash ON project_api_key(key_hash);

-- ============================================================
-- build_run table
-- ============================================================

CREATE TABLE IF NOT EXISTS build_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  external_run_id text NOT NULL,
  branch text NOT NULL,
  commit_sha text NOT NULL CHECK (commit_sha ~ '^[0-9a-f]{7,40}$'),
  status text NOT NULL CHECK (status IN ('SUCCESS', 'FAILED', 'RUNNING', 'CANCELLED')),
  duration_seconds integer NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
  triggered_by text,
  build_url text,
  simulation_dataset_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, external_run_id)
);

ALTER TABLE build_run ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON build_run TO authenticated;

DROP POLICY IF EXISTS "select_build_runs" ON build_run;
CREATE POLICY "select_build_runs" ON build_run FOR SELECT
  TO authenticated USING (is_org_member(build_run.organization_id, auth.uid()));

CREATE INDEX IF NOT EXISTS idx_build_project ON build_run(project_id);
CREATE INDEX IF NOT EXISTS idx_build_created ON build_run(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_build_status ON build_run(project_id, status);

-- ============================================================
-- Functions: API key management
-- ============================================================

CREATE OR REPLACE FUNCTION hash_api_key(p_key text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT encode(extensions.digest(p_key, 'sha256'), 'hex');
$$;

-- create_api_key: generates a random key, stores hash, returns plaintext
CREATE OR REPLACE FUNCTION create_api_key(p_project_id uuid, p_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_project project;
  v_key text;
  v_hash text;
  v_prefix text;
BEGIN
  SELECT * INTO v_project FROM project WHERE id = p_project_id;
  IF v_project IS NULL THEN
    RAISE EXCEPTION 'Project not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT is_org_admin(v_project.organization_id, auth.uid()) THEN
    RAISE EXCEPTION 'Only admins and owners can create API keys' USING ERRCODE = '42501';
  END IF;

  v_key := 'dpk_' || encode(gen_random_bytes(16), 'hex');
  v_hash := hash_api_key(v_key);
  v_prefix := substring(v_key from 1 for 12);

  INSERT INTO project_api_key (organization_id, project_id, name, key_hash, key_prefix, created_by)
  VALUES (v_project.organization_id, p_project_id, p_name, v_hash, v_prefix, auth.uid());

  RETURN v_key;
END;
$$;

REVOKE EXECUTE ON FUNCTION create_api_key(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_api_key(uuid, text) TO authenticated;

-- lookup_api_key: for edge function (no auth context)
CREATE OR REPLACE FUNCTION lookup_api_key(p_key text)
RETURNS project_api_key
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_key project_api_key;
  v_hash text;
BEGIN
  v_hash := hash_api_key(p_key);
  SELECT * INTO v_key FROM project_api_key WHERE key_hash = v_hash;
  IF v_key IS NOT NULL THEN
    UPDATE project_api_key SET last_used_at = now() WHERE id = v_key.id;
  END IF;
  RETURN v_key;
END;
$$;

REVOKE EXECUTE ON FUNCTION lookup_api_key(text) FROM PUBLIC, anon, authenticated;

-- ingest_build_run: idempotent ingestion via API key
CREATE OR REPLACE FUNCTION ingest_build_run(
  p_key text,
  p_external_run_id text,
  p_branch text,
  p_commit_sha text,
  p_status text,
  p_duration_seconds integer DEFAULT 0,
  p_triggered_by text DEFAULT NULL,
  p_build_url text DEFAULT NULL
)
RETURNS build_run
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_api_key project_api_key;
  v_existing build_run;
  v_result build_run;
BEGIN
  SELECT * INTO v_api_key FROM lookup_api_key(p_key);
  IF v_api_key IS NULL THEN
    RAISE EXCEPTION 'Invalid API key' USING ERRCODE = '42501';
  END IF;

  IF p_status NOT IN ('SUCCESS', 'FAILED', 'RUNNING', 'CANCELLED') THEN
    RAISE EXCEPTION 'Invalid status: %', p_status USING ERRCODE = '23514';
  END IF;

  IF p_commit_sha !~ '^[0-9a-f]{7,40}$' THEN
    RAISE EXCEPTION 'Invalid commit SHA' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_existing FROM build_run
  WHERE project_id = v_api_key.project_id AND external_run_id = p_external_run_id;

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  INSERT INTO build_run (
    organization_id, project_id, external_run_id,
    branch, commit_sha, status, duration_seconds,
    triggered_by, build_url
  )
  VALUES (
    v_api_key.organization_id, v_api_key.project_id, p_external_run_id,
    p_branch, p_commit_sha, p_status, p_duration_seconds,
    p_triggered_by, p_build_url
  )
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION ingest_build_run(text, text, text, text, text, integer, text, text) FROM PUBLIC, anon, authenticated;
