/**
 * Connect Instagram Modal
 * Modal for connecting Instagram accounts via Rube MCP
 * Multi-tenant support for each user to connect their own Instagram
 */

import { useState } from 'react';
import { Button } from '../common/Button';
import { Icon } from '../common/Icon';
import { Loader } from '../common/Loader';

interface InstagramAccount {
  id: string;
  instagram_user_id: string;
  instagram_username: string;
  is_active: boolean;
  connected_at: string;
  last_used_at: string | null;
}

interface ConnectInstagramModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  organizationId?: string | null;
  onAccountConnected: (account: InstagramAccount) => void;
}

const RUBE_API_KEYS_URL = 'https://rube.app/settings/api-keys';

export function ConnectInstagramModal({
  isOpen,
  onClose,
  userId,
  organizationId,
  onAccountConnected
}: ConnectInstagramModalProps) {
  const [token, setToken] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2>(1);

  const handleOpenRube = () => {
    window.open(RUBE_API_KEYS_URL, '_blank');
    setStep(2);
  };

  const handleConnect = async () => {
    if (!token.trim()) {
      setError('Cole o token do Rube');
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      const response = await fetch('/api/db/instagram-accounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          user_id: userId,
          organization_id: organizationId || null,
          rube_token: token.trim()
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao conectar conta');
      }

      onAccountConnected(data.account);
      setToken('');
      setStep(1);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleClose = () => {
    setToken('');
    setError(null);
    setStep(1);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 rounded-xl flex items-center justify-center">
              <Icon name="instagram" className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Conectar Instagram</h2>
              <p className="text-[10px] text-white/40">Via Rube MCP</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-white/5 rounded-lg transition-colors"
          >
            <Icon name="x" className="w-4 h-4 text-white/40" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Step 1 */}
          <div className={`space-y-3 ${step === 2 ? 'opacity-50' : ''}`}>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-[10px] font-bold text-white">1</span>
              </div>
              <div>
                <p className="text-xs font-medium text-white">Conecte o Instagram no Rube</p>
                <p className="text-[10px] text-white/40 mt-1">
                  Crie uma conta no Rube (grátis), conecte seu Instagram e gere o token na página API Keys
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleOpenRube}
                  className="mt-2"
                >
                  <Icon name="external-link" className="w-3 h-3 mr-1.5" />
                  Abrir Rube
                </Button>
              </div>
            </div>
          </div>

          {/* Step 2 */}
          <div className={`space-y-3 ${step === 1 ? 'opacity-50' : ''}`}>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-[10px] font-bold text-white">2</span>
              </div>
              <div className="flex-1">
                <p className="text-xs font-medium text-white">Copie o token e cole aqui</p>
                <p className="text-[10px] text-white/40 mt-1">
                  Clique em "Copy" no passo 2 da página API Keys do Rube
                </p>
                <div className="mt-2">
                  <textarea
                    value={token}
                    onChange={(e) => {
                      setToken(e.target.value);
                      setError(null);
                    }}
                    placeholder="eyJhbGciOiJIUzI1NiIs..."
                    className="w-full h-24 bg-[#111111] border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder:text-white/20 resize-none focus:outline-none focus:border-white/20 transition-colors"
                    disabled={isConnecting}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
              <Icon name="alert-circle" className="w-4 h-4 text-red-400 flex-shrink-0" />
              <p className="text-[11px] text-red-400">{error}</p>
            </div>
          )}

          {/* Info */}
          <div className="flex items-start gap-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
            <Icon name="info" className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="text-[10px] text-blue-300/80">
              <p className="font-medium mb-1">Por que usar o Rube?</p>
              <p>O Rube gerencia a autenticacao OAuth com o Instagram de forma segura. Seu token fica armazenado apenas no seu app.</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-white/10 bg-white/[0.02]">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClose}
            disabled={isConnecting}
          >
            Cancelar
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleConnect}
            disabled={!token.trim() || isConnecting}
          >
            {isConnecting ? (
              <>
                <Loader className="w-3 h-3 mr-1.5" />
                Conectando...
              </>
            ) : (
              <>
                <Icon name="link" className="w-3 h-3 mr-1.5" />
                Conectar
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Hook para gerenciar contas Instagram
 */
export function useInstagramAccounts(userId: string, organizationId?: string | null) {
  const [accounts, setAccounts] = useState<InstagramAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAccounts = async () => {
    if (!userId) return;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ user_id: userId });
      if (organizationId) {
        params.append('organization_id', organizationId);
      }

      const response = await fetch(`/api/db/instagram-accounts?${params}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao carregar contas');
      }

      setAccounts(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  };

  const addAccount = (account: InstagramAccount) => {
    setAccounts(prev => {
      const exists = prev.find(a => a.id === account.id);
      if (exists) {
        return prev.map(a => a.id === account.id ? account : a);
      }
      return [account, ...prev];
    });
  };

  const removeAccount = async (accountId: string) => {
    try {
      const response = await fetch(`/api/db/instagram-accounts?id=${accountId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Erro ao desconectar conta');
      }

      setAccounts(prev => prev.filter(a => a.id !== accountId));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
      return false;
    }
  };

  return {
    accounts,
    loading,
    error,
    fetchAccounts,
    addAccount,
    removeAccount
  };
}
