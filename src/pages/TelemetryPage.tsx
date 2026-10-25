import { useState, FormEvent } from 'react';
import {
  Plus,
  Key,
  Trash2,
  CheckCircle,
  XCircle,
  Clock,
  GitBranch,
  Zap,
  TrendingUp,
  AlertCircle,
  Copy,
  Check,
  Activity,
  Loader2,
} from 'lucide-react';
import { useTelemetry } from '@/context/TelemetryContext';
import { useProjects } from '@/context/ProjectsContext';
import { useOrg } from '@/context/OrgContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import type { BuildRun, BuildStatus } from '@/types';

const STATUS_ICONS: Record<BuildStatus, typeof CheckCircle> = {
  SUCCESS: CheckCircle,
  FAILED: XCircle,
  RUNNING: Loader2,
  CANCELLED: XCircle,
};

const STATUS_TONES: Record<BuildStatus, 'accent' | 'danger' | 'primary' | 'neutral'> = {
  SUCCESS: 'accent',
  FAILED: 'danger',
  RUNNING: 'primary',
  CANCELLED: 'neutral',
};

function StatCard({
  label,
  value,
  icon: Icon,
  tone = 'neutral',
}: {
  label: string;
  value: string | number;
  icon: typeof TrendingUp;
  tone?: 'neutral' | 'accent' | 'danger' | 'primary';
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
        </div>
      </div>
    </Card>
  );
}

function BuildRunRow({ run }: { run: BuildRun }) {
  const Icon = STATUS_ICONS[run.status];
  const isRunning = run.status === 'RUNNING';
  const duration = run.duration_seconds > 0
    ? run.duration_seconds >= 60
      ? `${Math.floor(run.duration_seconds / 60)}m ${run.duration_seconds % 60}s`
      : `${run.duration_seconds}s`
    : '—';

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-neutral-900/40 border border-neutral-800/40 hover:border-neutral-700/60 transition-colors">
      <div className={`shrink-0 ${isRunning ? 'animate-spin' : ''}`}>
        <Icon className={`w-4 h-4 ${
          run.status === 'SUCCESS' ? 'text-accent-400' :
          run.status === 'FAILED' ? 'text-red-400' :
          run.status === 'RUNNING' ? 'text-primary-400' :
          'text-neutral-500'
        }`} />
      </div>
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="text-xs font-mono text-neutral-500 shrink-0">{run.external_run_id}</span>
        <span className="text-sm text-white truncate">{run.branch}</span>
      </div>
      <div className="hidden md:flex items-center gap-1 text-xs text-neutral-500 shrink-0">
        <GitBranch className="w-3 h-3" />
        <span className="font-mono">{run.commit_sha.slice(0, 7)}</span>
      </div>
      <div className="hidden sm:flex items-center gap-1 text-xs text-neutral-500 shrink-0">
        <Clock className="w-3 h-3" />
        {duration}
      </div>
      <Badge tone={STATUS_TONES[run.status]} className="shrink-0">
        {run.status.toLowerCase()}
      </Badge>
      {run.build_url && (
        <a
          href={run.build_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-neutral-600 hover:text-white transition-colors shrink-0"
        >
          View →
        </a>
      )}
    </div>
  );
}

function ApiKeyRow({
  apiKey,
  canManage,
  onRevoke,
}: {
  apiKey: { id: string; name: string; key_prefix: string; last_used_at: string | null; created_at: string };
  canManage: boolean;
  onRevoke: () => void;
}) {
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-neutral-900/40 border border-neutral-800/40">
      <div className="w-8 h-8 rounded-lg bg-neutral-800 flex items-center justify-center shrink-0">
        <Key className="w-4 h-4 text-neutral-500" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm text-white truncate">{apiKey.name}</div>
        <div className="text-xs text-neutral-500 font-mono">{apiKey.key_prefix}...</div>
      </div>
      <div className="hidden sm:block text-xs text-neutral-500 shrink-0">
        {apiKey.last_used_at
          ? `Used ${new Date(apiKey.last_used_at).toLocaleDateString()}`
          : 'Never used'}
      </div>
      {canManage && (
        <button
          onClick={() => setConfirmRevoke(true)}
          className="p-1.5 rounded-md text-neutral-500 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
          title="Revoke key"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
      <Modal
        open={confirmRevoke}
        onClose={() => setConfirmRevoke(false)}
        title="Revoke API key"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setConfirmRevoke(false)}>Cancel</Button>
            <Button variant="danger" size="sm" onClick={async () => { await onRevoke(); setConfirmRevoke(false); }}>
              <Trash2 className="w-4 h-4" />
              Revoke
            </Button>
          </>
        }
      >
        <p className="text-sm text-neutral-300">
          Revoke "{apiKey.name}"? CI systems using this key will no longer be able to submit build runs.
          This cannot be undone.
        </p>
      </Modal>
    </div>
  );
}

