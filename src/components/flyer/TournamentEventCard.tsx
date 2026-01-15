/**
 * TournamentEventCard Component
 *
 * Displays a tournament event with its details and generated flyers.
 * Handles flyer generation for individual tournaments.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
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
import type { GenerationJobConfig } from '@/services/apiClient';
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
  collabLogo: string | null;
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

// Check if we're in development mode (QStash won't work locally)
const isDevMode = typeof window !== 'undefined' && window.location.hostname === 'localhost';

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
  collabLogo,
  styleReference,
  generatedFlyers,
  setGeneratedFlyers,
  onAddImageToGallery,
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

  const { queueJob, onJobComplete, onJobFailed, getJobByContext } = useBackgroundJobs();
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

    // Use background job if userId is available AND we're not in dev mode
    if (userId && !isDevMode) {
      setIsGenerating(true);
      setGeneratedFlyers((prev) => ['loading', ...prev]);

      try {
        const config: GenerationJobConfig = {
          brandName: brandProfile.name,
          brandDescription: brandProfile.description,
          brandToneOfVoice: brandProfile.toneOfVoice,
          brandPrimaryColor: brandProfile.primaryColor,
          brandSecondaryColor: brandProfile.secondaryColor,
          aspectRatio,
          model,
          imageSize,
          logo: brandProfile.logo || undefined,
          collabLogo: collabLogo || undefined,
          styleReference: styleReference?.src || undefined,
          compositionAssets: compositionAssets.map(
            (a) => `data:${a.mimeType};base64,${a.base64}`
          ),
          source: 'Flyer',
        };

        await queueJob(userId, 'flyer', prompt, config, jobContext);
      } catch (err) {
        console.error('[TournamentEventCard] Failed to queue job:', err);
        setGeneratedFlyers((prev) => prev.filter((f) => f !== 'loading'));
        setIsGenerating(false);
      }
      return;
    }

    // Local generation (dev mode or no userId)
    setIsGenerating(true);
    setGeneratedFlyers((prev) => ['loading', ...prev]);

    try {
      const [logoToUse, collabLogoToUse, refData] = await Promise.all([
        brandProfile.logo ? urlToBase64(brandProfile.logo) : null,
        collabLogo ? urlToBase64(collabLogo) : null,
        styleReference?.src ? urlToBase64(styleReference.src) : null,
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
        collabLogoToUse,
        imageSize,
        assetsToUse,
      );
      const newImage = onAddImageToGallery({
        src: imageUrl,
        prompt: '',
        source: 'Flyer',
        model,
        aspectRatio,
        imageSize,
      });
      setGeneratedFlyers((prev) =>
        prev.map((f) => (f === 'loading' ? newImage : f))
      );
    } catch (err) {
      console.error('[TournamentEventCard] Generation failed:', err);
      setGeneratedFlyers((prev) => prev.filter((f) => f !== 'loading'));
    } finally {
      setIsGenerating(false);
    }
  }, [event, brandProfile, currency, model, aspectRatio, imageSize, collabLogo, styleReference, compositionAssets, userId, jobContext, onAddImageToGallery, setGeneratedFlyers, queueJob]);

  const handleQuickPost = (flyer: GalleryImage) => {
    setQuickPostFlyer(flyer);
  };

  const handleSchedule = (flyer: GalleryImage) => {
    setScheduleFlyer(flyer);
  };

  const biVal = formatCurrencyValue(event.buyIn, currency);
  const gtdVal = formatCurrencyValue(event.gtd, currency);

  return (
    <Card className="overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between p-3 bg-white/5 border-b border-white/5 cursor-pointer hover:bg-white/10 transition-all"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <div className="flex flex-col">
            <span className="text-xs text-white/40 font-mono uppercase">{event.day}</span>
            <span className="text-sm font-bold text-white">{event.times?.['-3']}</span>
          </div>
          <div className="w-px h-10 bg-white/10" />
          <div className="flex flex-col">
            <span className="text-sm font-bold text-white line-clamp-1">{event.name}</span>
            <div className="flex items-center gap-2 text-xs text-white/60">
              <span className="text-primary font-mono">{biVal}</span>
              <span>|</span>
              <span className="font-mono">{event.structure}</span>
              <span>|</span>
              <span className="font-mono">{event.stack}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {gtdVal !== '---' && (
            <div className="flex flex-col items-end">
              <span className="text-[10px] text-white/40 uppercase tracking-wider">GTD</span>
              <span className="text-base font-black text-primary font-mono">{gtdVal}</span>
            </div>
          )}
          <Icon
            name="chevron-up"
            className={`w-4 h-4 text-white/40 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          />
        </div>
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="p-4">
          {/* Actions */}
          <div className="flex items-center gap-2 mb-4">
            <Button
              variant="primary"
              size="small"
              onClick={handleGenerate}
              disabled={isGenerating}
              className="flex items-center gap-2"
            >
              {isGenerating ? (
                <Loader className="w-4 h-4" />
              ) : (
                <Icon name="sparkles" className="w-4 h-4" />
              )}
              {isGenerating ? 'Gerando...' : 'Gerar Flyer'}
            </Button>
            <Button
              variant="ghost"
              size="small"
              onClick={() => onSetChatReference(null)}
              className="flex items-center gap-2"
            >
              <Icon name="eraser" className="w-4 h-4" />
              Limpar Referência
            </Button>
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

      {/* Modals */}
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
    </Card>
  );
};
