/**
 * 3-step wizard for connecting a Composio toolkit via OAuth.
 * Uses the app's Dialog, Input, and Button components.
 *
 * Steps:
 * 1. Configure — enter profile name
 * 2. Authenticate — OAuth popup
 * 3. Success
 */

import React, { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/common/Button";
import { Icon } from "@/components/common/Icon";
import { Loader } from "@/components/common/Loader";
import { createProfile } from "@/services/api/composioApi";
import { useProfileStatus } from "@/hooks/useComposio";
import type { ComposioToolkit } from "@/services/api/types/composioTypes";

type WizardStep = "configure" | "authenticate" | "success";

interface ConnectWizardProps {
  toolkit: ComposioToolkit;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function ConnectWizard({ toolkit, open, onOpenChange, onSuccess }: ConnectWizardProps) {
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

  const handleClose = useCallback(() => {
    onOpenChange(false);
    // Reset state after close animation
    setTimeout(() => {
      setStep("configure");
      setProfileName(`${toolkit.name} Profile`);
      setProfileId(null);
      setRedirectUrl(null);
      setError(null);
    }, 200);
  }, [onOpenChange, toolkit.name]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        {/* Step 1: Configure */}
        {step === "configure" && (
          <>
            <DialogHeader>
              <DialogTitle>Conectar {toolkit.name}</DialogTitle>
              <DialogDescription>
                Escolha um nome para esta conexao.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <label htmlFor="profile-name" className="text-sm font-medium text-foreground">
                  Nome do Profile
                </label>
                <Input
                  id="profile-name"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  placeholder="Ex: Minha conta YouTube"
                  maxLength={100}
                />
              </div>

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="ghost"
                onClick={handleClose}
              >
                Cancelar
              </Button>
              <Button
                variant="primary"
                onClick={handleConnect}
                disabled={isCreating || !profileName.trim()}
                isLoading={isCreating}
              >
                Conectar
              </Button>
            </DialogFooter>
          </>
        )}

        {/* Step 2: Authenticate */}
        {step === "authenticate" && (
          <>
            <DialogHeader>
              <DialogTitle>Autenticar {toolkit.name}</DialogTitle>
              <DialogDescription>
                Uma nova janela foi aberta para voce autorizar a conexao.
                Complete o processo e volte aqui.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col items-center gap-4 py-6">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                <Icon name="external-link" className="h-6 w-6 text-primary animate-pulse" />
              </div>

              {redirectUrl && (
                <p className="text-xs text-muted-foreground">
                  Janela nao abriu?{" "}
                  <a
                    href={redirectUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    Clique aqui
                  </a>
                </p>
              )}

              {status === "active" && (
                <p className="text-sm font-medium text-green-400">
                  Conexao confirmada!
                </p>
              )}
            </div>

            <DialogFooter>
              <Button variant="primary" onClick={handleAuthComplete}>
                Conclui a Autenticacao
              </Button>
            </DialogFooter>
          </>
        )}

        {/* Step 3: Success */}
        {step === "success" && (
          <>
            <DialogHeader>
              <DialogTitle>{toolkit.name} conectado!</DialogTitle>
              <DialogDescription>
                A integracao foi adicionada com sucesso.
              </DialogDescription>
            </DialogHeader>

            <div className="flex justify-center py-6">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-green-500/10">
                <Icon name="check-circle" className="h-7 w-7 text-green-400" />
              </div>
            </div>

            <DialogFooter>
              <Button variant="primary" onClick={handleClose}>
                Fechar
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
