/**
 * Campaign carousel generation helpers
 */

import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { BrandProfile, ImageFile, CarouselScript } from '../../../types';
import { generateImage } from '../../../services/geminiService';
import { uploadImageToBlob } from '../../../services/blobService';
import { urlToBase64 } from '../../../utils/imageHelpers';
import {
  updateCarouselCover,
  updateCarouselSlideImage,
  type DbCarouselScript,
} from '../../../services/api';
import { toCarouselScript } from '../utils';

interface GenerationContext {
  brandProfile: BrandProfile;
  setGeneratingCarousel: Dispatch<SetStateAction<Record<string, boolean>>>;
  setLocalCarousels: Dispatch<SetStateAction<CarouselScript[]>>;
  localCarouselsRef: MutableRefObject<CarouselScript[]>;
  onCarouselUpdate?: (carousel: CarouselScript) => void;
}

export const generateCampaignCover = async (
  carousel: CarouselScript,
  context: GenerationContext,
) => {
  if (!carousel.cover_prompt) return;

  const key = `${carousel.id}-cover`;
  context.setGeneratingCarousel((prev) => ({ ...prev, [key]: true }));

  try {
    const prompt = `CAPA DE CARROSSEL INSTAGRAM - SLIDE PRINCIPAL

${carousel.cover_prompt}

Esta imagem define o estilo visual (tipografia, cores, composição) para todos os slides do carrossel.`;

    const productImages: ImageFile[] = [];
    if (context.brandProfile.logo) {
      if (context.brandProfile.logo.startsWith('data:')) {
        productImages.push({
          base64: context.brandProfile.logo.split(',')[1],
          mimeType: context.brandProfile.logo.match(/:(.*?);/)?.[1] || 'image/png',
        });
      }
    }

    const imageDataUrl = await generateImage(prompt, context.brandProfile, {
      aspectRatio: '4:5',
      model: 'gemini-3-pro-image-preview',
      productImages: productImages.length > 0 ? productImages : undefined,
    });

    const base64Data = imageDataUrl.split(',')[1];
    const mimeType = imageDataUrl.match(/data:(.*?);/)?.[1] || 'image/png';
    const httpUrl = await uploadImageToBlob(base64Data, mimeType);

    if (httpUrl && carousel.id) {
      const updated: DbCarouselScript = await updateCarouselCover(
        carousel.id,
        httpUrl,
      );
      const converted = toCarouselScript(updated);
      context.setLocalCarousels((prev) => {
        const newState = prev.map((c) =>
          c.id === carousel.id ? converted : c,
        );
        context.localCarouselsRef.current = newState;
        return newState;
      });
      context.onCarouselUpdate?.(converted);
    }
  } catch (err) {
    console.error('[CarrosselTab] Failed to generate carousel cover:', err);
  } finally {
    context.setGeneratingCarousel((prev) => ({ ...prev, [key]: false }));
  }
};

export const generateCampaignSlide = async (
  carousel: CarouselScript,
  slideNumber: number,
  slide: { visual: string; text: string },
  context: GenerationContext,
) => {
  if (!carousel.cover_url) {
    console.error('[CarrosselTab] Cannot generate slide without cover image');
    return;
  }

  const key = `${carousel.id}-slide-${slideNumber}`;
  context.setGeneratingCarousel((prev) => ({ ...prev, [key]: true }));

  try {
    const coverData = await urlToBase64(carousel.cover_url);
    if (!coverData) {
      console.error('[CarrosselTab] Failed to convert cover to base64');
      return;
    }

    const styleRef: ImageFile = {
      base64: coverData.base64,
      mimeType: coverData.mimeType,
    };

    const prompt = `SLIDE ${slideNumber} DE UM CARROSSEL - DEVE USAR A MESMA TIPOGRAFIA DA IMAGEM DE REFERÊNCIA

Descrição visual: ${slide.visual}
Texto para incluir: ${slide.text}

IMPORTANTE: Este slide faz parte de uma sequência. A tipografia (fonte, peso, cor, efeitos) DEVE ser IDÊNTICA à imagem de referência anexada. NÃO use fontes diferentes.`;

    const productImages: ImageFile[] = [];
    if (context.brandProfile.logo) {
      if (context.brandProfile.logo.startsWith('data:')) {
        productImages.push({
          base64: context.brandProfile.logo.split(',')[1],
          mimeType: context.brandProfile.logo.match(/:(.*?);/)?.[1] || 'image/png',
        });
      }
    }

    const imageDataUrl = await generateImage(prompt, context.brandProfile, {
      aspectRatio: '4:5',
      model: 'gemini-3-pro-image-preview',
      styleReferenceImage: styleRef,
      productImages: productImages.length > 0 ? productImages : undefined,
    });

    const base64Data = imageDataUrl.split(',')[1];
    const mimeType = imageDataUrl.match(/data:(.*?);/)?.[1] || 'image/png';
    const httpUrl = await uploadImageToBlob(base64Data, mimeType);

    if (httpUrl && carousel.id) {
      const updated: DbCarouselScript = await updateCarouselSlideImage(
        carousel.id,
        slideNumber,
        httpUrl,
      );
      const converted = toCarouselScript(updated);
      context.setLocalCarousels((prev) => {
        const newState = prev.map((c) =>
          c.id === carousel.id ? converted : c,
        );
        context.localCarouselsRef.current = newState;
        return newState;
      });
      context.onCarouselUpdate?.(converted);
    }
  } catch (err) {
    console.error(
      `[CarrosselTab] Failed to generate slide ${slideNumber}:`,
      err,
    );
  } finally {
    context.setGeneratingCarousel((prev) => ({ ...prev, [key]: false }));
  }
};

export const generateAllCampaignCarouselImages = async (
  carousel: CarouselScript,
  context: GenerationContext,
) => {
  const carouselId = carousel.id;

  try {
    let currentCarousel =
      context.localCarouselsRef.current.find((c) => c.id === carouselId) ||
      carousel;

    if (!currentCarousel.cover_url) {
      console.debug('[CarrosselTab] Generating cover...');
      await generateCampaignCover(currentCarousel, context);

      await new Promise((resolve) => setTimeout(resolve, 800));

      currentCarousel =
        context.localCarouselsRef.current.find((c) => c.id === carouselId) ||
        currentCarousel;
      if (!currentCarousel?.cover_url) {
        console.error('[CarrosselTab] Cover generation failed, stopping');
        return;
      }
    }

    console.debug('[CarrosselTab] Generating slides...');
    for (let i = 0; i < currentCarousel.slides.length; i++) {
      currentCarousel =
        context.localCarouselsRef.current.find((c) => c.id === carouselId) ||
        currentCarousel;
      const slide = currentCarousel.slides[i];

      if (!slide.image_url) {
        await generateCampaignSlide(
          currentCarousel,
          slide.slide,
          slide,
          context,
        );
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    console.debug('[CarrosselTab] All carousel images generated!');
  } catch (err) {
    console.error('[CarrosselTab] Failed to generate all carousel images:', err);
  }
};
