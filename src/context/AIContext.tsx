import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useOrg } from '@/context/OrgContext';
import type { AIInteraction } from '@/types';

interface AIContextValue {
  interactions: AIInteraction[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  updateDecision: (interactionId: string, decision: 'ACCEPTED' | 'REJECTED') => Promise<void>;
}

const AIContext = createContext<AIContextValue | undefined>(undefined);

export function AIProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { activeOrg } = useOrg();
  const [interactions, setInteractions] = useState<AIInteraction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user || !activeOrg) {
      setInteractions([]);
      setLoading(false);
      return;
    }

    try {
      const { data } = await api.get<AIInteraction[]>(`/organizations/${activeOrg.id}/ai-interactions`);
      setInteractions(data);
      setError(null);
    } catch (queryError) {
      setError(queryError instanceof Error ? queryError.message : 'Unable to load AI history');
    }
    setLoading(false);
  }, [user, activeOrg]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const updateDecision = useCallback(
    async (interactionId: string, decision: 'ACCEPTED' | 'REJECTED') => {
      if (!user) throw new Error('Not authenticated');
      await api.put(`/ai-interactions/${interactionId}/decision`, { decision });
      await refresh();
    },
    [user, refresh]
  );

  return (
    <AIContext.Provider value={{ interactions, loading, error, refresh, updateDecision }}>
      {children}
    </AIContext.Provider>
  );
}

export function useAI() {
  const ctx = useContext(AIContext);
  if (!ctx) throw new Error('useAI must be used within AIProvider');
  return ctx;
}
