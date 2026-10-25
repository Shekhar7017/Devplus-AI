import { useState, FormEvent } from 'react';
import {
  Plus,
  Search,
  Archive,
  Pencil,
  AlertCircle,
  Layers,
  Database,
  FlaskConical,
  Building2,
} from 'lucide-react';
import { useProjects } from '@/context/ProjectsContext';
import { useOrg } from '@/context/OrgContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import type { Project, DataOrigin } from '@/types';

const KEY_REGEX = /^[A-Z][A-Z0-9]{1,9}$/;

function ProjectCard({
  project,
  canManage,
  onEdit,
  onArchive,
}: {
  project: Project;
  canManage: boolean;
  onEdit: () => void;
  onArchive: () => void;
}) {
  const isArchived = project.status === 'ARCHIVED';
  const isSimulated = project.data_origin === 'SIMULATED';

  return (
    <Card
      className={`p-5 transition-all duration-200 hover:border-neutral-700/80 ${
        isArchived ? 'opacity-60' : ''
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
              isSimulated
                ? 'bg-amber-500/10 text-amber-400'
                : 'bg-primary-500/10 text-primary-400'
            }`}
          >
            {isSimulated ? <FlaskConical className="w-5 h-5" /> : <Layers className="w-5 h-5" />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white truncate">{project.name}</span>
              <span className="text-xs font-mono text-neutral-500">{project.key}</span>
            </div>
            <div className="text-xs text-neutral-500 mt-0.5">
              {project.description ?? 'No description'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Badge tone={isSimulated ? 'warning' : 'accent'}>
            {isSimulated ? <FlaskConical className="w-3 h-3" /> : <Database className="w-3 h-3" />}
            {project.data_origin}
          </Badge>
          {isArchived && <Badge tone="neutral">Archived</Badge>}
        </div>
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-neutral-800/60">
        <div className="text-xs text-neutral-600">
          Created {new Date(project.created_at).toLocaleDateString()}
        </div>
        {!isArchived && canManage && (
          <div className="flex items-center gap-1">
            <button
              onClick={onEdit}
              className="p-1.5 rounded-md text-neutral-500 hover:text-white hover:bg-neutral-800 transition-colors"
              title="Edit project"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              onClick={onArchive}
              className="p-1.5 rounded-md text-neutral-500 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
              title="Archive project"
            >
              <Archive className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </Card>
  );
}

function ProjectFormModal({
  open,
  onClose,
  onSubmit,
  loading,
  error,
  editProject,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: { key: string; name: string; description: string; data_origin: DataOrigin }) => Promise<void>;
  loading: boolean;
  error: string | null;
  editProject?: Project | null;
}) {
  const [key, setKey] = useState(editProject?.key ?? '');
  const [name, setName] = useState(editProject?.name ?? '');
  const [description, setDescription] = useState(editProject?.description ?? '');
  const [dataOrigin, setDataOrigin] = useState<DataOrigin>(editProject?.data_origin ?? 'REAL');
  const [formError, setFormError] = useState<string | null>(null);

  const isEdit = !!editProject;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!isEdit && !KEY_REGEX.test(key.toUpperCase())) {
      setFormError('Key must be 2-10 characters: one uppercase letter followed by uppercase letters or digits.');
      return;
    }
    if (!name.trim()) {
      setFormError('Project name is required.');
      return;
    }

    await onSubmit({ key: key.toUpperCase(), name, description, data_origin: dataOrigin });
  };

  const displayError = formError || error;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit project' : 'Create project'}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" loading={loading} onClick={handleSubmit as unknown as () => void}>
            {isEdit ? 'Save changes' : 'Create project'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {!isEdit && (
          <Input
            label="Project key"
            type="text"
            placeholder="e.g. ENG, API, ML"
            value={key}
            onChange={(e) => setKey(e.target.value.toUpperCase())}
            maxLength={10}
            icon={<Building2 className="w-4 h-4" />}
            autoFocus
          />
        )}
        <Input
          label="Project name"
          type="text"
          placeholder="e.g. Engineering Platform"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={200}
        />
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-neutral-300">Description</label>
          <textarea
            className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-500/50 transition-all resize-none"
            rows={3}
            placeholder="Optional description..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
          />
        </div>
        {!isEdit && (
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-neutral-300">Data origin</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setDataOrigin('REAL')}
                className={`flex items-start gap-2.5 p-3 rounded-lg border text-left transition-all ${
                  dataOrigin === 'REAL'
                    ? 'border-accent-500/40 bg-accent-500/10'
                    : 'border-neutral-700 bg-neutral-900 hover:border-neutral-600'
                }`}
              >
                <Database className={`w-5 h-5 mt-0.5 ${dataOrigin === 'REAL' ? 'text-accent-400' : 'text-neutral-500'}`} />
                <div>
                  <div className="text-sm font-medium text-white">Real</div>
                  <div className="text-xs text-neutral-500">Production data from your team</div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setDataOrigin('SIMULATED')}
                className={`flex items-start gap-2.5 p-3 rounded-lg border text-left transition-all ${
                  dataOrigin === 'SIMULATED'
                    ? 'border-amber-500/40 bg-amber-500/10'
                    : 'border-neutral-700 bg-neutral-900 hover:border-neutral-600'
                }`}
              >
                <FlaskConical className={`w-5 h-5 mt-0.5 ${dataOrigin === 'SIMULATED' ? 'text-amber-400' : 'text-neutral-500'}`} />
                <div>
                  <div className="text-sm font-medium text-white">Simulated</div>
                  <div className="text-xs text-neutral-500">Generated research data</div>
                </div>
              </button>
            </div>
            <p className="text-xs text-neutral-600">
              Data origin is immutable once set. Simulated projects use a seeded generator for all data.
            </p>
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

export function ProjectsPage() {
  const { projects, loading, createProject, updateProject, archiveProject } = useProjects();
  const { currentUserMembership } = useOrg();
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<Project | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Project | null>(null);
  const [search, setSearch] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const canManage =
    currentUserMembership?.role === 'OWNER' || currentUserMembership?.role === 'ADMIN';

  const filtered = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.key.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async (input: { key: string; name: string; description: string; data_origin: DataOrigin }) => {
    setActionLoading(true);
    setActionError(null);
    try {
      await createProject(input);
      setShowCreate(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setActionLoading(false);
    }
  };

  const handleEdit = async (input: { key: string; name: string; description: string; data_origin: DataOrigin }) => {
    if (!editTarget) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await updateProject(editTarget.id, { name: input.name, description: input.description });
      setEditTarget(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update project');
    } finally {
      setActionLoading(false);
    }
  };

  const handleArchive = async () => {
    if (!archiveTarget) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await archiveProject(archiveTarget.id);
      setArchiveTarget(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to archive project');
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

  return (
    <div className="max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Projects</h2>
          <p className="text-sm text-neutral-500 mt-0.5">
            Manage your projects. Each has an immutable data origin — real or simulated.
          </p>
        </div>
        {canManage && (
          <Button size="sm" onClick={() => { setActionError(null); setShowCreate(true); }}>
            <Plus className="w-4 h-4" />
            New project
          </Button>
        )}
      </div>

      {/* Search */}
      {projects.length > 0 && (
        <Input
          type="text"
          placeholder="Search by name or key..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          icon={<Search className="w-4 h-4" />}
          className="max-w-sm"
        />
      )}

      {/* Error banner */}
      {actionError && !showCreate && !editTarget && (
        <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-300">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Project list */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-800 p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-neutral-800/80 flex items-center justify-center mx-auto mb-4">
            <Layers className="w-7 h-7 text-neutral-500" />
          </div>
          <h3 className="text-base font-semibold text-white mb-1">
            {projects.length === 0 ? 'No projects yet' : 'No results found'}
          </h3>
          <p className="text-sm text-neutral-400 max-w-sm mx-auto">
            {projects.length === 0
              ? canManage
                ? 'Create your first project to start tracking sprints, tasks, and telemetry.'
                : 'Ask an admin to create a project for this organization.'
              : 'Try a different search term.'}
          </p>
          {projects.length === 0 && canManage && (
            <Button size="sm" className="mt-4" onClick={() => { setActionError(null); setShowCreate(true); }}>
              <Plus className="w-4 h-4" />
              Create project
            </Button>
          )}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {filtered.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              canManage={canManage ?? false}
              onEdit={() => { setActionError(null); setEditTarget(project); }}
              onArchive={() => { setActionError(null); setArchiveTarget(project); }}
            />
          ))}
        </div>
      )}

      {/* Create modal */}
      <ProjectFormModal
        open={showCreate}
        onClose={() => { setShowCreate(false); setActionError(null); }}
        onSubmit={handleCreate}
        loading={actionLoading}
        error={actionError}
      />

      {/* Edit modal */}
      <ProjectFormModal
        open={!!editTarget}
        onClose={() => { setEditTarget(null); setActionError(null); }}
        onSubmit={handleEdit}
        loading={actionLoading}
        error={actionError}
        editProject={editTarget}
      />

      {/* Archive confirmation */}
      <Modal
        open={!!archiveTarget}
        onClose={() => setArchiveTarget(null)}
        title="Archive project"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setArchiveTarget(null)}>
              Cancel
            </Button>
            <Button variant="secondary" size="sm" loading={actionLoading} onClick={handleArchive}>
              <Archive className="w-4 h-4" />
              Archive
            </Button>
          </>
        }
      >
        <p className="text-sm text-neutral-300">
          Are you sure you want to archive{' '}
          <span className="font-medium text-white">{archiveTarget?.name}</span>?
          Archived projects become read-only and cannot have new sprints or tasks added.
          You can still view all historical data.
        </p>
      </Modal>
    </div>
  );
}
