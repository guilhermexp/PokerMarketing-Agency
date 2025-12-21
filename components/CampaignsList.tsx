import React, { useState, useEffect } from 'react';
import { Icon } from './common/Icon';
import { Loader } from './common/Loader';
import type { CampaignSummary } from '../types';
import { getCampaigns, deleteCampaign, type DbCampaign } from '../services/apiClient';

interface CampaignsListProps {
  userId: string;
  onSelectCampaign: (campaignId: string) => void;
  onNewCampaign: () => void;
  currentCampaignId?: string;
}

export function CampaignsList({ userId, onSelectCampaign, onNewCampaign, currentCampaignId }: CampaignsListProps) {
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
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
      const summaries: CampaignSummary[] = dbCampaigns.map((c: DbCampaign) => ({
        id: c.id,
        name: c.name,
        status: c.status,
        createdAt: c.created_at,
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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Icon name="layers" className="w-5 h-5 text-primary" />
          Minhas Campanhas
        </h2>
        <button
          onClick={onNewCampaign}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-black rounded-lg hover:bg-primary/80 transition-colors font-medium"
        >
          <Icon name="plus" className="w-4 h-4" />
          Nova Campanha
        </button>
      </div>

      {/* Campaign List */}
      {campaigns.length === 0 ? (
        <div className="bg-surface rounded-xl border border-white/10 p-12 text-center">
          <Icon name="layers" className="w-12 h-12 text-white/20 mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">Nenhuma campanha salva</h3>
          <p className="text-sm text-white/50 mb-6">
            Suas campanhas geradas aparecerão aqui para você acessar a qualquer momento.
          </p>
          <button
            onClick={onNewCampaign}
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-black rounded-lg hover:bg-primary/80 transition-colors font-medium"
          >
            <Icon name="plus" className="w-4 h-4" />
            Criar Primeira Campanha
          </button>
        </div>
      ) : (
        <div className="grid gap-3">
          {campaigns.map((campaign) => (
            <div
              key={campaign.id}
              onClick={() => handleSelectCampaign(campaign.id)}
              className={`
                bg-surface rounded-xl border p-4 cursor-pointer transition-all
                hover:border-primary/50 hover:bg-surface-light
                ${currentCampaignId === campaign.id ? 'border-primary' : 'border-white/10'}
                ${loadingCampaignId === campaign.id ? 'opacity-50' : ''}
              `}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-medium truncate">
                      {campaign.name || 'Campanha sem nome'}
                    </h3>
                    <span className={`text-xs ${getStatusColor(campaign.status)}`}>
                      {getStatusLabel(campaign.status)}
                    </span>
                  </div>
                  <p className="text-sm text-white/50">
                    {formatDate(campaign.createdAt)}
                  </p>
                </div>

                <div className="flex items-center gap-2 ml-4">
                  {loadingCampaignId === campaign.id ? (
                    <Loader className="w-5 h-5" />
                  ) : (
                    <>
                      <button
                        onClick={(e) => handleDeleteCampaign(campaign.id, e)}
                        disabled={deletingId === campaign.id}
                        className="p-2 text-white/30 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                        title="Excluir campanha"
                      >
                        {deletingId === campaign.id ? (
                          <Loader className="w-4 h-4" />
                        ) : (
                          <Icon name="trash-2" className="w-4 h-4" />
                        )}
                      </button>
                      <Icon name="chevron-right" className="w-5 h-5 text-white/30" />
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
