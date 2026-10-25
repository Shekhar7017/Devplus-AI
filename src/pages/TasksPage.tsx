import { useState, FormEvent, useEffect } from 'react';
import {
  Plus,
  AlertCircle,
  Bug,
  Star,
  Ticket,
  Zap,
  Target,
  Clock,
  History as HistoryIcon,
  X,
} from 'lucide-react';
import { useSprintTask } from '@/context/SprintTaskContext';
import { useProjects } from '@/context/ProjectsContext';
import { useOrg } from '@/context/OrgContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import type { TaskWithAssignee, TaskStatus, TaskType, TaskPriority, TaskStatusHistory } from '@/types';

const STATUS_COLUMNS: { key: TaskStatus; label: string; tone: string }[] = [
  { key: 'BACKLOG', label: 'Backlog', tone: 'bg-neutral-700' },
  { key: 'TODO', label: 'To Do', tone: 'bg-blue-500' },
  { key: 'IN_PROGRESS', label: 'In Progress', tone: 'bg-amber-500' },
  { key: 'IN_REVIEW', label: 'In Review', tone: 'bg-purple-500' },
  { key: 'DONE', label: 'Done', tone: 'bg-accent-500' },
  { key: 'BLOCKED', label: 'Blocked', tone: 'bg-red-500' },
];

const TYPE_ICONS: Record<TaskType, typeof Bug> = {
  BUG: Bug,
  FEATURE: Star,
  TASK: Ticket,
  EPIC: Target,
  SPIKE: Zap,
};

const PRIORITY_TONES: Record<TaskPriority, 'danger' | 'warning' | 'neutral' | 'primary'> = {
  BLOCKER: 'danger',
  HIGH: 'warning',
  MEDIUM: 'neutral',
  LOW: 'primary',
};

// Allowed transitions for dropdown
const ALLOWED_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  BACKLOG: ['TODO', 'IN_PROGRESS', 'BLOCKED'],
  TODO: ['IN_PROGRESS', 'BLOCKED', 'BACKLOG'],
  IN_PROGRESS: ['IN_REVIEW', 'DONE', 'BLOCKED'],
  IN_REVIEW: ['DONE', 'IN_PROGRESS', 'BLOCKED'],
  DONE: ['TODO', 'IN_PROGRESS'],
  BLOCKED: ['TODO', 'IN_PROGRESS', 'BACKLOG'],
};

