/**
 * Team Management Component
 * Shows invite + member management for the active organization (= the brand).
 * No org creation or switching — the org is created automatically with the brand.
 */

import React, { useState, useEffect, useCallback } from "react";
import { authClient } from "../../lib/auth-client";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import {
  Users,
  Mail,
  Crown,
  Shield,
  User,
  Trash2,
  Loader2,
  UserPlus,
  Copy,
  Check,
} from "lucide-react";

// Better Auth organization client uses Proxy — methods exist at runtime but TS doesn't type them
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const orgApi = authClient.organization as any;

interface Member {
  id: string;
  userId: string;
  role: string;
  user?: {
    id: string;
    name: string;
    email: string;
    image?: string;
  };
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: string;
}

const roleConfig: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  owner: { label: "Proprietario", icon: Crown, color: "text-amber-400" },
  admin: { label: "Admin", icon: Shield, color: "text-blue-400" },
  member: { label: "Membro", icon: User, color: "text-muted-foreground" },
};

function getInitials(name?: string, email?: string): string {
  if (name) {
    return name
      .split(" ")
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  }
  return (email || "?")[0].toUpperCase();
}

export function TeamManagement() {
  const { data: activeOrg } = authClient.useActiveOrganization();
  const { data: sessionData } = authClient.useSession();

  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);

  // Invite
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "admin">("member");
  const [isInviting, setIsInviting] = useState(false);

  // Copy token
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Feedback
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const currentUserId = sessionData?.user?.id;

  const showSuccess = (msg: string) => {
    setSuccess(msg);
    setError(null);
    setTimeout(() => setSuccess(null), 4000);
  };

  const showError = (msg: string) => {
    setError(msg);
    setSuccess(null);
  };

  const copyToken = async (invitationId: string) => {
    try {
      await navigator.clipboard.writeText(invitationId);
      setCopiedId(invitationId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Fallback for insecure contexts
      const input = document.createElement("input");
      input.value = invitationId;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopiedId(invitationId);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  // Load members
  const loadMembers = useCallback(async () => {
    if (!activeOrg?.id) return;
    setIsLoadingMembers(true);
    try {
      // Better Auth list-members is a GET endpoint — pass params via `query`
      // to avoid the client proxy sending POST (which causes 404)
      const result = await orgApi.listMembers({
        query: { organizationId: activeOrg.id },
      });
      // Response: { data: { members: [...], total: N } } or { data: [...] }
      const membersData = result.data?.members ?? result.data;
      if (Array.isArray(membersData)) {
        setMembers(membersData as unknown as Member[]);
      }
    } catch (err) {
      console.error("Failed to load members:", err);
    } finally {
      setIsLoadingMembers(false);
    }
  }, [activeOrg?.id]);

  // Load invitations
  const loadInvitations = useCallback(async () => {
    if (!activeOrg?.id) return;
    try {
      // Better Auth list-invitations is a GET endpoint — pass params via `query`
      const result = await orgApi.listInvitations({
        query: { organizationId: activeOrg.id },
      });
      if (result.data) {
        setInvitations(
          (result.data as unknown as Invitation[]).filter(
            (inv) => inv.status === "pending"
          )
        );
      }
    } catch {
      setInvitations([]);
    }
  }, [activeOrg?.id]);

  useEffect(() => {
    loadMembers();
    loadInvitations();
  }, [loadMembers, loadInvitations]);

  // Invite member
  const handleInvite = async () => {
    if (!activeOrg?.id || !inviteEmail.trim()) return;
    setIsInviting(true);
    setError(null);
    try {
      const result = await orgApi.inviteMember({
        organizationId: activeOrg.id,
        email: inviteEmail.trim(),
        role: inviteRole,
      });
      const invId = result?.data?.id;
      if (invId) {
        showSuccess(
          `Convite criado! Compartilhe o token com ${inviteEmail.trim()}.`
        );
        copyToken(invId);
      } else {
        showSuccess(`Convite enviado para ${inviteEmail.trim()}`);
      }
      setInviteEmail("");
      loadInvitations();
    } catch (err) {
      showError(
        err instanceof Error ? err.message : "Falha ao convidar membro"
      );
    } finally {
      setIsInviting(false);
    }
  };

  // Remove member
  const handleRemove = async (memberId: string) => {
    if (!activeOrg?.id) return;
    setError(null);
    try {
      await orgApi.removeMember({
        organizationId: activeOrg.id,
        memberIdOrEmail: memberId,
      });
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
      showSuccess("Membro removido");
    } catch (err) {
      showError(
        err instanceof Error ? err.message : "Falha ao remover membro"
      );
    }
  };

  // Change role
  const handleRoleChange = async (memberId: string, newRole: string) => {
    if (!activeOrg?.id) return;
    setError(null);
    try {
      await orgApi.updateMemberRole({
        organizationId: activeOrg.id,
        memberId,
        role: newRole as "member" | "admin",
      });
      setMembers((prev) =>
        prev.map((m) => (m.id === memberId ? { ...m, role: newRole } : m))
      );
      showSuccess("Cargo atualizado");
    } catch (err) {
      showError(
        err instanceof Error ? err.message : "Falha ao alterar cargo"
      );
    }
  };

  // Cancel invitation
  const handleCancelInvitation = async (invitationId: string) => {
    setError(null);
    try {
      await orgApi.cancelInvitation({ invitationId });
      setInvitations((prev) => prev.filter((inv) => inv.id !== invitationId));
      showSuccess("Convite cancelado");
    } catch (err) {
      showError(
        err instanceof Error ? err.message : "Falha ao cancelar convite"
      );
    }
  };

  // ──────────────────────────────────────
  // No active org — shouldn't happen after onboarding
  // ──────────────────────────────────────
  if (!activeOrg) {
    return (
      <div className="rounded-xl border border-border bg-white/[0.02] p-8 text-center">
        <Users className="h-8 w-8 text-muted-foreground mx-auto mb-3 opacity-40" />
        <p className="text-sm text-muted-foreground">
          Nenhuma organizacao ativa. Salve o perfil da marca para criar sua equipe.
        </p>
      </div>
    );
  }

  // ──────────────────────────────────────
  // Active org — full management
  // ──────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Feedback */}
      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {success}
        </div>
      )}

      {/* Invite member */}
      <div className="rounded-xl border border-border bg-white/[0.02] p-5">
        <div className="flex items-center gap-2 mb-3">
          <UserPlus className="h-4 w-4 text-muted-foreground" />
          <h4 className="text-sm font-medium text-white">Convidar membro</h4>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Convide pessoas por email para acessar esta marca e colaborar.
        </p>
        <div className="flex gap-2">
          <Input
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="email@exemplo.com"
            onKeyDown={(e) => e.key === "Enter" && handleInvite()}
            className="flex-1"
          />
          <select
            value={inviteRole}
            onChange={(e) =>
              setInviteRole(e.target.value as "member" | "admin")
            }
            className="h-9 px-2 text-sm rounded-xl border border-input bg-input/30 text-foreground"
          >
            <option value="member">Membro</option>
            <option value="admin">Admin</option>
          </select>
          <Button
            onClick={handleInvite}
            disabled={!inviteEmail.trim() || isInviting}
            size="sm"
          >
            {isInviting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Convidar"
            )}
          </Button>
        </div>
      </div>

      {/* Pending invitations */}
      {invitations.length > 0 && (
        <div className="rounded-xl border border-border bg-white/[0.02] p-5">
          <div className="flex items-center gap-2 mb-3">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <h4 className="text-sm font-medium text-white">
              Convites pendentes
            </h4>
            <Badge
              variant="secondary"
              className="ml-auto text-[10px] px-1.5 py-0"
            >
              {invitations.length}
            </Badge>
          </div>
          <div className="space-y-1.5">
            {invitations.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-white/[0.02] border border-border"
              >
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-500/10 border border-amber-500/20">
                    <Mail className="h-3 w-3 text-amber-400" />
                  </div>
                  <div>
                    <p className="text-sm text-white">{inv.email}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {roleConfig[inv.role]?.label || inv.role} — expira em{" "}
                      {new Date(inv.expiresAt).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => copyToken(inv.id)}
                    className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-white hover:bg-white/5 rounded transition-colors"
                    title="Copiar token do convite"
                  >
                    {copiedId === inv.id ? (
                      <Check className="h-3 w-3 text-emerald-400" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                    Token
                  </button>
                  <button
                    onClick={() => handleCancelInvitation(inv.id)}
                    className="px-2 py-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Members list */}
      <div className="rounded-xl border border-border bg-white/[0.02] p-5">
        <div className="flex items-center gap-2 mb-3">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h4 className="text-sm font-medium text-white">Membros</h4>
          {!isLoadingMembers && (
            <Badge
              variant="secondary"
              className="ml-auto text-[10px] px-1.5 py-0"
            >
              {members.length}
            </Badge>
          )}
        </div>

        {isLoadingMembers ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : members.length === 0 ? (
          <div className="text-center py-6">
            <Users className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-40" />
            <p className="text-xs text-muted-foreground">
              Apenas voce por enquanto. Convide membros acima.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {members.map((member) => {
              const config = roleConfig[member.role] || roleConfig.member;
              const RoleIcon = config.icon;
              const isCurrentUser = member.userId === currentUserId;

              return (
                <div
                  key={member.id}
                  className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-white/[0.02] border border-border"
                >
                  <div className="flex items-center gap-2.5">
                    {member.user?.image ? (
                      <img
                        src={member.user.image}
                        alt=""
                        className="h-8 w-8 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 border border-border text-xs font-semibold text-white">
                        {getInitials(member.user?.name, member.user?.email)}
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium text-white">
                          {member.user?.name || member.user?.email}
                        </p>
                        {isCurrentUser && (
                          <span className="text-[10px] text-muted-foreground">
                            (voce)
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {member.user?.email}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {member.role === "owner" ? (
                      <span
                        className={`flex items-center gap-1 text-xs font-medium ${config.color}`}
                      >
                        <RoleIcon className="h-3 w-3" />
                        {config.label}
                      </span>
                    ) : (
                      <select
                        value={member.role}
                        onChange={(e) =>
                          handleRoleChange(member.id, e.target.value)
                        }
                        className="h-7 px-2 text-xs rounded-lg border border-border bg-transparent text-foreground"
                        disabled={isCurrentUser}
                      >
                        <option value="admin">Admin</option>
                        <option value="member">Membro</option>
                      </select>
                    )}
                    {member.role !== "owner" && !isCurrentUser && (
                      <button
                        onClick={() => handleRemove(member.id)}
                        className="p-1 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                        title="Remover membro"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
