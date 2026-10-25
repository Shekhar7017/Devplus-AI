import { useState } from 'react';
import {
  Bot,
  Sparkles,
  FileText,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  Check,
  X,
  History,
  TrendingUp,
} from 'lucide-react';
import { useAI } from '@/context/AIContext';
import { useOrg } from '@/context/OrgContext';
import { useProjects } from '@/context/ProjectsContext';
import { useSprintTask } from '@/context/SprintTaskContext';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import type { AIRequestType, AIInteraction, AIInteractionStatus } from '@/types';

interface TaskRefinementResult {
  refined_title?: string;
  refined_description?: string;
  acceptance_criteria?: string[];
  suggested_estimate?: number;
  implementation_notes?: string;
  raw_response?: string;
}

interface SprintSummaryResult {
  summary?: string;
  progress?: number;
  risks?: string[];
  recommendations?: string[];
  velocity_note?: string;
  raw_response?: string;
}

const STATUS_TONES: Record<AIInteractionStatus, 'accent' | 'danger' | 'primary'> = {
  COMPLETED: 'accent',
  FAILED: 'danger',
  PENDING: 'primary',
};

const STATUS_ICONS: Record<AIInteractionStatus, typeof CheckCircle> = {
  COMPLETED: CheckCircle,
  FAILED: XCircle,
  PENDING: Loader2,
};

