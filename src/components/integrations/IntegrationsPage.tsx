/**
 * Main integrations page — connected profiles grid + marketplace.
 * Uses the app's EmptyState and Button components.
 */

import React, { useState, useCallback } from "react";
import { useComposioProfiles } from "@/hooks/useComposio";
import { deleteProfile } from "@/services/api/composioApi";
import { Button } from "@/components/common/Button";
import { EmptyState } from "@/components/common/EmptyState";
import { Loader } from "@/components/common/Loader";
import { AppCard } from "./AppCard";
import { MarketplaceModal } from "./MarketplaceModal";

export function IntegrationsPage() {
  const { profiles, isLoading, mutate } = useComposioProfiles();
  const [marketplaceOpen, setMarketplaceOpen] = useState(false);

  const handleDisconnect = useCallback(
    async (id: string) => {
      await deleteProfile(id);
      await mutate();
    },
    [mutate],
  );

  const handleProfileCreated = useCallback(() => {
    void mutate();
    setMarketplaceOpen(false);
  }, [mutate]);

  return (
    <div className="px-4 py-6 sm:px-6 sm:py-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Integrações</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Conecte seus apps favoritos via OAuth
          </p>
        </div>
        <Button
          variant="primary"
          icon="plus"
          onClick={() => setMarketplaceOpen(true)}
        >
          Conectar App
        </Button>
      </div>

      {/* Connected Profiles */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader size={20} className="text-muted-foreground" />
        </div>
      ) : profiles.length === 0 ? (
        <EmptyState
          title="Nenhuma integracao conectada"
          description="Conecte apps como YouTube, Slack, Google Calendar e mais para expandir as capacidades do seu agente."
          actionLabel="Conectar primeiro app"
          actionIcon="plus"
          onAction={() => setMarketplaceOpen(true)}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {profiles.map((profile) => (
            <AppCard
              key={profile.id}
              profile={profile}
              onDisconnect={handleDisconnect}
            />
          ))}
        </div>
      )}

      {/* Marketplace Modal */}
      <MarketplaceModal
        open={marketplaceOpen}
        onClose={() => setMarketplaceOpen(false)}
        onProfileCreated={handleProfileCreated}
      />
    </div>
  );
}
