import { useState, FormEvent } from 'react';
import {
  Plus,
  Play,
  CheckCircle,
  XCircle,
  AlertCircle,
  Calendar,
  Target,
  Flag,
} from 'lucide-react';
import { useSprintTask } from '@/context/SprintTaskContext';
import { useProjects } from '@/context/ProjectsContext';
import { useOrg } from '@/context/OrgContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import type { Sprint, SprintStatus } from '@/types';

const STATUS_TONES: Record<SprintStatus, 'primary' | 'accent' | 'neutral' | 'warning' | 'danger'> = {
  PLANNED: 'neutral',
  ACTIVE: 'primary',
  COMPLETED: 'accent',
  CANCELLED: 'danger',
};

function SprintCard({
  sprint,
  taskCount,
  doneCount,
  canManage,
  onStart,
  onComplete,
  onCancel,
}: {
  sprint: Sprint;
  taskCount: number;
  doneCount: number;
  canManage: boolean;
  onStart: () => void;
  onComplete: () => void;
  onCancel: () => void;
}) {
  const progress = taskCount > 0 ? Math.round((doneCount / taskCount) * 100) : 0;
  const isPlanned = sprint.status === 'PLANNED';
  const isActive = sprint.status === 'ACTIVE';
  const isTerminal = sprint.status === 'COMPLETED' || sprint.status === 'CANCELLED';

  return (
    <Card className={`p-5 ${isActive ? 'border-primary-500/30' : ''}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-white truncate">{sprint.name}</span>
            <Badge tone={STATUS_TONES[sprint.status]}>{sprint.status}</Badge>
          </div>
          {sprint.goal && (
            <div className="flex items-start gap-1.5 text-xs text-neutral-500">
              <Target className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{sprint.goal}</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs text-neutral-500 mb-3">
        <span className="flex items-center gap-1">
          <Calendar className="w-3.5 h-3.5" />
          {new Date(sprint.start_date).toLocaleDateString()} → {new Date(sprint.end_date).toLocaleDateString()}
        </span>
        <span className="flex items-center gap-1">
          <Flag className="w-3.5 h-3.5" />
          {doneCount}/{taskCount} done
        </span>
      </div>

      {taskCount > 0 && (
        <div className="w-full h-1.5 rounded-full bg-neutral-800 mb-4 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              sprint.status === 'COMPLETED' ? 'bg-accent-500' : 'bg-primary-500'
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {!isTerminal && canManage && (
        <div className="flex items-center gap-2 pt-1">
          {isPlanned && (
            <Button size="sm" variant="primary" onClick={onStart}>
              <Play className="w-3.5 h-3.5" />
              Start
            </Button>
          )}
          {isActive && (
            <Button size="sm" variant="secondary" onClick={onComplete}>
              <CheckCircle className="w-3.5 h-3.5" />
              Complete
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onCancel}>
            <XCircle className="w-3.5 h-3.5" />
            Cancel
          </Button>
        </div>
      )}
    </Card>
  );
}

export function SprintsPage() {
  const { sprints, tasks, loading, createSprint, startSprint, completeSprint, cancelSprint, selectedProjectId, setSelectedProjectId } = useSprintTask();
  const { projects } = useProjects();
  const { currentUserMembership } = useOrg();
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ type: 'start' | 'complete' | 'cancel'; sprint: Sprint } | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10));

  const canManage =
    currentUserMembership?.role === 'OWNER' || currentUserMembership?.role === 'ADMIN';

  const activeProjects = projects.filter((p) => p.status === 'ACTIVE');

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError('Sprint name is required');
      return;
    }
    if (new Date(endDate) <= new Date(startDate)) {
      setError('End date must be after start date');
      return;
    }
    setActionLoading(true);
    try {
      await createSprint({ name: name.trim(), goal: goal.trim() || undefined, start_date: startDate, end_date: endDate });
      setName('');
      setGoal('');
      setShowCreate(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create sprint');
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmAction = async () => {
    if (!confirmAction) return;
    setActionLoading(true);
    setError(null);
    try {
      if (confirmAction.type === 'start') await startSprint(confirmAction.sprint.id);
      if (confirmAction.type === 'complete') await completeSprint(confirmAction.sprint.id);
      if (confirmAction.type === 'cancel') await cancelSprint(confirmAction.sprint.id);
      setConfirmAction(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-6 w-6 border-2 border-primary-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (activeProjects.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-800 p-12 text-center">
        <p className="text-sm text-neutral-400">
          No active projects available. Create or unarchive a project first to manage sprints.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Sprints</h2>
          <p className="text-sm text-neutral-500 mt-0.5">
            Plan, start, and complete sprints. One active sprint per project.
          </p>
        </div>
        {canManage && (
          <Button size="sm" onClick={() => { setError(null); setShowCreate(true); }}>
            <Plus className="w-4 h-4" />
            New sprint
          </Button>
        )}
      </div>

      {/* Project selector */}
      <div className="flex items-center gap-3">
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

      {error && (
        <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-300">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {sprints.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-800 p-12 text-center">
          <p className="text-sm text-neutral-400">
            No sprints yet. {canManage && 'Create your first sprint to start planning.'}
          </p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {sprints.map((sprint) => {
            const sprintTasks = tasks.filter((t) => t.sprint_id === sprint.id);
            const doneCount = sprintTasks.filter((t) => t.status === 'DONE').length;
            return (
              <SprintCard
                key={sprint.id}
                sprint={sprint}
                taskCount={sprintTasks.length}
                doneCount={doneCount}
                canManage={canManage ?? false}
                onStart={() => setConfirmAction({ type: 'start', sprint })}
                onComplete={() => setConfirmAction({ type: 'complete', sprint })}
                onCancel={() => setConfirmAction({ type: 'cancel', sprint })}
              />
            );
          })}
        </div>
      )}

      {/* Create modal */}
      <Modal
        open={showCreate}
        onClose={() => { setShowCreate(false); setError(null); }}
        title="Create sprint"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button size="sm" loading={actionLoading} onClick={handleCreate as unknown as () => void}>
              <Plus className="w-4 h-4" />
              Create
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <Input label="Sprint name" type="text" placeholder="Sprint 1" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-neutral-300">Goal (optional)</label>
            <textarea
              className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-primary-500/40 resize-none"
              rows={2}
              placeholder="Ship the authentication module"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Start date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <Input label="End date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          {error && (
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-300">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </form>
      </Modal>

      {/* Confirm action modal */}
      <Modal
        open={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        title={
          confirmAction?.type === 'start' ? 'Start sprint' :
          confirmAction?.type === 'complete' ? 'Complete sprint' :
          'Cancel sprint'
        }
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setConfirmAction(null)}>Cancel</Button>
            <Button
              size="sm"
              variant={confirmAction?.type === 'cancel' ? 'danger' : 'primary'}
              loading={actionLoading}
              onClick={handleConfirmAction}
            >
              {confirmAction?.type === 'start' ? 'Start' :
               confirmAction?.type === 'complete' ? 'Complete' : 'Cancel sprint'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-neutral-300">
          {confirmAction?.type === 'start' && `Start "${confirmAction.sprint.name}"? This will set it as the active sprint.`}
          {confirmAction?.type === 'complete' && `Complete "${confirmAction.sprint.name}"? Unfinished tasks will move to the backlog. This cannot be undone.`}
          {confirmAction?.type === 'cancel' && `Cancel "${confirmAction.sprint.name}"? All tasks will move to the backlog. This cannot be undone.`}
        </p>
      </Modal>
    </div>
  );
}