export function TelemetryPage() {
  const { buildRuns, apiKeys, loading, createApiKey, revokeApiKey, selectedProjectId, setSelectedProjectId } = useTelemetry();
  const { projects } = useProjects();
  const { currentUserMembership } = useOrg();
  const [showCreateKey, setShowCreateKey] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const canManage =
    currentUserMembership?.role === 'OWNER' || currentUserMembership?.role === 'ADMIN';


  const stats = {
    total: buildRuns.length,
    success: buildRuns.filter((r) => r.status === 'SUCCESS').length,
    failed: buildRuns.filter((r) => r.status === 'FAILED').length,
    running: buildRuns.filter((r) => r.status === 'RUNNING').length,
    avgDuration: buildRuns.length > 0
      ? Math.round(buildRuns.reduce((sum, r) => sum + r.duration_seconds, 0) / buildRuns.length)
      : 0,
    successRate: buildRuns.length > 0
      ? Math.round((buildRuns.filter((r) => r.status === 'SUCCESS').length / buildRuns.length) * 100)
      : 0,
  };

  const handleCreateKey = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!keyName.trim()) {
      setError('Key name is required');
      return;
    }
    setActionLoading(true);
    try {
      const key = await createApiKey(keyName.trim());
      setNewKey(key);
      setKeyName('');
      setShowCreateKey(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create API key');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCopyKey = () => {
    if (newKey) {
      navigator.clipboard.writeText(newKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-6 w-6 border-2 border-primary-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">DevOps Telemetry</h2>
          <p className="text-sm text-neutral-500 mt-0.5">
            Build run analytics and CI ingestion API keys.
          </p>
        </div>
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
            <option key={p.id} value={p.id}>
              {p.key} — {p.name}
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

      {/* Stats */}
      {buildRuns.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Total builds" value={stats.total} icon={Activity} tone="primary" />
          <StatCard label="Success rate" value={`${stats.successRate}%`} icon={TrendingUp} tone={stats.successRate >= 80 ? 'accent' : 'danger'} />
          <StatCard label="Avg duration" value={stats.avgDuration >= 60 ? `${Math.floor(stats.avgDuration / 60)}m ${stats.avgDuration % 60}s` : `${stats.avgDuration}s`} icon={Clock} />
          <StatCard label="Failed" value={stats.failed} icon={XCircle} tone={stats.failed > 0 ? 'danger' : 'neutral'} />
        </div>
      )}

      {/* Build runs */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-neutral-400 uppercase tracking-wider">Recent builds</h3>
        {buildRuns.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-800 p-10 text-center">
            <div className="w-12 h-12 rounded-xl bg-neutral-800/80 flex items-center justify-center mx-auto mb-3">
              <Zap className="w-6 h-6 text-neutral-500" />
            </div>
            <p className="text-sm text-neutral-400 mb-1">No build runs yet</p>
            <p className="text-xs text-neutral-600">
              Create an API key below and configure your CI to POST build results.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {buildRuns.map((run) => (
              <BuildRunRow key={run.id} run={run} />
            ))}
          </div>
        )}
      </div>

      {/* API keys */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-neutral-400 uppercase tracking-wider">API keys</h3>
          {canManage && (
            <Button size="sm" variant="secondary" onClick={() => { setError(null); setShowCreateKey(true); }}>
              <Plus className="w-4 h-4" />
              Generate key
            </Button>
          )}
        </div>
        {apiKeys.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-800 p-8 text-center">
            <div className="w-10 h-10 rounded-lg bg-neutral-800/80 flex items-center justify-center mx-auto mb-3">
              <Key className="w-5 h-5 text-neutral-500" />
            </div>
            <p className="text-sm text-neutral-400 mb-1">No API keys</p>
            <p className="text-xs text-neutral-600">
              {canManage ? 'Generate a key to let your CI system submit build runs.' : 'Ask an admin to generate an API key.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {apiKeys.map((key) => (
              <ApiKeyRow
                key={key.id}
                apiKey={key}
                canManage={canManage ?? false}
                onRevoke={async () => {
                  try { await revokeApiKey(key.id); } catch (err) {
                    setError(err instanceof Error ? err.message : 'Failed to revoke key');
                  }
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create key modal */}
      <Modal
        open={showCreateKey}
        onClose={() => { setShowCreateKey(false); setError(null); }}
        title="Generate API key"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setShowCreateKey(false)}>Cancel</Button>
            <Button size="sm" loading={actionLoading} onClick={handleCreateKey as unknown as () => void}>
              <Key className="w-4 h-4" />
              Generate
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateKey} className="space-y-4">
          <Input
            label="Key name"
            type="text"
            placeholder="e.g. GitHub Actions, Jenkins"
            value={keyName}
            onChange={(e) => setKeyName(e.target.value)}
            autoFocus
          />
          {error && (
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-300">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </form>
      </Modal>

      {/* New key reveal modal */}
      <Modal
        open={!!newKey}
        onClose={() => { setNewKey(null); setCopied(false); }}
        title="API key created"
        footer={
          <Button size="sm" onClick={() => { setNewKey(null); setCopied(false); }}>
            <Check className="w-4 h-4" />
            Done
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-sm text-amber-300">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>Copy this key now. You won't be able to see it again.</span>
          </div>
          <div className="flex items-center gap-2 p-3 rounded-lg bg-neutral-900 border border-neutral-800">
            <code className="flex-1 text-xs text-white font-mono break-all">{newKey}</code>
            <button
              onClick={handleCopyKey}
              className="p-2 rounded-md text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors shrink-0"
            >
              {copied ? <Check className="w-4 h-4 text-accent-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
          <div className="text-xs text-neutral-500 space-y-1">
            <p className="font-medium text-neutral-400">Usage:</p>
            <p>POST to your ingestion endpoint with this JSON body:</p>
            <pre className="bg-neutral-900 rounded-lg p-2 overflow-x-auto text-neutral-400">{`{
  "key": "dpk_...",
  "external_run_id": "run-123",
  "branch": "main",
  "commit_sha": "abc1234",
  "status": "SUCCESS",
  "duration_seconds": 45,
  "triggered_by": "github-actions",
  "build_url": "https://..."
}`}</pre>
            <p>Re-submitting the same external_run_id is safe — duplicates are ignored.</p>
          </div>
        </div>
      </Modal>
    </div>
  );
}
