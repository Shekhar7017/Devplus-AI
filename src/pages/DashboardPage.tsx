import {
  Activity,
  Layers,
  GitBranch,
  Bot,
  CheckCircle,
  Zap,
  TrendingUp,
  AlertCircle,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { useDashboard } from '@/context/DashboardContext';
import { useOrg } from '@/context/OrgContext';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import type { ViewKey } from '@/components/DashboardLayout';

interface DashboardPageProps {
  onNavigate: (view: ViewKey) => void;
}

function StatCard({
  label, value, icon: Icon, tone = 'neutral', onClick, clickableLabel,
}: {
  label: string;
  value: string | number;
  icon: typeof TrendingUp;
  tone?: 'neutral' | 'accent' | 'danger' | 'primary' | 'warning';
  onClick?: () => void;
  clickableLabel?: string;
}) {
  const toneClasses = {
    neutral: 'text-neutral-400 bg-neutral-800/60',
    accent: 'text-accent-400 bg-accent-500/10',
    danger: 'text-red-400 bg-red-500/10',
    primary: 'text-primary-400 bg-primary-500/10',
    warning: 'text-amber-400 bg-amber-500/10',
  };
  const card = (
    <Card className={`p-4 ${onClick ? 'cursor-pointer hover:border-neutral-700 transition-colors' : ''}`}>
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${toneClasses[tone]}`}>
          <Icon className="w-4.5 h-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs text-neutral-500 truncate">{label}</div>
          <div className="text-lg font-semibold text-white">{value}</div>
        </div>
        {onClick && clickableLabel && (
          <ArrowRight className="w-4 h-4 text-neutral-600 shrink-0" />
        )}
      </div>
    </Card>
  );
  return onClick ? <button onClick={onClick} className="text-left w-full">{card}</button> : card;
}

const ACTIVITY_ICONS: Record<string, typeof Activity> = {
  sprint: Activity,
  task: GitBranch,
  build: Zap,
  ai: Sparkles,
};

const ACTIVITY_STATUS_TONES: Record<string, 'accent' | 'danger' | 'primary' | 'neutral' | 'warning'> = {
  SUCCESS: 'accent',
  FAILED: 'danger',
  RUNNING: 'primary',
  CANCELLED: 'neutral',
  DONE: 'accent',
  IN_PROGRESS: 'primary',
  BLOCKED: 'danger',
  COMPLETED: 'accent',
  ACTIVE: 'primary',
  PLANNED: 'neutral',
};

function ActivityRow({ item }: { item: { id: string; type: string; title: string; subtitle: string; timestamp: string; status?: string } }) {
  const Icon = ACTIVITY_ICONS[item.type] ?? Activity;
  const tone = item.status ? ACTIVITY_STATUS_TONES[item.status] ?? 'neutral' : 'neutral';
  const timeAgo = (() => {
    const diff = Date.now() - new Date(item.timestamp).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return 'just now';
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  })();

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-neutral-900/40 transition-colors">
      <div className="w-7 h-7 rounded-lg bg-neutral-800/80 flex items-center justify-center shrink-0">
        <Icon className="w-3.5 h-3.5 text-neutral-400" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm text-white truncate">{item.title}</div>
        <div className="text-xs text-neutral-500 capitalize">{item.subtitle}</div>
      </div>
      <span className="text-xs text-neutral-600 shrink-0">{timeAgo}</span>
      {item.status && <Badge tone={tone} className="shrink-0 capitalize">{item.subtitle}</Badge>}
    </div>
  );
}

export function DashboardPage({ onNavigate }: DashboardPageProps) {
  const {
    projects, projectSummaries, totalTasks, totalDone, totalInProgress, totalBlocked,
    overallBuildSuccessRate, activeSprintCount, aiQuotaUsed, aiQuotaLimit,
    recentActivity, loading, error,
  } = useDashboard();
  const { activeOrg } = useOrg();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-6 w-6 border-2 border-primary-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="max-w-2xl space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-white">Welcome to DevPulse</h2>
          <p className="text-sm text-neutral-500 mt-0.5">
            Your unified project management and DevOps analytics platform.
          </p>
        </div>
        <Card className="p-10 text-center">
          <div className="w-14 h-14 rounded-xl bg-neutral-800 flex items-center justify-center mx-auto mb-4">
            <Layers className="w-7 h-7 text-neutral-500" />
          </div>
          <h3 className="text-base font-semibold text-white mb-1">No projects yet</h3>
          <p className="text-sm text-neutral-500 max-w-sm mx-auto mb-4">
            Create your first project to start managing sprints, tasks, and tracking build health.
          </p>
          <button
            onClick={() => onNavigate('projects')}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg bg-primary-600 hover:bg-primary-700 text-white transition-colors"
          >
            <Layers className="w-4 h-4" />
            Go to Projects
          </button>
        </Card>
      </div>
    );
  }

  const donePercent = totalTasks > 0 ? Math.round((totalDone / totalTasks) * 100) : 0;

  return (
    <div className="max-w-5xl space-y-6">
      {/* Welcome header */}
      <div>
        <h2 className="text-xl font-semibold text-white">
          {activeOrg?.name} overview
        </h2>
        <p className="text-sm text-neutral-500 mt-0.5">
          Cross-project metrics at a glance. Last updated just now.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-300">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Top stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Projects"
          value={projects.length}
          icon={Layers}
          tone="primary"
          onClick={() => onNavigate('projects')}
          clickableLabel="View projects"
        />
        <StatCard
          label="Active sprints"
          value={activeSprintCount}
          icon={Activity}
          tone={activeSprintCount > 0 ? 'accent' : 'neutral'}
          onClick={() => onNavigate('sprints')}
          clickableLabel="View sprints"
        />
        <StatCard
          label="Tasks in progress"
          value={totalInProgress}
          icon={GitBranch}
          tone={totalInProgress > 0 ? 'primary' : 'neutral'}
          onClick={() => onNavigate('tasks')}
          clickableLabel="View tasks"
        />
        <StatCard
          label="Build success"
          value={`${overallBuildSuccessRate}%`}
          icon={CheckCircle}
          tone={overallBuildSuccessRate >= 80 ? 'accent' : overallBuildSuccessRate > 0 ? 'danger' : 'neutral'}
          onClick={() => onNavigate('telemetry')}
          clickableLabel="View telemetry"
        />
      </div>

      {/* Progress + AI quota */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-neutral-400 uppercase tracking-wider">Task progress</h3>
            <button onClick={() => onNavigate('tasks')} className="text-xs text-primary-400 hover:text-primary-300 transition-colors">
              View all →
            </button>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-neutral-400">{totalDone} of {totalTasks} tasks done</span>
              <span className="text-white font-medium">{donePercent}%</span>
            </div>
            <div className="h-2.5 rounded-full bg-neutral-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary-500 to-accent-500 rounded-full transition-all"
                style={{ width: `${donePercent}%` }}
              />
            </div>
            <div className="grid grid-cols-3 gap-2 pt-1">
              <div className="flex items-center gap-2 text-xs">
                <div className="w-2 h-2 rounded-full bg-primary-500" />
                <span className="text-neutral-500">In progress: <span className="text-white">{totalInProgress}</span></span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <div className="w-2 h-2 rounded-full bg-accent-500" />
                <span className="text-neutral-500">Done: <span className="text-white">{totalDone}</span></span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-neutral-500">Blocked: <span className="text-white">{totalBlocked}</span></span>
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-neutral-400 uppercase tracking-wider">AI quota</h3>
            <button onClick={() => onNavigate('ai')} className="text-xs text-primary-400 hover:text-primary-300 transition-colors">
              Open AI →
            </button>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-neutral-400">Requests this period</span>
              <span className="text-white font-medium">{aiQuotaUsed} / {aiQuotaLimit}</span>
            </div>
            <div className="h-2.5 rounded-full bg-neutral-800 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${aiQuotaUsed / aiQuotaLimit > 0.8 ? 'bg-amber-500' : 'bg-gradient-to-r from-primary-500 to-accent-500'}`}
                style={{ width: `${Math.min(100, (aiQuotaUsed / aiQuotaLimit) * 100)}%` }}
              />
            </div>
            <div className="flex items-center gap-2 text-xs">
              {activeOrg?.ai_enabled ? (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-accent-400" />
                  <span className="text-neutral-500">AI features enabled · {aiQuotaLimit - aiQuotaUsed} remaining</span>
                </>
              ) : (
                <>
                  <Bot className="w-3.5 h-3.5 text-neutral-500" />
                  <span className="text-neutral-500">AI features disabled — enable in Settings</span>
                </>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* Per-project summary */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-neutral-400 uppercase tracking-wider">Projects</h3>
        <div className="space-y-2">
          {projectSummaries.map((ps) => (
            <Card key={ps.project.id} className="p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-neutral-800 flex items-center justify-center shrink-0">
                    <span className="text-xs font-mono font-semibold text-neutral-400">{ps.project.key}</span>
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-white truncate">{ps.project.name}</div>
                    <div className="text-xs text-neutral-500">
                      {ps.activeSprint ? (
                        <span className="text-primary-400">{ps.activeSprint.name}</span>
                      ) : (
                        'No active sprint'
                      )}
                    </div>
                  </div>
                </div>
                <div className="hidden md:flex items-center gap-4 shrink-0">
                  <div className="text-center">
                    <div className="text-sm font-semibold text-white">{ps.taskCount}</div>
                    <div className="text-xs text-neutral-600">tasks</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-semibold text-white">{ps.doneTasks}</div>
                    <div className="text-xs text-neutral-600">done</div>
                  </div>
                  {ps.blockedTasks > 0 && (
                    <div className="text-center">
                      <div className="text-sm font-semibold text-red-400">{ps.blockedTasks}</div>
                      <div className="text-xs text-neutral-600">blocked</div>
                    </div>
                  )}
                  <div className="text-center">
                    <div className={`text-sm font-semibold ${ps.buildSuccessRate >= 80 ? 'text-accent-400' : ps.recentBuilds > 0 ? 'text-red-400' : 'text-neutral-500'}`}>
                      {ps.recentBuilds > 0 ? `${ps.buildSuccessRate}%` : '—'}
                    </div>
                    <div className="text-xs text-neutral-600">builds</div>
                  </div>
                </div>
                <button
                  onClick={() => onNavigate('sprints')}
                  className="text-xs text-neutral-500 hover:text-white transition-colors shrink-0"
                >
                  Open →
                </button>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Recent activity */}
      {recentActivity.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-neutral-400 uppercase tracking-wider">Recent activity</h3>
          <Card className="p-2">
            <div className="space-y-0.5">
              {recentActivity.map((item) => (
                <ActivityRow key={item.id} item={item} />
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
