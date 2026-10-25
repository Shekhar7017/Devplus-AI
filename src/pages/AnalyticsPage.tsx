import { useState, FormEvent } from 'react';
import {
  BarChart3,
  TrendingUp,
  Clock,
  CheckCircle,
  XCircle,
  Activity,
  Zap,
  Beaker,
  Trash2,
  AlertCircle,
  Database,
  Layers,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from 'recharts';
import { useAnalytics } from '@/context/AnalyticsContext';
import { useProjects } from '@/context/ProjectsContext';
import { useOrg } from '@/context/OrgContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import type { TaskStatus, TaskType, DataOrigin } from '@/types';

const TASK_STATUS_COLORS: Record<TaskStatus, string> = {
  BACKLOG: '#525252',
  TODO: '#737373',
  IN_PROGRESS: '#3b82f6',
  IN_REVIEW: '#f59e0b',
  DONE: '#10b981',
  BLOCKED: '#ef4444',
};

const TASK_TYPE_COLORS: Record<TaskType, string> = {
  BUG: '#ef4444',
  FEATURE: '#10b981',
  TASK: '#3b82f6',
  EPIC: '#8b5cf6',
  SPIKE: '#f59e0b',
};

function StatCard({
  label, value, icon: Icon, tone = 'neutral', subtitle,
}: {
  label: string;
  value: string | number;
  icon: typeof TrendingUp;
  tone?: 'neutral' | 'accent' | 'danger' | 'primary';
  subtitle?: string;
}) {
  const toneClasses = {
    neutral: 'text-neutral-400 bg-neutral-800/60',
    accent: 'text-accent-400 bg-accent-500/10',
    danger: 'text-red-400 bg-red-500/10',
    primary: 'text-primary-400 bg-primary-500/10',
  };
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${toneClasses[tone]}`}>
          <Icon className="w-4.5 h-4.5" />
        </div>
        <div className="min-w-0">
          <div className="text-xs text-neutral-500 truncate">{label}</div>
          <div className="text-lg font-semibold text-white">{value}</div>
          {subtitle && <div className="text-xs text-neutral-600 truncate">{subtitle}</div>}
        </div>
      </div>
    </Card>
  );
}

function DataOriginBadge({ origin }: { origin: DataOrigin }) {
  if (origin === 'SIMULATED') {
    return <Badge tone="warning"><Beaker className="w-3 h-3" /> Simulated</Badge>;
  }
  return <Badge tone="accent"><Activity className="w-3 h-3" /> Real</Badge>;
}

export function AnalyticsPage() {
  const {
    sprintMetrics, taskMetrics, buildMetrics, datasets, loading, error,
    selectedProjectId, setSelectedProjectId, generateSimulation, deleteDataset,
  } = useAnalytics();
  const { projects } = useProjects();
  const { currentUserMembership } = useOrg();
  const [showGenerate, setShowGenerate] = useState(false);
  const [seed, setSeed] = useState('42');
  const [sprintCount, setSprintCount] = useState('5');
  const [genError, setGenError] = useState<string | null>(null);
  const [genLoading, setGenLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const canManage =
    currentUserMembership?.role === 'OWNER' || currentUserMembership?.role === 'ADMIN';

  const selectedProject = projects.find((p) => p.id === selectedProjectId);
  const hasData = sprintMetrics.length > 0 || taskMetrics.total > 0 || buildMetrics.total > 0;

  const handleGenerate = async (e: FormEvent) => {
    e.preventDefault();
    setGenError(null);
    const seedNum = parseInt(seed, 10);
    const sprintNum = parseInt(sprintCount, 10);
    if (isNaN(seedNum) || seedNum < 0) { setGenError('Seed must be a non-negative number'); return; }
    if (isNaN(sprintNum) || sprintNum < 1 || sprintNum > 20) { setGenError('Sprint count must be 1-20'); return; }
    setGenLoading(true);
    try {
      await generateSimulation(seedNum, sprintNum);
      setShowGenerate(false);
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Failed to generate simulation data');
    } finally {
      setGenLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-6 w-6 border-2 border-primary-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const velocityData = sprintMetrics.map((s) => ({
    name: s.sprintName,
    velocity: s.velocity,
    tasks: s.doneTasks,
  }));

  const statusData = (Object.entries(taskMetrics.byStatus) as [TaskStatus, number][])
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ name: k.replace('_', ' ').toLowerCase(), value: v, status: k }));

  const typeData = (Object.entries(taskMetrics.byType) as [TaskType, number][])
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ name: k.toLowerCase(), value: v, type: k }));

  const buildTimelineData = buildMetrics.recent.map((b, i) => ({
    name: `#${i + 1}`,
    duration: b.duration_seconds,
    success: b.status === 'SUCCESS' ? 1 : 0,
    failed: b.status === 'FAILED' ? 1 : 0,
  }));

  return (
    <div className="max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">HAISDM Analytics</h2>
          <p className="text-sm text-neutral-500 mt-0.5">
            Baseline metrics across sprints, tasks, and build health.
          </p>
        </div>
        {canManage && (
          <Button variant="secondary" size="sm" onClick={() => { setGenError(null); setShowGenerate(true); }}>
            <Beaker className="w-4 h-4" />
            Generate simulation
          </Button>
        )}
      </div>

      {/* Project selector + data origin */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
          <label className="text-sm text-neutral-400">Project:</label>
          <select
            value={selectedProjectId ?? ''}
            onChange={(e) => setSelectedProjectId(e.target.value || null)}
            className="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500/40 cursor-pointer"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.key} — {p.name}</option>
            ))}
          </select>
        </div>
        {selectedProject && <DataOriginBadge origin={selectedProject.data_origin} />}
      </div>

      {error && (
        <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-300">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Empty state */}
      {!hasData && (
        <Card className="p-10 text-center">
          <div className="w-14 h-14 rounded-xl bg-neutral-800 flex items-center justify-center mx-auto mb-4">
            <BarChart3 className="w-7 h-7 text-neutral-500" />
          </div>
          <h3 className="text-base font-semibold text-white mb-1">No data to analyze yet</h3>
          <p className="text-sm text-neutral-500 max-w-sm mx-auto mb-4">
            Create sprints, tasks, and build runs to see metrics here. Admins can also
            generate simulated data to explore the analytics dashboards.
          </p>
          {canManage && (
            <Button size="sm" onClick={() => { setGenError(null); setShowGenerate(true); }}>
              <Beaker className="w-4 h-4" />
              Generate simulation data
            </Button>
          )}
        </Card>
      )}

      {/* Stats overview */}
      {hasData && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Total sprints" value={sprintMetrics.length} icon={Layers} tone="primary" />
          <StatCard label="Total tasks" value={taskMetrics.total} icon={Activity} />
          <StatCard label="Avg cycle time" value={taskMetrics.avgCycleTimeDays > 0 ? `${taskMetrics.avgCycleTimeDays}d` : '—'} icon={Clock} />
          <StatCard label="Build success" value={`${buildMetrics.successRate}%`} icon={CheckCircle} tone={buildMetrics.successRate >= 80 ? 'accent' : 'danger'} />
        </div>
      )}

      {/* Velocity chart */}
      {velocityData.length > 0 && (
        <Card className="p-5">
          <h3 className="text-sm font-medium text-neutral-400 uppercase tracking-wider mb-4">Sprint velocity</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={velocityData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
              <XAxis dataKey="name" stroke="#737373" fontSize={11} />
              <YAxis stroke="#737373" fontSize={11} />
              <Tooltip
                contentStyle={{ background: '#171717', border: '1px solid #404040', borderRadius: '8px', fontSize: '12px' }}
                labelStyle={{ color: '#e5e5e5' }}
              />
              <Bar dataKey="velocity" name="Story points" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Task distribution */}
      {taskMetrics.total > 0 && (
        <div className="grid md:grid-cols-2 gap-4">
          {statusData.length > 0 && (
            <Card className="p-5">
              <h3 className="text-sm font-medium text-neutral-400 uppercase tracking-wider mb-4">Task status distribution</h3>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={statusData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    innerRadius={40}
                  >
                    {statusData.map((entry) => (
                      <Cell key={entry.status} fill={TASK_STATUS_COLORS[entry.status]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: '#171717', border: '1px solid #404040', borderRadius: '8px', fontSize: '12px' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', color: '#a3a3a3' }} />
                </PieChart>
              </ResponsiveContainer>
            </Card>
          )}
          {typeData.length > 0 && (
            <Card className="p-5">
              <h3 className="text-sm font-medium text-neutral-400 uppercase tracking-wider mb-4">Task type breakdown</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={typeData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                  <XAxis type="number" stroke="#737373" fontSize={11} />
                  <YAxis type="category" dataKey="name" stroke="#737373" fontSize={11} width={70} />
                  <Tooltip
                    contentStyle={{ background: '#171717', border: '1px solid #404040', borderRadius: '8px', fontSize: '12px' }}
                  />
                  <Bar dataKey="value" name="Tasks" radius={[0, 4, 4, 0]}>
                    {typeData.map((entry) => (
                      <Cell key={entry.type} fill={TASK_TYPE_COLORS[entry.type]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )}
        </div>
      )}

      {/* Build health timeline */}
      {buildMetrics.total > 0 && (
        <Card className="p-5">
          <h3 className="text-sm font-medium text-neutral-400 uppercase tracking-wider mb-4">Build health timeline</h3>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <StatCard label="Total builds" value={buildMetrics.total} icon={Zap} tone="primary" />
            <StatCard label="Avg duration" value={buildMetrics.avgDuration >= 60 ? `${Math.floor(buildMetrics.avgDuration / 60)}m ${buildMetrics.avgDuration % 60}s` : `${buildMetrics.avgDuration}s`} icon={Clock} />
            <StatCard label="Failed" value={buildMetrics.failed} icon={XCircle} tone={buildMetrics.failed > 0 ? 'danger' : 'neutral'} />
          </div>
          {buildTimelineData.length > 1 && (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={buildTimelineData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                <XAxis dataKey="name" stroke="#737373" fontSize={11} />
                <YAxis stroke="#737373" fontSize={11} />
                <Tooltip
                  contentStyle={{ background: '#171717', border: '1px solid #404040', borderRadius: '8px', fontSize: '12px' }}
                />
                <Line type="monotone" dataKey="duration" name="Duration (s)" stroke="#3b82f6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>
      )}

      {/* Simulation datasets */}
      {datasets.length > 0 && (
        <div className="space-y-3 pt-2">
          <h3 className="text-sm font-medium text-neutral-400 uppercase tracking-wider">Simulation datasets</h3>
          <div className="space-y-2">
            {datasets.map((ds) => (
              <div key={ds.id} className="flex items-center gap-3 px-4 py-3 rounded-lg bg-neutral-900/40 border border-neutral-800/40">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                  <Database className="w-4 h-4 text-amber-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-white truncate">{ds.name}</div>
                  <div className="text-xs text-neutral-500">
                    {ds.sprint_count} sprints · {ds.task_count} tasks · {ds.build_count} builds
                  </div>
                </div>
                <div className="hidden sm:block text-xs text-neutral-500 shrink-0">
                  {new Date(ds.created_at).toLocaleDateString()}
                </div>
                {canManage && (
                  <button
                    onClick={() => setConfirmDelete(ds.id)}
                    className="p-1.5 rounded-md text-neutral-500 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
                    title="Delete dataset"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Generate simulation modal */}
      <Modal
        open={showGenerate}
        onClose={() => { setShowGenerate(false); setGenError(null); }}
        title="Generate simulation data"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setShowGenerate(false)}>Cancel</Button>
            <Button size="sm" loading={genLoading} onClick={handleGenerate as unknown as () => void}>
              <Beaker className="w-4 h-4" />
              Generate
            </Button>
          </>
        }
      >
        <form onSubmit={handleGenerate} className="space-y-4">
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-sm text-amber-300">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>This will add simulated sprints, tasks, and build runs to the selected project. The data is labelled as simulated and can be deleted later.</span>
          </div>
          <Input
            label="Random seed"
            type="number"
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
          />
          <p className="text-xs text-neutral-600 -mt-2">Same seed produces the same data (reproducible)</p>
          <Input
            label="Sprint count"
            type="number"
            value={sprintCount}
            onChange={(e) => setSprintCount(e.target.value)}
          />
          <p className="text-xs text-neutral-600 -mt-2">Number of sprints to generate (1-20)</p>
          {genError && (
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-300">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{genError}</span>
            </div>
          )}
        </form>
      </Modal>

      {/* Delete dataset confirm */}
      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete simulation dataset"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button variant="danger" size="sm" onClick={async () => {
              try { await deleteDataset(confirmDelete!); } catch (err) {
                setGenError(err instanceof Error ? err.message : 'Failed to delete dataset');
              }
              setConfirmDelete(null);
            }}>
              <Trash2 className="w-4 h-4" />
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-neutral-300">
          Delete this simulation dataset? The associated sprints, tasks, and build runs will remain
          but will no longer be linked to a dataset record.
        </p>
      </Modal>
    </div>
  );
}
