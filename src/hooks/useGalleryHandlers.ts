/**
 * Gallery Handlers Hook
 *
 * Manages all gallery-related operations:
 * - Adding images to gallery (with blob upload)
 * - Updating gallery images
 * - Deleting gallery images
 * - Marking images as published
 * - Style references (favorites)
 */

import { useCallback } from "react";
import type { GalleryImage, StyleReference, ChatReferenceImage } from "@/types";
import type { DbGalleryImage } from "@/services/apiClient";
import {
  createGalleryImage,
  deleteGalleryImage,
  updateGalleryImage,
} from "@/services/apiClient";
import { uploadDataUrlToBlob } from "@/services/blobService";

// =============================================================================
// Types
// =============================================================================

interface UseGalleryHandlersParams {
  userId: string | null;
  organizationId: string | null;
  toolImageReference: ChatReferenceImage | null;
  setToolImageReference: (ref: ChatReferenceImage | null) => void;
  swrAddGalleryImage: (image: DbGalleryImage) => void;
  swrRemoveGalleryImage: (imageId: string) => void;
  swrUpdateGalleryImage: (
    imageId: string,
    updates: Partial<DbGalleryImage>
  ) => void;
  refreshGallery: () => void;
  swrGalleryImages: DbGalleryImage[] | undefined;
  setSelectedStyleReference: (ref: StyleReference | null) => void;
  selectedStyleReference: StyleReference | null;
  onViewChange: (view: "flyer") => void;
}

interface GalleryHandlers {
  handleAddImageToGallery: (
    image: Omit<GalleryImage, "id">
  ) => GalleryImage;
  handleUpdateGalleryImage: (imageId: string, newImageSrc: string) => void;
  handleDeleteGalleryImage: (imageId: string) => Promise<void>;
  handleMarkGalleryImagePublished: (imageId: string) => void;
  handleAddStyleReference: (
    ref: Omit<StyleReference, "id" | "createdAt">
  ) => Promise<void>;
  handleRemoveStyleReference: (id: string) => Promise<void>;
  handleSelectStyleReference: (ref: StyleReference) => void;
  handleClearSelectedStyleReference: () => void;
}

// =============================================================================
// Hook
// =============================================================================

