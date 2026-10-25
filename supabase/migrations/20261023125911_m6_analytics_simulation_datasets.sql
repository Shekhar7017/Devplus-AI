/*
# M6: HAISDM Analytics — simulation datasets + seeded generator

## Purpose
Creates the simulation_dataset table for tracking generated simulation data
and a SECURITY DEFINER function that seeds a project with realistic simulated
sprints, tasks, and build runs. This enables the analytics page to display
metrics with data origin labelling (REAL vs SIMULATED).

## New Table: simulation_dataset
- id (uuid PK)
- organization_id (uuid FK -> organization, CASCADE)
- project_id (uuid FK -> project, CASCADE)
- name (text) — human label for the dataset
- seed (integer) — random seed used for reproducibility
- sprint_count (integer) — number of sprints generated
- task_count (integer) — number of tasks generated
- build_count (integer) — number of build runs generated
- created_by (uuid FK -> app_user, SET NULL)
- created_at (timestamptz)

## Function: generate_simulation_data
- p_project_id uuid, p_seed integer, p_sprint_count integer
- SECURITY DEFINER — needs to insert into sprint, task, build_run, task_status_history
- Generates reproducible random data using the seed
- Creates sprints with realistic dates (2-week sprints going back in time)
- Creates tasks per sprint with varied types, priorities, statuses, estimates
- Marks all generated records with simulation_dataset_id
- Creates build runs with varied statuses and durations
- Returns a summary record with counts

## Security
- simulation_dataset: RLS enabled, org members SELECT, org admins INSERT/DELETE
- generate_simulation_data: callable by authenticated (checks admin inside)
- All generated sprints/tasks/build_runs inherit the org's RLS policies
*/

-- ============================================================
-- simulation_dataset table
-- ============================================================

