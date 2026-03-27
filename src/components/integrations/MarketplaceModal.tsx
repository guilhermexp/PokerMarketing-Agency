/**
 * Marketplace modal — browse and connect Composio apps.
 * Uses the app's Dialog and Input components.
 */

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Loader } from "@/components/common/Loader";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/common/Button";
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

  return (
    <>
      <Dialog open={open && !selectedToolkit} onOpenChange={(v) => { if (!v) onClose(); }}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Conectar App</DialogTitle>
            <DialogDescription>
              {total} apps disponiveis
            </DialogDescription>
          </DialogHeader>

          {/* Search */}
          <div className="relative">
            <Icon name="search" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Buscar apps..."
              className="pl-9"
            />
          </div>

          {/* Grid */}
          <div className="flex-1 overflow-y-auto -mx-6 px-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader size={20} className="text-muted-foreground" />
              </div>
            ) : toolkits.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                Nenhum app encontrado
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 py-2">
                {toolkits.map((toolkit) => (
                  <button
                    key={toolkit.slug}
                    onClick={() => setSelectedToolkit(toolkit)}
                    className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card/50 p-4 text-center transition-colors hover:bg-card hover:border-border/80"
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
                    <span className="text-xs font-medium text-foreground line-clamp-1">
                      {toolkit.name}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 border-t border-border pt-3 -mx-6 px-6">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                Anterior
              </Button>
              <span className="text-xs text-muted-foreground">
                {page} / {totalPages}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                Proximo
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Connect Wizard (separate dialog) */}
      {selectedToolkit && (
        <ConnectWizard
          toolkit={selectedToolkit}
          open={!!selectedToolkit}
          onOpenChange={(v) => { if (!v) setSelectedToolkit(null); }}
          onSuccess={() => {
            setSelectedToolkit(null);
            onProfileCreated();
          }}
        />
      )}
    </>
  );
}
