import { createContext, useContext, useEffect, useState, useCallback, ReactNode, useMemo } from 'react';
import { api } from '@/lib/api';
import { useOrg } from '@/context/OrgContext';
import type { Sprint, TaskWithAssignee, BuildRun, Project, AIInteraction } from '@/types';

interface ActivityItem {
  id: string;
  type: 'sprint' | 'task' | 'build' | 'ai';
  title: string;
  subtitle: string;
  timestamp: string;
  status?: string;
}

interface ProjectSummary {
  project: Project;
  activeSprint: Sprint | null;
  taskCount: number;
  doneTasks: number;
  inProgressTasks: number;
  blockedTasks: number;
  recentBuilds: number;
  buildSuccessRate: number;
}

interface DashboardContextValue {
  projects: Project[];
  projectSummaries: ProjectSummary[];
  totalTasks: number;
  totalDone: number;
  totalInProgress: number;
  totalBlocked: number;
  totalBuilds: number;
  overallBuildSuccessRate: number;
  activeSprintCount: number;
  aiQuotaUsed: number;
  aiQuotaLimit: number;
  recentActivity: ActivityItem[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const DashboardContext = createContext<DashboardContextValue | undefined>(undefined);

const AI_QUOTA_LIMIT = 100;

export function DashboardProvider({ children }: { children: ReactNode }) {
  const { activeOrg } = useOrg();
  const [projects, setProjects] = useState<Project[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [tasks, setTasks] = useState<TaskWithAssignee[]>([]);
  const [buildRuns, setBuildRuns] = useState<BuildRun[]>([]);
  const [aiInteractions, setAiInteractions] = useState<AIInteraction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!activeOrg) {
      setProjects([]); setSprints([]); setTasks([]); setBuildRuns([]); setAiInteractions([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const [projectResult, sprintResult, taskResult, buildResult, aiResult] = await Promise.all([
        api.get<Project[]>('/projects', { params: { organization_id: activeOrg.id } }),
        api.get<Sprint[]>(`/organizations/${activeOrg.id}/sprints`),
        api.get<TaskWithAssignee[]>(`/organizations/${activeOrg.id}/tasks`),
        api.get<BuildRun[]>(`/organizations/${activeOrg.id}/build-runs`),
        api.get<AIInteraction[]>('/organizations/' + activeOrg.id + '/ai-interactions'),
      ]);
      setProjects(projectResult.data);
      setSprints(sprintResult.data);
      setTasks(taskResult.data);
      setBuildRuns(buildResult.data);
      setAiInteractions(aiResult.data);
      setError(null);
    } catch (queryError) {
      setError(queryError instanceof Error ? queryError.message : 'Unable to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, [activeOrg]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const projectSummaries: ProjectSummary[] = useMemo(() => {
    return projects.map((project) => {
      const projSprints = sprints.filter((s) => s.project_id === project.id);
      const activeSprint = projSprints.find((s) => s.status === 'ACTIVE') ?? null;
      const projTasks = tasks.filter((t) => t.project_id === project.id);
      const projBuilds = buildRuns.filter((b) => b.project_id === project.id);
      const successCount = projBuilds.filter((b) => b.status === 'SUCCESS').length;

      return {
        project,
        activeSprint,
        taskCount: projTasks.length,
        doneTasks: projTasks.filter((t) => t.status === 'DONE').length,
        inProgressTasks: projTasks.filter((t) => t.status === 'IN_PROGRESS').length,
        blockedTasks: projTasks.filter((t) => t.status === 'BLOCKED').length,
        recentBuilds: projBuilds.length,
        buildSuccessRate: projBuilds.length > 0 ? Math.round((successCount / projBuilds.length) * 100) : 0,
      };
    });
  }, [projects, sprints, tasks, buildRuns]);

  const totalTasks = tasks.length;
  const totalDone = tasks.filter((t) => t.status === 'DONE').length;
  const totalInProgress = tasks.filter((t) => t.status === 'IN_PROGRESS').length;
  const totalBlocked = tasks.filter((t) => t.status === 'BLOCKED').length;
  const totalBuilds = buildRuns.length;
  const overallBuildSuccessRate = totalBuilds > 0
    ? Math.round((buildRuns.filter((b) => b.status === 'SUCCESS').length / totalBuilds) * 100)
    : 0;
  const activeSprintCount = sprints.filter((s) => s.status === 'ACTIVE').length;
  const aiQuotaUsed = activeOrg?.ai_requests_this_period ?? 0;

  const recentActivity: ActivityItem[] = useMemo(() => {
    const items: ActivityItem[] = [];

    tasks.slice(0, 10).forEach((t) => {
      items.push({
        id: 'task-' + t.id,
        type: 'task',
        title: `#${t.number} ${t.title}`,
        subtitle: t.status.replace('_', ' ').toLowerCase(),
        timestamp: t.updated_at,
        status: t.status,
      });
    });

    buildRuns.slice(0, 10).forEach((b) => {
      items.push({
        id: 'build-' + b.id,
        type: 'build',
        title: `Build on ${b.branch}`,
        subtitle: b.status.toLowerCase(),
        timestamp: b.created_at,
        status: b.status,
      });
    });

    sprints.slice(0, 5).forEach((s) => {
      items.push({
        id: 'sprint-' + s.id,
        type: 'sprint',
        title: s.name,
        subtitle: s.status.toLowerCase(),
        timestamp: s.updated_at,
        status: s.status,
      });
    });

    aiInteractions.forEach((i) => {
      items.push({
        id: 'ai-' + i.id,
        type: 'ai',
        title: i.request_type === 'TASK_REFINEMENT' ? 'AI task refinement' : 'AI sprint summary',
        subtitle: i.status.toLowerCase(),
        timestamp: i.created_at,
        status: i.status,
      });
    });

    return items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 15);
  }, [tasks, buildRuns, sprints, aiInteractions]);

  return (
    <DashboardContext.Provider
      value={{
        projects, projectSummaries,
        totalTasks, totalDone, totalInProgress, totalBlocked,
        totalBuilds, overallBuildSuccessRate,
        activeSprintCount, aiQuotaUsed, aiQuotaLimit: AI_QUOTA_LIMIT,
        recentActivity, loading, error, refresh,
      }}
    >
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error('useDashboard must be used within DashboardProvider');
  return ctx;
}
