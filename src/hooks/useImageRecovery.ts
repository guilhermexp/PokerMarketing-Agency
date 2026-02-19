import { useEffect, useRef } from "react";
import type { GalleryImage } from "../types";

/**
 * Image Recovery Hook
 *
 * 3-tier priority system for recovering images:
 *   Priority 1: item.image_url from database (most reliable)
 *   Priority 2: galleryImages filtered by item ID field (safe, tied to specific item)
 *   Priority 3: galleryImages filtered by source + campaignId (legacy fallback)
 *
 * WARNING: Do NOT remove the gallery fallback! Users lose their generated
 * images when navigating away and back if this fallback is missing.
 */

interface RecoveryItem {
  id?: string;
  image_url?: string | null;
  image_prompt?: string;
}

interface UseImageRecoveryOptions<T extends RecoveryItem> {
  items: T[];
  galleryImages?: GalleryImage[];
  campaignId?: string;
  /** Get the gallery image field to match on (e.g., img.post_id or img.ad_creative_id) */
  getItemIdFromGallery: (img: GalleryImage) => string | undefined;
  /** Generate a source string for the current format */
  getSource: (index: number, item: T) => string;
  /** Generate a legacy source string for backward compatibility */
  getLegacySource: (index: number, item: T) => string;
  /** Sync recovered image to database */
  syncToDatabase: (itemId: string, imageUrl: string) => Promise<unknown>;
  /** Whether an index is actively generating (skip recovery for these) */
  isActivelyGenerating?: (index: number) => boolean;
}

/**
 * Hook that runs image recovery as an effect and returns the current images.
 *
 * Callbacks are stored in refs to avoid infinite re-render loops when callers
 * pass inline arrow functions (which create new references every render).
 * The effect only re-runs when actual data changes (items, galleryImages, campaignId).
 */
export function useImageRecoveryEffect<T extends RecoveryItem>(
  options: UseImageRecoveryOptions<T> & {
    setImages: React.Dispatch<React.SetStateAction<(GalleryImage | null)[]>>;
    resetGenerationState: (length: number) => void;
  },
) {
  const {
    items,
    galleryImages,
    campaignId,
    setImages,
    resetGenerationState,
  } = options;

  // Store all callbacks in refs so they never trigger the effect
  const getItemIdFromGalleryRef = useRef(options.getItemIdFromGallery);
  const getSourceRef = useRef(options.getSource);
  const getLegacySourceRef = useRef(options.getLegacySource);
  const syncToDatabaseRef = useRef(options.syncToDatabase);
  const isActivelyGeneratingRef = useRef(options.isActivelyGenerating);
  const setImagesRef = useRef(setImages);
  const resetGenerationStateRef = useRef(resetGenerationState);

  getItemIdFromGalleryRef.current = options.getItemIdFromGallery;
  getSourceRef.current = options.getSource;
  getLegacySourceRef.current = options.getLegacySource;
  syncToDatabaseRef.current = options.syncToDatabase;
  isActivelyGeneratingRef.current = options.isActivelyGenerating;
  setImagesRef.current = setImages;
  resetGenerationStateRef.current = resetGenerationState;

  useEffect(() => {
    // Recover images using the 3-tier priority system
    const recovered = items.map((item, index) => {
      // Priority 1: Use saved image_url from database
      if (item.image_url) {
        return {
          id: `saved-${item.id || Date.now()}`,
          src: item.image_url,
          prompt: item.image_prompt || "",
          source: getSourceRef.current(index, item),
          model: "gemini-3-pro-image-preview" as const,
        };
      }

      // Priority 2: Recover from gallery using item ID
      if (item.id && galleryImages && galleryImages.length > 0) {
        const galleryImage = galleryImages.find(
          (img) => getItemIdFromGalleryRef.current(img) === item.id,
        );
        if (galleryImage) {
          syncToDatabaseRef.current(item.id, galleryImage.src).catch(() => {});
          return galleryImage;
        }
      }

      // Priority 3: Fallback to source matching (legacy)
      if (galleryImages && galleryImages.length > 0) {
        const newSource = getSourceRef.current(index, item);
        let galleryImage = galleryImages.find(
          (img) => img.source === newSource,
        );

        if (!galleryImage) {
          const legacySource = getLegacySourceRef.current(index, item);
          galleryImage = galleryImages.find(
            (img) =>
              img.source === legacySource &&
              (!campaignId || img.campaign_id === campaignId),
          );
        }

        if (galleryImage && item.id) {
          syncToDatabaseRef.current(item.id, galleryImage.src).catch(() => {});
          return galleryImage;
        }
      }

      return null;
    });

    setImagesRef.current((prevImages) =>
      recovered.map((img, idx) => {
        if (isActivelyGeneratingRef.current?.(idx)) {
          return prevImages[idx] ?? null;
        }
        return img;
      }),
    );
    resetGenerationStateRef.current(items.length);
  }, [items, galleryImages, campaignId]);
}
