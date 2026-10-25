/*
# M5: AI Assistance — interaction logging, quota enforcement, Claude proxy

## Purpose
Creates the ai_interaction table for logging every AI request/response cycle,
plus SECURITY DEFINER functions for atomic quota checking and interaction logging.
The edge function `ai-assist` will call Claude's API, enforce per-org quotas,
and record every interaction.

## New Table: ai_interaction
- id (uuid PK)
- organization_id (uuid FK -> organization, CASCADE)
- project_id (uuid FK -> project, CASCADE) — optional, for project-scoped requests
- user_id (uuid FK -> app_user, SET NULL) — who triggered the interaction
- request_type (text) — 'TASK_REFINEMENT' | 'SPRINT_SUMMARY'
- request_payload (jsonb) — the input sent to Claude (task data, sprint data, etc.)
- response_payload (jsonb) — Claude's response
- status (text) — 'PENDING' | 'COMPLETED' | 'FAILED'
- decision (text) — 'ACCEPTED' | 'REJECTED' | 'NONE' (user's decision on AI suggestion)
- error_message (text, nullable) — if status is FAILED
- tokens_used (integer, default 0) — approximate token count
- created_at (timestamptz)

## Functions
1. check_ai_quota(p_org_id uuid) — SECURITY DEFINER
   Checks if AI is enabled for the org and if quota allows another request.
   If allowed, atomically increments ai_requests_this_period.
   Returns boolean.

2. log_ai_interaction(p_org_id, p_user_id, p_request_type, p_request_payload,
   p_response_payload, p_status, p_error_message, p_tokens_used, p_project_id)
   — SECURITY DEFINER, inserts an ai_interaction row.

3. update_ai_decision(p_interaction_id uuid, p_decision text)
   — SECURITY DEFINER, updates the decision column on an interaction.
   Only the user who created the interaction or an org admin can update it.

## Security
- ai_interaction: RLS enabled, org members can SELECT
- INSERT/UPDATE only via SECURITY DEFINER functions (edge function uses service role)
- check_ai_quota: callable by authenticated (called from frontend to check remaining quota)
- log_ai_interaction / update_ai_decision: revoked from PUBLIC/anon/authenticated
  (only the edge function with service role key calls these)

## Quota Logic
- Monthly quota: 100 requests per org (configurable)
- ai_requests_this_period counter on organization is incremented atomically
- ai_quota_reset_at: if current time > reset time, counter resets to 0 and
  reset_at moves forward by 30 days
*/

-- ============================================================
-- ai_interaction table
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_interaction (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  project_id uuid REFERENCES project(id) ON DELETE CASCADE,
  user_id uuid REFERENCES app_user(id) ON DELETE SET NULL,
  request_type text NOT NULL CHECK (request_type IN ('TASK_REFINEMENT', 'SPRINT_SUMMARY')),
  request_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_payload jsonb,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED')),
  decision text NOT NULL DEFAULT 'NONE' CHECK (decision IN ('ACCEPTED', 'REJECTED', 'NONE')),
  error_message text,
  tokens_used integer NOT NULL DEFAULT 0 CHECK (tokens_used >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ai_interaction ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON ai_interaction TO authenticated;

DROP POLICY IF EXISTS "select_ai_interactions" ON ai_interaction;
CREATE POLICY "select_ai_interactions" ON ai_interaction FOR SELECT
  TO authenticated USING (is_org_member(ai_interaction.organization_id, auth.uid()));

CREATE INDEX IF NOT EXISTS idx_ai_interaction_org ON ai_interaction(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_interaction_project ON ai_interaction(project_id);

-- ============================================================
-- Functions: Quota enforcement
-- ============================================================

CREATE OR REPLACE FUNCTION check_ai_quota(p_org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org organization;
  v_quota_limit integer := 100;
  v_reset_needed boolean := false;
BEGIN
  SELECT * INTO v_org FROM organization WHERE id = p_org_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Organization not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT v_org.ai_enabled THEN
    RETURN false;
  END IF;

  -- Check if quota needs reset (monthly cycle)
  IF v_org.ai_quota_reset_at IS NULL OR now() >= v_org.ai_quota_reset_at THEN
    v_reset_needed := true;
  END IF;

  -- Reset quota if needed, then check
  IF v_reset_needed THEN
    UPDATE organization
    SET ai_requests_this_period = 0,
        ai_quota_reset_at = now() + INTERVAL '30 days'
    WHERE id = p_org_id;
    v_org.ai_requests_this_period := 0;
  END IF;

  -- Check quota
  IF v_org.ai_requests_this_period >= v_quota_limit THEN
    RETURN false;
  END IF;

  -- Atomically increment
  UPDATE organization
  SET ai_requests_this_period = ai_requests_this_period + 1
  WHERE id = p_org_id;

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION check_ai_quota(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION check_ai_quota(uuid) TO authenticated;

-- ============================================================
-- Functions: Interaction logging
-- ============================================================

CREATE OR REPLACE FUNCTION log_ai_interaction(
  p_org_id uuid,
  p_user_id uuid,
  p_request_type text,
  p_request_payload jsonb,
  p_response_payload jsonb DEFAULT NULL,
  p_status text DEFAULT 'PENDING',
  p_error_message text DEFAULT NULL,
  p_tokens_used integer DEFAULT 0,
  p_project_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO ai_interaction (
    organization_id, project_id, user_id,
    request_type, request_payload, response_payload,
    status, error_message, tokens_used
  )
  VALUES (
    p_org_id, p_project_id, p_user_id,
    p_request_type, p_request_payload, p_response_payload,
    p_status, p_error_message, p_tokens_used
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION log_ai_interaction(uuid, uuid, text, jsonb, jsonb, text, text, integer, uuid) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- Functions: Update AI decision
-- ============================================================

CREATE OR REPLACE FUNCTION update_ai_decision(
  p_interaction_id uuid,
  p_decision text,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_interaction ai_interaction;
BEGIN
  SELECT * INTO v_interaction FROM ai_interaction WHERE id = p_interaction_id;
  IF v_interaction IS NULL THEN
    RAISE EXCEPTION 'Interaction not found' USING ERRCODE = 'P0002';
  END IF;

  -- Only the original user or an org admin can update the decision
  IF v_interaction.user_id != p_user_id
     AND NOT is_org_admin(v_interaction.organization_id, p_user_id) THEN
    RAISE EXCEPTION 'Not authorized to update this interaction' USING ERRCODE = '42501';
  END IF;

  IF p_decision NOT IN ('ACCEPTED', 'REJECTED', 'NONE') THEN
    RAISE EXCEPTION 'Invalid decision value' USING ERRCODE = '23514';
  END IF;

  UPDATE ai_interaction SET decision = p_decision WHERE id = p_interaction_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION update_ai_decision(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION update_ai_decision(uuid, text, uuid) TO authenticated;
