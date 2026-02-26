/**
 * Campaign carousel generation helpers
 */

import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { BrandProfile, ImageFile, CarouselScript, ChatReferenceImage, StyleReference, ImageModel } from '../../../types';
import { generateImage } from '../../../services/geminiService';
import { uploadImageToBlob } from '../../../services/blobService';
import {
  buildCarouselCampaignSlidePrompt,
  buildCarouselCoverPrompt,
} from '@/ai-prompts';
import { urlToBase64 } from '../../../utils/imageHelpers';
import {
  updateCarouselCover,
  updateCarouselSlideImage,
  type DbCarouselScript,
} from '../../../services/api';
import { toCarouselScript } from '../utils';

interface GenerationContext {
  brandProfile: BrandProfile;
  imageModel?: ImageModel;
  chatReferenceImage?: ChatReferenceImage | null;
  selectedStyleReference?: StyleReference | null;
  compositionAssets?: { base64: string; mimeType: string }[]; // Assets (ativos) for composition
  productImages?: ImageFile[];
  shouldPause?: () => boolean;
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
    const prompt = buildCarouselCoverPrompt(carousel.cover_prompt);

    const productImages: ImageFile[] = [];

    if (context.productImages && context.productImages.length > 0) {
      productImages.push(...context.productImages);
    }

    // Use chat reference image if available
    if (context.chatReferenceImage) {
      const src = context.chatReferenceImage.src;
      if (src.startsWith('data:')) {
        const matches = src.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
          productImages.push({ base64: matches[2], mimeType: matches[1] });
        }
      } else {
        try {
          const response = await fetch(src);
          const blob = await response.blob();
          const base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
          const base64Data = base64.split(',')[1];
          productImages.push({ base64: base64Data, mimeType: blob.type || 'image/jpeg' });
        } catch (err) {
          console.error('[CarrosselTab] Failed to fetch chat reference image:', err);
        }
      }
    }

    if (context.brandProfile.logo) {
      if (context.brandProfile.logo.startsWith('data:')) {
        const base64Data = context.brandProfile.logo.split(',')[1];
        if (base64Data) {
          productImages.push({
            base64: base64Data,
            mimeType: context.brandProfile.logo.match(/:(.*?);/)?.[1] || 'image/png',
          });
        }
      } else {
        try {
          const response = await fetch(context.brandProfile.logo);
          const blob = await response.blob();
          const base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
          const base64Data = base64.split(',')[1];
          productImages.push({ base64: base64Data, mimeType: blob.type || 'image/png' });
        } catch (err) {
          console.error('[CarrosselTab] Failed to fetch brand logo:', err);
        }
      }
    }

    // Use selected style reference (favoritos) if available
    if (context.selectedStyleReference?.src) {
      const src = context.selectedStyleReference.src;
      if (src.startsWith('data:')) {
        const matches = src.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
          productImages.push({ base64: matches[2], mimeType: matches[1] });
        }
      } else {
        try {
          const response = await fetch(src);
          const blob = await response.blob();
          const base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
          const base64Data = base64.split(',')[1];
          productImages.push({ base64: base64Data, mimeType: blob.type || 'image/jpeg' });
        } catch (err) {
          console.error('[CarrosselTab] Failed to fetch style reference image:', err);
        }
      }
    }

    const imageUrl = await generateImage(prompt, context.brandProfile, {
      aspectRatio: '4:5',
      model: context.imageModel || 'gemini-3-pro-image-preview',
      productImages: productImages.length > 0 ? productImages : undefined,
      compositionAssets: context.compositionAssets?.length > 0 ? context.compositionAssets : undefined,
    });

    // API now returns HTTP URL directly (Vercel Blob), no need to re-upload
    let httpUrl = imageUrl;
    if (imageUrl.startsWith('data:')) {
      // Fallback: if still receiving data URL, upload to blob
      const base64Data = imageUrl.split(',')[1];
      const mimeType = imageUrl.match(/data:(.*?);/)?.[1] || 'image/png';
      httpUrl = await uploadImageToBlob(base64Data, mimeType);
    }

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

    const prompt = buildCarouselCampaignSlidePrompt({
      slideNumber,
      visual: slide.visual,
      text: slide.text,
    });

    const productImages: ImageFile[] = [];

    if (context.productImages && context.productImages.length > 0) {
      productImages.push(...context.productImages);
    }

    // Use chat reference image if available
    if (context.chatReferenceImage) {
      const src = context.chatReferenceImage.src;
      if (src.startsWith('data:')) {
        const matches = src.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
          productImages.push({ base64: matches[2], mimeType: matches[1] });
        }
      } else {
        try {
          const response = await fetch(src);
          const blob = await response.blob();
          const base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
          const base64Data = base64.split(',')[1];
          productImages.push({ base64: base64Data, mimeType: blob.type || 'image/jpeg' });
        } catch (err) {
          console.error('[CarrosselTab] Failed to fetch chat reference image:', err);
        }
      }
    }

    if (context.brandProfile.logo) {
      if (context.brandProfile.logo.startsWith('data:')) {
        const base64Data = context.brandProfile.logo.split(',')[1];
        if (base64Data) {
          productImages.push({
            base64: base64Data,
            mimeType: context.brandProfile.logo.match(/:(.*?);/)?.[1] || 'image/png',
          });
        }
      } else {
        try {
          const response = await fetch(context.brandProfile.logo);
          const blob = await response.blob();
          const base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
          const base64Data = base64.split(',')[1];
          productImages.push({ base64: base64Data, mimeType: blob.type || 'image/png' });
        } catch (err) {
          console.error('[CarrosselTab] Failed to fetch brand logo:', err);
        }
      }
    }

    // Use selected style reference (favoritos) if available
    if (context.selectedStyleReference?.src) {
      const src = context.selectedStyleReference.src;
      if (src.startsWith('data:')) {
        const matches = src.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
          productImages.push({ base64: matches[2], mimeType: matches[1] });
        }
      } else {
        try {
          const response = await fetch(src);
          const blob = await response.blob();
          const base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
          const base64Data = base64.split(',')[1];
          productImages.push({ base64: base64Data, mimeType: blob.type || 'image/jpeg' });
        } catch (err) {
          console.error('[CarrosselTab] Failed to fetch style reference image:', err);
        }
      }
    }

    const imageUrl = await generateImage(prompt, context.brandProfile, {
      aspectRatio: '4:5',
      model: context.imageModel || 'gemini-3-pro-image-preview',
      styleReferenceImage: styleRef,
      productImages: productImages.length > 0 ? productImages : undefined,
      compositionAssets: context.compositionAssets?.length > 0 ? context.compositionAssets : undefined,
    });

    // API now returns HTTP URL directly (Vercel Blob), no need to re-upload
    let httpUrl = imageUrl;
    if (imageUrl.startsWith('data:')) {
      // Fallback: if still receiving data URL, upload to blob
      const base64Data = imageUrl.split(',')[1];
      const mimeType = imageUrl.match(/data:(.*?);/)?.[1] || 'image/png';
      httpUrl = await uploadImageToBlob(base64Data, mimeType);
    }

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
      if (context.shouldPause?.()) {
        console.debug('[CarrosselTab] Generation paused before cover');
        return;
      }
      console.debug('[CarrosselTab] Generating cover...');
      await generateCampaignCover(currentCarousel, context);

      await new Promise((resolve) => setTimeout(resolve, 800));

      if (context.shouldPause?.()) {
        console.debug('[CarrosselTab] Generation paused after cover');
        return;
      }

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
      if (context.shouldPause?.()) {
        console.debug('[CarrosselTab] Generation paused during slides');
        break;
      }
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
