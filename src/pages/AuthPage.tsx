import { useState, FormEvent } from 'react';
import { Mail, Lock, User, Activity, AlertCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export function AuthPage({ mode, onToggleMode }: { mode: 'signin' | 'signup'; onToggleMode: () => void }) {
  const { signIn, signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isSignUp = mode === 'signup';

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isSignUp) {
        if (password.length < 12) {
          throw new Error('Password must be at least 12 characters');
        }
        await signUp(email, password, displayName || undefined);
      } else {
        await signIn(email, password);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Authentication failed';
      setError(msg);
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
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-lg shadow-primary-600/30">
            <Activity className="w-6 h-6 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-xl font-semibold text-white tracking-tight">
            DevPulse<span className="text-primary-400"> AI</span>
          </span>
        </div>

        <div className="rounded-2xl bg-neutral-900/70 border border-neutral-800/60 backdrop-blur-sm p-7">
          <h1 className="text-xl font-semibold text-white mb-1">
            {isSignUp ? 'Create your account' : 'Welcome back'}
          </h1>
          <p className="text-sm text-neutral-500 mb-6">
            {isSignUp
              ? 'Sign up to start managing your projects with HAISDM.'
              : 'Sign in to your DevPulse AI workspace.'}
          </p>

          {error && (
            <div className="flex items-start gap-2.5 mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-300">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <Input
                label="Display name"
                type="text"
                placeholder="Jane Doe"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                icon={<User className="w-4 h-4" />}
              />
            )}
            <Input
              label="Email"
              type="email"
              placeholder="you@company.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              icon={<Mail className="w-4 h-4" />}
            />
            <Input
              label="Password"
              type="password"
              placeholder={isSignUp ? 'At least 12 characters' : '••••••••'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              icon={<Lock className="w-4 h-4" />}
            />
            <Button type="submit" size="lg" loading={loading} className="w-full">
              {isSignUp ? 'Create account' : 'Sign in'}
            </Button>
          </form>

          <div className="mt-5 text-center text-sm text-neutral-500">
            {isSignUp ? (
              <>
                Already have an account?{' '}
                <button type="button" onClick={onToggleMode} className="text-primary-400 hover:text-primary-300 transition-colors">
                  Sign in
                </button>
              </>
            ) : (
              <>
                Don't have an account?{' '}
                <button type="button" onClick={onToggleMode} className="text-primary-400 hover:text-primary-300 transition-colors">
                  Sign up
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
