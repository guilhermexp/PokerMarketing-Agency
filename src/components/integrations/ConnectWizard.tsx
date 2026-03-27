/**
 * 3-step wizard for connecting a Composio toolkit via OAuth.
 *
 * Steps:
 * 1. Configure — enter profile name
 * 2. Authenticate — OAuth popup
 * 3. Success
 */

import React, { useState, useCallback } from "react";
import { X, ExternalLink, Loader2, CheckCircle2 } from "lucide-react";
import { createProfile } from "@/services/api/composioApi";
import { useProfileStatus } from "@/hooks/useComposio";
import type { ComposioToolkit } from "@/services/api/types/composioTypes";

type WizardStep = "configure" | "authenticate" | "success";

interface ConnectWizardProps {
  toolkit: ComposioToolkit;
  onClose: () => void;
  onSuccess: () => void;
}

export function ConnectWizard({ toolkit, onClose, onSuccess }: ConnectWizardProps) {
  const [step, setStep] = useState<WizardStep>("configure");
  const [profileName, setProfileName] = useState(`${toolkit.name} Profile`);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const { status } = useProfileStatus(
    step === "authenticate" ? profileId : null,
  );

  const handleConnect = useCallback(async () => {
    if (!profileName.trim()) {
      setError("Nome do profile e obrigatorio");
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const result = await createProfile({
        toolkit_slug: toolkit.slug,
        profile_name: profileName.trim(),
      });

      setProfileId(result.profile_id);
      setRedirectUrl(result.redirect_url);
      setStep("authenticate");

      if (result.redirect_url) {
        window.open(
          result.redirect_url,
          "composio_oauth",
          "width=600,height=700,scrollbars=yes",
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar profile");
    } finally {
      setIsCreating(false);
    }
  }, [profileName, toolkit.slug]);

  const handleAuthComplete = useCallback(() => {
    setStep("success");
    onSuccess();
  }, [onSuccess]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-zinc-900 p-6 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-zinc-400 hover:bg-white/10 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Step indicators */}
        <div className="mb-6 flex items-center gap-2">
          {(["configure", "authenticate", "success"] as const).map((s, i) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-colors ${
                step === s
                  ? "bg-blue-500"
                  : (["configure", "authenticate", "success"].indexOf(step) > i
                    ? "bg-blue-500/40"
                    : "bg-white/10")
              }`}
            />
          ))}
        </div>

        {/* Step 1: Configure */}
        {step === "configure" && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-white">
                Conectar {toolkit.name}
              </h2>
              <p className="mt-1 text-sm text-zinc-400">
                Escolha um nome para esta conexao.
              </p>
            </div>

            <div>
              <label
                htmlFor="profile-name"
                className="mb-1.5 block text-sm font-medium text-zinc-300"
              >
                Nome do Profile
              </label>
              <input
                id="profile-name"
                type="text"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder="Ex: Minha conta YouTube"
                maxLength={100}
              />
            </div>

            {error && (
              <p className="text-sm text-red-400">{error}</p>
            )}

            <button
              onClick={handleConnect}
              disabled={isCreating || !profileName.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
            >
              {isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Conectando...
                </>
              ) : (
                "Conectar"
              )}
            </button>
          </div>
        )}

        {/* Step 2: Authenticate */}
        {step === "authenticate" && (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-500/10">
              <ExternalLink className="h-7 w-7 text-blue-400 animate-pulse" />
            </div>

            <div>
              <h2 className="text-lg font-semibold text-white">
                Autenticar {toolkit.name}
              </h2>
              <p className="mt-1 text-sm text-zinc-400">
                Uma nova janela foi aberta para voce autorizar a conexao.
                Complete o processo e volte aqui.
              </p>
            </div>

            {redirectUrl && (
              <p className="text-xs text-zinc-500">
                Janela nao abriu?{" "}
                <a
                  href={redirectUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:underline"
                >
                  Clique aqui
                </a>
              </p>
            )}

            {status === "active" && (
              <p className="text-sm text-emerald-400">
                Conexao confirmada!
              </p>
            )}

            <button
              onClick={handleAuthComplete}
              className="w-full rounded-lg bg-white/10 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/20"
            >
              Conclui a Autenticacao
            </button>
          </div>
        )}

        {/* Step 3: Success */}
        {step === "success" && (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
              <CheckCircle2 className="h-8 w-8 text-emerald-400" />
            </div>

            <div>
              <h2 className="text-lg font-semibold text-white">
                {toolkit.name} conectado!
              </h2>
              <p className="mt-1 text-sm text-zinc-400">
                A integracao foi adicionada com sucesso.
              </p>
            </div>

            <button
              onClick={onClose}
              className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-500"
            >
              Fechar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
