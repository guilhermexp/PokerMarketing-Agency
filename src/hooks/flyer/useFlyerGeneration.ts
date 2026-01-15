/**
 * useFlyerGeneration Hook
 *
 * Handles flyer generation logic including batch generation.
 */

import { useCallback, useState } from 'react';
import { useFlyerStore } from '@/stores/flyerStore';
import { generateFlyer } from '@/services/geminiService';
import { urlToBase64 } from '@/utils/imageHelpers';
import {
  buildBackgroundFlyerPrompt,
  buildSingleEventFlyerPrompt,
} from '@/ai-prompts';
import type { BrandProfile, GalleryImage, ImageSize, TournamentEvent } from '@/types';
import type { GenerationJobConfig } from '@/services/apiClient';

interface UseFlyerGenerationProps {
  brandProfile: BrandProfile;
  userId?: string | null;
  isDevMode?: boolean;
}

export const useFlyerGeneration = ({
  brandProfile,
  userId,
  isDevMode = false,
}: UseFlyerGenerationProps) => {
  const {
    selectedAspectRatio,
    selectedImageSize,
    selectedCurrency,
    selectedLanguage,
    selectedImageModel,
    globalStyleReference,
    collabLogo,
    compositionAssets,
    setBatchGenerating,
    triggerBatchGeneration: _triggerBatchGeneration,
  } = useFlyerStore();

  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  const generateSingleFlyer = useCallback(
    async (
      event: TournamentEvent,
      onAddImageToGallery: (image: Omit<GalleryImage, 'id'>) => GalleryImage,
    ): Promise<GalleryImage | null> => {
      setIsGenerating(true);
      setGenerationError(null);

      try {
        // Build prompt
        const biVal = event.buyIn || '0';
        const gtdVal = event.gtd || '0';

        const prompt = buildSingleEventFlyerPrompt({
          eventName: event.name,
          gtdValue: gtdVal,
          buyInValue: biVal,
          eventTime: event.times?.['-3'],
          brandPrimaryColor: brandProfile.primaryColor,
          brandSecondaryColor: brandProfile.secondaryColor,
        });

        // Convert assets to base64
        const [logoToUse, refData] = await Promise.all([
          brandProfile.logo ? urlToBase64(brandProfile.logo) : null,
          globalStyleReference?.src ? urlToBase64(globalStyleReference.src) : null,
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
          selectedAspectRatio as never,
          selectedImageModel,
          collabLogo,
          selectedImageSize as ImageSize,
          assetsToUse,
        );

        const newImage = onAddImageToGallery({
          src: imageUrl,
          prompt: '',
          source: 'Flyer',
          model: selectedImageModel,
          aspectRatio: selectedAspectRatio,
          imageSize: selectedImageSize,
        });

        return newImage;
      } catch (error) {
        console.error('Generation failed:', error);
        setGenerationError(error instanceof Error ? error.message : 'Generation failed');
        return null;
      } finally {
        setIsGenerating(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      brandProfile,
      selectedAspectRatio,
      selectedImageSize,
      selectedCurrency,
      selectedLanguage,
      selectedImageModel,
      globalStyleReference,
      collabLogo,
      compositionAssets,
    ],
  );

  const generateBatchFlyers = useCallback(
    async (
      events: TournamentEvent[],
      onAddImageToGallery: (image: Omit<GalleryImage, 'id'>) => GalleryImage,
      onProgress?: (current: number, total: number) => void,
    ): Promise<GalleryImage[]> => {
      setIsGenerating(true);
      setBatchGenerating(true);
      setGenerationError(null);

      const results: GalleryImage[] = [];
      const total = events.length;

      for (let i = 0; i < events.length; i++) {
        const event = events[i];
        onProgress?.(i + 1, total);

        const result = await generateSingleFlyer(event, onAddImageToGallery);
        if (result) {
          results.push(result);
        }
      }

      setIsGenerating(false);
      setBatchGenerating(false);
      return results;
    },
    [generateSingleFlyer, setBatchGenerating],
  );

  const queueBackgroundGeneration = useCallback(
    async (
      event: TournamentEvent,
      jobContext: string,
      onQueued?: () => void,
    ): Promise<boolean> => {
      if (!userId || isDevMode) {
        return false;
      }

      try {
        const _config: GenerationJobConfig = {
          brandName: brandProfile.name,
          brandDescription: brandProfile.description,
          brandToneOfVoice: brandProfile.toneOfVoice || 'Profissional',
          brandPrimaryColor: brandProfile.primaryColor,
          brandSecondaryColor: brandProfile.secondaryColor,
          aspectRatio: selectedAspectRatio as never,
          model: selectedImageModel,
          imageSize: selectedImageSize as ImageSize,
          logo: brandProfile.logo || undefined,
          collabLogo: collabLogo ? `data:${collabLogo.mimeType};base64,${collabLogo.base64}` : undefined,
          styleReference: globalStyleReference?.src || undefined,
          compositionAssets: compositionAssets.map(
            (a) => `data:${a.mimeType};base64,${a.base64}`
          ),
          source: 'Flyer',
        };

        const _prompt = buildBackgroundFlyerPrompt(event.name, event.gtd);

        // This would call the queueJob function from useBackgroundJobs
        // For now, we'll just trigger the callback
        onQueued?.();
        return true;
      } catch (error) {
        console.error('Failed to queue job:', error);
        return false;
      }
    },
    [
      userId,
      isDevMode,
      brandProfile,
      selectedAspectRatio,
      selectedImageModel,
      selectedImageSize,
      collabLogo,
      globalStyleReference,
      compositionAssets,
    ],
  );

  return {
    isGenerating,
    generationError,
    generateSingleFlyer,
    generateBatchFlyers,
    queueBackgroundGeneration,
  };
};
