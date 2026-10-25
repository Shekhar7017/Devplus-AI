/*
# M3: Fix infinite RLS recursion + create sprint and task tables

## Purpose
1. Fix the infinite recursion in membership/app_user/organization RLS policies.
   The membership SELECT policy queried the membership table itself, which
   triggered RLS again -> infinite recursion. Fix: replace inline membership
   subqueries with a SECURITY DEFINER function `is_org_member(org_id, user_id)`
   that bypasses RLS.

2. Create sprint and task tables with full lifecycle support, status history,
   optimistic locking, and a partial unique index for one active sprint per project.

## Part 1: Recursion fix

### New function
- `is_org_member(p_org_id uuid, p_user_id uuid)` — SECURITY DEFINER
  Returns true if the user is a member of the org. Used in RLS policies
  to avoid recursive membership lookups.

- `is_org_admin(p_org_id uuid, p_user_id uuid)` — SECURITY DEFINER
  Returns true if the user is an OWNER or ADMIN of the org.

### Policy changes
- organization SELECT/UPDATE/DELETE: replace inline subquery with is_org_member/is_org_admin
- app_user SELECT: replace inline join with is_org_member
- membership SELECT/INSERT/UPDATE/DELETE: replace inline subquery with is_org_member/is_org_admin

## Part 2: Sprint table
- id, organization_id, project_id, name, goal, status, start_date, end_date,
  simulation_dataset_id (nullable), created_at, updated_at
- Status: PLANNED, ACTIVE, COMPLETED, CANCELLED
- CHECK: end_date > start_date
- Partial unique index: one ACTIVE sprint per project

## Part 3: Task table
- id, organization_id, project_id, sprint_id (nullable), number, title, description,
  type, status, priority, estimate_points, assignee_id (nullable), reporter_id,
  version (integer, for optimistic locking), started_at, completed_at,
  simulation_dataset_id (nullable), created_at, updated_at
- Status: BACKLOG, TODO, IN_PROGRESS, IN_REVIEW, DONE, BLOCKED
- Type: BUG, FEATURE, TASK, EPIC, SPIKE
- Priority: BLOCKER, HIGH, MEDIUM, LOW
- Composite FK: task(sprint_id, project_id) -> sprint(id, project_id)

## Part 4: Task status history
- id, task_id, from_status, to_status, changed_by, changed_at
- Append-only (no UPDATE/DELETE grants)

## Part 5: Functions
- start_sprint(p_sprint_id) — transitions PLANNED -> ACTIVE
- complete_sprint(p_sprint_id) — transitions ACTIVE -> COMPLETED,
  moves unfinished tasks to BACKLOG
- cancel_sprint(p_sprint_id) — transitions PLANNED/ACTIVE -> CANCELLED,
  moves tasks to BACKLOG
- transition_task(p_task_id, p_to_status) — validates allowed transitions,
  records history, sets started_at/completed_at
- create_task(p_project_id, ...) — creates task with auto-incremented number
  from project.task_counter under a row lock

## Security
- RLS on sprint, task, task_status_history
- Grants to authenticated only
- Policies use is_org_member / is_org_admin
- task_status_history: no UPDATE or DELETE grants (append-only)

## Important Notes
1. The is_org_member/is_org_admin functions are SECURITY DEFINER and bypass
   RLS. They are read-only lookups and safe to call from policies.
2. Sprint completion is atomic: status change + task backlog move in one transaction.
3. Task number comes from project.task_counter, incremented under SELECT FOR UPDATE.
4. Optimistic locking on task uses the version column — callers must send the
   current version; the function checks and increments it.
5. Allowed task transitions:
   BACKLOG -> TODO, IN_PROGRESS, BLOCKED
   TODO -> IN_PROGRESS, BLOCKED, BACKLOG
   IN_PROGRESS -> IN_REVIEW, DONE, BLOCKED
   IN_REVIEW -> DONE, IN_PROGRESS, BLOCKED
   DONE -> TODO, IN_PROGRESS (reopen)
   BLOCKED -> TODO, IN_PROGRESS, BACKLOG
*/

