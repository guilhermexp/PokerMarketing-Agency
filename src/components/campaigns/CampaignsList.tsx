import React, { useState, useMemo } from "react";
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
  postsBreakdown: Record<string, number>;
  adsBreakdown: Record<string, number>;
  clipPreviewUrl: string | null;
  postPreviewUrl: string | null;
  adPreviewUrl: string | null;
  inputTranscript: string | null;
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
      campaign.clipsCount + campaign.postsCount + campaign.adsCount;

    return (
      <div
        onClick={onSelect}
        className={`
        group relative cursor-pointer
        bg-[#0a0a0a] rounded-xl overflow-hidden
        border transition-all duration-300
        ${isSelected
            ? "border-primary/30 ring-1 ring-primary/20"
            : "border-white/[0.05] hover:border-white/[0.1]"
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
        <div className="relative px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-[13px] font-semibold text-white truncate">
              {campaign.name || "Campanha sem título"}
            </h3>
            <p className="text-[10px] text-white/25 mt-0.5 flex items-center gap-1.5">
              <span>{formatDate(campaign.createdAt)}</span>
              {campaign.creatorName && (
                <>
                  <span className="text-white/10">•</span>
                  <span className="truncate max-w-[100px]">{campaign.creatorName}</span>
                </>
              )}
            </p>
          </div>

          <div className="flex items-center gap-1.5">
            {campaign.inputTranscript && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowPrompt(true);
                }}
                className="p-1.5 rounded-md text-white/30 hover:text-white/60 hover:bg-white/5 transition-all"
                title="Ver prompt"
              >
                <Icon name="eye" className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={onDelete}
              disabled={isDeleting}
              className="p-1.5 rounded-md text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-50"
              title="Excluir"
            >
              {isDeleting ? (
                <Loader className="w-3.5 h-3.5" />
              ) : (
                <Icon name="trash-2" className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Prompt Modal - rendered via portal */}
        {showPrompt && campaign.inputTranscript && createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
            onClick={() => setShowPrompt(false)}
          >
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
            <div
              className="relative w-full max-w-lg bg-[#0d0d0d] border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Icon name="eye" className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">Requisição Original</h4>
                    <p className="text-[10px] text-white/40">Prompt usado para criar esta campanha</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowPrompt(false)}
                  className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/[0.06] transition-all"
                >
                  <Icon name="x" className="w-4 h-4" />
                </button>
              </div>
              <div className="p-5 max-h-[60vh] overflow-y-auto">
                <p className="text-sm text-white/70 whitespace-pre-wrap leading-relaxed">
                  {campaign.inputTranscript}
                </p>
              </div>
              <div className="px-5 py-3 border-t border-white/[0.06] flex justify-end">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(campaign.inputTranscript || "");
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.04] text-[10px] font-bold text-white/50 hover:text-white hover:bg-white/[0.08] transition-all"
                >
                  <Icon name="copy" className="w-3 h-3" />
                  Copiar
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

        {/* Preview Images */}
        {totalAssets > 0 ? (
          <div className="px-4 pb-4">
            <div className="grid grid-cols-3 gap-1.5">
              {campaign.clipsCount > 0 && (
                <div className="relative overflow-hidden rounded-lg aspect-square bg-white/[0.02]">
                  {campaign.clipPreviewUrl ? (
                    <img
                      src={campaign.clipPreviewUrl}
                      alt="Clip"
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Icon name="film" className="w-4 h-4 text-white/10" />
                    </div>
                  )}
                </div>
              )}
              {campaign.postsCount > 0 && (
                <div className="relative overflow-hidden rounded-lg aspect-square bg-white/[0.02]">
                  {campaign.postPreviewUrl ? (
                    <img
                      src={campaign.postPreviewUrl}
                      alt="Post"
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Icon name="image" className="w-4 h-4 text-white/10" />
                    </div>
                  )}
                </div>
              )}
              {campaign.adsCount > 0 && (
                <div className="relative overflow-hidden rounded-lg aspect-square bg-white/[0.02]">
                  {campaign.adPreviewUrl ? (
                    <img
                      src={campaign.adPreviewUrl}
                      alt="Ad"
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Icon name="zap" className="w-4 h-4 text-white/10" />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Counts */}
            <div className="flex items-center gap-3 mt-3 text-[9px] text-white/25">
              {campaign.clipsCount > 0 && (
                <span>{campaign.clipsCount} clip{campaign.clipsCount !== 1 ? 's' : ''}</span>
              )}
              {campaign.postsCount > 0 && (
                <span>{campaign.postsCount} post{campaign.postsCount !== 1 ? 's' : ''}</span>
              )}
              {campaign.adsCount > 0 && (
                <span>{campaign.adsCount} ad{campaign.adsCount !== 1 ? 's' : ''}</span>
              )}
              {isSelected && (
                <span className="ml-auto text-primary/60 font-medium">Aberta</span>
              )}
            </div>
          </div>
        ) : (
          <div className="px-4 pb-4">
            <div className="text-center py-6 rounded-lg bg-white/[0.01]">
              <p className="text-[10px] text-white/20">Campanha vazia</p>
            </div>
          </div>
        )}
      </div>
    );
  };

// Empty state component - minimal version
const CampaignsEmptyState: React.FC = () => (
  <div className="flex items-center justify-center w-full min-h-[60vh]">
    <div className="bg-[#111] border border-white/[0.06] rounded-2xl px-16 py-20 flex flex-col items-center justify-center text-center min-w-[320px]">
      <div className="grid grid-cols-2 gap-1.5 mb-6">
        <div className="w-6 h-6 rounded border border-white/20" />
        <div className="w-6 h-6 rounded border border-white/20" />
        <div className="w-6 h-6 rounded border border-white/20" />
        <div className="w-6 h-6 rounded border border-white/20" />
      </div>
      <p className="text-white/40 text-sm">
        Nenhuma campanha ainda
      </p>
    </div>
  </div>
);

// Loading skeleton - minimal
const LoadingSkeleton: React.FC = () => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    {[0, 1, 2].map((i) => (
      <div
        key={i}
        className="bg-[#0a0a0a] rounded-xl border border-white/[0.05] overflow-hidden"
        style={{
          animationDelay: `${i * 80}ms`,
          animation: "pulse 1.5s ease-in-out infinite",
        }}
      >
        <div className="px-4 py-3">
          <div className="h-4 bg-white/[0.04] rounded w-2/3 mb-1.5" />
          <div className="h-3 bg-white/[0.03] rounded w-1/3" />
        </div>
        <div className="px-4 pb-4">
          <div className="grid grid-cols-3 gap-1.5">
            {[0, 1, 2].map((j) => (
              <div key={j} className="aspect-square bg-white/[0.02] rounded-lg" />
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
  } = useCampaigns(userId, organizationId);

  const [loadingCampaignId, setLoadingCampaignId] = useState<string | null>(
    null,
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Transform DB campaigns to display format (memoized to avoid recalc)
  const campaigns = useMemo<CampaignWithCounts[]>(() => {
    return dbCampaigns.map((c: DbCampaign) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      createdAt: c.created_at,
      creatorName: c.creator_name || null,
      clipsCount: Number(c.clips_count) || 0,
      postsCount: Number(c.posts_count) || 0,
      adsCount: Number(c.ads_count) || 0,
      postsBreakdown: c.posts_breakdown || {},
      adsBreakdown: c.ads_breakdown || {},
      clipPreviewUrl: c.clip_preview_url || null,
      postPreviewUrl: c.post_preview_url || null,
      adPreviewUrl: c.ad_preview_url || null,
      inputTranscript: c.input_transcript || null,
    }));
  }, [dbCampaigns]);

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
    <div className="space-y-6">
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

      {/* Header */}
      <div
        className="flex justify-between items-start gap-3 mb-2"
        style={{ animation: "fadeSlideIn 0.4s ease-out" }}
      >
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight">
            Campanhas
          </h1>
          {!isLoading && (
            <p className="text-[11px] text-white/30 uppercase tracking-wider mt-1">
              {campaigns.length} campanha{campaigns.length !== 1 ? "s" : ""}{" "}
              salva{campaigns.length !== 1 ? "s" : ""}
            </p>
          )}
        </div>
        <button
          onClick={onNewCampaign}
          className="flex items-center gap-1.5 px-3 py-2.5 sm:py-2 bg-transparent border border-white/[0.06] rounded-lg text-[10px] font-bold text-white/50 uppercase tracking-wide hover:border-white/[0.1] hover:text-white/70 transition-all active:scale-95 flex-shrink-0"
        >
          <Icon name="plus" className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
          <span className="hidden sm:inline">Nova Campanha</span>
          <span className="sm:hidden">Nova</span>
        </button>
      </div>

      {/* Content */}
      {isLoading ? (
        <LoadingSkeleton />
      ) : campaigns.length === 0 ? (
        <CampaignsEmptyState />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
  );
}
