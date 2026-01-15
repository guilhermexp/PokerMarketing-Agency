/**
 * Carousel caption generation
 */

import type { Dispatch, SetStateAction } from 'react';
import type { BrandProfile, GalleryImage, VideoClipScript } from '../../../types';
import { generateQuickPostText } from '../../../services/geminiService';
import { urlToDataUrl } from '../../../utils/imageHelpers';

interface CaptionParams {
  clipKey: string;
  images: GalleryImage[];
  clip: VideoClipScript;
  brandProfile: BrandProfile;
  setCaptions: Dispatch<SetStateAction<Record<string, string>>>;
  setGeneratingCaption: Dispatch<SetStateAction<Record<string, boolean>>>;
}

export const generateCarouselCaption = async ({
  clipKey,
  images,
  clip,
  brandProfile,
  setCaptions,
  setGeneratingCaption,
}: CaptionParams) => {
  if (images.length === 0) return;

  setGeneratingCaption((prev) => ({ ...prev, [clipKey]: true }));
  try {
    const firstImage = images[0];
    const imageDataUrl = await urlToDataUrl(firstImage.src);

    const scenesContext =
      clip.scenes?.map((scene) => scene.narration).join('\n') || clip.title;
    const context = `Carrossel de ${images.length} imagens sobre: ${scenesContext}`;

    const result = await generateQuickPostText(
      brandProfile,
      context,
      imageDataUrl || undefined,
    );

    const fullCaption = `${result.content}\n\n${result.hashtags
      .map((hashtag) => `#${hashtag}`)
      .join(' ')}`;
    setCaptions((prev) => ({ ...prev, [clipKey]: fullCaption }));
  } catch (err) {
    console.error('[CarrosselTab] Failed to generate caption:', err);
  } finally {
    setGeneratingCaption((prev) => ({ ...prev, [clipKey]: false }));
  }
};
