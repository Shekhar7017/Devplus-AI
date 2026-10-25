import { Activity, BarChart3, Bot, GitBranch, Layers, Lock, Zap } from 'lucide-react';

const MODULES = [
  {
    icon: Layers,
    title: 'Project Management',
    description: 'Create and organize projects with immutable data origin tracking — real or simulated.',
  },
  {
    icon: Activity,
    title: 'Agile Sprint Management',
    description: 'Plan, activate, and complete sprints with a single active sprint per project.',
  },
  {
    icon: GitBranch,
    title: 'Task Management',
    description: 'Full status workflow with optimistic locking and append-only history.',
  },
  {
    icon: BarChart3,
    title: 'DevOps Telemetry',
    description: 'Idempotent build ingestion via per-project API keys with summary analytics.',
  },
  {
    icon: Bot,
    title: 'AI Assistance',
    description: 'Claude-powered task refinement and sprint summaries with per-org quotas.',
  },
  {
    icon: Zap,
    title: 'HAISDM Analytics',
    description: 'Baseline metrics: velocity, cycle time, build health — labelled by data origin.',
  },
];

const STATS = [
  { label: 'Modules', value: '6' },
  { label: 'Tenant-isolated', value: '100%' },
  { label: 'Data origins', value: '2' },
  { label: 'Milestone', value: 'M0' },
];

export function LandingPage() {
  return (
    <div className="min-h-screen bg-neutral-950 text-gray-200">
      {/* Background gradient */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-primary-600/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-accent-600/10 rounded-full blur-[100px]" />
      </div>

      {/* Navbar */}
      <nav className="relative z-10 border-b border-neutral-800/50 backdrop-blur-sm bg-neutral-950/70">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-lg shadow-primary-600/20">
              <Activity className="w-5 h-5 text-white" strokeWidth={2.5} />
            </div>
            <span className="text-lg font-semibold text-white tracking-tight">
              DevPulse<span className="text-primary-400"> AI</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-neutral-500 px-2 py-1 rounded-md bg-neutral-900 border border-neutral-800">
              M0 · Foundation
            </span>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 pt-24 pb-20">
        <div className="max-w-3xl animate-fade-in">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary-500/10 border border-primary-500/20 text-primary-300 text-sm font-medium mb-6">
            <span className="w-2 h-2 rounded-full bg-accent-400 animate-pulse-slow" />
            Hybrid Agile-Innovation Software Development Model
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-white tracking-tight leading-[1.1] mb-6">
            Engineering intelligence<br />
            for modern software teams
          </h1>
          <p className="text-xl text-neutral-400 leading-relaxed mb-8 max-w-2xl">
            A multi-tenant platform that unifies project management, sprint planning,
            task tracking, DevOps telemetry, and AI-powered insights — with strict
            separation of real and simulated research data.
          </p>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-neutral-500">
              <Lock className="w-4 h-4 text-accent-400" />
              <span>Tenant-isolated by design</span>
            </div>
            <div className="w-px h-4 bg-neutral-800" />
            <div className="flex items-center gap-2 text-sm text-neutral-500">
              <GitBranch className="w-4 h-4 text-primary-400" />
              <span>Modular monolith architecture</span>
            </div>
          </div>
        </div>

        {/* Stats bar */}
        <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-px bg-neutral-800/50 rounded-xl overflow-hidden border border-neutral-800/50">
          {STATS.map((stat) => (
            <div key={stat.label} className="bg-neutral-950 px-6 py-5">
              <div className="text-3xl font-bold text-white font-mono">{stat.value}</div>
              <div className="text-sm text-neutral-500 mt-1">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Modules */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 py-20">
        <div className="mb-12">
          <h2 className="text-3xl font-bold text-white tracking-tight mb-2">Core Modules</h2>
          <p className="text-neutral-400">
            Six modules built on a shared multi-tenant foundation, each with clear boundaries.
          </p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {MODULES.map((mod, i) => {
            const Icon = mod.icon;
            return (
              <div
                key={mod.title}
                className="group relative p-6 rounded-xl bg-neutral-900/50 border border-neutral-800/50 hover:border-primary-500/30 transition-all duration-300 hover:bg-neutral-900/80 animate-slide-up"
                style={{ animationDelay: `${i * 80}ms`, animationFillMode: 'both' }}
              >
                <div className="w-11 h-11 rounded-lg bg-neutral-800/80 flex items-center justify-center mb-4 group-hover:bg-primary-500/10 transition-colors duration-300">
                  <Icon className="w-5 h-5 text-neutral-400 group-hover:text-primary-400 transition-colors duration-300" strokeWidth={2} />
                </div>
                <h3 className="text-base font-semibold text-white mb-2">{mod.title}</h3>
                <p className="text-sm text-neutral-400 leading-relaxed">{mod.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Architecture overview */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 py-20">
        <div className="rounded-2xl bg-gradient-to-br from-neutral-900/80 to-neutral-950 border border-neutral-800/50 p-8 md:p-12">
          <h2 className="text-3xl font-bold text-white tracking-tight mb-2">Architecture</h2>
          <p className="text-neutral-400 mb-10">
            One modular monolith, organized by module, with strict API boundaries.
          </p>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="space-y-3">
              <div className="text-sm font-mono text-primary-400 uppercase tracking-wider">Frontend</div>
              <div className="text-sm text-neutral-300 space-y-1">
                <div>React + TypeScript + Vite</div>
                <div>Tailwind CSS + Recharts</div>
                <div>Axios API client</div>
              </div>
            </div>
            <div className="space-y-3">
              <div className="text-sm font-mono text-accent-400 uppercase tracking-wider">Backend</div>
              <div className="text-sm text-neutral-300 space-y-1">
                <div>Java 21 + Spring Boot</div>
                <div>Session auth + tenant role checks</div>
                <div>REST API + server-side AI</div>
              </div>
            </div>
            <div className="space-y-3">
              <div className="text-sm font-mono text-neutral-400 uppercase tracking-wider">Data</div>
              <div className="text-sm text-neutral-300 space-y-1">
                <div>UUID primary keys, UTC timestamps</div>
                <div>Composite tenant-scoped FKs</div>
                <div>Immutable data origin flag</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-neutral-800/50 mt-10">
        <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center">
              <Activity className="w-4 h-4 text-white" strokeWidth={2.5} />
            </div>
            <span className="text-sm text-neutral-500">
              DevPulse AI · HAISDM Demonstration Platform
            </span>
          </div>
          <div className="text-xs font-mono text-neutral-600">
            M0 Foundation · Baseline metrics (not HAISDM-defined)
          </div>
        </div>
      </footer>
    </div>
  );
}
