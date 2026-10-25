CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE app_user (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL UNIQUE,
    display_name text,
    password_hash text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE organization (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
    ai_enabled boolean NOT NULL DEFAULT false,
    ai_requests_this_period integer NOT NULL DEFAULT 0 CHECK (ai_requests_this_period >= 0),
    ai_quota_reset_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE membership (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    role text NOT NULL CHECK (role IN ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organization_id, user_id)
);
CREATE INDEX idx_membership_user ON membership(user_id);

CREATE TABLE project (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
    key text NOT NULL CHECK (key ~ '^[A-Z][A-Z0-9]{1,9}$'),
    name text NOT NULL,
    description text,
    status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ARCHIVED')),
    data_origin text NOT NULL DEFAULT 'REAL' CHECK (data_origin IN ('REAL', 'SIMULATED')),
    task_counter integer NOT NULL DEFAULT 0 CHECK (task_counter >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organization_id, key),
    UNIQUE (id, organization_id)
);
CREATE INDEX idx_project_org ON project(organization_id);
CREATE INDEX idx_project_status ON project(organization_id, status);

CREATE TABLE simulation_dataset (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
    project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    name text NOT NULL,
    seed integer NOT NULL,
    sprint_count integer NOT NULL DEFAULT 0,
    task_count integer NOT NULL DEFAULT 0,
    build_count integer NOT NULL DEFAULT 0,
    created_by uuid REFERENCES app_user(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sprint (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
    project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    name text NOT NULL,
    goal text,
    status text NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED')),
    start_date date NOT NULL,
    end_date date NOT NULL CHECK (end_date > start_date),
    simulation_dataset_id uuid REFERENCES simulation_dataset(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (id, project_id)
);
CREATE UNIQUE INDEX idx_one_active_sprint_per_project ON sprint(project_id) WHERE status = 'ACTIVE';
CREATE INDEX idx_sprint_project ON sprint(project_id);
CREATE INDEX idx_sprint_org ON sprint(organization_id);

CREATE TABLE task (
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
    estimate_points integer NOT NULL DEFAULT 0 CHECK (estimate_points BETWEEN 0 AND 100),
    assignee_id uuid REFERENCES app_user(id) ON DELETE SET NULL,
    reporter_id uuid REFERENCES app_user(id) ON DELETE SET NULL,
    version integer NOT NULL DEFAULT 1,
    started_at timestamptz,
    completed_at timestamptz,
    simulation_dataset_id uuid REFERENCES simulation_dataset(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (project_id, number),
    FOREIGN KEY (sprint_id) REFERENCES sprint(id) ON DELETE SET NULL
);
CREATE INDEX idx_task_project ON task(project_id);
CREATE INDEX idx_task_sprint ON task(sprint_id) WHERE sprint_id IS NOT NULL;
CREATE INDEX idx_task_org ON task(organization_id);
CREATE INDEX idx_task_status ON task(project_id, status);

CREATE TABLE task_status_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id uuid NOT NULL REFERENCES task(id) ON DELETE CASCADE,
    organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
    from_status text,
    to_status text NOT NULL,
    changed_by uuid REFERENCES app_user(id) ON DELETE SET NULL,
    changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_history_task ON task_status_history(task_id);
CREATE INDEX idx_history_changed ON task_status_history(changed_at);

CREATE TABLE project_api_key (
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
CREATE INDEX idx_api_key_project ON project_api_key(project_id);
CREATE INDEX idx_api_key_hash ON project_api_key(key_hash);

CREATE TABLE build_run (
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
    simulation_dataset_id uuid REFERENCES simulation_dataset(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (project_id, external_run_id)
);
CREATE INDEX idx_build_run_org_created ON build_run(organization_id, created_at DESC);
CREATE INDEX idx_build_run_project ON build_run(project_id, created_at DESC);

CREATE TABLE ai_interaction (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
    project_id uuid REFERENCES project(id) ON DELETE CASCADE,
    user_id uuid REFERENCES app_user(id) ON DELETE SET NULL,
    request_type text NOT NULL CHECK (request_type IN ('TASK_REFINEMENT', 'SPRINT_SUMMARY')),
    request_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    response_payload jsonb,
    status text NOT NULL CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED')),
    decision text NOT NULL DEFAULT 'NONE' CHECK (decision IN ('ACCEPTED', 'REJECTED', 'NONE')),
    error_message text,
    tokens_used integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_interaction_org_created ON ai_interaction(organization_id, created_at DESC);