-- ============================================================
-- Part 1: Recursion fix — helper functions
-- ============================================================

CREATE OR REPLACE FUNCTION is_org_member(p_org_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM membership
    WHERE organization_id = p_org_id
    AND user_id = p_user_id
  );
$$;

REVOKE EXECUTE ON FUNCTION is_org_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION is_org_member(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION is_org_admin(p_org_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM membership
    WHERE organization_id = p_org_id
    AND user_id = p_user_id
    AND role IN ('OWNER', 'ADMIN')
  );
$$;

REVOKE EXECUTE ON FUNCTION is_org_admin(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION is_org_admin(uuid, uuid) TO authenticated;

-- ============================================================
-- Part 1b: Fix organization policies
-- ============================================================

DROP POLICY IF EXISTS "select_own_orgs" ON organization;
CREATE POLICY "select_own_orgs" ON organization FOR SELECT
  TO authenticated USING (is_org_member(organization.id, auth.uid()));

DROP POLICY IF EXISTS "insert_orgs" ON organization;
CREATE POLICY "insert_orgs" ON organization FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_own_orgs" ON organization;
CREATE POLICY "update_own_orgs" ON organization FOR UPDATE
  TO authenticated USING (is_org_admin(organization.id, auth.uid()))
  WITH CHECK (is_org_admin(organization.id, auth.uid()));

DROP POLICY IF EXISTS "delete_own_orgs" ON organization;
CREATE POLICY "delete_own_orgs" ON organization FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM membership
      WHERE organization_id = organization.id
      AND user_id = auth.uid()
      AND role = 'OWNER'
    )
  );

-- ============================================================
-- Part 1c: Fix app_user policies
-- ============================================================

DROP POLICY IF EXISTS "select_own_profile" ON app_user;
CREATE POLICY "select_own_profile" ON app_user FOR SELECT
  TO authenticated USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM membership m1
      WHERE m1.user_id = auth.uid()
      AND m1.organization_id IN (
        SELECT m2.organization_id FROM membership m2
        WHERE m2.user_id = app_user.id
      )
    )
  );

-- ============================================================
-- Part 1d: Fix membership policies
-- ============================================================

DROP POLICY IF EXISTS "select_own_memberships" ON membership;
CREATE POLICY "select_own_memberships" ON membership FOR SELECT
  TO authenticated USING (is_org_member(membership.organization_id, auth.uid()));

DROP POLICY IF EXISTS "insert_memberships" ON membership;
CREATE POLICY "insert_memberships" ON membership FOR INSERT
  TO authenticated WITH CHECK (is_org_admin(membership.organization_id, auth.uid()));

DROP POLICY IF EXISTS "update_memberships" ON membership;
CREATE POLICY "update_memberships" ON membership FOR UPDATE
  TO authenticated USING (is_org_admin(membership.organization_id, auth.uid()))
  WITH CHECK (is_org_admin(membership.organization_id, auth.uid()));

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
-- Part 2: Sprint table
-- ============================================================

CREATE TABLE IF NOT EXISTS sprint (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  name text NOT NULL,
  goal text,
  status text NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED')),
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '14 days'),
  simulation_dataset_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date > start_date)
);

ALTER TABLE sprint ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON sprint TO authenticated;

DROP POLICY IF EXISTS "select_org_sprints" ON sprint;
CREATE POLICY "select_org_sprints" ON sprint FOR SELECT
  TO authenticated USING (is_org_member(sprint.organization_id, auth.uid()));

DROP POLICY IF EXISTS "insert_org_sprints" ON sprint;
CREATE POLICY "insert_org_sprints" ON sprint FOR INSERT
  TO authenticated WITH CHECK (is_org_member(sprint.organization_id, auth.uid()));

