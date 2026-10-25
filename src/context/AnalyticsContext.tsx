import { createContext, useContext, useEffect, useState, useCallback, ReactNode, useMemo } from 'react';
import { api } from '@/lib/api';
import { useOrg } from '@/context/OrgContext';
import { useProjects } from '@/context/ProjectsContext';
import type { Sprint, TaskWithAssignee, BuildRun, SimulationDataset, SprintStatus, TaskStatus, TaskType } from '@/types';

interface SprintMetrics {
  sprintId: string;
  sprintName: string;
  sprintStatus: SprintStatus;
  totalTasks: number;
  doneTasks: number;
  velocity: number;
  inProgress: number;
  blocked: number;
  startDate: string;
  endDate: string;
}

interface TaskMetrics {
  total: number;
  byStatus: Record<TaskStatus, number>;
  byType: Record<TaskType, number>;
  completedWithCycleTime: Array<{ cycleTimeDays: number; type: TaskType }>;
  avgCycleTimeDays: number;
}

interface BuildMetrics {
  total: number;
  success: number;
  failed: number;
  running: number;
  cancelled: number;
  successRate: number;
  avgDuration: number;
  recent: BuildRun[];
}

interface AnalyticsContextValue {
  sprints: Sprint[];
  tasks: TaskWithAssignee[];
  buildRuns: BuildRun[];
  datasets: SimulationDataset[];
  loading: boolean;
  error: string | null;
  selectedProjectId: string | null;
  setSelectedProjectId: (id: string | null) => void;
  sprintMetrics: SprintMetrics[];
  taskMetrics: TaskMetrics;
  buildMetrics: BuildMetrics;
  generateSimulation: (seed: number, sprintCount: number) => Promise<void>;
  deleteDataset: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const AnalyticsContext = createContext<AnalyticsContextValue | undefined>(undefined);

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const { activeOrg } = useOrg();
  const { projects } = useProjects();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [tasks, setTasks] = useState<TaskWithAssignee[]>([]);
  const [buildRuns, setBuildRuns] = useState<BuildRun[]>([]);
  const [datasets, setDatasets] = useState<SimulationDataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedProjectId && projects.length > 0) {
      const firstActive = projects.find((p) => p.status === 'ACTIVE');
      setSelectedProjectId(firstActive?.id ?? projects[0].id);
    }
    if (selectedProjectId && !projects.find((p) => p.id === selectedProjectId)) {
      setSelectedProjectId(projects[0]?.id ?? null);
    }
  }, [projects, selectedProjectId]);

  const refresh = useCallback(async () => {
    if (!activeOrg || !selectedProjectId) {
      setSprints([]);
      setTasks([]);
      setBuildRuns([]);
      setDatasets([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const [sprintRes, taskRes, buildRes, datasetRes] = await Promise.all([
        api.get<Sprint[]>(`/projects/${selectedProjectId}/sprints`),
        api.get<TaskWithAssignee[]>(`/projects/${selectedProjectId}/tasks`),
        api.get<BuildRun[]>(`/projects/${selectedProjectId}/build-runs`),
        api.get<SimulationDataset[]>(`/projects/${selectedProjectId}/simulation-datasets`),
      ]);
      setSprints(sprintRes.data);
      setTasks(taskRes.data);
      setBuildRuns(buildRes.data);
      setDatasets(datasetRes.data);
      setError(null);
    } catch (queryError) {
      setError(queryError instanceof Error ? queryError.message : 'Unable to load analytics');
    } finally {
      setLoading(false);
    }
  }, [activeOrg, selectedProjectId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const sprintMetrics: SprintMetrics[] = useMemo(() => {
    return sprints.map((sprint) => {
      const sprintTasks = tasks.filter((t) => t.sprint_id === sprint.id);
      const doneTasks = sprintTasks.filter((t) => t.status === 'DONE');
      const velocity = doneTasks.reduce((sum, t) => sum + t.estimate_points, 0);
      return {
        sprintId: sprint.id,
        sprintName: sprint.name,
        sprintStatus: sprint.status,
        totalTasks: sprintTasks.length,
        doneTasks: doneTasks.length,
        velocity,
        inProgress: sprintTasks.filter((t) => t.status === 'IN_PROGRESS').length,
        blocked: sprintTasks.filter((t) => t.status === 'BLOCKED').length,
        startDate: sprint.start_date,
        endDate: sprint.end_date,
      };
    });
  }, [sprints, tasks]);

  const taskMetrics: TaskMetrics = useMemo(() => {
    const byStatus: Record<TaskStatus, number> = {
      BACKLOG: 0, TODO: 0, IN_PROGRESS: 0, IN_REVIEW: 0, DONE: 0, BLOCKED: 0,
    };
    const byType: Record<TaskType, number> = {
      BUG: 0, FEATURE: 0, TASK: 0, EPIC: 0, SPIKE: 0,
    };

    tasks.forEach((t) => {
      byStatus[t.status]++;
      byType[t.type]++;
    });

    const completedWithCycleTime = tasks
      .filter((t) => t.completed_at && t.started_at)
      .map((t) => ({
        cycleTimeDays: Math.max(1, Math.round(
          (new Date(t.completed_at!).getTime() - new Date(t.started_at!).getTime()) / 86400000
        )),
        type: t.type,
      }));

    const avgCycleTimeDays = completedWithCycleTime.length > 0
      ? Math.round(completedWithCycleTime.reduce((sum, t) => sum + t.cycleTimeDays, 0) / completedWithCycleTime.length * 10) / 10
      : 0;

    return { total: tasks.length, byStatus, byType, completedWithCycleTime, avgCycleTimeDays };
  }, [tasks]);

  const buildMetrics: BuildMetrics = useMemo(() => {
    const total = buildRuns.length;
    const success = buildRuns.filter((b) => b.status === 'SUCCESS').length;
    const failed = buildRuns.filter((b) => b.status === 'FAILED').length;
    const running = buildRuns.filter((b) => b.status === 'RUNNING').length;
    const cancelled = buildRuns.filter((b) => b.status === 'CANCELLED').length;
    const successRate = total > 0 ? Math.round((success / total) * 100) : 0;
    const avgDuration = total > 0
      ? Math.round(buildRuns.reduce((sum, b) => sum + b.duration_seconds, 0) / total)
      : 0;
    const recent = [...buildRuns].reverse().slice(0, 20);

    return { total, success, failed, running, cancelled, successRate, avgDuration, recent };
  }, [buildRuns]);

  const generateSimulation = useCallback(
    async (seed: number, sprintCount: number) => {
      if (!selectedProjectId) throw new Error('No active project');
      await api.post(`/projects/${selectedProjectId}/simulation-datasets`, {
        seed,
        sprint_count: sprintCount,
      });
      await refresh();
    },
    [selectedProjectId, refresh]
  );

  const deleteDataset = useCallback(
    async (id: string) => {
      await api.delete(`/simulation-datasets/${id}`);
      await refresh();
    },
    [refresh]
  );

  return (
    <AnalyticsContext.Provider
      value={{
        sprints, tasks, buildRuns, datasets, loading, error,
        selectedProjectId, setSelectedProjectId,
        sprintMetrics, taskMetrics, buildMetrics,
        generateSimulation, deleteDataset, refresh,
      }}
    >
      {children}
    </AnalyticsContext.Provider>
  );
}

export function useAnalytics() {
  const ctx = useContext(AnalyticsContext);
  if (!ctx) throw new Error('useAnalytics must be used within AnalyticsProvider');
  return ctx;
}
