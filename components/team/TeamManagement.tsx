/**
 * Team Management Component
 * Manages organizations, members, roles, and invites - all in one place
 */

import { useState, useEffect } from 'react';
import { Icon } from '../common/Icon';
import { useOrganization } from '../../contexts/OrganizationContext';
import { useAuth } from '../auth/AuthWrapper';
import { Button } from '../common/Button';

interface TeamMember {
  id: string;
  user_id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  role_name: string;
  role_id: string;
  status: 'active' | 'inactive' | 'pending';
  joined_at: string | null;
}

interface TeamRole {
  id: string;
  name: string;
  description: string | null;
  is_system_role: boolean;
  permissions: string[];
}

interface PendingInvite {
  id: string;
  email: string;
  role_name: string;
  status: string;
  expires_at: string;
  created_at: string;
}

interface ReceivedInvite {
  id: string;
  token: string;
  organization_name: string;
  organization_id: string;
  role_name: string;
  invited_by_name: string;
  expires_at: string;
}

type ViewMode = 'list' | 'create' | 'manage';

export function TeamManagement() {
  const { userId } = useAuth();
  const {
    currentOrganization,
    organizations,
    switchOrganization,
    createNewOrganization,
    hasPermission,
    refreshOrganizations
  } = useOrganization();

  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [roles, setRoles] = useState<TeamRole[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [receivedInvites, setReceivedInvites] = useState<ReceivedInvite[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Create organization form
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgDescription, setNewOrgDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRoleId, setInviteRoleId] = useState('');
  const [isInviting, setIsInviting] = useState(false);

  const canManageMembers = hasPermission('manage_members');

  // Determine view mode based on state
  useEffect(() => {
    if (currentOrganization) {
      setViewMode('manage');
      fetchTeamData();
    } else {
      setViewMode('list');
    }
  }, [currentOrganization?.id]);

  // Fetch received invites on mount
  useEffect(() => {
    if (userId) {
      fetchReceivedInvites();
    }
  }, [userId]);

  const fetchReceivedInvites = async () => {
    if (!userId) return;
    try {
      const res = await fetch(`/api/db/user/invites?user_id=${userId}`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setReceivedInvites(data.invites || []);
      }
    } catch (err) {
      console.error('Failed to fetch received invites:', err);
    }
  };

  const fetchTeamData = async () => {
    if (!currentOrganization || !userId) return;

    setIsLoading(true);
    setError(null);

    try {
      const [membersRes, rolesRes, invitesRes] = await Promise.all([
        fetch(`/api/db/organizations/members?organization_id=${currentOrganization.id}&user_id=${userId}`, {
          credentials: 'include',
        }),
        fetch(`/api/db/organizations/roles?organization_id=${currentOrganization.id}&user_id=${userId}`, {
          credentials: 'include',
        }),
        canManageMembers ? fetch(`/api/db/organizations/invites?organization_id=${currentOrganization.id}&user_id=${userId}`, {
          credentials: 'include',
        }) : Promise.resolve({ ok: true, json: () => Promise.resolve({ invites: [] }) }),
      ]);

      if (!membersRes.ok) throw new Error('Falha ao carregar membros');
      if (!rolesRes.ok) throw new Error('Falha ao carregar roles');

      const membersData = await membersRes.json();
      const rolesData = await rolesRes.json();
      const invitesData = invitesRes.ok ? await invitesRes.json() : { invites: [] };

      setMembers(membersData.members || []);
      setRoles(rolesData.roles || []);
      setInvites(invitesData.invites || []);

      const editorRole = rolesData.roles?.find((r: TeamRole) => r.name === 'Editor');
      if (editorRole) {
        setInviteRoleId(editorRole.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados do time');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrgName.trim()) return;

    setIsCreating(true);
    setError(null);

    try {
      await createNewOrganization({
        name: newOrgName.trim(),
        description: newOrgDescription.trim() || undefined,
      });
      setNewOrgName('');
      setNewOrgDescription('');
      setSuccessMessage('Organizacao criada com sucesso!');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar organizacao');
    } finally {
      setIsCreating(false);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganization || !inviteEmail.trim() || !inviteRoleId || !userId) return;

    setIsInviting(true);
    setError(null);

    try {
      const res = await fetch(`/api/db/organizations/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          user_id: userId,
          organization_id: currentOrganization.id,
          email: inviteEmail.trim(),
          role_id: inviteRoleId,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Falha ao enviar convite');
      }

      const data = await res.json();
      setInvites(prev => [...prev, data.invite]);
      setInviteEmail('');
      setSuccessMessage(`Convite enviado para ${inviteEmail.trim()}`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar convite');
    } finally {
      setIsInviting(false);
    }
  };

  const handleAcceptInvite = async (invite: ReceivedInvite) => {
    try {
      const res = await fetch(`/api/db/organizations/invites/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ user_id: userId, token: invite.token }),
      });

      if (!res.ok) throw new Error('Falha ao aceitar convite');

      setReceivedInvites(prev => prev.filter(i => i.id !== invite.id));
      await refreshOrganizations();
      setSuccessMessage('Convite aceito! Voce agora faz parte da organizacao.');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao aceitar convite');
    }
  };

  const handleDeclineInvite = async (invite: ReceivedInvite) => {
    try {
      const res = await fetch(`/api/db/organizations/invites/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ user_id: userId, token: invite.token }),
      });

      if (!res.ok) throw new Error('Falha ao recusar convite');

      setReceivedInvites(prev => prev.filter(i => i.id !== invite.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao recusar convite');
    }
  };

  const handleCancelInvite = async (inviteId: string) => {
    if (!currentOrganization || !userId) return;

    try {
      const res = await fetch(`/api/db/organizations/invites?id=${inviteId}&user_id=${userId}&organization_id=${currentOrganization.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!res.ok) throw new Error('Falha ao cancelar convite');

      setInvites(prev => prev.filter(i => i.id !== inviteId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao cancelar convite');
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!currentOrganization || !userId) return;
    if (!confirm('Tem certeza que deseja remover este membro?')) return;

    try {
      const res = await fetch(`/api/db/organizations/members?id=${memberId}&user_id=${userId}&organization_id=${currentOrganization.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!res.ok) throw new Error('Falha ao remover membro');

      setMembers(prev => prev.filter(m => m.id !== memberId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao remover membro');
    }
  };

  return (
    <div className="space-y-6">
      {/* Messages */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-500/20 border border-red-500/30 rounded-xl text-red-400 text-sm">
          <Icon name="alert-circle" className="w-4 h-4 flex-shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto">
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="flex items-center gap-2 px-4 py-3 bg-green-500/20 border border-green-500/30 rounded-xl text-green-400 text-sm">
          <Icon name="check" className="w-4 h-4 flex-shrink-0" />
          {successMessage}
        </div>
      )}

      {/* Received Invites Section */}
      {receivedInvites.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-amber-500/20">
            <h3 className="text-sm font-bold text-amber-400 flex items-center gap-2">
              <Icon name="mail" className="w-4 h-4" />
              Convites Recebidos ({receivedInvites.length})
            </h3>
          </div>
          <div className="divide-y divide-amber-500/10">
            {receivedInvites.map(invite => (
              <div key={invite.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="text-sm font-medium text-white">{invite.organization_name}</div>
                  <div className="text-xs text-white/40">
                    Convidado por {invite.invited_by_name} como {invite.role_name}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleAcceptInvite(invite)}
                    className="px-3 py-1.5 bg-green-600 hover:bg-green-700 rounded-lg text-xs font-medium text-white transition-colors"
                  >
                    Aceitar
                  </button>
                  <button
                    onClick={() => handleDeclineInvite(invite)}
                    className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-medium text-white/60 transition-colors"
                  >
                    Recusar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Organizations Section */}
      <div className="bg-white/[0.02] border border-white/5 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Icon name="building" className="w-4 h-4 text-white/40" />
            Minhas Organizacoes
          </h3>
          {viewMode !== 'create' && (
            <button
              onClick={() => setViewMode('create')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/20 hover:bg-primary/30 rounded-lg text-xs font-medium text-primary transition-colors"
            >
              <Icon name="plus" className="w-3.5 h-3.5" />
              Nova
            </button>
          )}
        </div>

        {/* Create Organization Form */}
        {viewMode === 'create' && (
          <div className="p-4 border-b border-white/5 bg-white/[0.02]">
            <form onSubmit={handleCreateOrganization} className="space-y-4">
              <div>
                <label className="block text-[8px] font-black text-white/30 uppercase tracking-[0.2em] mb-2">
                  Nome da Organizacao *
                </label>
                <input
                  type="text"
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  placeholder="Ex: Minha Empresa"
                  className="w-full px-4 py-3 bg-[#111] border border-white/10 rounded-xl text-white text-sm placeholder-white/20 focus:outline-none focus:border-primary/50"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-[8px] font-black text-white/30 uppercase tracking-[0.2em] mb-2">
                  Descricao (opcional)
                </label>
                <textarea
                  value={newOrgDescription}
                  onChange={(e) => setNewOrgDescription(e.target.value)}
                  placeholder="Uma breve descricao..."
                  rows={2}
                  className="w-full px-4 py-3 bg-[#111] border border-white/10 rounded-xl text-white text-sm placeholder-white/20 focus:outline-none focus:border-primary/50 resize-none"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 rounded-xl text-sm font-medium text-white/60 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isCreating || !newOrgName.trim()}
                  className="flex-1 px-4 py-2.5 bg-primary hover:bg-primary/90 disabled:bg-white/10 disabled:text-white/30 rounded-xl text-sm font-bold text-black transition-colors flex items-center justify-center gap-2"
                >
                  {isCreating ? (
                    <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  ) : (
                    <Icon name="plus" className="w-4 h-4" />
                  )}
                  Criar
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Organizations List */}
        <div className="divide-y divide-white/5">
          {organizations.length === 0 && viewMode !== 'create' ? (
            <div className="px-4 py-8 text-center">
              <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center mx-auto mb-3">
                <Icon name="building" className="w-6 h-6 text-white/20" />
              </div>
              <p className="text-sm text-white/40 mb-3">Nenhuma organizacao ainda</p>
              <button
                onClick={() => setViewMode('create')}
                className="text-sm text-primary hover:text-primary/80 font-medium"
              >
                Criar primeira organizacao
              </button>
            </div>
          ) : (
            organizations.map(org => (
              <button
                key={org.id}
                onClick={() => switchOrganization(org.id)}
                className={`w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors text-left ${
                  currentOrganization?.id === org.id ? 'bg-primary/10' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                    currentOrganization?.id === org.id
                      ? 'bg-primary text-black'
                      : 'bg-white/10 text-white/60'
                  }`}>
                    {org.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-white">{org.name}</div>
                    {org.description && (
                      <div className="text-xs text-white/40 truncate max-w-[200px]">{org.description}</div>
                    )}
                  </div>
                </div>
                {currentOrganization?.id === org.id && (
                  <Icon name="check" className="w-4 h-4 text-primary" />
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Team Management - Only show when org is selected */}
      {currentOrganization && viewMode === 'manage' && (
        <>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* Invite Form */}
              {canManageMembers && (
                <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4">
                  <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                    <Icon name="user-plus" className="w-4 h-4 text-white/40" />
                    Convidar Membro
                  </h3>
                  <form onSubmit={handleInvite} className="flex gap-3">
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="email@exemplo.com"
                      required
                      className="flex-1 px-3 py-2 bg-[#111] border border-white/10 rounded-lg text-sm text-white placeholder-white/30 focus:outline-none focus:border-primary/50"
                    />
                    <select
                      value={inviteRoleId}
                      onChange={(e) => setInviteRoleId(e.target.value)}
                      required
                      className="px-3 py-2 bg-[#111] border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-primary/50"
                    >
                      <option value="">Cargo</option>
                      {roles.map(role => (
                        <option key={role.id} value={role.id}>{role.name}</option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      disabled={isInviting || !inviteEmail.trim() || !inviteRoleId}
                      className="px-4 py-2 bg-primary hover:bg-primary/90 disabled:bg-white/10 disabled:text-white/30 rounded-lg text-sm font-bold text-black transition-colors flex items-center gap-2"
                    >
                      {isInviting ? (
                        <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                      ) : (
                        <Icon name="send" className="w-4 h-4" />
                      )}
                    </button>
                  </form>
                </div>
              )}

              {/* Members List */}
              <div className="bg-white/[0.02] border border-white/5 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-white/5">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Icon name="users" className="w-4 h-4 text-white/40" />
                    Membros ({members.length})
                  </h3>
                </div>
                <div className="divide-y divide-white/5">
                  {members.map(member => (
                    <div key={member.id} className="flex items-center justify-between px-4 py-3 hover:bg-white/[0.02]">
                      <div className="flex items-center gap-3">
                        {member.avatar_url ? (
                          <img src={member.avatar_url} alt="" className="w-8 h-8 rounded-full" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white">
                            {(member.name || member.email).charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <div className="text-sm font-medium text-white">
                            {member.name || member.email}
                          </div>
                          {member.name && (
                            <div className="text-xs text-white/40">{member.email}</div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          member.role_name === 'Admin'
                            ? 'bg-amber-500/20 text-amber-400'
                            : member.role_name === 'Editor'
                            ? 'bg-blue-500/20 text-blue-400'
                            : 'bg-white/10 text-white/60'
                        }`}>
                          {member.role_name}
                        </span>
                        {canManageMembers && member.role_name !== 'Admin' && (
                          <button
                            onClick={() => handleRemoveMember(member.id)}
                            className="p-1.5 text-white/30 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                            title="Remover membro"
                          >
                            <Icon name="trash-2" className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Pending Invites */}
              {canManageMembers && invites.length > 0 && (
                <div className="bg-white/[0.02] border border-white/5 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-white/5">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Icon name="mail" className="w-4 h-4 text-white/40" />
                      Convites Enviados ({invites.length})
                    </h3>
                  </div>
                  <div className="divide-y divide-white/5">
                    {invites.map(invite => (
                      <div key={invite.id} className="flex items-center justify-between px-4 py-3 hover:bg-white/[0.02]">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center">
                            <Icon name="mail" className="w-4 h-4 text-white/30" />
                          </div>
                          <div>
                            <div className="text-sm font-medium text-white">{invite.email}</div>
                            <div className="text-xs text-white/40">
                              Expira em {new Date(invite.expires_at).toLocaleDateString('pt-BR')}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-white/10 text-white/60">
                            {invite.role_name}
                          </span>
                          <button
                            onClick={() => handleCancelInvite(invite.id)}
                            className="p-1.5 text-white/30 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                            title="Cancelar convite"
                          >
                            <Icon name="x" className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
