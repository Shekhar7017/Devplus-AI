export type UserRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';

export type DataOrigin = 'REAL' | 'SIMULATED';

export type ProjectStatus = 'ACTIVE' | 'ARCHIVED';

export type SprintStatus = 'PLANNED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export type TaskType = 'BUG' | 'FEATURE' | 'TASK' | 'EPIC' | 'SPIKE';

export type TaskPriority = 'BLOCKER' | 'HIGH' | 'MEDIUM' | 'LOW';

export type TaskStatus =
  | 'BACKLOG'
  | 'TODO'
  | 'IN_PROGRESS'
  | 'IN_REVIEW'
  | 'DONE'
  | 'BLOCKED';

export type BuildStatus = 'SUCCESS' | 'FAILED' | 'RUNNING' | 'CANCELLED';

export type AIInteractionStatus = 'PENDING' | 'COMPLETED' | 'FAILED';

export type AIDecision = 'ACCEPTED' | 'REJECTED' | 'NONE';

export interface Organization {
  id: string;
  name: string;
  ai_enabled: boolean;
  ai_requests_this_period: number;
  ai_quota_reset_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AppUser {
  id: string;
  email: string;
  display_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface Membership {
  id: string;
  organization_id: string;
  user_id: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface MembershipWithUser extends Membership {
  app_user: Pick<AppUser, 'id' | 'email' | 'display_name'>;
}

export interface MembershipWithOrg extends Membership {
  organization: Pick<Organization, 'id' | 'name' | 'ai_enabled'>;
}

export interface Project {
  id: string;
  organization_id: string;
  key: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  data_origin: DataOrigin;
  task_counter: number;
  created_at: string;
  updated_at: string;
}

export interface Sprint {
  id: string;
  organization_id: string;
  project_id: string;
  name: string;
  goal: string | null;
  status: SprintStatus;
  start_date: string;
  end_date: string;
  simulation_dataset_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  organization_id: string;
  project_id: string;
  sprint_id: string | null;
  number: number;
  title: string;
  description: string | null;
  type: TaskType;
  status: TaskStatus;
  priority: TaskPriority;
  estimate_points: number;
  assignee_id: string | null;
  reporter_id: string | null;
  version: number;
  started_at: string | null;
  completed_at: string | null;
  simulation_dataset_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskStatusHistory {
  id: string;
  task_id: string;
  organization_id: string;
  from_status: TaskStatus | null;
  to_status: TaskStatus;
  changed_by: string | null;
  changed_at: string;
}

export interface TaskWithAssignee extends Task {
  assignee: Pick<AppUser, 'id' | 'email' | 'display_name'> | null;
}

export interface ProjectApiKey {
  id: string;
  organization_id: string;
  project_id: string;
  name: string;
  key_prefix: string;
  created_by: string | null;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BuildRun {
  id: string;
  organization_id: string;
  project_id: string;
  external_run_id: string;
  branch: string;
  commit_sha: string;
  status: BuildStatus;
  duration_seconds: number;
  triggered_by: string | null;
  build_url: string | null;
  simulation_dataset_id: string | null;
  created_at: string;
}

export type AIRequestType = 'TASK_REFINEMENT' | 'SPRINT_SUMMARY';

export interface AIInteraction {
  id: string;
  organization_id: string;
  project_id: string | null;
  user_id: string | null;
  request_type: AIRequestType;
  request_payload: Record<string, unknown>;
  response_payload: Record<string, unknown> | null;
  status: AIInteractionStatus;
  decision: AIDecision;
  error_message: string | null;
  tokens_used: number;
  created_at: string;
}

export interface SimulationDataset {
  id: string;
  organization_id: string;
  project_id: string;
  name: string;
  seed: number;
  sprint_count: number;
  task_count: number;
  build_count: number;
  created_by: string | null;
  created_at: string;
}