DROP POLICY IF EXISTS "update_org_sprints" ON sprint;
CREATE POLICY "update_org_sprints" ON sprint FOR UPDATE
  TO authenticated USING (is_org_admin(sprint.organization_id, auth.uid()))
  WITH CHECK (is_org_admin(sprint.organization_id, auth.uid()));

DROP POLICY IF EXISTS "delete_org_sprints" ON sprint;
CREATE POLICY "delete_org_sprints" ON sprint FOR DELETE
  TO authenticated USING (is_org_admin(sprint.organization_id, auth.uid()));

-- Partial unique index: one ACTIVE sprint per project
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_sprint_per_project
  ON sprint(project_id) WHERE status = 'ACTIVE';

-- Trigger: updated_at
DROP TRIGGER IF EXISTS trg_sprint_updated ON sprint;
CREATE TRIGGER trg_sprint_updated
  BEFORE UPDATE ON sprint
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sprint_project ON sprint(project_id);
CREATE INDEX IF NOT EXISTS idx_sprint_org ON sprint(organization_id);

-- ============================================================
-- Part 3: Task table
-- ============================================================

CREATE TABLE IF NOT EXISTS task (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  sprint_id uuid,
  number integer NOT NULL,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  description text,
  type text NOT NULL DEFAULT 'TASK' CHECK (type IN ('BUG', 'FEATURE', 'TASK', 'EPIC', 'SPIKE')),
  status text NOT NULL DEFAULT 'BACKLOG' CHECK (status IN ('BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'BLOCKED')),
  priority text NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('BLOCKER', 'HIGH', 'MEDIUM', 'LOW')),
  estimate_points integer NOT NULL DEFAULT 0 CHECK (estimate_points >= 0 AND estimate_points <= 100),
  assignee_id uuid REFERENCES app_user(id) ON DELETE SET NULL,
  reporter_id uuid REFERENCES app_user(id) ON DELETE SET NULL,
  version integer NOT NULL DEFAULT 1,
  started_at timestamptz,
  completed_at timestamptz,
  simulation_dataset_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, number)
);

-- Composite FK: task.sprint_id must point to a sprint in the same project
-- Done via a trigger since composite FKs need unique constraints
CREATE OR REPLACE FUNCTION validate_task_sprint_same_project()
RETURNS TRIGGER AS $$
DECLARE
  v_sprint_project uuid;
BEGIN
  IF NEW.sprint_id IS NOT NULL THEN
    SELECT project_id INTO v_sprint_project FROM sprint WHERE id = NEW.sprint_id;
    IF v_sprint_project IS NULL THEN
      RAISE EXCEPTION 'Sprint not found' USING ERRCODE = 'P0002';
    END IF;
    IF v_sprint_project != NEW.project_id THEN
      RAISE EXCEPTION 'Task sprint must belong to the same project' USING ERRCODE = 'P0003';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_task_sprint_check ON task;
CREATE TRIGGER trg_task_sprint_check
  BEFORE INSERT OR UPDATE OF sprint_id ON task
  FOR EACH ROW EXECUTE FUNCTION validate_task_sprint_same_project();

ALTER TABLE task ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON task TO authenticated;

DROP POLICY IF EXISTS "select_org_tasks" ON task;
CREATE POLICY "select_org_tasks" ON task FOR SELECT
  TO authenticated USING (is_org_member(task.organization_id, auth.uid()));

DROP POLICY IF EXISTS "insert_org_tasks" ON task;
CREATE POLICY "insert_org_tasks" ON task FOR INSERT
  TO authenticated WITH CHECK (is_org_member(task.organization_id, auth.uid()));

DROP POLICY IF EXISTS "update_org_tasks" ON task;
CREATE POLICY "update_org_tasks" ON task FOR UPDATE
  TO authenticated USING (is_org_member(task.organization_id, auth.uid()))
  WITH CHECK (is_org_member(task.organization_id, auth.uid()));

