import { useState } from 'react';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { OrgProvider, useOrg } from '@/context/OrgContext';
import { AuthPage } from '@/pages/AuthPage';
import { OnboardingPage } from '@/pages/OnboardingPage';
import { DashboardLayout, ViewKey } from '@/components/DashboardLayout';
import { MembersPage } from '@/pages/MembersPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { ProjectsPage } from '@/pages/ProjectsPage';
import { ProjectsProvider } from '@/context/ProjectsContext';
import { SprintsPage } from '@/pages/SprintsPage';
import { TasksPage } from '@/pages/TasksPage';
import { SprintTaskProvider } from '@/context/SprintTaskContext';
import { TelemetryPage } from '@/pages/TelemetryPage';
import { TelemetryProvider } from '@/context/TelemetryContext';
import { AIPage } from '@/pages/AIPage';
import { AIProvider } from '@/context/AIContext';
import { AnalyticsPage } from '@/pages/AnalyticsPage';
import { AnalyticsProvider } from '@/context/AnalyticsContext';
import { DashboardPage } from '@/pages/DashboardPage';
import { DashboardProvider } from '@/context/DashboardContext';

function AppContent() {
  const { session, loading, error } = useAuth();
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [view, setView] = useState<ViewKey>('dashboard');

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-primary-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error && !session) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center px-4">
        <div className="max-w-md rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center">
          <p className="text-sm text-red-200">Unable to connect to the application backend: {error}</p>
          <button className="mt-4 text-sm text-primary-300 underline" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <AuthPage
        mode={authMode}
        onToggleMode={() => setAuthMode((prev) => (prev === 'signin' ? 'signup' : 'signin'))}
      />
    );
  }

  return (
    <OrgProvider>
      <AuthenticatedApp view={view} onNavigate={setView} />
    </OrgProvider>
  );
}

function AuthenticatedApp({
  view,
  onNavigate,
}: {
  view: ViewKey;
  onNavigate: (view: ViewKey) => void;
}) {
  const { organizations, activeOrg, loading } = useOrg();

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-primary-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (organizations.length === 0) {
    return <OnboardingPage />;
  }

  if (!activeOrg) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-primary-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const renderView = () => {
    switch (view) {
      case 'dashboard':
        return (
          <DashboardProvider>
            <DashboardPage onNavigate={onNavigate} />
          </DashboardProvider>
        );
      case 'members':
        return <MembersPage />;
      case 'settings':
        return <SettingsPage />;
      case 'projects':
        return (
          <ProjectsProvider>
            <ProjectsPage />
          </ProjectsProvider>
        );
      case 'sprints':
        return (
          <ProjectsProvider>
            <SprintTaskProvider>
              <SprintsPage />
            </SprintTaskProvider>
          </ProjectsProvider>
        );
      case 'tasks':
        return (
          <ProjectsProvider>
            <SprintTaskProvider>
              <TasksPage />
            </SprintTaskProvider>
          </ProjectsProvider>
        );
      case 'telemetry':
        return (
          <ProjectsProvider>
            <TelemetryProvider>
              <TelemetryPage />
            </TelemetryProvider>
          </ProjectsProvider>
        );
      case 'ai':
        return (
          <ProjectsProvider>
            <SprintTaskProvider>
              <AIProvider>
                <AIPage />
              </AIProvider>
            </SprintTaskProvider>
          </ProjectsProvider>
        );
      case 'analytics':
        return (
          <ProjectsProvider>
            <AnalyticsProvider>
              <AnalyticsPage />
            </AnalyticsProvider>
          </ProjectsProvider>
        );
      default:
        return null;
    }
  };

  return (
    <DashboardLayout activeView={view} onNavigate={onNavigate}>
      {renderView()}
    </DashboardLayout>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
