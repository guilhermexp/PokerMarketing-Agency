/**
 * Marketplace modal — browse and connect Composio apps.
 */

import React, { useState, useMemo } from "react";
import { X, Search, Loader2 } from "lucide-react";
import { useComposioToolkits } from "@/hooks/useComposio";
import { ConnectWizard } from "./ConnectWizard";
import type { ComposioToolkit } from "@/services/api/types/composioTypes";

interface MarketplaceModalProps {
  open: boolean;
  onClose: () => void;
  onProfileCreated: () => void;
}

export function MarketplaceModal({ open, onClose, onProfileCreated }: MarketplaceModalProps) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedToolkit, setSelectedToolkit] = useState<ComposioToolkit | null>(null);

  // Debounce search
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchTimeoutRef = React.useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
    clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearch(value);
    }, 300);
  };

  const { toolkits, total, isLoading } = useComposioToolkits(
    debouncedSearch || undefined,
    page,
  );

  const totalPages = Math.ceil(total / 20);

  if (!open) return null;

  if (selectedToolkit) {
    return (
      <ConnectWizard
        toolkit={selectedToolkit}
        onClose={() => setSelectedToolkit(null)}
        onSuccess={() => {
          setSelectedToolkit(null);
          onProfileCreated();
        }}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-white/10 bg-zinc-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Conectar App</h2>
            <p className="text-sm text-zinc-400">
              {total} apps disponiveis
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-400 hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search */}
        <div className="border-b border-white/10 px-6 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Buscar apps..."
              className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm text-white placeholder-zinc-500 outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
            </div>
          ) : toolkits.length === 0 ? (
            <div className="py-12 text-center text-sm text-zinc-500">
              Nenhum app encontrado
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {toolkits.map((toolkit) => (
                <button
                  key={toolkit.slug}
                  onClick={() => setSelectedToolkit(toolkit)}
                  className="flex flex-col items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-4 text-center transition-colors hover:border-white/20 hover:bg-white/[0.07]"
                >
                  {toolkit.logo ? (
                    <img
                      src={toolkit.logo}
                      alt={toolkit.name}
                      className="h-10 w-10 rounded-lg object-contain"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 text-lg font-bold text-white">
                      {toolkit.name.charAt(0)}
                    </div>
                  )}
                  <span className="text-xs font-medium text-white line-clamp-1">
                    {toolkit.name}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 border-t border-white/10 px-6 py-3">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-lg px-3 py-1 text-xs text-zinc-400 hover:bg-white/10 disabled:opacity-30"
            >
              Anterior
            </button>
            <span className="text-xs text-zinc-500">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded-lg px-3 py-1 text-xs text-zinc-400 hover:bg-white/10 disabled:opacity-30"
            >
              Proximo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
