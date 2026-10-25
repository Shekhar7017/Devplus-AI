import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import type { Organization, Membership, MembershipWithUser, UserRole } from '@/types';

interface OrgContextValue {
  organizations: Organization[];
  activeOrg: Organization | null;
  memberships: MembershipWithUser[];
  currentUserMembership: Membership | null;
  loading: boolean;
  error: string | null;
  setActiveOrg: (orgId: string) => void;
  refreshOrgs: () => Promise<void>;
  refreshMemberships: () => Promise<void>;
  createOrg: (name: string) => Promise<void>;
  addMember: (email: string, role: UserRole) => Promise<void>;
  updateMemberRole: (userId: string, role: UserRole) => Promise<void>;
  removeMember: (userId: string) => Promise<void>;
  updateOrgSettings: (settings: { name?: string; ai_enabled?: boolean }) => Promise<void>;
}

const OrgContext = createContext<OrgContextValue | undefined>(undefined);

const STORAGE_KEY = 'devpulse_active_org';

export function OrgProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [activeOrg, setActiveOrgState] = useState<Organization | null>(null);
  const [memberships, setMemberships] = useState<MembershipWithUser[]>([]);
  const [currentUserMembership, setCurrentUserMembership] = useState<Membership | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshOrgs = useCallback(async () => {
    if (!user) {
      setOrganizations([]);
      setActiveOrgState(null);
      setMemberships([]);
      setCurrentUserMembership(null);
      setLoading(false);
      return;
    }

    let orgs: Organization[];
    try {
      const { data } = await api.get<Organization[]>('/organizations');
      orgs = data;
      setError(null);
    } catch (queryError) {
      setError(queryError instanceof Error ? queryError.message : 'Unable to load organizations');
      setLoading(false);
      return;
    }
    setOrganizations(orgs);

    if (orgs.length > 0) {
      const stored = localStorage.getItem(STORAGE_KEY);
      const storedOrg = stored ? orgs.find((o) => o.id === stored) : null;
      const target = storedOrg ?? orgs[0];
      setActiveOrgState(target);
      localStorage.setItem(STORAGE_KEY, target.id);
    } else {
      setActiveOrgState(null);
    }
    setLoading(false);
  }, [user]);

  const refreshMemberships = useCallback(async () => {
    if (!activeOrg || !user) {
      setMemberships([]);
      setCurrentUserMembership(null);
      return;
    }

    let allMemberships: MembershipWithUser[];
    try {
      const { data } = await api.get<MembershipWithUser[]>(`/organizations/${activeOrg.id}/members`);
      allMemberships = data;
    } catch (queryError) {
      setError(queryError instanceof Error ? queryError.message : 'Unable to load organization members');
      return;
    }
    setMemberships(allMemberships);

    const myMembership = allMemberships.find((m) => m.user_id === user.id) ?? null;
    setCurrentUserMembership(myMembership);
  }, [activeOrg, user]);

  useEffect(() => {
    refreshOrgs();
  }, [refreshOrgs]);

  useEffect(() => {
    refreshMemberships();
  }, [refreshMemberships]);

  const setActiveOrg = useCallback((orgId: string) => {
    const org = organizations.find((o) => o.id === orgId);
    if (org) {
      setActiveOrgState(org);
      localStorage.setItem(STORAGE_KEY, org.id);
    }
  }, [organizations]);

  const createOrg = useCallback(
    async (name: string) => {
      const { data } = await api.post<Organization>('/organizations', { name });
      setOrganizations((current) => [...current, data]);
      setActiveOrgState(data);
      localStorage.setItem(STORAGE_KEY, data.id);
    },
    []
  );

  const addMember = useCallback(
    async (email: string, role: UserRole) => {
      if (!activeOrg) throw new Error('No active organization');
      await api.post(`/organizations/${activeOrg.id}/members`, { email, role });
      await refreshMemberships();
    },
    [activeOrg, refreshMemberships]
  );

  const updateMemberRole = useCallback(
    async (userId: string, role: UserRole) => {
      if (!activeOrg) throw new Error('No active organization');
      await api.put(`/organizations/${activeOrg.id}/members/${userId}`, { role });
      await refreshMemberships();
    },
    [activeOrg, refreshMemberships]
  );

  const removeMember = useCallback(
    async (userId: string) => {
      if (!activeOrg) throw new Error('No active organization');
      await api.delete(`/organizations/${activeOrg.id}/members/${userId}`);
      await refreshMemberships();
    },
    [activeOrg, refreshMemberships]
  );

  const updateOrgSettings = useCallback(
    async (settings: { name?: string; ai_enabled?: boolean }) => {
      if (!activeOrg) throw new Error('No active organization');
      await api.put(`/organizations/${activeOrg.id}`, settings);
      await refreshOrgs();
    },
    [activeOrg, refreshOrgs]
  );

  return (
    <OrgContext.Provider
      value={{
        organizations,
        activeOrg,
        memberships,
        currentUserMembership,
        loading,
        error,
        setActiveOrg,
        refreshOrgs,
        refreshMemberships,
        createOrg,
        addMember,
        updateMemberRole,
        removeMember,
        updateOrgSettings,
      }}
    >
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg() {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error('useOrg must be used within OrgProvider');
  return ctx;
}
