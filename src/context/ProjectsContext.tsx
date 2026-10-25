import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { api } from '@/lib/api';
import { useOrg } from '@/context/OrgContext';
import type { Project, DataOrigin } from '@/types';

interface ProjectInput {
  key: string;
  name: string;
  description?: string;
  data_origin?: DataOrigin;
}

interface ProjectsContextValue {
  projects: Project[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  createProject: (input: ProjectInput) => Promise<Project>;
  updateProject: (id: string, input: { name?: string; description?: string | null }) => Promise<void>;
  archiveProject: (id: string) => Promise<void>;
}

const ProjectsContext = createContext<ProjectsContextValue | undefined>(undefined);

const KEY_REGEX = /^[A-Z][A-Z0-9]{1,9}$/;

export function ProjectsProvider({ children }: { children: ReactNode }) {
  const { activeOrg } = useOrg();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!activeOrg) {
      setProjects([]);
      setLoading(false);
      return;
    }

    try {
      const { data } = await api.get<Project[]>('/projects', {
        params: { organization_id: activeOrg.id },
      });
      setProjects(data);
      setError(null);
    } catch (queryError) {
      setError(queryError instanceof Error ? queryError.message : 'Unable to load projects');
    }
    setLoading(false);
  }, [activeOrg]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createProject = useCallback(
    async (input: ProjectInput): Promise<Project> => {
      if (!activeOrg) throw new Error('No active organization');
      if (!KEY_REGEX.test(input.key)) {
        throw new Error('Key must be 2-10 characters: uppercase letter followed by uppercase letters or digits.');
      }
      if (!input.name.trim()) {
        throw new Error('Project name is required');
      }

      const { data } = await api.post<Project>('/projects', {
        organization_id: activeOrg.id,
        key: input.key.toUpperCase(),
        name: input.name.trim(),
        description: input.description?.trim() || null,
        data_origin: input.data_origin ?? 'REAL',
      });

      await refresh();
      return data;
    },
    [activeOrg, refresh]
  );

  const updateProject = useCallback(
    async (id: string, input: { name?: string; description?: string | null }) => {
      const updates: Record<string, unknown> = {};
      if (input.name !== undefined) updates.name = input.name.trim();
      if (input.description !== undefined) updates.description = input.description?.trim() || null;

      await api.put(`/projects/${id}`, updates);
      await refresh();
    },
    [refresh]
  );

  const archiveProject = useCallback(
    async (id: string) => {
      await api.post(`/projects/${id}/archive`);
      await refresh();
    },
    [refresh]
  );

  return (
    <ProjectsContext.Provider
      value={{ projects, loading, error, refresh, createProject, updateProject, archiveProject }}
    >
      {children}
    </ProjectsContext.Provider>
  );
}

export function useProjects() {
  const ctx = useContext(ProjectsContext);
  if (!ctx) throw new Error('useProjects must be used within ProjectsProvider');
  return ctx;
}
