/**
 * Carousel image update helper
 */

import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { CarouselScript } from '../../../types';
import { updateCarouselCover, updateCarouselSlideImage } from '../../../services/api';
import { toCarouselScript } from '../utils';

interface UpdateParams {
  imageId: string;
  newSrc: string;
  localCarousels: CarouselScript[];
  setLocalCarousels: Dispatch<SetStateAction<CarouselScript[]>>;
  localCarouselsRef: MutableRefObject<CarouselScript[]>;
  onCarouselUpdate?: (carousel: CarouselScript) => void;
  onUpdateGalleryImage?: (imageId: string, newImageSrc: string) => void;
}

export const updateCarouselImage = async ({
  imageId,
  newSrc,
  localCarousels,
  setLocalCarousels,
  localCarouselsRef,
  onCarouselUpdate,
  onUpdateGalleryImage,
}: UpdateParams) => {
  const coverMatch = imageId.match(/^(.+)-cover$/);
  const slideMatch = imageId.match(/^(.+)-slide-(\d+)$/);

  if (coverMatch) {
    const carouselId = coverMatch[1];
    const carousel = localCarousels.find((c) => c.id === carouselId);
    if (carousel) {
      try {
        const updated = await updateCarouselCover(carouselId, newSrc);
        const converted = toCarouselScript(updated);
        setLocalCarousels((prev) => {
          const newState = prev.map((c) =>
            c.id === carouselId ? converted : c,
          );
          localCarouselsRef.current = newState;
          return newState;
        });
        onCarouselUpdate?.(converted);
        console.debug('[CarrosselTab] Updated carousel cover:', carouselId);
      } catch (err) {
        console.error('[CarrosselTab] Failed to update carousel cover:', err);
      }
    }
    return;
  }

  if (slideMatch) {
    const carouselId = slideMatch[1];
    const slideNumber = parseInt(slideMatch[2], 10);
    const carousel = localCarousels.find((c) => c.id === carouselId);
    if (carousel) {
      try {
        const updated = await updateCarouselSlideImage(
          carouselId,
          slideNumber,
          newSrc,
        );
        const converted = toCarouselScript(updated);
        setLocalCarousels((prev) => {
          const newState = prev.map((c) =>
            c.id === carouselId ? converted : c,
          );
          localCarouselsRef.current = newState;
          return newState;
        });
        onCarouselUpdate?.(converted);
        console.debug(
          '[CarrosselTab] Updated carousel slide:',
          carouselId,
          slideNumber,
        );
      } catch (err) {
        console.error(
          `[CarrosselTab] Failed to update carousel slide ${slideNumber}:`,
          err,
        );
      }
    }
    return;
  }

  if (onUpdateGalleryImage) {
    onUpdateGalleryImage(imageId, newSrc);
  }
};