export function useGalleryHandlers({
  userId,
  organizationId,
  toolImageReference,
  setToolImageReference,
  swrAddGalleryImage,
  swrRemoveGalleryImage,
  swrUpdateGalleryImage,
  refreshGallery,
  swrGalleryImages,
  setSelectedStyleReference,
  selectedStyleReference,
  onViewChange,
}: UseGalleryHandlersParams): GalleryHandlers {
  const handleAddImageToGallery = useCallback(
    (image: Omit<GalleryImage, "id">): GalleryImage => {
      // Create image with temporary ID immediately for UI responsiveness
      const tempId = `temp-${Date.now()}`;
      const newImage: GalleryImage = { ...image, id: tempId };

      // Save to database in background (don't block UI)
      if (userId) {
        swrAddGalleryImage({
          id: tempId,
          user_id: userId,
          src_url: image.src,
          prompt: image.prompt || null,
          source: image.source,
          model: image.model,
          aspect_ratio: null,
          image_size: null,
          created_at: new Date().toISOString(),
          // Include linking fields for immediate filtering support
          post_id: image.post_id || null,
          ad_creative_id: image.ad_creative_id || null,
          video_script_id: image.video_script_id || null,
          media_type: image.mediaType || null,
          duration: image.duration || null,
          // Daily flyer fields
          week_schedule_id: image.week_schedule_id || null,
          daily_flyer_day: image.daily_flyer_day || null,
          daily_flyer_period: image.daily_flyer_period || null,
        } as DbGalleryImage);

        (async () => {
          try {
            const srcUrl = image.src.startsWith("data:")
              ? await uploadDataUrlToBlob(image.src)
              : image.src;
            const dbImage = await createGalleryImage(userId, {
              src_url: srcUrl,
              prompt: image.prompt,
              source: image.source,
              model: image.model,
              post_id: image.post_id,
              ad_creative_id: image.ad_creative_id,
              video_script_id: image.video_script_id,
              organization_id: organizationId,
              media_type: image.mediaType,
              duration: image.duration,
              // Daily flyer fields
              week_schedule_id: image.week_schedule_id,
              daily_flyer_day: image.daily_flyer_day,
              daily_flyer_period: image.daily_flyer_period,
            });
            // Replace temp image with the real database image
            swrRemoveGalleryImage(tempId);
            swrAddGalleryImage(dbImage);
            if (toolImageReference?.id === tempId) {
              setToolImageReference({ id: dbImage.id, src: dbImage.src_url });
            }

            // Refresh gallery to ensure UI reflects the new image
            refreshGallery();
          } catch (e) {
            console.error("Failed to save image to database:", e);
          }
        })();
      }

      return newImage;
    },
    [
      organizationId,
      setToolImageReference,
      swrAddGalleryImage,
      swrRemoveGalleryImage,
      refreshGallery,
      toolImageReference?.id,
      userId,
    ]
  );

  const handleUpdateGalleryImage = useCallback(
    (imageId: string, newImageSrc: string) => {
      console.debug("[Gallery] handleUpdateGalleryImage called:", {
        imageId,
        newSrc: newImageSrc.substring(0, 50),
      });

      // Update SWR cache immediately (optimistic update)
      swrUpdateGalleryImage(imageId, { src_url: newImageSrc });
      console.debug("[Gallery] SWR cache updated");

      if (toolImageReference?.id === imageId) {
        setToolImageReference({ id: imageId, src: newImageSrc });
        console.debug("[Gallery] toolImageReference updated");
      }

      // Skip temp images, synthetic IDs (like thumbnail-xxx), and other non-database IDs
      if (
        imageId.startsWith("temp-") ||
        imageId.startsWith("thumbnail-") ||
        imageId.includes("-cover")
      ) {
        console.debug("[Gallery] Skipping synthetic/temp image ID:", imageId);
        return;
      }

      // Upload to Blob and update database in background
      (async () => {
        try {
          const srcUrl = newImageSrc.startsWith("data:")
            ? await uploadDataUrlToBlob(newImageSrc)
            : newImageSrc;

          console.debug("[Gallery] Updating database with:", {
            imageId,
            srcUrl: srcUrl.substring(0, 50),
          });

          await updateGalleryImage(imageId, { src_url: srcUrl });
          console.debug("[Gallery] Database updated successfully");

          // Update cache with final Blob URL
          if (srcUrl !== newImageSrc) {
            swrUpdateGalleryImage(imageId, { src_url: srcUrl });
            if (toolImageReference?.id === imageId)
              setToolImageReference({ id: imageId, src: srcUrl });
            console.debug("[Gallery] Cache updated with blob URL");
          }

          // Refresh gallery to ensure UI reflects the edit
          refreshGallery();
        } catch (e) {
          console.error("[Gallery] Failed to update image in database:", e);
        }
      })();
    },
    [
      setToolImageReference,
      swrUpdateGalleryImage,
      refreshGallery,
      toolImageReference?.id,
    ]
  );

  const handleDeleteGalleryImage = useCallback(
    async (imageId: string) => {
      // Remove from SWR cache immediately (optimistic update)
      swrRemoveGalleryImage(imageId);

      if (imageId.startsWith("temp-")) return;

      // Also remove from database
      try {
        await deleteGalleryImage(imageId);
      } catch (e) {
        console.error("Failed to delete image from database:", e);
      }
    },
    [swrRemoveGalleryImage]
  );

  const handleMarkGalleryImagePublished = useCallback(
    (imageId: string) => {
      // Update SWR cache to mark image as published
      swrUpdateGalleryImage(imageId, {
        published_at: new Date().toISOString(),
      } as Partial<DbGalleryImage>);
    },
    [swrUpdateGalleryImage]
  );

  const handleAddStyleReference = useCallback(
    async (ref: Omit<StyleReference, "id" | "createdAt">) => {
      console.info("[Gallery] handleAddStyleReference called", ref);

      // Find the gallery image by src
      const galleryImage = swrGalleryImages?.find(
        (img) => img.src_url === ref.src
      );

      if (!galleryImage) {
        console.error("[Gallery] Could not find gallery image with src:", ref.src);
        return;
      }

      try {
        // Update image to mark as style reference
        await updateGalleryImage(galleryImage.id, {
          is_style_reference: true,
          style_reference_name: ref.name,
        });

        // Update local SWR cache
        swrUpdateGalleryImage(galleryImage.id, {
          is_style_reference: true,
          style_reference_name: ref.name,
        } as Partial<DbGalleryImage>);

        console.info("[Gallery] Successfully added to favorites:", galleryImage.id);
      } catch (error) {
        console.error("[Gallery] Failed to add style reference:", error);
      }
    },
    [swrGalleryImages, swrUpdateGalleryImage]
  );

  const handleRemoveStyleReference = useCallback(
    async (id: string) => {
      console.info("[Gallery] handleRemoveStyleReference called", id);

      try {
        // Update image to unmark as style reference
        await updateGalleryImage(id, {
          is_style_reference: false,
          style_reference_name: null,
        });

        // Update local SWR cache
        swrUpdateGalleryImage(id, {
          is_style_reference: false,
          style_reference_name: null,
        } as Partial<DbGalleryImage>);

        console.info("[Gallery] Successfully removed from favorites:", id);

        if (selectedStyleReference?.id === id) setSelectedStyleReference(null);
      } catch (error) {
        console.error("[Gallery] Failed to remove style reference:", error);
      }
    },
    [selectedStyleReference?.id, setSelectedStyleReference, swrUpdateGalleryImage]
  );

  const handleSelectStyleReference = useCallback(
    (ref: StyleReference) => {
      setSelectedStyleReference(ref);
      onViewChange("flyer");
    },
    [setSelectedStyleReference, onViewChange]
  );

  const handleClearSelectedStyleReference = useCallback(
    () => setSelectedStyleReference(null),
    [setSelectedStyleReference]
  );

  return {
    handleAddImageToGallery,
    handleUpdateGalleryImage,
    handleDeleteGalleryImage,
    handleMarkGalleryImagePublished,
    handleAddStyleReference,
    handleRemoveStyleReference,
    handleSelectStyleReference,
    handleClearSelectedStyleReference,
  };
}
