/**
 * Carousel utils
 */

import type { CarouselScript, GalleryImage } from '../../types';
import type { DbCarouselScript } from '../../services/api';
import type { VideoClipScript } from '../../types';

export const toCarouselScript = (db: DbCarouselScript): CarouselScript => ({
  id: db.id,
  title: db.title,
  hook: db.hook,
  cover_prompt: db.cover_prompt || '',
  cover_url: db.cover_url,
  caption: db.caption || undefined,
  slides: db.slides,
});

export const getCarouselPreviewImages = (
  carousel: CarouselScript,
): GalleryImage[] => {
  const images: GalleryImage[] = [];

  if (carousel.cover_url) {
    images.push({
      id: `${carousel.id}-cover`,
      src: carousel.cover_url,
      prompt: carousel.cover_prompt || '',
      source: `Carrossel-${carousel.title}-cover`,
      model: 'gemini-3-pro-image-preview',
    });
  }

  for (const slide of carousel.slides) {
    if (slide.image_url) {
      images.push({
        id: `${carousel.id}-slide-${slide.slide}`,
        src: slide.image_url,
        prompt: slide.visual,
        source: `Carrossel-${carousel.title}-${slide.slide}`,
        model: 'gemini-3-pro-image-preview',
      });
    }
  }

  return images;
};

export const getTruncatedTitle = (title: string): string => {
  const maxLen = 50 - 'Carrossel--99'.length;
  return title.length > maxLen ? title.slice(0, maxLen) : title;
};

export const getCarrosselSource = (
  clipTitle: string,
  sceneNumber: number,
): string => `Carrossel-${getTruncatedTitle(clipTitle)}-${sceneNumber}`;

export const getSceneSource = (clipTitle: string, sceneNumber: number): string =>
  `Cena-${clipTitle.substring(0, 35)}-${sceneNumber}`;

export const findGalleryImage = (
  galleryImages: GalleryImage[] | undefined,
  clipId: string | undefined,
  source: string,
): GalleryImage | undefined => {
  if (!galleryImages || galleryImages.length === 0) return undefined;

  if (clipId) {
    const exactMatch = galleryImages.find(
      (img) =>
        img.source === source &&
        img.video_script_id === clipId &&
        img.mediaType !== 'audio',
    );
    if (exactMatch) return exactMatch;
  }

  return galleryImages.find(
    (img) =>
      img.source === source &&
      !img.video_script_id &&
      img.mediaType !== 'audio',
  );
};

export const getCarouselImagesForClip = (
  clip: VideoClipScript,
  galleryImages: GalleryImage[] | undefined,
): GalleryImage[] => {
  if (!clip.scenes || clip.scenes.length === 0) return [];

  const images: GalleryImage[] = [];
  for (const scene of clip.scenes) {
    const carrosselSource = getCarrosselSource(clip.title, scene.scene);
    const carrosselImage = findGalleryImage(
      galleryImages,
      clip.id,
      carrosselSource,
    );

    if (carrosselImage) {
      images.push(carrosselImage);
    } else {
      const newSource = getSceneSource(clip.title, scene.scene);
      const oldSource = `Cena-${clip.title}-${scene.scene}`;
      const originalImage =
        findGalleryImage(galleryImages, clip.id, newSource) ||
        findGalleryImage(galleryImages, clip.id, oldSource);
      if (originalImage) {
        images.push(originalImage);
      }
    }
  }
  return images;
};

export const getOriginalImageForScene = (
  clip: VideoClipScript,
  sceneNumber: number,
  galleryImages: GalleryImage[] | undefined,
): GalleryImage | undefined => {
  const newSource = getSceneSource(clip.title, sceneNumber);
  const oldSource = `Cena-${clip.title}-${sceneNumber}`;
  return (
    findGalleryImage(galleryImages, clip.id, newSource) ||
    findGalleryImage(galleryImages, clip.id, oldSource)
  );
};

export const getOriginalSceneImages = (
  clip: VideoClipScript,
  galleryImages: GalleryImage[] | undefined,
): GalleryImage[] => {
  if (!clip.scenes || clip.scenes.length === 0) return [];
  if (!galleryImages || galleryImages.length === 0) return [];

  const images: GalleryImage[] = [];
  for (const scene of clip.scenes) {
    const image = getOriginalImageForScene(clip, scene.scene, galleryImages);
    if (image) {
      images.push(image);
    }
  }
  return images;
};

export const getCarrosselImage = (
  clip: VideoClipScript,
  sceneNumber: number,
  galleryImages: GalleryImage[] | undefined,
): GalleryImage | undefined => {
  const source = getCarrosselSource(clip.title, sceneNumber);
  return findGalleryImage(galleryImages, clip.id, source);
};
