import { useState, FormEvent } from 'react';
import { Building2, AlertCircle, ArrowRight } from 'lucide-react';
import { useOrg } from '@/context/OrgContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export function OnboardingPage() {
  const { createOrg } = useOrg();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError('Organization name is required');
      return;
    }
    setLoading(true);
    try {
      await createOrg(name.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create organization');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center px-4">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/3 w-[500px] h-[500px] bg-primary-600/10 rounded-full blur-[120px]" />
      </div>

      <div className="relative w-full max-w-md animate-slide-up">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-xl shadow-primary-600/30 mb-4">
            <Building2 className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Create your organization</h1>
          <p className="text-sm text-neutral-400 max-w-sm">
            Every project, sprint, and task belongs to an organization. Let's set up your workspace.
          </p>
        </div>

        <div className="rounded-2xl bg-neutral-900/70 border border-neutral-800/60 backdrop-blur-sm p-7">
          {error && (
            <div className="flex items-start gap-2.5 mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-300">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Organization name"
              type="text"
              placeholder="Acme Engineering"
              value={name}
              onChange={(e) => setName(e.target.value)}
              icon={<Building2 className="w-4 h-4" />}
              autoFocus
            />
            <Button type="submit" size="lg" loading={loading} className="w-full">
              Create organization
              <ArrowRight className="w-4 h-4" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
