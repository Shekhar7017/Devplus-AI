import { ReactNode, useState } from 'react';
import {
  LayoutDashboard,
  Activity,
  Layers,
  GitBranch,
  BarChart3,
  Bot,
  Settings,
  Users,
  LogOut,
  ChevronDown,
  Building2,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useOrg } from '@/context/OrgContext';
import { Badge } from '@/components/ui/Badge';

export type ViewKey =
  | 'dashboard'
  | 'projects'
  | 'sprints'
  | 'tasks'
  | 'telemetry'
  | 'ai'
  | 'analytics'
  | 'members'
  | 'settings';

interface DashboardLayoutProps {
  activeView: ViewKey;
  onNavigate: (view: ViewKey) => void;
  children: ReactNode;
}

const NAV_ITEMS: { key: ViewKey; label: string; icon: typeof Layers }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'projects', label: 'Projects', icon: Layers },
  { key: 'sprints', label: 'Sprints', icon: Activity },
  { key: 'tasks', label: 'Tasks', icon: GitBranch },
  { key: 'telemetry', label: 'Telemetry', icon: BarChart3 },
  { key: 'ai', label: 'AI Assistance', icon: Bot },
  { key: 'analytics', label: 'Analytics', icon: BarChart3 },
];

const ADMIN_ITEMS: { key: ViewKey; label: string; icon: typeof Settings }[] = [
  { key: 'members', label: 'Members', icon: Users },
  { key: 'settings', label: 'Settings', icon: Settings },
];

export function DashboardLayout({ activeView, onNavigate, children }: DashboardLayoutProps) {
  const { profile, signOut } = useAuth();
  const { organizations, activeOrg, setActiveOrg, currentUserMembership } = useOrg();
  const [orgMenuOpen, setOrgMenuOpen] = useState(false);

  const isAdmin = currentUserMembership?.role === 'OWNER' || currentUserMembership?.role === 'ADMIN';

  return (
    <div className="min-h-screen bg-neutral-950 flex">
      {/* Sidebar */}
      <aside className="w-60 shrink-0 border-r border-neutral-800/60 bg-neutral-950 flex flex-col">
        {/* Logo */}
        <div className="px-5 py-4 border-b border-neutral-800/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-lg shadow-primary-600/20">
              <Activity className="w-5 h-5 text-white" strokeWidth={2.5} />
            </div>
            <span className="text-base font-semibold text-white tracking-tight">
              DevPulse<span className="text-primary-400"> AI</span>
            </span>
          </div>
        </div>

        {/* Org switcher */}
        <div className="px-3 py-3 border-b border-neutral-800/60 relative">
          <button
            onClick={() => setOrgMenuOpen(!orgMenuOpen)}
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-neutral-900 border border-neutral-800 hover:border-neutral-700 transition-colors"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Building2 className="w-4 h-4 text-neutral-400 shrink-0" />
              <span className="text-sm text-white truncate">{activeOrg?.name ?? 'No org'}</span>
            </div>
            <ChevronDown className={`w-4 h-4 text-neutral-500 transition-transform ${orgMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          {orgMenuOpen && (
            <div className="absolute left-3 right-3 top-full mt-1 rounded-lg bg-neutral-900 border border-neutral-800 shadow-xl z-20 py-1">
              {organizations.map((org) => (
                <button
                  key={org.id}
                  onClick={() => {
                    setActiveOrg(org.id);
                    setOrgMenuOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-sm transition-colors hover:bg-neutral-800 ${
                    org.id === activeOrg?.id ? 'text-primary-400' : 'text-neutral-300'
                  }`}
                >
                  {org.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeView === item.key;
            return (
              <button
                key={item.key}
                onClick={() => onNavigate(item.key)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  active
                    ? 'bg-primary-500/10 text-primary-300 border border-primary-500/20'
                    : 'text-neutral-400 hover:text-white hover:bg-neutral-900 border border-transparent'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {item.label}
              </button>
            );
          })}

          {isAdmin && (
            <>
              <div className="pt-3 pb-1 px-3">
                <span className="text-xs font-medium text-neutral-600 uppercase tracking-wider">
                  Administration
                </span>
              </div>
              {ADMIN_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = activeView === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => onNavigate(item.key)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                      active
                        ? 'bg-primary-500/10 text-primary-300 border border-primary-500/20'
                        : 'text-neutral-400 hover:text-white hover:bg-neutral-900 border border-transparent'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    {item.label}
                  </button>
                );
              })}
            </>
          )}
        </nav>

        {/* User footer */}
        <div className="px-3 py-3 border-t border-neutral-800/60">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center text-sm font-medium text-white shrink-0">
                {(profile?.display_name ?? profile?.email ?? '?')[0].toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="text-sm text-white truncate">{profile?.display_name ?? 'User'}</div>
                <div className="text-xs text-neutral-500 truncate">{profile?.email}</div>
              </div>
            </div>
            <button
              onClick={() => signOut()}
              className="p-2 rounded-lg text-neutral-500 hover:text-white hover:bg-neutral-800 transition-colors"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-14 border-b border-neutral-800/60 bg-neutral-950/80 backdrop-blur-sm px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-semibold text-white capitalize">
              {activeView.replace(/([A-Z])/g, ' $1').trim()}
            </h1>
            {currentUserMembership && (
              <Badge tone={currentUserMembership.role === 'OWNER' ? 'primary' : 'neutral'}>
                {currentUserMembership.role}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {activeOrg && (
              <Badge tone="neutral">
                <span className="font-mono">{activeOrg.name}</span>
              </Badge>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