function RefinementResult({ result }: { result: TaskRefinementResult }) {
  return (
    <div className="space-y-4">
      {result.refined_title && (
        <div>
          <div className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">Refined title</div>
          <p className="text-sm text-white">{result.refined_title}</p>
        </div>
      )}
      {result.refined_description && (
        <div>
          <div className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">Refined description</div>
          <p className="text-sm text-neutral-300 leading-relaxed">{result.refined_description}</p>
        </div>
      )}
      {result.acceptance_criteria && result.acceptance_criteria.length > 0 && (
        <div>
          <div className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-2">Acceptance criteria</div>
          <ul className="space-y-1.5">
            {result.acceptance_criteria.map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-neutral-300">
                <Check className="w-3.5 h-3.5 text-accent-400 mt-0.5 shrink-0" />
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {result.suggested_estimate !== undefined && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-neutral-900/60 border border-neutral-800">
          <TrendingUp className="w-4 h-4 text-primary-400" />
          <div>
            <span className="text-xs text-neutral-500">Suggested estimate: </span>
            <span className="text-sm font-medium text-white">{result.suggested_estimate} points</span>
          </div>
        </div>
      )}
      {result.implementation_notes && (
        <div>
          <div className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">Implementation notes</div>
          <p className="text-sm text-neutral-300 leading-relaxed">{result.implementation_notes}</p>
        </div>
      )}
      {result.raw_response && !result.refined_title && (
        <p className="text-sm text-neutral-300 leading-relaxed whitespace-pre-wrap">{result.raw_response}</p>
      )}
    </div>
  );
}

function SummaryResult({ result }: { result: SprintSummaryResult }) {
  return (
    <div className="space-y-4">
      {result.summary && (
        <div>
          <div className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">Summary</div>
          <p className="text-sm text-neutral-300 leading-relaxed whitespace-pre-wrap">{result.summary}</p>
        </div>
      )}
      {result.progress !== undefined && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-neutral-900/60 border border-neutral-800">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-neutral-500">Progress</span>
              <span className="text-sm font-medium text-white">{result.progress}%</span>
            </div>
            <div className="h-2 rounded-full bg-neutral-800 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-primary-500 to-accent-500 rounded-full transition-all" style={{ width: `${result.progress}%` }} />
            </div>
          </div>
        </div>
      )}
      {result.risks && result.risks.length > 0 && (
        <div>
          <div className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-2">Risks</div>
          <ul className="space-y-1.5">
            {result.risks.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-neutral-300">
                <AlertCircle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {result.recommendations && result.recommendations.length > 0 && (
        <div>
          <div className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-2">Recommendations</div>
          <ul className="space-y-1.5">
            {result.recommendations.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-neutral-300">
                <Sparkles className="w-3.5 h-3.5 text-primary-400 mt-0.5 shrink-0" />
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {result.velocity_note && (
        <div>
          <div className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">Velocity note</div>
          <p className="text-sm text-neutral-300 leading-relaxed">{result.velocity_note}</p>
        </div>
      )}
      {result.raw_response && !result.summary && (
        <p className="text-sm text-neutral-300 leading-relaxed whitespace-pre-wrap">{result.raw_response}</p>
      )}
    </div>
  );
}

function InteractionRow({
  interaction,
  onDecision,
}: {
  interaction: AIInteraction;
  onDecision: (id: string, decision: 'ACCEPTED' | 'REJECTED') => void;
}) {
  const Icon = STATUS_ICONS[interaction.status];
  const isPending = interaction.status === 'PENDING';
  const typeLabel = interaction.request_type === 'TASK_REFINEMENT' ? 'Task Refinement' : 'Sprint Summary';

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-neutral-900/40 border border-neutral-800/40">
      <div className={isPending ? 'animate-spin' : ''}>
        <Icon className={`w-4 h-4 ${interaction.status === 'COMPLETED' ? 'text-accent-400' : interaction.status === 'FAILED' ? 'text-red-400' : 'text-primary-400'}`} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm text-white truncate">{typeLabel}</div>
        <div className="text-xs text-neutral-500">{new Date(interaction.created_at).toLocaleString()}</div>
      </div>
      {interaction.tokens_used > 0 && (
        <div className="hidden sm:block text-xs text-neutral-600 shrink-0">{interaction.tokens_used} tokens</div>
      )}
      <Badge tone={STATUS_TONES[interaction.status]} className="shrink-0">
        {interaction.status.toLowerCase()}
      </Badge>
      {interaction.status === 'COMPLETED' && interaction.decision === 'NONE' && (
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onDecision(interaction.id, 'ACCEPTED')}
            className="p-1.5 rounded-md text-neutral-500 hover:text-accent-400 hover:bg-accent-500/10 transition-colors"
            title="Accept suggestion"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onDecision(interaction.id, 'REJECTED')}
            className="p-1.5 rounded-md text-neutral-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title="Reject suggestion"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {interaction.decision !== 'NONE' && interaction.status === 'COMPLETED' && (
        <Badge tone={interaction.decision === 'ACCEPTED' ? 'accent' : 'danger'} className="shrink-0">
          {interaction.decision === 'ACCEPTED' ? 'Accepted' : 'Rejected'}
        </Badge>
      )}
    </div>
  );
}

export function AIPage() {
  const { activeOrg } = useOrg();
  const { projects } = useProjects();
  const { sprints, tasks, selectedProjectId, setSelectedProjectId } = useSprintTask();
  const { interactions, updateDecision } = useAI();
  const [activeTab, setActiveTab] = useState<'refine' | 'summary'>('refine');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedSprintId, setSelectedSprintId] = useState<string | null>(null);
  const [result, setResult] = useState<TaskRefinementResult | SprintSummaryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const aiEnabled = activeOrg?.ai_enabled ?? false;
  const quotaUsed = activeOrg?.ai_requests_this_period ?? 0;
  const quotaLimit = 100;
  const quotaRemaining = Math.max(0, quotaLimit - quotaUsed);

  const activeSprint = sprints.find((s) => s.status === 'ACTIVE');
  const selectedTask = tasks.find((t) => t.id === selectedTaskId);
  const selectedSprint = sprints.find((s) => s.id === selectedSprintId) ?? activeSprint;

  const callAI = async (type: AIRequestType) => {
    setError(null);
    setResult(null);
    setLoading(true);

    try {
      let payload: Record<string, unknown> = {};

      if (type === 'TASK_REFINEMENT') {
        if (!selectedTask) {
          setError('Select a task to refine');
          setLoading(false);
          return;
        }
        payload = {
          title: selectedTask.title,
          description: selectedTask.description ?? '',
          type: selectedTask.type,
          priority: selectedTask.priority,
          estimate_points: selectedTask.estimate_points,
        };
      } else {
        if (!selectedSprint) {
          setError('No active sprint to summarize');
          setLoading(false);
          return;
        }
        const sprintTasks = tasks.filter((t) => t.sprint_id === selectedSprint.id);
        payload = {
          name: selectedSprint.name,
          goal: selectedSprint.goal ?? '',
          tasks: sprintTasks.map((t) => ({
            title: t.title,
            status: t.status,
            type: t.type,
            assignee: t.assignee?.email ?? null,
          })),
        };
      }

      const { data } = await api.post<{ response: string }>('/ai/assist', {
        request_type: type,
        organization_id: activeOrg?.id,
        project_id: selectedProjectId,
        payload,
      });
      try {
        setResult(JSON.parse(data.response) as TaskRefinementResult | SprintSummaryResult);
      } catch {
        setResult({ raw_response: data.response });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI request failed');
    } finally {
      setLoading(false);
    }
  };

  if (!aiEnabled) {
    return (
      <div className="max-w-3xl">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-white">AI Assistance</h2>
          <p className="text-sm text-neutral-500 mt-0.5">
            Gemini-powered task refinement and sprint summaries.
          </p>
        </div>
        <Card className="p-10 text-center">
          <div className="w-14 h-14 rounded-xl bg-neutral-800 flex items-center justify-center mx-auto mb-4">
            <Bot className="w-7 h-7 text-neutral-500" />
          </div>
          <h3 className="text-base font-semibold text-white mb-1">AI features are disabled</h3>
          <p className="text-sm text-neutral-500 max-w-sm mx-auto">
            An organization admin can enable AI features in Settings. When enabled, members can use
            Gemini-powered task refinement and sprint summaries with a per-organization quota.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">AI Assistance</h2>
          <p className="text-sm text-neutral-500 mt-0.5">
            Gemini-powered task refinement and sprint summaries.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setShowHistory(true)}>
          <History className="w-4 h-4" />
          History
        </Button>
      </div>

      {/* Quota bar */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary-400" />
            <span className="text-sm text-white">Monthly AI quota</span>
          </div>
          <span className="text-xs text-neutral-500">{quotaUsed} / {quotaLimit} used · {quotaRemaining} remaining</span>
        </div>
        <div className="h-2 rounded-full bg-neutral-800 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${quotaRemaining < 20 ? 'bg-amber-500' : 'bg-gradient-to-r from-primary-500 to-accent-500'}`}
            style={{ width: `${Math.min(100, (quotaUsed / quotaLimit) * 100)}%` }}
          />
        </div>
      </Card>

      {/* Project selector */}
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

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-lg bg-neutral-900 border border-neutral-800 w-fit">
        <button
          onClick={() => { setActiveTab('refine'); setResult(null); setError(null); }}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
            activeTab === 'refine' ? 'bg-primary-500/15 text-primary-300' : 'text-neutral-400 hover:text-white'
          }`}
        >
          <span className="inline-flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            Task Refinement
          </span>
        </button>
        <button
          onClick={() => { setActiveTab('summary'); setResult(null); setError(null); }}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
            activeTab === 'summary' ? 'bg-primary-500/15 text-primary-300' : 'text-neutral-400 hover:text-white'
          }`}
        >
          <span className="inline-flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Sprint Summary
          </span>
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-300">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Refinement tab */}
      {activeTab === 'refine' && (
        <Card className="p-5 space-y-4">
          <div>
            <label className="text-sm text-neutral-400 block mb-2">Select a task to refine</label>
            {tasks.length === 0 ? (
              <p className="text-sm text-neutral-500 p-4 text-center rounded-lg bg-neutral-900/40 border border-neutral-800/40">
                No tasks in this project. Create tasks first.
              </p>
            ) : (
              <select
                value={selectedTaskId ?? ''}
                onChange={(e) => setSelectedTaskId(e.target.value || null)}
                className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500/40 cursor-pointer"
              >
                <option value="">Choose a task...</option>
                {tasks.map((t) => (
                  <option key={t.id} value={t.id}>#{t.number} — {t.title}</option>
                ))}
              </select>
            )}
          </div>

          {selectedTask && (
            <div className="p-3 rounded-lg bg-neutral-900/40 border border-neutral-800/40 space-y-1">
              <div className="text-sm text-white">{selectedTask.title}</div>
              <div className="flex items-center gap-2 text-xs text-neutral-500">
                <Badge tone="neutral">{selectedTask.type}</Badge>
                <Badge tone="neutral">{selectedTask.priority}</Badge>
                <span>{selectedTask.estimate_points} pts</span>
              </div>
            </div>
          )}

          <Button
            onClick={() => callAI('TASK_REFINEMENT')}
            disabled={!selectedTask || loading || quotaRemaining === 0}
            loading={loading}
          >
            <Sparkles className="w-4 h-4" />
            {loading ? 'Refining...' : 'Refine task with AI'}
          </Button>

          {result && <RefinementResult result={result as TaskRefinementResult} />}
        </Card>
      )}

      {/* Summary tab */}
      {activeTab === 'summary' && (
        <Card className="p-5 space-y-4">
          <div>
            <label className="text-sm text-neutral-400 block mb-2">Select a sprint to summarize</label>
            {sprints.length === 0 ? (
              <p className="text-sm text-neutral-500 p-4 text-center rounded-lg bg-neutral-900/40 border border-neutral-800/40">
                No sprints in this project. Create a sprint first.
              </p>
            ) : (
              <select
                value={selectedSprintId ?? activeSprint?.id ?? ''}
                onChange={(e) => setSelectedSprintId(e.target.value || null)}
                className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500/40 cursor-pointer"
              >
                {sprints.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.status.toLowerCase()})
                  </option>
                ))}
              </select>
            )}
          </div>

          {selectedSprint && (
            <div className="p-3 rounded-lg bg-neutral-900/40 border border-neutral-800/40">
              <div className="text-sm text-white">{selectedSprint.name}</div>
              {selectedSprint.goal && (
                <div className="text-xs text-neutral-500 mt-1">{selectedSprint.goal}</div>
              )}
              <div className="text-xs text-neutral-500 mt-2">
                {tasks.filter((t) => t.sprint_id === selectedSprint.id).length} tasks in sprint
              </div>
            </div>
          )}

          <Button
            onClick={() => callAI('SPRINT_SUMMARY')}
            disabled={!selectedSprint || loading || quotaRemaining === 0}
            loading={loading}
          >
            <FileText className="w-4 h-4" />
            {loading ? 'Generating summary...' : 'Generate sprint summary'}
          </Button>

          {result && <SummaryResult result={result as SprintSummaryResult} />}
        </Card>
      )}

      {/* History modal */}
      <Modal
        open={showHistory}
        onClose={() => setShowHistory(false)}
        title="AI interaction history"
        footer={
          <Button size="sm" onClick={() => setShowHistory(false)}>Close</Button>
        }
      >
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {interactions.length === 0 ? (
            <p className="text-sm text-neutral-500 text-center py-6">No AI interactions yet.</p>
          ) : (
            interactions.map((i) => (
              <InteractionRow
                key={i.id}
                interaction={i}
                onDecision={async (id, decision) => {
                  try { await updateDecision(id, decision); } catch { /* ignore */ }
                }}
              />
            ))
          )}
        </div>
      </Modal>
    </div>
  );
}
