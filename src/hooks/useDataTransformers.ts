/**
 * Data Transformers Hook
 *
 * Memoized transformations from SWR/API data to UI-friendly formats:
 * - Gallery images
 * - Scheduled posts
 * - Campaigns list
 * - Style references
 */

import { useMemo } from "react";
import type { GalleryImage, ScheduledPost, StyleReference, CampaignSummary } from "@/types";
import type { DbGalleryImage, DbScheduledPost, DbCampaign } from "@/services/apiClient";

// =============================================================================
// Gallery Images
// =============================================================================

export function useTransformedGalleryImages(
  swrGalleryImages: DbGalleryImage[] | undefined
): GalleryImage[] {
  return useMemo(
    () =>
      (swrGalleryImages || [])
        .filter((img) => {
          if (!img.src_url || img.src_url === "") return false;
          if (img.src_url.startsWith("blob:")) return false;
          return true;
        })
        .map((img) => ({
          id: img.id,
          src: img.src_url,
          thumbnailSrc: img.thumbnail_url || undefined,
          prompt: img.prompt || undefined,
          source: img.source as GalleryImage["source"],
          model: img.model as GalleryImage["model"],
          mediaType: (img.media_type as GalleryImage["mediaType"]) || "image",
          duration: img.duration || undefined,
          post_id: img.post_id || undefined,
          ad_creative_id: img.ad_creative_id || undefined,
          video_script_id: img.video_script_id || undefined,
          created_at: img.created_at,
          published_at: img.published_at || undefined,
        })),
    [swrGalleryImages]
  );
}

// =============================================================================
// Scheduled Posts
// =============================================================================

export function useTransformedScheduledPosts(
  swrScheduledPosts: DbScheduledPost[] | undefined
): ScheduledPost[] {
  return useMemo(
    () =>
      (swrScheduledPosts || [])
        .map((post) => {
          const normalizedDate =
            post.scheduled_date?.split("T")[0] || post.scheduled_date;
          return {
            id: post.id,
            type: post.content_type as ScheduledPost["type"],
            contentId: post.content_id || "",
            imageUrl: post.image_url,
            carouselImageUrls: post.carousel_image_urls || undefined,
            caption: post.caption,
            hashtags: post.hashtags || [],
            scheduledDate: normalizedDate,
            scheduledTime: post.scheduled_time,
            scheduledTimestamp: new Date(post.scheduled_timestamp).getTime(),
            timezone: post.timezone,
            platforms: post.platforms as ScheduledPost["platforms"],
            instagramContentType:
              post.instagram_content_type as ScheduledPost["instagramContentType"],
            status: post.status as ScheduledPost["status"],
            publishedAt: post.published_at
              ? new Date(post.published_at).getTime()
              : undefined,
            errorMessage: post.error_message || undefined,
            createdAt: new Date(post.created_at).getTime(),
            updatedAt: new Date(post.updated_at || post.created_at).getTime(),
            createdFrom: (post.created_from || "gallery") as ScheduledPost["createdFrom"],
          };
        })
        .sort((a, b) => a.scheduledTimestamp - b.scheduledTimestamp),
    [swrScheduledPosts]
  );
}

// =============================================================================
// Campaigns List
// =============================================================================

export function useTransformedCampaignsList(
  swrCampaigns: DbCampaign[] | undefined
): CampaignSummary[] {
  return useMemo(
    () =>
      (swrCampaigns || []).map((c) => ({
        id: c.id,
        name: c.name,
        status: c.status,
        createdAt: c.created_at,
      })),
    [swrCampaigns]
  );
}

// =============================================================================
// Style References
// =============================================================================

export function useStyleReferences(
  swrGalleryImages: DbGalleryImage[] | undefined
): StyleReference[] {
  return useMemo(
    () =>
      (swrGalleryImages || [])
        .filter((img) => img.is_style_reference)
        .map((img) => ({
          id: img.id,
          src: img.src_url,
          name: img.style_reference_name || img.prompt || "Favorito sem nome",
          createdAt: new Date(img.created_at).getTime(),
        })),
    [swrGalleryImages]
  );
}
