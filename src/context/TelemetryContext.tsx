import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { api } from '@/lib/api';
import { useOrg } from '@/context/OrgContext';
import { useProjects } from '@/context/ProjectsContext';
import type { BuildRun, ProjectApiKey } from '@/types';

interface TelemetryContextValue {
  buildRuns: BuildRun[];
  apiKeys: ProjectApiKey[];
  loading: boolean;
  error: string | null;
  selectedProjectId: string | null;
  setSelectedProjectId: (id: string | null) => void;
  createApiKey: (name: string) => Promise<string>;
  revokeApiKey: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const TelemetryContext = createContext<TelemetryContextValue | undefined>(undefined);

export function TelemetryProvider({ children }: { children: ReactNode }) {
  const { activeOrg } = useOrg();
  const { projects } = useProjects();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [buildRuns, setBuildRuns] = useState<BuildRun[]>([]);
  const [apiKeys, setApiKeys] = useState<ProjectApiKey[]>([]);
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
      setBuildRuns([]);
      setApiKeys([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const [buildResult, keyResult] = await Promise.all([
        api.get<BuildRun[]>(`/projects/${selectedProjectId}/build-runs`),
        api.get<ProjectApiKey[]>(`/projects/${selectedProjectId}/api-keys`),
      ]);
      setBuildRuns(buildResult.data);
      setApiKeys(keyResult.data);
      setError(null);
    } catch (queryError) {
      setError(queryError instanceof Error ? queryError.message : 'Unable to load telemetry');
    } finally {
      setLoading(false);
    }
  }, [activeOrg, selectedProjectId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createApiKey = useCallback(
    async (name: string): Promise<string> => {
      if (!selectedProjectId) throw new Error('No active project');
      const { data } = await api.post<{ key: string }>(`/projects/${selectedProjectId}/api-keys`, { name });
      await refresh();
      return data.key;
    },
    [selectedProjectId, refresh]
  );

  const revokeApiKey = useCallback(
    async (id: string) => {
      await api.delete(`/api-keys/${id}`);
      await refresh();
    },
    [refresh]
  );

  return (
    <TelemetryContext.Provider
      value={{
        buildRuns,
        apiKeys,
        loading,
        error,
        selectedProjectId,
        setSelectedProjectId,
        createApiKey,
        revokeApiKey,
        refresh,
      }}
    >
      {children}
    </TelemetryContext.Provider>
  );
}

export function useTelemetry() {
  const ctx = useContext(TelemetryContext);
  if (!ctx) throw new Error('useTelemetry must be used within TelemetryProvider');
  return ctx;
}