function TaskCard({
  task,
  projectKey,
  onTransition,
  onShowHistory,
}: {
  task: TaskWithAssignee;
  projectKey: string;
  onTransition: (status: TaskStatus) => void;
  onShowHistory: () => void;
}) {
  const [showMove, setShowMove] = useState(false);
  const TypeIcon = TYPE_ICONS[task.type];
  const allowed = ALLOWED_TRANSITIONS[task.status] ?? [];

  return (
    <Card className="p-3.5 hover:border-neutral-700/80 transition-colors group">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <TypeIcon className="w-4 h-4 text-neutral-500 shrink-0" />
          <span className="text-xs font-mono text-neutral-500 shrink-0">
            {projectKey}-{task.number}
          </span>
        </div>
        <Badge tone={PRIORITY_TONES[task.priority]} className="shrink-0">
          {task.priority.toLowerCase()}
        </Badge>
      </div>

      <p className="text-sm text-white mb-2 line-clamp-2">{task.title}</p>

      {task.estimate_points > 0 && (
        <div className="text-xs text-neutral-500 mb-2 flex items-center gap-1">
          <Target className="w-3 h-3" />
          {task.estimate_points} pts
        </div>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-neutral-800/60">
        <div className="flex items-center gap-1.5">
          {task.assignee ? (
            <div className="w-6 h-6 rounded-full bg-neutral-700 flex items-center justify-center text-xs font-medium text-white">
              {(task.assignee.display_name ?? task.assignee.email)[0].toUpperCase()}
            </div>
          ) : (
            <div className="w-6 h-6 rounded-full bg-neutral-800 border border-dashed border-neutral-700" />
          )}
          <button
            onClick={onShowHistory}
            className="p-1 text-neutral-600 hover:text-neutral-400 transition-colors"
            title="Status history"
          >
            <HistoryIcon className="w-3.5 h-3.5" />
          </button>
        </div>

        {allowed.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setShowMove(!showMove)}
              className="text-xs text-neutral-500 hover:text-white transition-colors px-2 py-1 rounded-md hover:bg-neutral-800"
            >
              Move →
            </button>
            {showMove && (
              <div className="absolute right-0 top-full mt-1 z-10 rounded-lg bg-neutral-900 border border-neutral-800 shadow-xl py-1 min-w-[140px]">
                {allowed.map((status) => (
                  <button
                    key={status}
                    onClick={() => {
                      onTransition(status);
                      setShowMove(false);
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors"
                  >
                    {status.replace(/_/g, ' ')}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

function TaskFormModal({
  open,
  onClose,
  onSubmit,
  loading,
  error,
  sprints,
  members,
  projectKey,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: { title: string; description: string; type: TaskType; priority: TaskPriority; estimate_points: number; assignee_id: string | null; sprint_id: string | null }) => Promise<void>;
  loading: boolean;
  error: string | null;
  sprints: { id: string; name: string; status: string }[];
  members: { user_id: string; app_user: { email: string; display_name: string | null } }[];
  projectKey: string;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<TaskType>('TASK');
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM');
  const [estimatePoints, setEstimatePoints] = useState(0);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [sprintId, setSprintId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!title.trim()) {
      setFormError('Title is required');
      return;
    }
    await onSubmit({ title, description, type, priority, estimate_points: estimatePoints, assignee_id: assigneeId, sprint_id: sprintId });
  };

  const displayError = formError || error;
  const availableSprints = sprints.filter((s) => s.status === 'PLANNED' || s.status === 'ACTIVE');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create task"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={loading} onClick={handleSubmit as unknown as () => void}>
            <Plus className="w-4 h-4" />
            Create
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="Title" type="text" placeholder={`${projectKey}-1: Brief summary`} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} autoFocus />
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-neutral-300">Description</label>
          <textarea
            className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-primary-500/40 resize-none"
            rows={3}
            placeholder="Acceptance criteria, context, links..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={10000}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-neutral-300">Type</label>
            <select value={type} onChange={(e) => setType(e.target.value as TaskType)}
              className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500/40 cursor-pointer">
              <option value="TASK">Task</option>
              <option value="BUG">Bug</option>
              <option value="FEATURE">Feature</option>
              <option value="EPIC">Epic</option>
              <option value="SPIKE">Spike</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-neutral-300">Priority</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}
              className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500/40 cursor-pointer">
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="BLOCKER">Blocker</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Estimate (points)" type="number" min={0} max={100} value={estimatePoints} onChange={(e) => setEstimatePoints(parseInt(e.target.value) || 0)} />
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-neutral-300">Assignee</label>
            <select value={assigneeId ?? ''} onChange={(e) => setAssigneeId(e.target.value || null)}
              className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500/40 cursor-pointer">
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.app_user.display_name ?? m.app_user.email}
                </option>
              ))}
            </select>
          </div>
        </div>
        {availableSprints.length > 0 && (
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-neutral-300">Sprint (optional)</label>
            <select value={sprintId ?? ''} onChange={(e) => setSprintId(e.target.value || null)}
              className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500/40 cursor-pointer">
              <option value="">Backlog (no sprint)</option>
              {availableSprints.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.status})
                </option>
              ))}
            </select>
          </div>
        )}
        {displayError && (
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-300">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{displayError}</span>
          </div>
        )}
      </form>
    </Modal>
  );
}

