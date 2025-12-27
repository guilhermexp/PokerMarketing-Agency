import React, { useState, useEffect } from 'react';
import { Icon } from './common/Icon';
import { Button } from './common/Button';
import { Loader } from './common/Loader';
import { EmptyState } from './common/EmptyState';
import { getCampaigns, deleteCampaign, type DbCampaign } from '../services/apiClient';

interface CampaignWithCounts {
  id: string;
  name: string | null;
  status: string;
  createdAt: string;
  clipsCount: number;
  postsCount: number;
  adsCount: number;
  postsBreakdown: Record<string, number>;
  adsBreakdown: Record<string, number>;
  clipPreviewUrl: string | null;
  postPreviewUrl: string | null;
  adPreviewUrl: string | null;
}

interface CampaignsListProps {
  userId: string;
  organizationId?: string | null;
  onSelectCampaign: (campaignId: string) => void;
  onNewCampaign: () => void;
  currentCampaignId?: string;
}

// Animated counter for stats
const AnimatedNumber: React.FC<{ value: number; delay?: number }> = ({ value, delay = 0 }) => {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      let start = 0;
      const duration = 600;
      const startTime = performance.now();

      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easeOut = 1 - Math.pow(1 - progress, 3);
        setDisplayValue(Math.floor(easeOut * value));

        if (progress < 1) {
          requestAnimationFrame(animate);
        }
      };

      requestAnimationFrame(animate);
    }, delay);

    return () => clearTimeout(timer);
  }, [value, delay]);

  return <span>{displayValue}</span>;
};

