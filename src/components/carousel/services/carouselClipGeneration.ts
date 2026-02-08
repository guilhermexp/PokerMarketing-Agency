/**
 * Clip carousel generation helpers (4:5)
 */

import type { Dispatch, SetStateAction } from 'react';
import type { BrandProfile, GalleryImage, ImageFile, VideoClipScript, ChatReferenceImage, StyleReference } from '../../../types';
import { generateImage } from '../../../services/geminiService';
import { uploadImageToBlob } from '../../../services/blobService';
import { buildCarouselSlide4x5Prompt } from '@/ai-prompts';
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
  chatReferenceImage?: ChatReferenceImage | null;
  selectedStyleReference?: StyleReference | null;
  compositionAssets?: { base64: string; mimeType: string }[]; // Assets (ativos) for composition
  productImages?: ImageFile[] | null;
  onAddImageToGallery: (image: Omit<GalleryImage, 'id'>) => GalleryImage;
  setGenerating: Dispatch<SetStateAction<Record<string, boolean>>>;
}

export const generateCarouselSlide4x5 = async ({
  clip,
  sceneNumber,
  scene,
  originalImage,
  brandProfile,
  chatReferenceImage,
  selectedStyleReference,
  compositionAssets,
  productImages,
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

    const prompt = buildCarouselSlide4x5Prompt({
      sceneVisual: scene.visual,
      narration: scene.narration,
    });

    // Build product images array with chat reference image (priority) and brand logo
    const productImageRefs: { base64: string; mimeType: string }[] = [];

    if (productImages && productImages.length > 0) {
      productImageRefs.push(...productImages);
    }

    // Use chat reference image if available
    if (chatReferenceImage) {
      const src = chatReferenceImage.src;
      if (src.startsWith('data:')) {
        const matches = src.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
          productImageRefs.push({ base64: matches[2], mimeType: matches[1] });
        }
      } else {
        // Fetch and convert HTTP URL
        try {
          const response = await fetch(src);
          const blob = await response.blob();
          const base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
          const base64Data = base64.split(',')[1];
          productImageRefs.push({ base64: base64Data, mimeType: blob.type || 'image/jpeg' });
        } catch (err) {
          console.error('[CarrosselTab] Failed to fetch chat reference image:', err);
        }
      }
    }

    if (brandProfile.logo) {
      const logoData = await urlToBase64(brandProfile.logo);
      if (logoData?.base64) {
        productImageRefs.push({ base64: logoData.base64, mimeType: logoData.mimeType });
      }
    }

    // Use selected style reference (favoritos) if available
    if (selectedStyleReference?.src) {
      const src = selectedStyleReference.src;
      if (src.startsWith('data:')) {
        const matches = src.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
          productImageRefs.push({ base64: matches[2], mimeType: matches[1] });
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
          productImageRefs.push({ base64: base64Data, mimeType: blob.type || 'image/jpeg' });
        } catch (err) {
          console.error('[CarrosselTab] Failed to fetch style reference image:', err);
        }
      }
    }

    const imageUrl = await generateImage(prompt, brandProfile, {
      aspectRatio: '4:5',
      model: 'gemini-3-pro-image-preview',
      styleReferenceImage: styleRef,
      productImages: productImageRefs.length > 0 ? productImageRefs : undefined,
      compositionAssets: compositionAssets?.length > 0 ? compositionAssets : undefined,
    });

    // API now returns HTTP URL directly (Vercel Blob), no need to re-upload
    let httpUrl = imageUrl;
    if (imageUrl.startsWith('data:')) {
      // Fallback: if still receiving data URL, upload to blob
      const base64Data = imageUrl.split(',')[1];
      const mimeType = imageUrl.match(/data:(.*?);/)?.[1] || 'image/png';
      httpUrl = await uploadImageToBlob(base64Data, mimeType);
    }

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
  chatReferenceImage?: ChatReferenceImage | null;
  selectedStyleReference?: StyleReference | null;
  compositionAssets?: { base64: string; mimeType: string }[]; // Assets (ativos) for composition
  productImages?: ImageFile[] | null;
  shouldPause?: () => boolean;
  onAddImageToGallery: (image: Omit<GalleryImage, 'id'>) => GalleryImage;
  setGenerating: Dispatch<SetStateAction<Record<string, boolean>>>;
}

export const generateAllCarouselSlides4x5 = async ({
  clip,
  galleryImages,
  brandProfile,
  chatReferenceImage,
  selectedStyleReference,
  compositionAssets,
  productImages,
  shouldPause,
  onAddImageToGallery,
  setGenerating,
}: GenerateAllParams) => {
  if (!clip.scenes) return;

  for (const scene of clip.scenes) {
    if (shouldPause?.()) {
      console.debug('[CarrosselTab] Generation paused for clip carousel');
      break;
    }
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
        chatReferenceImage,
        selectedStyleReference,
        compositionAssets,
        productImages,
        onAddImageToGallery,
        setGenerating,
      });
    }
  }
};