CREATE TABLE IF NOT EXISTS simulation_dataset (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  seed integer NOT NULL,
  sprint_count integer NOT NULL DEFAULT 0,
  task_count integer NOT NULL DEFAULT 0,
  build_count integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES app_user(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE simulation_dataset ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, DELETE ON simulation_dataset TO authenticated;

DROP POLICY IF EXISTS "select_sim_datasets" ON simulation_dataset;
CREATE POLICY "select_sim_datasets" ON simulation_dataset FOR SELECT
  TO authenticated USING (is_org_member(simulation_dataset.organization_id, auth.uid()));

DROP POLICY IF EXISTS "insert_sim_datasets" ON simulation_dataset;
CREATE POLICY "insert_sim_datasets" ON simulation_dataset FOR INSERT
  TO authenticated WITH CHECK (is_org_admin(simulation_dataset.organization_id, auth.uid()));

DROP POLICY IF EXISTS "delete_sim_datasets" ON simulation_dataset;
CREATE POLICY "delete_sim_datasets" ON simulation_dataset FOR DELETE
  TO authenticated USING (is_org_admin(simulation_dataset.organization_id, auth.uid()));

CREATE INDEX IF NOT EXISTS idx_sim_dataset_project ON simulation_dataset(project_id);

-- ============================================================
-- Function: generate_simulation_data
-- ============================================================

CREATE OR REPLACE FUNCTION generate_simulation_data(
  p_project_id uuid,
  p_seed integer DEFAULT 42,
  p_sprint_count integer DEFAULT 5
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project project;
  v_dataset_id uuid;
  v_sprint_id uuid;
  v_task_id uuid;
  v_task_num integer;
  v_i integer;
  v_j integer;
  v_task_count integer := 0;
  v_build_count integer := 0;
  v_sprint_start date;
  v_sprint_end date;
  v_base_date date := CURRENT_DATE;
  v_task_types text[] := ARRAY['BUG', 'FEATURE', 'TASK', 'EPIC', 'SPIKE'];
  v_task_priorities text[] := ARRAY['BLOCKER', 'HIGH', 'MEDIUM', 'LOW'];
  v_task_statuses text[] := ARRAY['BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'BLOCKED'];
  v_build_statuses text[] := ARRAY['SUCCESS', 'FAILED', 'RUNNING', 'CANCELLED'];
  v_branches text[] := ARRAY['main', 'develop', 'feature/auth', 'feature/api', 'fix/login', 'refactor/db'];
  v_rand double precision;
  v_task_count_per_sprint integer;
  v_status text;
  v_type text;
  v_priority text;
  v_estimate integer;
  v_duration integer;
  v_commit text;
  v_sprint_name text;
  v_task_title text;
  v_started_at timestamptz;
  v_completed_at timestamptz;
  v_total_sprints integer;
  v_total_tasks integer := 0;
  v_total_builds integer := 0;
BEGIN
  SELECT * INTO v_project FROM project WHERE id = p_project_id;
  IF v_project IS NULL THEN
    RAISE EXCEPTION 'Project not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT is_org_admin(v_project.organization_id, auth.uid()) THEN
    RAISE EXCEPTION 'Only admins and owners can generate simulation data' USING ERRCODE = '42501';
  END IF;

  IF p_sprint_count < 1 OR p_sprint_count > 20 THEN
    RAISE EXCEPTION 'Sprint count must be between 1 and 20' USING ERRCODE = '23514';
  END IF;

  -- Create the dataset record
  INSERT INTO simulation_dataset (organization_id, project_id, name, seed, created_by)
  VALUES (v_project.organization_id, p_project_id, 'Simulation seed=' || p_seed, p_seed, auth.uid())
  RETURNING id INTO v_dataset_id;

  v_total_sprints := p_sprint_count;

  FOR v_i IN 1..p_sprint_count LOOP
    -- Sprint dates: go backwards from current date, 2-week sprints
    v_sprint_end := v_base_date - ((v_i - 1) * 14);
    v_sprint_start := v_sprint_end - 14;
    v_sprint_name := 'Sprint ' || (p_sprint_count - v_i + 1);

    -- Determine sprint status: last sprint is ACTIVE, rest COMPLETED
    IF v_i = 1 THEN
      v_status := 'ACTIVE';
    ELSE
      v_status := 'COMPLETED';
    END IF;

    -- Insert sprint
    INSERT INTO sprint (
      organization_id, project_id, name, goal, status,
      start_date, end_date, simulation_dataset_id
    )
    VALUES (
      v_project.organization_id, p_project_id, v_sprint_name,
      'Deliver value for ' || v_sprint_name, v_status,
      v_sprint_start, v_sprint_end, v_dataset_id
    )
    RETURNING id INTO v_sprint_id;

    -- Generate tasks for this sprint (5-12 tasks per sprint, seeded random)
    v_task_count_per_sprint := 5 + (abs(p_seed + v_i * 7) % 8);

    FOR v_j IN 1..v_task_count_per_sprint LOOP
      -- Seeded pseudo-random selection
      v_rand := abs(p_seed + v_i * 31 + v_j * 17) % 100 / 100.0;
      v_type := v_task_types[1 + (abs(p_seed + v_i * 13 + v_j * 3) % 5)];
      v_priority := v_task_priorities[1 + (abs(p_seed + v_i * 19 + v_j * 5) % 4)];
      v_estimate := 1 + (abs(p_seed + v_i * 23 + v_j * 11) % 12);

      -- Status distribution: mostly DONE for completed sprints
      IF v_status = 'COMPLETED' THEN
        IF v_rand < 0.75 THEN
          v_status := 'DONE';
        ELSIF v_rand < 0.85 THEN
          v_status := 'IN_REVIEW';
        ELSIF v_rand < 0.92 THEN
          v_status := 'IN_PROGRESS';
        ELSIF v_rand < 0.97 THEN
          v_status := 'BLOCKED';
        ELSE
          v_status := 'TODO';
        END IF;
      ELSE
        -- Active sprint: mix of statuses
        IF v_rand < 0.35 THEN
          v_status := 'IN_PROGRESS';
        ELSIF v_rand < 0.55 THEN
          v_status := 'DONE';
        ELSIF v_rand < 0.70 THEN
          v_status := 'TODO';
        ELSIF v_rand < 0.82 THEN
          v_status := 'IN_REVIEW';
        ELSIF v_rand < 0.90 THEN
          v_status := 'BACKLOG';
        ELSE
          v_status := 'BLOCKED';
        END IF;
      END IF;

      -- Task number from project counter
      SELECT task_counter INTO v_task_num FROM project WHERE id = p_project_id FOR UPDATE;
      UPDATE project SET task_counter = task_counter + 1 WHERE id = p_project_id;

      v_task_title := v_type || '-' || (p_sprint_count - v_i + 1) || '.' || v_j || ': ' ||
                      CASE v_type
                        WHEN 'BUG' THEN 'Fix issue in module ' || v_j
                        WHEN 'FEATURE' THEN 'Implement feature ' || v_j
                        WHEN 'TASK' THEN 'Complete task ' || v_j
                        WHEN 'EPIC' THEN 'Epic: ' || v_j || ' user stories'
                        WHEN 'SPIKE' THEN 'Investigate ' || v_j
                      END;

      -- Timestamps for started/completed tasks
      v_started_at := NULL;
      v_completed_at := NULL;
      IF v_status IN ('IN_PROGRESS', 'IN_REVIEW', 'DONE', 'BLOCKED') THEN
        v_started_at := (v_sprint_start + (v_j % 7))::timestamptz;
      END IF;
      IF v_status = 'DONE' THEN
        v_completed_at := (v_sprint_start + ((v_j + 3) % 14))::timestamptz;
      END IF;

      INSERT INTO task (
        organization_id, project_id, sprint_id, number,
        title, description, type, status, priority,
        estimate_points, version, started_at, completed_at,
        simulation_dataset_id
      )
      VALUES (
        v_project.organization_id, p_project_id, v_sprint_id, v_task_num,
        v_task_title, 'Simulated task generated with seed ' || p_seed,
        v_type, v_status, v_priority,
        v_estimate, 1, v_started_at, v_completed_at,
        v_dataset_id
      );

      v_total_tasks := v_total_tasks + 1;

      -- Generate 1-3 build runs per sprint
      IF v_j <= 2 THEN
        v_duration := 30 + (abs(p_seed + v_i * 41 + v_j * 29) % 300);
        v_commit := lpad(to_hex(abs(p_seed + v_i * 53 + v_j * 37) % 268435455), 7, '0');

        INSERT INTO build_run (
          organization_id, project_id, external_run_id,
          branch, commit_sha, status, duration_seconds,
          triggered_by, build_url, simulation_dataset_id, created_at
        )
        VALUES (
          v_project.organization_id, p_project_id,
          'sim-run-' || v_dataset_id::text || '-' || v_i || '-' || v_j,
          v_branches[1 + (abs(p_seed + v_i * 7 + v_j) % 6)],
          v_commit,
          v_build_statuses[1 + (abs(p_seed + v_i * 43 + v_j * 19) % 4)],
          v_duration,
          'simulation-bot',
          NULL,
          v_dataset_id,
          (v_sprint_start + (v_j % 14))::timestamptz
        );

        v_total_builds := v_total_builds + 1;
      END IF;
    END LOOP;
  END LOOP;

  -- Update dataset with counts
  UPDATE simulation_dataset
  SET sprint_count = v_total_sprints, task_count = v_total_tasks, build_count = v_total_builds
  WHERE id = v_dataset_id;

  RETURN jsonb_build_object(
    'dataset_id', v_dataset_id,
    'sprint_count', v_total_sprints,
    'task_count', v_total_tasks,
    'build_count', v_total_builds
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION generate_simulation_data(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION generate_simulation_data(uuid, integer, integer) TO authenticated;
