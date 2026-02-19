/**
 * TournamentEventCard Component
 *
 * Displays a tournament event with its details and generated flyers.
 * Handles flyer generation for individual tournaments.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/common/Icon';
import { Loader } from '@/components/common/Loader';
import { FlyerThumbStrip } from './FlyerThumbStrip';
import { ImagePreviewModal } from '@/components/common/ImagePreviewModal';
import { QuickPostModal } from '@/components/common/QuickPostModal';
import { SchedulePostModal } from '@/components/calendar/SchedulePostModal';
import { useBackgroundJobs, type ActiveJob } from '@/hooks/useBackgroundJobs';
import { urlToBase64 } from '@/utils/imageHelpers';
import { generateFlyer } from '@/services/geminiService';
import { buildSingleEventFlyerPromptExtended } from '@/ai-prompts';
import type { BrandProfile, TournamentEvent, GalleryImage, ImageModel, ImageSize, ImageFile } from '@/types';
import type { Currency } from '@/types/flyer.types';
import type { InstagramContext } from '@/services/rubeService';
import type { ScheduledPost } from '@/types';

interface TournamentEventCardProps {
  event: TournamentEvent;
  brandProfile: BrandProfile;
  aspectRatio: string;
  currency: Currency;
  language: 'pt' | 'en';
  model: ImageModel;
  imageSize: ImageSize;
  compositionAssets: ImageFile[];
  collabLogos: string[];
  styleReference: GalleryImage | null;
  generatedFlyers: (GalleryImage | 'loading')[];
  setGeneratedFlyers: (updater: (prev: (GalleryImage | 'loading')[]) => (GalleryImage | 'loading')[]) => void;
  onAddImageToGallery: (image: Omit<GalleryImage, 'id'>) => GalleryImage;
  onUpdateGalleryImage: (imageId: string, newImageSrc: string) => void;
  onSetChatReference: (image: GalleryImage | null) => void;
  onPublishToCampaign: (text: string, flyer: GalleryImage) => void;
  userId?: string | null;
  instagramContext?: InstagramContext;
  galleryImages?: GalleryImage[];
  onSchedulePost?: (post: Omit<ScheduledPost, 'id' | 'createdAt' | 'updatedAt'>) => void;
}

const formatCurrencyValue = (val: string, currency: Currency): string => {
  if (!val || val === '0' || val === '') return '---';
  const num = parseFloat(String(val).replace(/[^0-9.-]+/g, '')) || 0;
  if (num === 0) return '---';
  if (currency === 'USD') return `$${num.toLocaleString('en-US')}`;
  return `R$ ${(num * 5).toLocaleString('pt-BR', { minimumFractionDigits: num % 1 !== 0 ? 2 : 0 })}`;
};

export const TournamentEventCard: React.FC<TournamentEventCardProps> = ({
  event,
  brandProfile,
  aspectRatio,
  currency,
  language: _language,
  model,
  imageSize,
  compositionAssets,
  collabLogos,
  styleReference,
  generatedFlyers,
  setGeneratedFlyers,
  onAddImageToGallery: _onAddImageToGallery,
  onUpdateGalleryImage,
  onSetChatReference,
  onPublishToCampaign,
  userId,
  instagramContext,
  galleryImages = [],
  onSchedulePost,
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [editingFlyer, setEditingFlyer] = useState<GalleryImage | null>(null);
  const [quickPostFlyer, setQuickPostFlyer] = useState<GalleryImage | null>(null);
  const [scheduleFlyer, setScheduleFlyer] = useState<GalleryImage | null>(null);

  // Auto-expand if there are already generated flyers
  const hasExistingFlyers = generatedFlyers.some((f) => f !== 'loading');
  const [isExpanded, setIsExpanded] = useState(hasExistingFlyers);

  const { onJobComplete, onJobFailed, getJobByContext } = useBackgroundJobs();
  const jobContext = `flyer-event-${event.id}`;
  const pendingJob = getJobByContext(jobContext);

  // Listen for job completion to add image to gallery
  useEffect(() => {
    const unsubComplete = onJobComplete((job: ActiveJob) => {
      if (job.context === jobContext && job.result_url) {
        const newImage: GalleryImage = {
          id: job.result_gallery_id || `temp-${Date.now()}`,
          src: job.result_url,
          prompt: '',
          source: 'Flyer',
          model,
          aspectRatio,
          imageSize,
        };
        setGeneratedFlyers((prev) =>
          prev.map((f) => (f === 'loading' ? newImage : f))
        );
        setIsGenerating(false);
        setIsExpanded(true);
      }
    });

    const unsubFailed = onJobFailed((job: ActiveJob) => {
      if (job.context === jobContext) {
        setGeneratedFlyers((prev) => prev.filter((f) => f !== 'loading'));
        setIsGenerating(false);
        console.error('[TournamentEventCard] Job failed:', job.error_message);
      }
    });

    return () => {
      unsubComplete();
      unsubFailed();
    };
  }, [jobContext, onJobComplete, onJobFailed, model, aspectRatio, imageSize, setGeneratedFlyers]);

  // Restore loading state from pending job
  useEffect(() => {
    if (
      pendingJob &&
      (pendingJob.status === 'queued' || pendingJob.status === 'processing') &&
      !isGenerating
    ) {
      setIsGenerating(true);
      if (!generatedFlyers.includes('loading')) {
        setGeneratedFlyers((prev) => ['loading', ...prev]);
      }
    }
  }, [pendingJob, isGenerating, generatedFlyers, setGeneratedFlyers]);

  // Auto-expand when flyers are loaded from storage
  useEffect(() => {
    if (hasExistingFlyers && !isExpanded) {
      setIsExpanded(true);
    }
  }, [hasExistingFlyers, isExpanded]);

  const handleGenerate = useCallback(async () => {
    const biVal = formatCurrencyValue(event.buyIn, currency);
    const gtdVal = formatCurrencyValue(event.gtd, currency);

    const prompt = buildSingleEventFlyerPromptExtended({
      eventName: event.name,
      gtdValue: gtdVal,
      buyInValue: biVal,
      eventTime: event.times?.['-3'],
      brandPrimaryColor: brandProfile.primaryColor,
      brandSecondaryColor: brandProfile.secondaryColor,
    });

    // Synchronous generation (background jobs were removed)
    setIsGenerating(true);
    setGeneratedFlyers((prev) => ['loading', ...prev]);

    try {
      const [logoToUse, refData, ...collabLogosToUse] = await Promise.all([
        brandProfile.logo ? urlToBase64(brandProfile.logo) : null,
        styleReference?.src ? urlToBase64(styleReference.src) : null,
        ...collabLogos.map(logo => urlToBase64(logo)),
      ]);
      const assetsToUse = compositionAssets.map((a) => ({
        base64: a.base64,
        mimeType: a.mimeType,
      }));
      const imageUrl = await generateFlyer(
        prompt,
        brandProfile,
        logoToUse,
        refData,
        aspectRatio,
        model,
        collabLogosToUse.filter(Boolean) as { base64: string; mimeType: string }[],
        imageSize,
        assetsToUse,
      );
      const newImage: GalleryImage = {
        id: `flyer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        src: imageUrl,
        prompt: '',
        source: 'Flyer',
        model,
        aspectRatio,
        imageSize,
      };
      setGeneratedFlyers((prev) =>
        prev.map((f) => (f === 'loading' ? newImage : f))
      );
    } catch (err) {
      console.error('[TournamentEventCard] Generation failed:', err);
      setGeneratedFlyers((prev) => prev.filter((f) => f !== 'loading'));
    } finally {
      setIsGenerating(false);
    }
  }, [event, brandProfile, currency, model, aspectRatio, imageSize, collabLogos, styleReference, compositionAssets, userId, jobContext, setGeneratedFlyers]);

  const handleQuickPost = (flyer: GalleryImage) => {
    setQuickPostFlyer(flyer);
  };

  const handleSchedule = (flyer: GalleryImage) => {
    setScheduleFlyer(flyer);
  };

  const biVal = formatCurrencyValue(event.buyIn, currency);
  const gtdVal = formatCurrencyValue(event.gtd, currency);

  return (
    <>
      <Card className="overflow-hidden bg-white/[0.02] border border-white/[0.06] rounded-2xl">
        {/* Header */}
        <div
          className="flex items-center justify-between p-3 bg-white/[0.02] border-b border-white/[0.06] cursor-pointer hover:bg-white/[0.04] transition-all"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
            <div className="flex flex-col min-w-[52px]">
              <span className="text-[10px] text-white/35 font-semibold uppercase tracking-wider">{event.day}</span>
              <span className="text-sm font-semibold text-white">{event.times?.['-3']}</span>
            </div>
          <div className="w-px h-10 bg-white/10" />
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-semibold text-white line-clamp-1">{event.name}</span>
              <div className="flex items-center gap-2 text-[11px] text-white/35">
                <span className="text-white/80 font-mono">{biVal}</span>
                <span>|</span>
                <span className="font-mono truncate max-w-[90px]">{event.structure}</span>
                <span>|</span>
                <span className="font-mono truncate max-w-[70px]">{event.stack}</span>
              </div>
            </div>
        </div>
        <div className="flex items-center gap-3">
          {gtdVal !== '---' && (
            <div className="flex flex-col items-end">
              <span className="text-[10px] text-white/35 uppercase tracking-wider font-semibold">GTD</span>
                <span className="text-base font-bold text-white/90 font-mono">{gtdVal}</span>
            </div>
          )}
            <Icon
              name="chevron-up"
              className={`w-4 h-4 text-white/35 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            />
        </div>
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="p-4">
          {/* Actions */}
          <div className="flex items-center gap-2 mb-4">
              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="flex items-center gap-2 px-4 py-2 bg-white/[0.06] border border-white/[0.08] rounded-xl text-sm font-medium text-white hover:bg-white/[0.1] hover:border-white/[0.15] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGenerating ? (
                  <Loader size={16} className="text-white/40" />
                ) : (
                  <Icon name="sparkles" className="w-4 h-4" />
                )}
                {isGenerating ? 'Gerando...' : 'Gerar Flyer'}
              </button>
              <button
                onClick={() => onSetChatReference(null)}
                className="flex items-center gap-2 px-4 py-2 bg-white/[0.03] border border-white/[0.06] rounded-xl text-sm font-medium text-white/50 hover:text-white hover:bg-white/[0.06] hover:border-white/[0.12] transition-all"
              >
                <Icon name="eraser" className="w-4 h-4" />
                Limpar Referência
              </button>
          </div>

          {/* Flyers Strip */}
          <FlyerThumbStrip
            images={generatedFlyers}
            onEdit={setEditingFlyer}
            onQuickPost={handleQuickPost}
            onSchedule={handleSchedule}
            onPublish={(flyer) =>
              onPublishToCampaign(`Campanha para torneio ${event.name}`, flyer)
            }
            onDownload={(flyer, index) => {
              const link = document.createElement('a');
              link.href = flyer.src;
              link.download = `flyer-${event.name.replace(/\s+/g, '-').toLowerCase()}-${index + 1}.png`;
              link.click();
            }}
            emptyTitle="Nenhum flyer gerado"
            emptyDescription="Clique em 'Gerar Flyer' para criar um novo flyer"
          />
        </div>
      )}
      </Card>

      {/* Modals - Renderizados fora do Card para evitar problema de overflow */}
      {editingFlyer && (
        <ImagePreviewModal
          image={editingFlyer}
          onClose={() => setEditingFlyer(null)}
          onImageUpdate={(src) => {
            onUpdateGalleryImage(editingFlyer.id, src);
            setGeneratedFlyers((prev) =>
              prev.map((f) =>
                f !== 'loading' && f.id === editingFlyer.id ? { ...f, src } : f
              )
            );
          }}
          onSetChatReference={onSetChatReference}
          onQuickPost={setQuickPostFlyer}
          onPublish={(f) =>
            onPublishToCampaign(`Campanha para torneio ${event.name}`, f)
          }
          downloadFilename={`flyer-${event.name.replace(/\s+/g, '-').toLowerCase()}.png`}
        />
      )}

      {quickPostFlyer && (
        <QuickPostModal
          isOpen={!!quickPostFlyer}
          onClose={() => setQuickPostFlyer(null)}
          image={quickPostFlyer}
          brandProfile={brandProfile}
          context={`Torneio: ${event.name}\nGTD: ${gtdVal}\nBuy-in: ${biVal}\nHorário: ${event.times?.['-3']}`}
          instagramContext={instagramContext}
        />
      )}

      {scheduleFlyer && onSchedulePost && (
        <SchedulePostModal
          isOpen={!!scheduleFlyer}
          onClose={() => setScheduleFlyer(null)}
          galleryImages={galleryImages}
          onSchedule={(post) => {
            onSchedulePost(post);
            // Optionally track schedule status state here if needed
          }}
          initialImage={scheduleFlyer}
          initialCaption={`Torneio: ${event.name}\n🚀 GTD: ${gtdVal}\n💰 Buy-in: ${biVal}\n⏰ Início: ${event.times?.['-3']}`}
        />
      )}
    </>
  );
};
