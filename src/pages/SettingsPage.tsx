import { useState, FormEvent, useEffect } from 'react';
import { Building2, Bot, AlertCircle, Check, Save } from 'lucide-react';
import { useOrg } from '@/context/OrgContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';

export function SettingsPage() {
  const { activeOrg, currentUserMembership, updateOrgSettings } = useOrg();
  const [name, setName] = useState(activeOrg?.name ?? '');
  const [aiEnabled, setAiEnabled] = useState(activeOrg?.ai_enabled ?? false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setName(activeOrg?.name ?? '');
    setAiEnabled(activeOrg?.ai_enabled ?? false);
  }, [activeOrg]);

  const canEdit =
    currentUserMembership?.role === 'OWNER' || currentUserMembership?.role === 'ADMIN';

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setLoading(true);
    try {
      await updateOrgSettings({ name: name.trim(), ai_enabled: aiEnabled });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setLoading(false);
    }
  };

  if (!activeOrg) return null;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white">Organization settings</h2>
        <p className="text-sm text-neutral-500 mt-0.5">
          Manage your organization profile and AI configuration.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-300">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* General settings */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-lg bg-neutral-800 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-neutral-400" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white">General</h3>
            <p className="text-sm text-neutral-500">Organization name and identity</p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-5">
          <Input
            label="Organization name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!canEdit}
          />

          <div className="flex items-center justify-between pt-2">
            <div className="text-xs text-neutral-600">
              Org ID: <span className="font-mono text-neutral-500">{activeOrg.id.slice(0, 8)}...</span>
            </div>
            {canEdit && (
              <Button type="submit" size="sm" loading={loading}>
                {success ? (
                  <>
                    <Check className="w-4 h-4" />
                    Saved
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save changes
                  </>
                )}
              </Button>
            )}
          </div>
        </form>
      </Card>

      {/* AI Settings */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-lg bg-neutral-800 flex items-center justify-center">
            <Bot className="w-5 h-5 text-neutral-400" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white">AI Assistance</h3>
            <p className="text-sm text-neutral-500">Enable or disable AI features for this organization</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-start justify-between p-4 rounded-lg bg-neutral-900/50 border border-neutral-800/60">
            <div className="flex-1 mr-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium text-white">Enable AI features</span>
                {aiEnabled ? (
                  <Badge tone="accent">Active</Badge>
                ) : (
                  <Badge tone="neutral">Disabled</Badge>
                )}
              </div>
              <p className="text-xs text-neutral-500 leading-relaxed">
                When enabled, members can use Claude-powered task refinement and sprint summaries.
                Tenant data is sent to a third-party AI provider. Per-organization quotas apply.
              </p>
            </div>
            {canEdit && (
              <button
                type="button"
                onClick={() => setAiEnabled(!aiEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${
                  aiEnabled ? 'bg-accent-600' : 'bg-neutral-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    aiEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="p-3 rounded-lg bg-neutral-900/50 border border-neutral-800/60">
              <div className="text-neutral-500 text-xs mb-1">Requests this period</div>
              <div className="text-white font-mono">{activeOrg.ai_requests_this_period}</div>
            </div>
            <div className="p-3 rounded-lg bg-neutral-900/50 border border-neutral-800/60">
              <div className="text-neutral-500 text-xs mb-1">Quota resets</div>
              <div className="text-white font-mono text-xs">
                {activeOrg.ai_quota_reset_at
                  ? new Date(activeOrg.ai_quota_reset_at).toLocaleDateString()
                  : 'N/A'}
              </div>
            </div>
          </div>

          {canEdit && aiEnabled !== activeOrg.ai_enabled && (
            <Button size="sm" onClick={handleSave} loading={loading}>
              <Save className="w-4 h-4" />
              Save AI settings
            </Button>
          )}
        </div>
      </Card>

      {/* Danger zone */}
      {currentUserMembership?.role === 'OWNER' && (
        <Card className="p-6 border-red-500/20">
          <h3 className="text-base font-semibold text-red-300 mb-1">Danger zone</h3>
          <p className="text-sm text-neutral-500 mb-4">
            Irreversible actions. Proceed with caution.
          </p>
          <div className="flex items-center justify-between p-4 rounded-lg bg-red-500/5 border border-red-500/10">
            <div>
              <div className="text-sm font-medium text-white">Delete organization</div>
              <div className="text-xs text-neutral-500 mt-0.5">
                All projects, sprints, tasks, and data will be permanently removed.
              </div>
            </div>
            <Button variant="danger" size="sm" disabled>
              Delete
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
