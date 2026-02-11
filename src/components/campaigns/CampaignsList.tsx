import React, { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../common/Icon";
import { Loader } from "../common/Loader";
import { deleteCampaign, type DbCampaign } from "../../services/apiClient";
import { useCampaigns } from "../../hooks/useAppData";

interface CampaignWithCounts {
  id: string;
  name: string | null;
  status: string;
  createdAt: string;
  creatorName: string | null;
  clipsCount: number;
  postsCount: number;
  adsCount: number;
  carouselsCount: number;
  postsBreakdown: Record<string, number>;
  adsBreakdown: Record<string, number>;
  clipPreviewUrl: string | null;
  postPreviewUrl: string | null;
  adPreviewUrl: string | null;
  carouselPreviewUrl: string | null;
  inputTranscript: string | null;
  toneOfVoiceOverride: string | null;
  toneOfVoiceUsed: string | null;
}

interface CampaignsListProps {
  userId: string;
  organizationId?: string | null;
  onSelectCampaign: (campaignId: string) => void;
  onNewCampaign: () => void;
  currentCampaignId?: string;
}

// Campaign card component
const CampaignCard: React.FC<{
  campaign: CampaignWithCounts;
  isSelected: boolean;
  isLoading: boolean;
  isDeleting: boolean;
  onSelect: () => void;
  onDelete: (e: React.MouseEvent) => void;
  index: number;
}> = ({
  campaign,
  isSelected,
  isLoading: _isLoading,
  isDeleting,
  onSelect,
  onDelete,
  index,
}) => {
    const [showPrompt, setShowPrompt] = useState(false);
    const formatDate = (dateString: string) => {
      const date = new Date(dateString);
      return date.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    };

    const totalAssets =
      campaign.clipsCount + campaign.postsCount + campaign.adsCount + campaign.carouselsCount;
  const toneLabel = campaign.toneOfVoiceOverride || campaign.toneOfVoiceUsed;
  const previewItems = [
      campaign.clipsCount > 0
        ? { type: "clips", url: campaign.clipPreviewUrl, icon: "film", label: "Clip" }
        : null,
      campaign.postsCount > 0
        ? { type: "posts", url: campaign.postPreviewUrl, icon: "image", label: "Post" }
        : null,
      campaign.adsCount > 0
        ? { type: "ads", url: campaign.adPreviewUrl, icon: "zap", label: "Ad" }
        : null,
      campaign.carouselsCount > 0
        ? { type: "carousels", url: campaign.carouselPreviewUrl, icon: "layers", label: "Carrossel" }
        : null,
    ].filter(Boolean) as Array<{
      type: "clips" | "posts" | "ads" | "carousels";
      url: string | null;
      icon: string;
      label: string;
    }>;
  const columns = Math.min(previewItems.length, 4) || 1;

    return (
      <div
        onClick={onSelect}
        className={`
        group relative cursor-pointer
        bg-background rounded-lg overflow-hidden
        border transition-all duration-300
        ${isSelected
            ? "border-primary/30 ring-1 ring-primary/20"
            : "border-border hover:border-white/20"
          }
      `}
        style={{
          animationName: "fadeSlideIn",
          animationDuration: "0.4s",
          animationTimingFunction: "ease-out",
          animationFillMode: "backwards",
          animationDelay: `${index * 50}ms`,
        }}
      >
        {/* Header - Minimal */}
        <div className="relative px-3 py-2 flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="text-[12px] font-semibold text-white truncate">
              {campaign.name || "Campanha sem título"}
            </h3>
            <p className="text-[9px] text-white/25 mt-0.5 flex items-center gap-1.5">
              <span>{formatDate(campaign.createdAt)}</span>
              {campaign.creatorName && (
                <>
                  <span className="text-white/10">•</span>
                  <span className="truncate max-w-[100px]">{campaign.creatorName}</span>
                </>
              )}
            </p>
          </div>

          <div className="flex items-center gap-1">
            {campaign.inputTranscript && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowPrompt(true);
                }}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all"
                title="Ver prompt"
              >
                <Icon name="eye" className="w-3 h-3" />
              </button>
            )}
            <button
              onClick={onDelete}
              disabled={isDeleting}
              className="p-1 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-50"
              title="Excluir"
            >
              {isDeleting ? (
                <Loader size={12} className="text-muted-foreground" />
              ) : (
                <Icon name="trash-2" className="w-3 h-3" />
              )}
            </button>
          </div>
        </div>

        {/* Prompt Modal - rendered via portal */}
        {showPrompt && campaign.inputTranscript && typeof document !== 'undefined' && document.body
          ? createPortal(
              <div
                className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
                onClick={() => setShowPrompt(false)}
              >
                <div className="absolute inset-0 bg-black/90 backdrop-blur-md" />
                <div
                  className="relative w-full max-w-lg bg-black border border-border rounded-2xl shadow-2xl overflow-hidden"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-white/[0.06] flex items-center justify-center">
                        <Icon name="file-text" className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-white">Prompt Original</h4>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Requisição usada para criar esta campanha</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowPrompt(false)}
                      className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-all"
                    >
                      <Icon name="x" className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="p-5 max-h-[60vh] overflow-y-auto">
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                      {campaign.inputTranscript}
                    </p>
                  </div>
                  <div className="px-5 py-3 border-t border-border flex justify-end">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(campaign.inputTranscript || "");
                      }}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/[0.06] border border-border text-xs font-medium text-white/70 hover:text-white hover:bg-white/[0.1] transition-all"
                    >
                      <Icon name="copy" className="w-3.5 h-3.5" />
                      Copiar
                    </button>
                  </div>
                </div>
              </div>,
              document.body
            )
          : null}

        {/* Preview Images */}
        {totalAssets > 0 ? (
          <div className="px-3 pb-3">
            <div className="w-full aspect-[5/3]">
              <div
                className={`grid gap-1 h-full grid-rows-1 ${
                  columns === 1
                    ? "grid-cols-1"
                    : columns === 2
                      ? "grid-cols-2"
                      : columns === 3
                        ? "grid-cols-3"
                        : "grid-cols-4"
                }`}
              >
                {previewItems.map((item) => (
                  <div
                    key={item.type}
                    className="relative overflow-hidden rounded-md h-full bg-white/[0.02]"
                  >
                    {item.url ? (
                      <img
                        src={item.url}
                        alt={item.label}
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 p-2">
                        <Icon name={item.icon} className="w-4 h-4 text-white/15" />
                        <div className="text-center">
                          <span className="text-[8px] text-muted-foreground uppercase tracking-wide block">
                            {item.label}
                          </span>
                          <span className="text-[7px] text-white/15 block mt-1 leading-tight">
                            Conteúdo ainda não gerado
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Counts */}
            <div className="flex items-center gap-2.5 mt-2 text-[8px] text-white/25">
              {campaign.clipsCount > 0 && (
                <span>{campaign.clipsCount} clip{campaign.clipsCount !== 1 ? 's' : ''}</span>
              )}
              {campaign.postsCount > 0 && (
                <span>{campaign.postsCount} post{campaign.postsCount !== 1 ? 's' : ''}</span>
              )}
              {campaign.adsCount > 0 && (
                <span>{campaign.adsCount} ad{campaign.adsCount !== 1 ? 's' : ''}</span>
              )}
              {campaign.carouselsCount > 0 && (
                <span>{campaign.carouselsCount} carrossel{campaign.carouselsCount !== 1 ? 'is' : ''}</span>
              )}
              {toneLabel && <span>Tom: {toneLabel}</span>}
              {isSelected && (
                <span className="ml-auto text-primary/60 font-medium">Aberta</span>
              )}
            </div>
          </div>
        ) : (
          <div className="px-3 pb-3">
            <div className="text-center py-5 rounded-lg bg-white/[0.01]">
              <p className="text-[9px] text-muted-foreground">Campanha vazia</p>
            </div>
          </div>
        )}
      </div>
    );
  };

// Empty state component - minimal version
const CampaignsEmptyState: React.FC = () => (
  <div className="flex items-center justify-center w-full min-h-[60vh]">
    <p className="text-muted-foreground text-sm">
      Nenhuma campanha ainda
    </p>
  </div>
);

// Loading skeleton - minimal
const LoadingSkeleton: React.FC = () => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
    {[0, 1, 2].map((i) => (
      <div
        key={i}
        className="bg-background rounded-lg border border-border overflow-hidden"
        style={{
          animationDelay: `${i * 80}ms`,
          animation: "pulse 1.5s ease-in-out infinite",
        }}
      >
        <div className="px-3 py-2">
          <div className="h-3 bg-white/[0.04] rounded w-2/3 mb-1" />
          <div className="h-2.5 bg-white/[0.03] rounded w-1/3" />
        </div>
        <div className="px-3 pb-3">
          <div className="grid grid-cols-3 gap-1">
            {[0, 1, 2].map((j) => (
              <div key={j} className="aspect-square bg-white/[0.02] rounded-md" />
            ))}
          </div>
        </div>
      </div>
    ))}
  </div>
);

export function CampaignsList({
  userId,
  organizationId,
  onSelectCampaign,
  onNewCampaign,
  currentCampaignId,
}: CampaignsListProps) {
  // Use cached data from SWR - no duplicate fetches!
  const {
    campaigns: dbCampaigns,
    isLoading,
    removeCampaign,
    loadMore,
    isLoadingMore,
    hasMore,
  } = useCampaigns(userId, organizationId);

  const [loadingCampaignId, setLoadingCampaignId] = useState<string | null>(
    null,
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 6;

  // Transform DB campaigns to display format (memoized to avoid recalc)
  const allCampaigns = useMemo<CampaignWithCounts[]>(() => {
    return dbCampaigns.map((c: DbCampaign) => {
      const toneData = c.generation_options as
        | { toneOfVoiceOverride?: string | null; toneOfVoiceUsed?: string | null }
        | null;
      const toneOverride = toneData?.toneOfVoiceOverride || null;
      const toneOfVoiceUsed = toneData?.toneOfVoiceUsed || null;

      return {
        id: c.id,
        name: c.name,
        status: c.status,
        createdAt: c.created_at,
        creatorName: c.creator_name || null,
        clipsCount: Number(c.clips_count) || 0,
        postsCount: Number(c.posts_count) || 0,
        adsCount: Number(c.ads_count) || 0,
        carouselsCount: Number(c.carousels_count) || 0,
        postsBreakdown: c.posts_breakdown || {},
        adsBreakdown: c.ads_breakdown || {},
        clipPreviewUrl: c.clip_preview_url || null,
        postPreviewUrl: c.post_preview_url || null,
        adPreviewUrl: c.ad_preview_url || null,
        carouselPreviewUrl: c.carousel_preview_url || null,
        inputTranscript: c.input_transcript || null,
        toneOfVoiceOverride: toneOverride,
        toneOfVoiceUsed,
      };
    });
  }, [dbCampaigns]);

  // Pagination calculations
  const totalPages = Math.ceil(allCampaigns.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const campaigns = allCampaigns.slice(startIndex, endIndex);
  const totalPagesLabel = hasMore ? `${totalPages}+` : `${totalPages}`;
  const canGoNext = currentPage < totalPages || hasMore;

  const handleNextPage = async () => {
    if (currentPage < totalPages) {
      setCurrentPage((prev) => prev + 1);
      return;
    }
    if (!hasMore || isLoadingMore) return;
    await loadMore();
    setCurrentPage((prev) => prev + 1);
  };

  // Reset to page 1 when campaigns change
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const handleSelectCampaign = (campaignId: string) => {
    setLoadingCampaignId(campaignId);
    onSelectCampaign(campaignId);
    setTimeout(() => setLoadingCampaignId(null), 2000);
  };

  const handleDeleteCampaign = async (
    campaignId: string,
    e: React.MouseEvent,
  ) => {
    e.stopPropagation();

    if (!confirm("Tem certeza que deseja excluir esta campanha?")) {
      return;
    }

    try {
      setDeletingId(campaignId);
      // Optimistic update - remove from cache immediately
      removeCampaign(campaignId);
      await deleteCampaign(campaignId);
    } catch (error) {
      console.error("Failed to delete campaign:", error);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      {/* CSS Keyframes */}
      <style>{`
        @keyframes fadeSlideIn {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>

      {/* Content wrapper */}
      <div className={`px-4 sm:px-6 lg:px-8 ${totalPages > 1 ? "pb-20" : ""}`}>
      {/* Header */}
      <div
        className="flex justify-between items-start gap-3 mb-6"
        style={{ animation: "fadeSlideIn 0.4s ease-out" }}
      >
        <div>
          <h1 className="text-3xl font-semibold text-white tracking-tight">
            Campanhas
          </h1>
          {!isLoading && (
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider mt-1">
              {allCampaigns.length} campanha{allCampaigns.length !== 1 ? "s" : ""}{" "}
              salva{allCampaigns.length !== 1 ? "s" : ""}
              {totalPages > 1 && (
                <span className="text-muted-foreground">
                  {" "}
                  • Página {currentPage} de {totalPagesLabel}
                </span>
              )}
            </p>
          )}
        </div>
        <button
          onClick={onNewCampaign}
          className="flex items-center gap-1.5 px-3 py-2.5 sm:py-2 bg-transparent border border-border rounded-lg text-[10px] font-bold text-muted-foreground uppercase tracking-wide hover:border-white/20 hover:text-white/70 transition-all active:scale-95 flex-shrink-0"
        >
          <Icon name="plus" className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
          <span className="hidden sm:inline">Nova Campanha</span>
          <span className="sm:hidden">Nova</span>
        </button>
      </div>

      {/* Content - Flex 1 to push pagination down */}
      <div className="flex-1">
        {isLoading ? (
          <LoadingSkeleton />
        ) : allCampaigns.length === 0 ? (
          <CampaignsEmptyState />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {campaigns.map((campaign, index) => (
              <CampaignCard
                key={campaign.id}
                campaign={campaign}
                isSelected={currentCampaignId === campaign.id}
                isLoading={loadingCampaignId === campaign.id}
                isDeleting={deletingId === campaign.id}
                onSelect={() => handleSelectCampaign(campaign.id)}
                onDelete={(e) => handleDeleteCampaign(campaign.id, e)}
                index={index}
              />
            ))}
          </div>
        )}
      </div>
      </div>
      {/* End content wrapper */}

      {/* Fixed Pagination Footer */}
      {totalPages > 1 && !isLoading && allCampaigns.length > 0 && (
        <footer className="fixed bottom-0 left-0 right-0 bg-black/80 backdrop-blur-xl border-t border-white/10 px-4 sm:px-6 py-3 z-40">
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="flex items-center gap-2 px-4 py-2 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-full text-sm font-medium text-white/90 hover:border-white/30 transition-all shadow-[0_8px_30px_rgba(0,0,0,0.5)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-white/10"
            >
              <Icon name="chevron-left" className="w-4 h-4" />
              Anterior
            </button>
            <span className="text-sm text-muted-foreground font-medium px-4">
              Página {currentPage} de {totalPagesLabel}
            </span>
            <button
              onClick={handleNextPage}
              disabled={!canGoNext}
              className="flex items-center gap-2 px-4 py-2 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-full text-sm font-medium text-white/90 hover:border-white/30 transition-all shadow-[0_8px_30px_rgba(0,0,0,0.5)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-white/10"
            >
              {isLoadingMore ? "Carregando..." : "Próxima"}
              <Icon name="chevron-right" className="w-4 h-4" />
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}
