/**
 * Main integrations page — shows connected profiles and browse marketplace.
 */

import React, { useState, useCallback } from "react";
import { Plus, Loader2, Unplug } from "lucide-react";
import { useComposioProfiles } from "@/hooks/useComposio";
import { deleteProfile } from "@/services/api/composioApi";
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
          <h1 className="text-xl font-semibold text-white">Integrações</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Conecte seus apps favoritos via OAuth
          </p>
        </div>
        <button
          onClick={() => setMarketplaceOpen(true)}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
        >
          <Plus className="h-4 w-4" />
          Conectar App
        </button>
      </div>

      {/* Connected Profiles Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
        </div>
      ) : profiles.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 py-16">
          <Unplug className="mb-3 h-10 w-10 text-zinc-600" />
          <p className="text-sm text-zinc-400">
            Nenhuma integracao conectada
          </p>
          <button
            onClick={() => setMarketplaceOpen(true)}
            className="mt-3 text-sm text-blue-400 hover:underline"
          >
            Conectar primeiro app
          </button>
        </div>
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