function HistoryModal({
  open,
  onClose,
  history,
}: {
  open: boolean;
  onClose: () => void;
  history: TaskStatusHistory[];
}) {
  return (
    <Modal open={open} onClose={onClose} title="Status history" footer={<Button variant="ghost" size="sm" onClick={onClose}>Close</Button>}>
      {history.length === 0 ? (
        <p className="text-sm text-neutral-500">No history available.</p>
      ) : (
        <div className="space-y-3 max-h-80 overflow-y-auto">
          {history.map((entry) => (
            <div key={entry.id} className="flex items-start gap-3">
              <div className="flex flex-col items-center pt-0.5">
                <div className="w-2 h-2 rounded-full bg-primary-500" />
                <div className="w-px h-full bg-neutral-800" />
              </div>
              <div className="pb-1">
                <div className="text-sm text-white">
                  {entry.from_status ? entry.from_status.replace(/_/g, ' ') : 'Created'} → {entry.to_status.replace(/_/g, ' ')}
                </div>
                <div className="text-xs text-neutral-500 flex items-center gap-1 mt-0.5">
                  <Clock className="w-3 h-3" />
                  {new Date(entry.changed_at).toLocaleString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

export function TasksPage() {
  const { tasks, sprints, loading, selectedProjectId, setSelectedProjectId, createTask, transitionTask, getTaskHistory } = useSprintTask();
  const { projects } = useProjects();
  const { memberships } = useOrg();
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [historyTaskId, setHistoryTaskId] = useState<string | null>(null);
  const [history, setHistory] = useState<TaskStatusHistory[]>([]);

  const selectedProject = projects.find((p) => p.id === selectedProjectId);
  const projectKey = selectedProject?.key ?? 'PRJ';
  const isArchived = selectedProject?.status === 'ARCHIVED';

  useEffect(() => {
    if (historyTaskId) {
      getTaskHistory(historyTaskId).then(setHistory).catch(() => setHistory([]));
    }
  }, [historyTaskId, getTaskHistory]);

  const handleCreate = async (input: { title: string; description: string; type: TaskType; priority: TaskPriority; estimate_points: number; assignee_id: string | null; sprint_id: string | null }) => {
    setActionLoading(true);
    setError(null);
    try {
      await createTask(input);
      setShowCreate(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task');
    } finally {
      setActionLoading(false);
    }
  };

  const handleTransition = async (taskId: string, status: TaskStatus) => {
    setError(null);
    try {
      await transitionTask(taskId, status);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to move task');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-6 w-6 border-2 border-primary-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const activeProjects = projects.filter((p) => p.status === 'ACTIVE');

  if (activeProjects.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-800 p-12 text-center">
        <p className="text-sm text-neutral-400">No active projects available. Create a project first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Tasks</h2>
          <p className="text-sm text-neutral-500 mt-0.5">
            Kanban board with status workflow and history tracking.
          </p>
        </div>
        {!isArchived && (
          <Button size="sm" onClick={() => { setError(null); setShowCreate(true); }}>
            <Plus className="w-4 h-4" />
            New task
          </Button>
        )}
      </div>

      {/* Project selector + sprint filter */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-sm text-neutral-400">Project:</label>
          <select
            value={selectedProjectId ?? ''}
            onChange={(e) => setSelectedProjectId(e.target.value || null)}
            className="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500/40 cursor-pointer"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id} disabled={p.status === 'ARCHIVED'}>
                {p.key} — {p.name} {p.status === 'ARCHIVED' ? '(archived)' : ''}
              </option>
            ))}
          </select>
        </div>
        {isArchived && (
          <Badge tone="warning">Archived — read only</Badge>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-300">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-neutral-500 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Kanban board */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {STATUS_COLUMNS.map((col) => {
          const colTasks = tasks.filter((t) => t.status === col.key);
          return (
            <div key={col.key} className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <div className={`w-2 h-2 rounded-full ${col.tone}`} />
                <span className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
                  {col.label}
                </span>
                <span className="text-xs text-neutral-600 font-mono">{colTasks.length}</span>
              </div>
              <div className="space-y-3 min-h-[100px]">
                {colTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    projectKey={projectKey}
                    onTransition={(status) => handleTransition(task.id, status)}
                    onShowHistory={() => setHistoryTaskId(task.id)}
                  />
                ))}
                {colTasks.length === 0 && (
                  <div className="rounded-lg border border-dashed border-neutral-800/50 p-4 text-center">
                    <span className="text-xs text-neutral-600">Empty</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Create modal */}
      <TaskFormModal
        open={showCreate}
        onClose={() => { setShowCreate(false); setError(null); }}
        onSubmit={handleCreate}
        loading={actionLoading}
        error={error}
        sprints={sprints}
        members={memberships}
        projectKey={projectKey}
      />

      {/* History modal */}
      <HistoryModal
        open={!!historyTaskId}
        onClose={() => setHistoryTaskId(null)}
        history={history}
      />
    </div>
  );
}
