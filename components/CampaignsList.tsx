import React, { useState, useEffect } from 'react';
import { Icon } from './common/Icon';
import { Button } from './common/Button';
import { Loader } from './common/Loader';
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
}

interface CampaignsListProps {
  userId: string;
  onSelectCampaign: (campaignId: string) => void;
  onNewCampaign: () => void;
  currentCampaignId?: string;
}

export function CampaignsList({ userId, onSelectCampaign, onNewCampaign, currentCampaignId }: CampaignsListProps) {
  const [campaigns, setCampaigns] = useState<CampaignWithCounts[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingCampaignId, setLoadingCampaignId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    loadCampaigns();
  }, [userId]);

  const loadCampaigns = async () => {
    try {
      setIsLoading(true);
      const dbCampaigns = await getCampaigns(userId);
      const summaries: CampaignWithCounts[] = dbCampaigns.map((c: DbCampaign & {
        clips_count?: number;
        posts_count?: number;
        ads_count?: number;
        posts_breakdown?: Record<string, number>;
        ads_breakdown?: Record<string, number>;
      }) => ({
        id: c.id,
        name: c.name,
        status: c.status,
        createdAt: c.created_at,
        clipsCount: Number(c.clips_count) || 0,
        postsCount: Number(c.posts_count) || 0,
        adsCount: Number(c.ads_count) || 0,
        postsBreakdown: c.posts_breakdown || {},
        adsBreakdown: c.ads_breakdown || {},
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
    // Loading state will be cleared when component unmounts or campaign loads
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

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-400';
      case 'draft':
        return 'text-yellow-400';
      case 'generating':
        return 'text-blue-400';
      default:
        return 'text-gray-400';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Concluida';
      case 'draft':
        return 'Rascunho';
      case 'generating':
        return 'Gerando...';
      default:
        return status;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Controls Bar - Same style as PostsTab */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-5 bg-[#0a0a0a] rounded-2xl border border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
            <Icon name="layers" className="w-4 h-4 text-primary" />
          </div>
          <h2 className="text-sm font-black text-white uppercase tracking-wide">Minhas Campanhas</h2>
        </div>
        <Button onClick={onNewCampaign} icon="plus" size="small">
          Nova Campanha
        </Button>
      </div>

      {/* Campaign Grid */}
      {campaigns.length === 0 ? (
        <div className="bg-[#0a0a0a] rounded-2xl border border-white/5 p-12 text-center">
          <Icon name="layers" className="w-12 h-12 text-white/10 mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">Nenhuma campanha salva</h3>
          <p className="text-sm text-white/40 mb-6">
            Suas campanhas geradas aparecerão aqui para você acessar a qualquer momento.
          </p>
          <Button onClick={onNewCampaign} icon="plus">
            Criar Primeira Campanha
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {campaigns.map((campaign) => (
            <div
              key={campaign.id}
              className={`bg-[#0a0a0a] rounded-2xl border border-white/5 overflow-hidden h-full flex flex-col transition-all hover:border-primary/30 ${
                currentCampaignId === campaign.id ? 'border-primary/50' : ''
              }`}
            >
              {/* Header - Same style as PostCard */}
              <div className="px-5 py-3 border-b border-white/5 bg-[#0d0d0d] flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-primary/20 flex items-center justify-center">
                  <Icon name="zap" className="w-3 h-3 text-primary" />
                </div>
                <h3 className="text-xs font-black text-white uppercase tracking-wide flex-1 truncate">
                  {campaign.name || 'Campanha'}
                </h3>
                <span className={`text-[9px] px-2 py-1 rounded-full uppercase tracking-wider font-medium border ${
                  campaign.status === 'completed'
                    ? 'bg-green-500/10 text-green-400 border-green-500/20'
                    : campaign.status === 'generating'
                    ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                    : 'bg-white/5 text-white/40 border-white/10'
                }`}>
                  {getStatusLabel(campaign.status)}
                </span>
              </div>

              <div className="flex-1 p-4 space-y-3">
                {/* Stats Area */}
                <div className="bg-[#080808] rounded-xl p-4 border border-white/5">
                  <div className="space-y-2">
                    {/* Clips */}
                    {campaign.clipsCount > 0 && (
                      <div className="flex items-center gap-2">
                        <Icon name="film" className="w-3.5 h-3.5 text-primary" />
                        <span className="text-[11px] text-white/70">{campaign.clipsCount} Clips</span>
                      </div>
                    )}

                    {/* Posts breakdown */}
                    {Object.keys(campaign.postsBreakdown).length > 0 && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <Icon name="image" className="w-3.5 h-3.5 text-primary" />
                        <span className="text-[11px] text-white/70">
                          {Object.entries(campaign.postsBreakdown).map(([platform, count], i, arr) => (
                            <span key={platform}>
                              {count} {platform}{i < arr.length - 1 ? ' • ' : ''}
                            </span>
                          ))}
                        </span>
                      </div>
                    )}

                    {/* Ads breakdown */}
                    {Object.keys(campaign.adsBreakdown).length > 0 && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <Icon name="zap" className="w-3.5 h-3.5 text-primary" />
                        <span className="text-[11px] text-white/70">
                          {Object.entries(campaign.adsBreakdown).map(([platform, count], i, arr) => (
                            <span key={platform}>
                              {count} {platform} Ads{i < arr.length - 1 ? ' • ' : ''}
                            </span>
                          ))}
                        </span>
                      </div>
                    )}

                    {/* Empty state */}
                    {campaign.clipsCount === 0 && campaign.postsCount === 0 && campaign.adsCount === 0 && (
                      <p className="text-[11px] text-white/30 italic">Campanha vazia</p>
                    )}
                  </div>
                </div>

                {/* Date */}
                <p className="text-[11px] text-white/40 leading-relaxed">
                  Criada em {formatDate(campaign.createdAt)}
                </p>
              </div>

              {/* Actions - Same style as PostCard */}
              <div className="p-4 pt-0 flex gap-2">
                <Button
                  onClick={() => handleSelectCampaign(campaign.id)}
                  isLoading={loadingCampaignId === campaign.id}
                  size="small"
                  className="flex-1"
                  icon="eye"
                >
                  Abrir
                </Button>
                <button
                  onClick={(e) => handleDeleteCampaign(campaign.id, e)}
                  disabled={deletingId === campaign.id}
                  className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-red-400 hover:bg-red-500/10 hover:border-red-500/20 transition-colors"
                  title="Excluir campanha"
                >
                  {deletingId === campaign.id ? (
                    <Loader className="w-4 h-4" />
                  ) : (
                    <Icon name="trash-2" className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
