import React, { useState } from 'react';
import { getOrganizationApi } from '../../lib/auth-client';
import { Button } from '../common/Button';
import { Icon } from '../common/Icon';

const orgApi = getOrganizationApi();

interface OnboardingModalProps {
  onInviteAccepted: () => void;
  onCreateBrand: () => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({ onInviteAccepted, onCreateBrand }) => {
  const [inviteToken, setInviteToken] = useState('');
  const [isAccepting, setIsAccepting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const handleAcceptInvite = async () => {
    if (!inviteToken.trim()) return;
    setIsAccepting(true);
    setInviteError(null);
    try {
      const result = await orgApi.acceptInvitation({
        invitationId: inviteToken.trim(),
      });
      if (result.error) {
        setInviteError(result.error.message || 'Token invalido ou expirado');
        return;
      }
      const orgId = result.data?.member?.organizationId || result.data?.organizationId;
      if (orgId) {
        await orgApi.setActive({ organizationId: orgId });
      }
      onInviteAccepted();
    } catch (err) {
      setInviteError(
        err instanceof Error ? err.message : 'Falha ao aceitar convite'
      );
    } finally {
      setIsAccepting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 sm:p-6 relative overflow-hidden font-sans selection:bg-white/20 selection:text-white">
      <div className="w-full max-w-md z-10">
        <div className="flex items-center justify-center mb-8">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-white/5 border border-border flex items-center justify-center backdrop-blur-xl">
              <Icon name="logo" className="w-5 h-5 text-white" />
            </div>
            <span className="text-sm font-semibold text-muted-foreground">Social Lab</span>
          </div>
        </div>

        <div className="rounded-2xl p-6 sm:p-8 shadow-2xl border border-border bg-[#0a0a0a]/95 backdrop-blur-xl">
          <div className="text-center mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mb-2">
              Bem-vindo ao Socialab!
            </h1>
            <p className="text-sm text-muted-foreground">
              Voce ja recebeu um convite para entrar em uma marca?
            </p>
          </div>

          <div className="space-y-4 mb-6">
            <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5 space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/10">
                  <Icon name="mail" className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">Tenho um convite</p>
                  <p className="text-xs text-muted-foreground">Cole o token para entrar na marca</p>
                </div>
              </div>

              {inviteError && (
                <p className="text-xs text-red-400">{inviteError}</p>
              )}

              <div className="flex gap-2">
                <input
                  type="text"
                  value={inviteToken}
                  onChange={(e) => setInviteToken(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAcceptInvite()}
                  placeholder="Cole o token do convite aqui"
                  className="flex-1 bg-black/40 border border-white/15 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/20 transition-all"
                />
                <Button
                  type="button"
                  onClick={handleAcceptInvite}
                  disabled={!inviteToken.trim() || isAccepting}
                  size="normal"
                  className="px-5 py-3 text-sm font-semibold bg-white text-black hover:bg-white/90 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  variant="primary"
                >
                  {isAccepting ? 'Entrando...' : 'Entrar'}
                </Button>
              </div>
            </div>
          </div>

          <div className="relative flex items-center justify-center my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border"></div>
            </div>
            <span className="relative bg-[#0a0a0a] px-4 text-xs text-muted-foreground">ou</span>
          </div>

          <Button
            type="button"
            onClick={onCreateBrand}
            size="large"
            className="w-full py-3.5 text-sm font-semibold bg-white/5 text-white border border-border hover:bg-white/10 rounded-xl transition-all"
            variant="secondary"
          >
            Criar nova marca
          </Button>
        </div>

        <p className="text-center text-muted-foreground text-xs font-medium mt-6">
          Social Lab
        </p>
      </div>
    </div>
  );
};
