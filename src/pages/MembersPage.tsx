import { useState, FormEvent } from 'react';
import { UserPlus, Trash2, AlertCircle, Mail, Crown, Shield, User as UserIcon, Eye } from 'lucide-react';
import { useOrg } from '@/context/OrgContext';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import type { UserRole, MembershipWithUser } from '@/types';

const ROLE_ICONS: Record<UserRole, typeof Crown> = {
  OWNER: Crown,
  ADMIN: Shield,
  MEMBER: UserIcon,
  VIEWER: Eye,
};

const ROLE_TONES: Record<UserRole, 'primary' | 'accent' | 'neutral' | 'warning'> = {
  OWNER: 'primary',
  ADMIN: 'accent',
  MEMBER: 'neutral',
  VIEWER: 'neutral',
};

function initials(name: string | null, email: string): string {
  if (name) {
    const parts = name.split(' ');
    return (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '');
  }
  return email.slice(0, 2).toUpperCase();
}

function MemberRow({
  member,
  isCurrentUser,
  canManage,
  onRoleChange,
  onRemove,
}: {
  member: MembershipWithUser;
  isCurrentUser: boolean;
  canManage: boolean;
  onRoleChange: (userId: string, role: UserRole) => void;
  onRemove: (userId: string) => void;
}) {
  const [showRemove, setShowRemove] = useState(false);
  const RoleIcon = ROLE_ICONS[member.role];
  const email = member.app_user?.email ?? 'Unknown';
  const displayName = member.app_user?.display_name;

  return (
    <div className="flex items-center justify-between py-3.5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center text-sm font-medium text-white shrink-0">
          {initials(displayName, email)}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white">{displayName ?? email}</span>
            {isCurrentUser && <span className="text-xs text-neutral-500">(you)</span>}
          </div>
          <div className="text-xs text-neutral-500">{email}</div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {canManage ? (
          <select
            value={member.role}
            onChange={(e) => onRoleChange(member.user_id, e.target.value as UserRole)}
            className="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500/40 cursor-pointer"
          >
            <option value="OWNER">Owner</option>
            <option value="ADMIN">Admin</option>
            <option value="MEMBER">Member</option>
            <option value="VIEWER">Viewer</option>
          </select>
        ) : (
          <Badge tone={ROLE_TONES[member.role]}>
            <RoleIcon className="w-3 h-3" />
            {member.role.toLowerCase()}
          </Badge>
        )}

        {canManage && !isCurrentUser && (
          <button
            onClick={() => setShowRemove(true)}
            className="p-1.5 rounded-md text-neutral-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title="Remove member"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      <Modal
        open={showRemove}
        onClose={() => setShowRemove(false)}
        title="Remove member"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setShowRemove(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                onRemove(member.user_id);
                setShowRemove(false);
              }}
            >
              Remove
            </Button>
          </>
        }
      >
        <p className="text-sm text-neutral-300">
          Are you sure you want to remove{' '}
          <span className="font-medium text-white">{displayName ?? email}</span> from this organization?
          They will lose access to all projects and data.
        </p>
      </Modal>
    </div>
  );
}

export function MembersPage() {
  const { memberships, currentUserMembership, addMember, updateMemberRole, removeMember } = useOrg();
  const { user } = useAuth();
  const [showAdd, setShowAdd] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('MEMBER');
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const canManage =
    currentUserMembership?.role === 'OWNER' || currentUserMembership?.role === 'ADMIN';

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setActionLoading(true);
    try {
      await addMember(email.trim(), role);
      setEmail('');
      setRole('MEMBER');
      setShowAdd(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add member');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    try {
      await updateMemberRole(userId, newRole);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update role');
    }
  };

  const handleRemove = async (userId: string) => {
    try {
      await removeMember(userId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove member');
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Members</h2>
          <p className="text-sm text-neutral-500 mt-0.5">
            Manage who has access to this organization.
          </p>
        </div>
        {canManage && (
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <UserPlus className="w-4 h-4" />
            Add member
          </Button>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-300">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <Card className="px-5 py-2">
        <div className="divide-y divide-neutral-800/60">
          {memberships.length === 0 ? (
            <div className="py-8 text-center text-sm text-neutral-500">No members found.</div>
          ) : (
            memberships.map((member) => (
              <MemberRow
                key={member.id}
                member={member}
                isCurrentUser={member.user_id === user?.id}
                canManage={canManage ?? false}
                onRoleChange={handleRoleChange}
                onRemove={handleRemove}
              />
            ))
          )}
        </div>
      </Card>

      {/* Add member modal */}
      <Modal
        open={showAdd}
        onClose={() => {
          setShowAdd(false);
          setError(null);
        }}
        title="Add member"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
            <Button size="sm" loading={actionLoading} onClick={handleAdd as unknown as () => void}>
              <UserPlus className="w-4 h-4" />
              Add member
            </Button>
          </>
        }
      >
        <form onSubmit={handleAdd} className="space-y-4">
          <Input
            label="Email address"
            type="email"
            placeholder="colleague@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            icon={<Mail className="w-4 h-4" />}
            autoFocus
          />
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-neutral-300">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500/40 cursor-pointer"
            >
              <option value="MEMBER">Member — can manage projects and tasks</option>
              <option value="ADMIN">Admin — can manage members and settings</option>
              <option value="VIEWER">Viewer — read-only access</option>
              {currentUserMembership?.role === 'OWNER' && (
                <option value="OWNER">Owner — full control including deletion</option>
              )}
            </select>
          </div>
          {error && (
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-300">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </form>
      </Modal>
    </div>
  );
}