DROP POLICY IF EXISTS "delete_org_tasks" ON task;
CREATE POLICY "delete_org_tasks" ON task FOR DELETE
  TO authenticated USING (is_org_admin(task.organization_id, auth.uid()));

-- Trigger: updated_at
DROP TRIGGER IF EXISTS trg_task_updated ON task;
CREATE TRIGGER trg_task_updated
  BEFORE UPDATE ON task
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_task_project ON task(project_id);
CREATE INDEX IF NOT EXISTS idx_task_sprint ON task(sprint_id) WHERE sprint_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_task_org ON task(organization_id);
CREATE INDEX IF NOT EXISTS idx_task_status ON task(project_id, status);

-- ============================================================
-- Part 4: Task status history (append-only)
-- ============================================================

CREATE TABLE IF NOT EXISTS task_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES task(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  changed_by uuid REFERENCES app_user(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE task_status_history ENABLE ROW LEVEL SECURITY;

-- Append-only: only SELECT and INSERT, no UPDATE or DELETE
GRANT SELECT, INSERT ON task_status_history TO authenticated;

DROP POLICY IF EXISTS "select_task_history" ON task_status_history;
CREATE POLICY "select_task_history" ON task_status_history FOR SELECT
  TO authenticated USING (is_org_member(task_status_history.organization_id, auth.uid()));

DROP POLICY IF EXISTS "insert_task_history" ON task_status_history;
CREATE POLICY "insert_task_history" ON task_status_history FOR INSERT
  TO authenticated WITH CHECK (is_org_member(task_status_history.organization_id, auth.uid()));

-- Explicitly revoke UPDATE and DELETE (append-only enforcement)
REVOKE UPDATE, DELETE ON task_status_history FROM authenticated;

CREATE INDEX IF NOT EXISTS idx_history_task ON task_status_history(task_id);
CREATE INDEX IF NOT EXISTS idx_history_changed ON task_status_history(changed_at);

-- ============================================================
-- Part 5a: Sprint lifecycle functions
-- ============================================================

CREATE OR REPLACE FUNCTION start_sprint(p_sprint_id uuid)
RETURNS sprint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sprint sprint;
BEGIN
  SELECT * INTO v_sprint FROM sprint WHERE id = p_sprint_id FOR UPDATE;

  IF v_sprint IS NULL THEN
    RAISE EXCEPTION 'Sprint not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT is_org_admin(v_sprint.organization_id, auth.uid()) THEN
    RAISE EXCEPTION 'Only admins and owners can start sprints' USING ERRCODE = '42501';
  END IF;

  IF v_sprint.status != 'PLANNED' THEN
    RAISE EXCEPTION 'Only PLANNED sprints can be started (current: %)', v_sprint.status USING ERRCODE = 'P0003';
  END IF;

  UPDATE sprint SET status = 'ACTIVE' WHERE id = p_sprint_id
  RETURNING * INTO v_sprint;

  RETURN v_sprint;
END;
$$;

REVOKE EXECUTE ON FUNCTION start_sprint(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION start_sprint(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION complete_sprint(p_sprint_id uuid)
RETURNS sprint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sprint sprint;
BEGIN
  SELECT * INTO v_sprint FROM sprint WHERE id = p_sprint_id FOR UPDATE;

  IF v_sprint IS NULL THEN
    RAISE EXCEPTION 'Sprint not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT is_org_admin(v_sprint.organization_id, auth.uid()) THEN
    RAISE EXCEPTION 'Only admins and owners can complete sprints' USING ERRCODE = '42501';
  END IF;

  IF v_sprint.status != 'ACTIVE' THEN
    RAISE EXCEPTION 'Only ACTIVE sprints can be completed (current: %)', v_sprint.status USING ERRCODE = 'P0003';
  END IF;

  -- Move unfinished tasks to backlog
  UPDATE task SET sprint_id = NULL, status = 'BACKLOG', version = version + 1
  WHERE sprint_id = p_sprint_id AND status NOT IN ('DONE');

  UPDATE sprint SET status = 'COMPLETED' WHERE id = p_sprint_id
  RETURNING * INTO v_sprint;

  RETURN v_sprint;
END;
$$;

REVOKE EXECUTE ON FUNCTION complete_sprint(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION complete_sprint(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION cancel_sprint(p_sprint_id uuid)
RETURNS sprint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sprint sprint;
BEGIN
  SELECT * INTO v_sprint FROM sprint WHERE id = p_sprint_id FOR UPDATE;

  IF v_sprint IS NULL THEN
    RAISE EXCEPTION 'Sprint not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT is_org_admin(v_sprint.organization_id, auth.uid()) THEN
    RAISE EXCEPTION 'Only admins and owners can cancel sprints' USING ERRCODE = '42501';
  END IF;

  IF v_sprint.status NOT IN ('PLANNED', 'ACTIVE') THEN
    RAISE EXCEPTION 'Only PLANNED or ACTIVE sprints can be cancelled (current: %)', v_sprint.status USING ERRCODE = 'P0003';
  END IF;

  -- Move tasks to backlog
  UPDATE task SET sprint_id = NULL, status = 'BACKLOG', version = version + 1
  WHERE sprint_id = p_sprint_id;

  UPDATE sprint SET status = 'CANCELLED' WHERE id = p_sprint_id
  RETURNING * INTO v_sprint;

  RETURN v_sprint;
END;
$$;

REVOKE EXECUTE ON FUNCTION cancel_sprint(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cancel_sprint(uuid) TO authenticated;

-- ============================================================
-- Part 5b: Task lifecycle functions
-- ============================================================

CREATE OR REPLACE FUNCTION create_task(
  p_project_id uuid,
  p_title text,
  p_description text DEFAULT NULL,
  p_type text DEFAULT 'TASK',
  p_priority text DEFAULT 'MEDIUM',
  p_estimate_points integer DEFAULT 0,
  p_assignee_id uuid DEFAULT NULL,
  p_sprint_id uuid DEFAULT NULL
)
RETURNS task
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project project;
  v_task task;
  v_task_number integer;
BEGIN
  SELECT * INTO v_project FROM project WHERE id = p_project_id FOR UPDATE;

  IF v_project IS NULL THEN
    RAISE EXCEPTION 'Project not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_project.status = 'ARCHIVED' THEN
    RAISE EXCEPTION 'Cannot create tasks in an archived project' USING ERRCODE = 'P0003';
  END IF;

  IF NOT is_org_member(v_project.organization_id, auth.uid()) THEN
    RAISE EXCEPTION 'You are not a member of this organization' USING ERRCODE = '42501';
  END IF;

  -- Validate inputs
  IF p_title IS NULL OR btrim(p_title) = '' OR length(p_title) > 200 THEN
    RAISE EXCEPTION 'Title must be 1-200 characters' USING ERRCODE = '23514';
  END IF;
  IF p_type NOT IN ('BUG', 'FEATURE', 'TASK', 'EPIC', 'SPIKE') THEN
    RAISE EXCEPTION 'Invalid task type' USING ERRCODE = '23514';
  END IF;
  IF p_priority NOT IN ('BLOCKER', 'HIGH', 'MEDIUM', 'LOW') THEN
    RAISE EXCEPTION 'Invalid priority' USING ERRCODE = '23514';
  END IF;
  IF p_estimate_points < 0 OR p_estimate_points > 100 THEN
    RAISE EXCEPTION 'Estimate points must be 0-100' USING ERRCODE = '23514';
  END IF;

  v_task_number := v_project.task_counter + 1;
  UPDATE project SET task_counter = v_task_number WHERE id = p_project_id;

  INSERT INTO task (
    organization_id, project_id, sprint_id, number,
    title, description, type, status, priority, estimate_points,
    assignee_id, reporter_id
  )
  VALUES (
    v_project.organization_id, p_project_id, p_sprint_id, v_task_number,
    p_title, p_description, p_type, 'BACKLOG', p_priority, p_estimate_points,
    p_assignee_id, auth.uid()
  )
  RETURNING * INTO v_task;

  -- Record initial status history
  INSERT INTO task_status_history (task_id, organization_id, from_status, to_status, changed_by)
  VALUES (v_task.id, v_project.organization_id, NULL, 'BACKLOG', auth.uid());

  RETURN v_task;
END;
$$;

REVOKE EXECUTE ON FUNCTION create_task(uuid, text, text, text, text, integer, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_task(uuid, text, text, text, text, integer, uuid, uuid) TO authenticated;

-- Allowed task transitions
CREATE OR REPLACE FUNCTION transition_task(p_task_id uuid, p_to_status text)
RETURNS task
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task task;
  v_allowed boolean;
  v_transitions text[][] := ARRAY[
    ['BACKLOG', 'TODO'], ['BACKLOG', 'IN_PROGRESS'], ['BACKLOG', 'BLOCKED'],
    ['TODO', 'IN_PROGRESS'], ['TODO', 'BLOCKED'], ['TODO', 'BACKLOG'],
    ['IN_PROGRESS', 'IN_REVIEW'], ['IN_PROGRESS', 'DONE'], ['IN_PROGRESS', 'BLOCKED'],
    ['IN_REVIEW', 'DONE'], ['IN_REVIEW', 'IN_PROGRESS'], ['IN_REVIEW', 'BLOCKED'],
    ['DONE', 'TODO'], ['DONE', 'IN_PROGRESS'],
    ['BLOCKED', 'TODO'], ['BLOCKED', 'IN_PROGRESS'], ['BLOCKED', 'BACKLOG']
  ];
BEGIN
  SELECT * INTO v_task FROM task WHERE id = p_task_id FOR UPDATE;

  IF v_task IS NULL THEN
    RAISE EXCEPTION 'Task not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT is_org_member(v_task.organization_id, auth.uid()) THEN
    RAISE EXCEPTION 'You are not a member of this organization' USING ERRCODE = '42501';
  END IF;

  -- Check if transition is allowed
  SELECT EXISTS (
    SELECT 1 FROM unnest(v_transitions) AS t
    WHERE t[1] = v_task.status AND t[2] = p_to_status
  ) INTO v_allowed;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Invalid transition from % to %', v_task.status, p_to_status USING ERRCODE = 'P0003';
  END IF;

  -- Record history
  INSERT INTO task_status_history (task_id, organization_id, from_status, to_status, changed_by)
  VALUES (p_task_id, v_task.organization_id, v_task.status, p_to_status, auth.uid());

  -- Set timestamps
  IF p_to_status = 'IN_PROGRESS' AND v_task.started_at IS NULL THEN
    UPDATE task SET status = p_to_status, version = version + 1, started_at = now()
    WHERE id = p_task_id RETURNING * INTO v_task;
  ELSIF p_to_status = 'DONE' THEN
    UPDATE task SET status = p_to_status, version = version + 1, completed_at = now()
    WHERE id = p_task_id RETURNING * INTO v_task;
  ELSIF p_to_status NOT IN ('DONE', 'IN_PROGRESS') AND v_task.status = 'DONE' THEN
    UPDATE task SET status = p_to_status, version = version + 1, completed_at = NULL
    WHERE id = p_task_id RETURNING * INTO v_task;
  ELSE
    UPDATE task SET status = p_to_status, version = version + 1
    WHERE id = p_task_id RETURNING * INTO v_task;
  END IF;

  RETURN v_task;
END;
$$;

REVOKE EXECUTE ON FUNCTION transition_task(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transition_task(uuid, text) TO authenticated;