// Status badge component
const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const config = {
    completed: {
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20',
      text: 'text-emerald-400',
      dot: 'bg-emerald-400',
      label: 'Concluída'
    },
    generating: {
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/20',
      text: 'text-amber-400',
      dot: 'bg-amber-400 animate-pulse',
      label: 'Gerando...'
    },
    draft: {
      bg: 'bg-white/5',
      border: 'border-white/10',
      text: 'text-white/50',
      dot: 'bg-white/40',
      label: 'Rascunho'
    }
  }[status] || {
    bg: 'bg-white/5',
    border: 'border-white/10',
    text: 'text-white/40',
    dot: 'bg-white/30',
    label: status
  };

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-semibold uppercase tracking-wider ${config.bg} ${config.border} ${config.text} border`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
};

// Campaign card component
const CampaignCard: React.FC<{
  campaign: CampaignWithCounts;
  isSelected: boolean;
  isLoading: boolean;
  isDeleting: boolean;
  onSelect: () => void;
  onDelete: (e: React.MouseEvent) => void;
  index: number;
}> = ({ campaign, isSelected, isLoading, isDeleting, onSelect, onDelete, index }) => {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const totalAssets = campaign.clipsCount + campaign.postsCount + campaign.adsCount;

  return (
    <div
      className={`
        group relative
        bg-gradient-to-b from-[#0d0d0d] to-[#0a0a0a]
        rounded-2xl overflow-hidden
        border transition-all duration-500 ease-out
        ${isSelected
          ? 'border-primary/40 shadow-[0_0_40px_-10px_rgba(245,158,11,0.3)]'
          : 'border-white/[0.06] hover:border-white/[0.12]'
        }
        hover:shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)]
        hover:-translate-y-0.5
      `}
      style={{
        animationDelay: `${index * 80}ms`,
        animation: 'fadeSlideIn 0.5s ease-out backwards'
      }}
    >
      {/* Ambient glow on hover */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none">
        <div className="absolute -top-20 -right-20 w-40 h-40 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-white/[0.02] rounded-full blur-2xl" />
      </div>

      {/* Header */}
      <div className="relative px-5 py-4 border-b border-white/[0.04]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {/* Icon */}
            <div className={`
              w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0
              transition-all duration-300
              ${isSelected
                ? 'bg-primary/20 shadow-[0_0_20px_rgba(245,158,11,0.2)]'
                : 'bg-white/[0.04] group-hover:bg-white/[0.06]'
              }
            `}>
              <Icon
                name="zap"
                className={`w-4 h-4 transition-colors duration-300 ${
                  isSelected ? 'text-primary' : 'text-white/40 group-hover:text-white/60'
                }`}
              />
            </div>

            {/* Title */}
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold text-white truncate leading-tight">
                {campaign.name || 'Campanha sem título'}
              </h3>
              <p className="text-[10px] text-white/30 mt-0.5">
                {formatDate(campaign.createdAt)} às {formatTime(campaign.createdAt)}
              </p>
            </div>
          </div>

          <StatusBadge status={campaign.status} />
        </div>
      </div>

      {/* Content */}
      <div className="relative p-5 space-y-4">
        {/* Stats Grid with Previews */}
        {totalAssets > 0 ? (
          <div className="grid grid-cols-3 gap-3">
            {campaign.clipsCount > 0 && (
              <div className="relative overflow-hidden rounded-xl border border-white/[0.04] aspect-square group/stat">
                {campaign.clipPreviewUrl ? (
                  <>
                    <img
                      src={campaign.clipPreviewUrl}
                      alt="Clip preview"
                      className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover/stat:scale-110"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/20" />
                  </>
                ) : (
                  <div className="absolute inset-0 bg-white/[0.02] flex items-center justify-center">
                    <Icon name="film" className="w-6 h-6 text-white/10" />
                  </div>
                )}
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-2">
                  <div className="text-xl font-black text-white tabular-nums drop-shadow-lg">
                    <AnimatedNumber value={campaign.clipsCount} delay={index * 80} />
                  </div>
                  <div className="text-[8px] text-white/60 uppercase tracking-wider font-semibold mt-0.5">Clips</div>
                </div>
              </div>
            )}
            {campaign.postsCount > 0 && (
              <div className="relative overflow-hidden rounded-xl border border-white/[0.04] aspect-square group/stat">
                {campaign.postPreviewUrl ? (
                  <>
                    <img
                      src={campaign.postPreviewUrl}
                      alt="Post preview"
                      className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover/stat:scale-110"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/20" />
                  </>
                ) : (
                  <div className="absolute inset-0 bg-white/[0.02] flex items-center justify-center">
                    <Icon name="image" className="w-6 h-6 text-white/10" />
                  </div>
                )}
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-2">
                  <div className="text-xl font-black text-white tabular-nums drop-shadow-lg">
                    <AnimatedNumber value={campaign.postsCount} delay={index * 80 + 100} />
                  </div>
                  <div className="text-[8px] text-white/60 uppercase tracking-wider font-semibold mt-0.5">Posts</div>
                </div>
              </div>
            )}
            {campaign.adsCount > 0 && (
              <div className="relative overflow-hidden rounded-xl border border-white/[0.04] aspect-square group/stat">
                {campaign.adPreviewUrl ? (
                  <>
                    <img
                      src={campaign.adPreviewUrl}
                      alt="Ad preview"
                      className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover/stat:scale-110"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/20" />
                  </>
                ) : (
                  <div className="absolute inset-0 bg-white/[0.02] flex items-center justify-center">
                    <Icon name="zap" className="w-6 h-6 text-white/10" />
                  </div>
                )}
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-2">
                  <div className="text-xl font-black text-white tabular-nums drop-shadow-lg">
                    <AnimatedNumber value={campaign.adsCount} delay={index * 80 + 200} />
                  </div>
                  <div className="text-[8px] text-white/60 uppercase tracking-wider font-semibold mt-0.5">Ads</div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-4">
            <div className="w-10 h-10 rounded-full bg-white/[0.02] flex items-center justify-center mx-auto mb-2">
              <Icon name="inbox" className="w-4 h-4 text-white/20" />
            </div>
            <p className="text-[11px] text-white/20 italic">Campanha vazia</p>
          </div>
        )}

        {/* Platform breakdown */}
        {(Object.keys(campaign.postsBreakdown).length > 0 || Object.keys(campaign.adsBreakdown).length > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(campaign.postsBreakdown).map(([platform, count]) => (
              <span
                key={`post-${platform}`}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.03] text-[9px] text-white/40"
              >
                <Icon name="image" className="w-2.5 h-2.5" />
                {count} {platform}
              </span>
            ))}
            {Object.entries(campaign.adsBreakdown).map(([platform, count]) => (
              <span
                key={`ad-${platform}`}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/5 text-[9px] text-primary/60"
              >
                <Icon name="zap" className="w-2.5 h-2.5" />
                {count} {platform}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="relative px-5 pb-5 pt-0 flex gap-2">
        <button
          onClick={onSelect}
          disabled={isLoading}
          className={`
            flex-1 flex items-center justify-center gap-2
            px-4 py-2.5 rounded-xl
            text-[10px] font-bold uppercase tracking-wider
            transition-all duration-300
            ${isSelected
              ? 'bg-primary text-black'
              : 'bg-white/[0.04] text-white/70 hover:bg-white/[0.08] hover:text-white border border-white/[0.06]'
            }
            disabled:opacity-50
          `}
        >
          {isLoading ? (
            <Loader className="w-3.5 h-3.5" />
          ) : (
            <>
              <Icon name="eye" className="w-3.5 h-3.5" />
              <span>{isSelected ? 'Aberta' : 'Abrir'}</span>
            </>
          )}
        </button>

        <button
          onClick={onDelete}
          disabled={isDeleting}
          className="
            w-10 h-10 rounded-xl
            flex items-center justify-center
            bg-white/[0.02] border border-white/[0.06]
            text-white/30
            hover:bg-red-500/10 hover:border-red-500/20 hover:text-red-400
            transition-all duration-300
            disabled:opacity-50
          "
          title="Excluir campanha"
        >
          {isDeleting ? (
            <Loader className="w-4 h-4" />
          ) : (
            <Icon name="trash-2" className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Selection indicator */}
      {isSelected && (
        <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent" />
      )}
    </div>
  );
};

// Empty state component using reusable EmptyState
const CampaignsEmptyState: React.FC<{ onNewCampaign: () => void }> = ({ onNewCampaign }) => (
  <EmptyState
    icon="layers"
    title="Nenhuma campanha ainda"
    description="Comece criando sua primeira campanha de marketing e veja a mágica acontecer."
    actionLabel="Criar Primeira Campanha"
    actionIcon="plus"
    onAction={onNewCampaign}
    size="large"
  />
);

// Loading skeleton
const LoadingSkeleton: React.FC = () => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
    {[0, 1, 2].map((i) => (
      <div
        key={i}
        className="bg-[#0a0a0a] rounded-2xl border border-white/[0.04] overflow-hidden"
        style={{ animationDelay: `${i * 100}ms`, animation: 'pulse 1.5s ease-in-out infinite' }}
      >
        <div className="p-5 border-b border-white/[0.04]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/[0.04]" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-white/[0.04] rounded-lg w-3/4" />
              <div className="h-3 bg-white/[0.04] rounded-lg w-1/2" />
            </div>
          </div>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {[0, 1, 2].map((j) => (
              <div key={j} className="h-16 bg-white/[0.02] rounded-xl" />
            ))}
          </div>
        </div>
        <div className="px-5 pb-5 flex gap-2">
          <div className="flex-1 h-10 bg-white/[0.04] rounded-xl" />
          <div className="w-10 h-10 bg-white/[0.04] rounded-xl" />
        </div>
      </div>
    ))}
  </div>
);

export function CampaignsList({ userId, organizationId, onSelectCampaign, onNewCampaign, currentCampaignId }: CampaignsListProps) {
  const [campaigns, setCampaigns] = useState<CampaignWithCounts[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingCampaignId, setLoadingCampaignId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    loadCampaigns();
  }, [userId, organizationId]);

  const loadCampaigns = async () => {
    try {
      setIsLoading(true);
      const dbCampaigns = await getCampaigns(userId, organizationId);
      const summaries: CampaignWithCounts[] = dbCampaigns.map((c: DbCampaign) => ({
        id: c.id,
        name: c.name,
        status: c.status,
        createdAt: c.created_at,
        clipsCount: Number(c.clips_count) || 0,
        postsCount: Number(c.posts_count) || 0,
        adsCount: Number(c.ads_count) || 0,
        postsBreakdown: c.posts_breakdown || {},
        adsBreakdown: c.ads_breakdown || {},
        clipPreviewUrl: c.clip_preview_url || null,
        postPreviewUrl: c.post_preview_url || null,
        adPreviewUrl: c.ad_preview_url || null,
      }));
      setCampaigns(summaries);
    } catch (error) {
      console.error('Failed to load campaigns:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectCampaign = (campaignId: string) => {
    setLoadingCampaignId(campaignId);
    onSelectCampaign(campaignId);
    setTimeout(() => setLoadingCampaignId(null), 2000);
  };

  const handleDeleteCampaign = async (campaignId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (!confirm('Tem certeza que deseja excluir esta campanha?')) {
      return;
    }

    try {
      setDeletingId(campaignId);
      await deleteCampaign(campaignId);
      setCampaigns(prev => prev.filter(c => c.id !== campaignId));
    } catch (error) {
      console.error('Failed to delete campaign:', error);
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
        className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-2"
        style={{ animation: 'fadeSlideIn 0.4s ease-out' }}
      >
        <div>
          <h1 className="text-2xl font-black text-white uppercase tracking-tight">
            Minhas Campanhas
          </h1>
          {!isLoading && (
            <p className="text-[11px] text-white/30 uppercase tracking-wider mt-1">
              {campaigns.length} campanha{campaigns.length !== 1 ? 's' : ''} salva{campaigns.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>
        <Button onClick={onNewCampaign} icon="plus" size="small" variant="primary">
          Nova Campanha
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <LoadingSkeleton />
      ) : campaigns.length === 0 ? (
        <CampaignsEmptyState onNewCampaign={onNewCampaign} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
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
