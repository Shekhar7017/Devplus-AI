import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { api } from '@/lib/api';
import { useOrg } from '@/context/OrgContext';
import { useProjects } from '@/context/ProjectsContext';
import type {
  Sprint,
  TaskWithAssignee,
  TaskStatusHistory,
  TaskType,
  TaskPriority,
} from '@/types';

interface SprintInput {
  name: string;
  goal?: string;
  start_date: string;
  end_date: string;
}

interface TaskInput {
  title: string;
  description?: string;
  type?: TaskType;
  priority?: TaskPriority;
  estimate_points?: number;
  assignee_id?: string | null;
  sprint_id?: string | null;
}

interface SprintTaskContextValue {
  sprints: Sprint[];
  tasks: TaskWithAssignee[];
  loading: boolean;
  error: string | null;
  selectedProjectId: string | null;
  setSelectedProjectId: (id: string | null) => void;
  createSprint: (input: SprintInput) => Promise<void>;
  startSprint: (sprintId: string) => Promise<void>;
  completeSprint: (sprintId: string) => Promise<void>;
  cancelSprint: (sprintId: string) => Promise<void>;
  createTask: (input: TaskInput) => Promise<void>;
  updateTask: (taskId: string, input: Partial<TaskInput>) => Promise<void>;
  transitionTask: (taskId: string, toStatus: string) => Promise<void>;
  getTaskHistory: (taskId: string) => Promise<TaskStatusHistory[]>;
  refresh: () => Promise<void>;
}

const SprintTaskContext = createContext<SprintTaskContextValue | undefined>(undefined);

export function SprintTaskProvider({ children }: { children: ReactNode }) {
  const { activeOrg } = useOrg();
  const { projects } = useProjects();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [tasks, setTasks] = useState<TaskWithAssignee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Auto-select first active project
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
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const [sprintResult, taskResult] = await Promise.all([
        api.get<Sprint[]>(`/projects/${selectedProjectId}/sprints`),
        api.get<TaskWithAssignee[]>(`/projects/${selectedProjectId}/tasks`),
      ]);
      setSprints(sprintResult.data);
      setTasks(taskResult.data);
      setError(null);
    } catch (queryError) {
      setError(queryError instanceof Error ? queryError.message : 'Unable to load sprints and tasks');
    } finally {
      setLoading(false);
    }
  }, [activeOrg, selectedProjectId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createSprint = useCallback(
    async (input: SprintInput) => {
      if (!activeOrg || !selectedProjectId) throw new Error('No active project');
      await api.post(`/projects/${selectedProjectId}/sprints`, {
        name: input.name.trim(),
        goal: input.goal?.trim() || null,
        start_date: input.start_date,
        end_date: input.end_date,
      });
      await refresh();
    },
    [activeOrg, selectedProjectId, refresh]
  );

  const startSprint = useCallback(
    async (sprintId: string) => {
      await api.post(`/sprints/${sprintId}/start`);
      await refresh();
    },
    [refresh]
  );

  const completeSprint = useCallback(
    async (sprintId: string) => {
      await api.post(`/sprints/${sprintId}/complete`);
      await refresh();
    },
    [refresh]
  );

  const cancelSprint = useCallback(
    async (sprintId: string) => {
      await api.post(`/sprints/${sprintId}/cancel`);
      await refresh();
    },
    [refresh]
  );

  const createTask = useCallback(
    async (input: TaskInput) => {
      if (!selectedProjectId) throw new Error('No active project');
      await api.post(`/projects/${selectedProjectId}/tasks`, {
        title: input.title,
        description: input.description ?? null,
        type: input.type ?? 'TASK',
        priority: input.priority ?? 'MEDIUM',
        estimate_points: input.estimate_points ?? 0,
        assignee_id: input.assignee_id ?? null,
        sprint_id: input.sprint_id ?? null,
      });
      await refresh();
    },
    [selectedProjectId, refresh]
  );

  const updateTask = useCallback(
    async (taskId: string, input: Partial<TaskInput>) => {
      const updates: Record<string, unknown> = {};
      if (input.title !== undefined) updates.title = input.title;
      if (input.description !== undefined) updates.description = input.description?.trim() || null;
      if (input.type !== undefined) updates.type = input.type;
      if (input.priority !== undefined) updates.priority = input.priority;
      if (input.estimate_points !== undefined) updates.estimate_points = input.estimate_points;
      if (input.assignee_id !== undefined) updates.assignee_id = input.assignee_id;
      if (input.sprint_id !== undefined) updates.sprint_id = input.sprint_id;

      const currentTask = tasks.find((task) => task.id === taskId);
      await api.put(`/tasks/${taskId}`, { ...updates, version: currentTask?.version });
      await refresh();
    },
    [tasks, refresh]
  );

  const transitionTask = useCallback(
    async (taskId: string, toStatus: string) => {
      const currentTask = tasks.find((task) => task.id === taskId);
      await api.post(`/tasks/${taskId}/transition`, { status: toStatus, version: currentTask?.version });
      await refresh();
    },
    [tasks, refresh]
  );

  const getTaskHistory = useCallback(
    async (taskId: string): Promise<TaskStatusHistory[]> => {
      const { data } = await api.get<TaskStatusHistory[]>(`/tasks/${taskId}/history`);
      return data;
    },
    []
  );

  return (
    <SprintTaskContext.Provider
      value={{
        sprints,
        tasks,
        loading,
        error,
        selectedProjectId,
        setSelectedProjectId,
        createSprint,
        startSprint,
        completeSprint,
        cancelSprint,
        createTask,
        updateTask,
        transitionTask,
        getTaskHistory,
        refresh,
      }}
    >
      {children}
    </SprintTaskContext.Provider>
  );
}

export function useSprintTask() {
  const ctx = useContext(SprintTaskContext);
  if (!ctx) throw new Error('useSprintTask must be used within SprintTaskProvider');
  return ctx;
}
