/**
 * Clip carousel generation helpers (4:5)
 */

import type { Dispatch, SetStateAction } from 'react';
import type { BrandProfile, GalleryImage, ImageFile, VideoClipScript } from '../../../types';
import { generateImage } from '../../../services/geminiService';
import { uploadImageToBlob } from '../../../services/blobService';
import { urlToBase64 } from '../../../utils/imageHelpers';
import {
  getCarrosselSource,
  getCarrosselImage,
  getOriginalImageForScene,
} from '../utils';

interface Generate4x5Params {
  clip: VideoClipScript;
  sceneNumber: number;
  scene: { visual: string; narration: string };
  originalImage: GalleryImage;
  brandProfile: BrandProfile;
  onAddImageToGallery: (image: Omit<GalleryImage, 'id'>) => GalleryImage;
  setGenerating: Dispatch<SetStateAction<Record<string, boolean>>>;
}

export const generateCarouselSlide4x5 = async ({
  clip,
  sceneNumber,
  scene,
  originalImage,
  brandProfile,
  onAddImageToGallery,
  setGenerating,
}: Generate4x5Params) => {
  if (!clip.id) return;

  const key = `${clip.id}-${sceneNumber}`;
  setGenerating((prev) => ({ ...prev, [key]: true }));

  try {
    const imageData = await urlToBase64(originalImage.src);
    if (!imageData) {
      console.error('[CarrosselTab] Failed to convert image to base64');
      return;
    }

    const styleRef: ImageFile = {
      base64: imageData.base64,
      mimeType: imageData.mimeType,
    };

    const prompt = `RECRIE ESTA IMAGEM NO FORMATO 4:5 PARA FEED DO INSTAGRAM

Descrição visual: ${scene.visual}
Texto/Narração para incluir: ${scene.narration}

IMPORTANTE:
- Use a imagem anexada como referência EXATA de estilo, cores, tipografia e composição
- Adapte o layout para o formato 4:5 (vertical para feed)
- Mantenha TODOS os elementos visuais e textos visíveis dentro do enquadramento
- A tipografia (fonte, peso, cor, efeitos) DEVE ser IDÊNTICA à imagem de referência`;

    // Build product images array with brand logo
    const productImages: { base64: string; mimeType: string }[] = [];
    if (brandProfile.logo) {
      const logoData = await urlToBase64(brandProfile.logo);
      if (logoData?.base64) {
        productImages.push({ base64: logoData.base64, mimeType: logoData.mimeType });
      }
    }

    const imageDataUrl = await generateImage(prompt, brandProfile, {
      aspectRatio: '4:5',
      model: 'gemini-3-pro-image-preview',
      styleReferenceImage: styleRef,
      productImages: productImages.length > 0 ? productImages : undefined,
    });

    const base64Data = imageDataUrl.split(',')[1];
    const mimeType = imageDataUrl.match(/data:(.*?);/)?.[1] || 'image/png';
    const httpUrl = await uploadImageToBlob(base64Data, mimeType);

    if (httpUrl) {
      onAddImageToGallery({
        src: httpUrl,
        prompt: scene.visual,
        source: getCarrosselSource(clip.title, sceneNumber),
        model: 'gemini-3-pro-image-preview',
        video_script_id: clip.id,
      });
    }
  } catch (err) {
    console.error(`Error generating 4:5 image for scene ${sceneNumber}:`, err);
  } finally {
    setGenerating((prev) => ({ ...prev, [key]: false }));
  }
};

interface GenerateAllParams {
  clip: VideoClipScript;
  galleryImages: GalleryImage[] | undefined;
  brandProfile: BrandProfile;
  onAddImageToGallery: (image: Omit<GalleryImage, 'id'>) => GalleryImage;
  setGenerating: Dispatch<SetStateAction<Record<string, boolean>>>;
}

export const generateAllCarouselSlides4x5 = async ({
  clip,
  galleryImages,
  brandProfile,
  onAddImageToGallery,
  setGenerating,
}: GenerateAllParams) => {
  if (!clip.scenes) return;

  for (const scene of clip.scenes) {
    const sceneNumber = scene.scene;
    const existing = getCarrosselImage(clip, sceneNumber, galleryImages);
    if (existing) continue;

    const originalImage = getOriginalImageForScene(
      clip,
      sceneNumber,
      galleryImages,
    );
    if (originalImage) {
      await generateCarouselSlide4x5({
        clip,
        sceneNumber,
        scene,
        originalImage,
        brandProfile,
        onAddImageToGallery,
        setGenerating,
      });
    }
  }
};
