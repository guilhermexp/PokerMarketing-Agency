import { clientLogger } from "@/lib/client-logger";
/**
 * Scheduled Posts Handlers Hook
 *
 * Manages all scheduled posts operations:
 * - Creating/scheduling posts
 * - Updating scheduled posts
 * - Deleting scheduled posts
 * - Retrying failed posts
 * - Publishing to Instagram
 */

import { useCallback } from "react";
import type { ScheduledPost, InstagramPublishState, InstagramContext } from "@/types";
import type { DbScheduledPost } from "@/services/apiClient";
import {
  createScheduledPost,
  updateScheduledPost as updateScheduledPostApi,
  deleteScheduledPost as deleteScheduledPostApi,
  retryScheduledPost as retryScheduledPostApi,
} from "@/services/apiClient";
import {
  publishToInstagram,
  uploadImageForInstagram,
  type InstagramContentType,
} from "@/services/rubeService";

// =============================================================================
// Types
// =============================================================================

interface UseScheduledPostsHandlersParams {
  userId: string | null;
  organizationId: string | null;
  instagramContext: InstagramContext | undefined;
  swrScheduledPosts: DbScheduledPost[] | undefined;
  swrAddScheduledPost: (post: DbScheduledPost) => void;
  swrUpdateScheduledPost: (
    postId: string,
    updates: Partial<DbScheduledPost>
  ) => void;
  swrRemoveScheduledPost: (postId: string) => void;
  setPublishingStates: (
    updater: (
      prev: Record<string, InstagramPublishState>
    ) => Record<string, InstagramPublishState>
  ) => void;
}

interface ScheduledPostsHandlers {
  handleSchedulePost: (
    post: Omit<ScheduledPost, "id" | "createdAt" | "updatedAt">
  ) => Promise<void>;
  handleUpdateScheduledPost: (
    postId: string,
    updates: Partial<ScheduledPost>
  ) => Promise<void>;
  handleDeleteScheduledPost: (postId: string) => Promise<void>;
  handleRetryScheduledPost: (postId: string) => Promise<void>;
  handlePublishToInstagram: (post: ScheduledPost) => Promise<void>;
}

// =============================================================================
// Hook
// =============================================================================

export function useScheduledPostsHandlers({
  userId,
  organizationId,
  instagramContext,
  swrScheduledPosts,
  swrAddScheduledPost,
  swrUpdateScheduledPost,
  swrRemoveScheduledPost,
  setPublishingStates,
}: UseScheduledPostsHandlersParams): ScheduledPostsHandlers {
  const handleUpdateScheduledPost = useCallback(
    async (postId: string, updates: Partial<ScheduledPost>) => {
      try {
        // Map frontend field names to database field names
        const dbUpdates: Record<string, unknown> = {};
        if (updates.status !== undefined) dbUpdates.status = updates.status;
        if (updates.publishedAt !== undefined)
          dbUpdates.published_at = new Date(updates.publishedAt).toISOString();
        if (updates.errorMessage !== undefined)
          dbUpdates.error_message = updates.errorMessage;
        if (updates.instagramMediaId !== undefined)
          dbUpdates.instagram_media_id = updates.instagramMediaId;
        if (updates.publishAttempts !== undefined)
          dbUpdates.publish_attempts = updates.publishAttempts;
        if (updates.lastPublishAttempt !== undefined)
          dbUpdates.last_publish_attempt = new Date(
            updates.lastPublishAttempt
          ).toISOString();
        if (updates.scheduledDate !== undefined)
          dbUpdates.scheduled_date = updates.scheduledDate;
        if (updates.scheduledTime !== undefined)
          dbUpdates.scheduled_time = updates.scheduledTime;

        // If date or time changed, recalculate the timestamp
        if (
          updates.scheduledDate !== undefined ||
          updates.scheduledTime !== undefined
        ) {
          // Find current post to get existing date/time if one is missing
          const currentPost = swrScheduledPosts?.find((p) => p.id === postId);
          const newDate = updates.scheduledDate ?? currentPost?.scheduled_date;
          const newTime = updates.scheduledTime ?? currentPost?.scheduled_time;
          if (newDate && newTime) {
            const timestamp = new Date(`${newDate}T${newTime}:00`);
            dbUpdates.scheduled_timestamp = timestamp.toISOString();
          }
        }

        await updateScheduledPostApi(postId, dbUpdates);
        // Update SWR cache
        swrUpdateScheduledPost(postId, dbUpdates as Partial<DbScheduledPost>);
      } catch (e) {
        clientLogger.error("Failed to update scheduled post:", e);
      }
    },
    [swrScheduledPosts, swrUpdateScheduledPost]
  );

  const handlePublishToInstagram = useCallback(
    async (post: ScheduledPost) => {
      const postId = post.id;

      // Initialize publishing state
      setPublishingStates((prev) => ({
        ...prev,
        [postId]: {
          step: "uploading_image",
          message: "Preparando imagem...",
          progress: 10,
        },
      }));

      try {
        // Update post status to publishing
        await handleUpdateScheduledPost(postId, { status: "publishing" });

        // Step 1: Upload image to get HTTP URL (Instagram requires HTTP URLs, not data URLs)
        setPublishingStates((prev) => ({
          ...prev,
          [postId]: {
            step: "uploading_image",
            message: "Fazendo upload da imagem...",
            progress: 15,
          },
        }));

        const imageUrl = await uploadImageForInstagram(post.imageUrl);

        // Step 2: Prepare caption with hashtags
        const fullCaption = `${post.caption}\n\n${post.hashtags.join(" ")}`;

        // Step 3: Determine content type (default to photo)
        const contentType: InstagramContentType =
          post.instagramContentType || "photo";

        // Step 4: Publish to Instagram with progress tracking
        if (!instagramContext) {
          throw new Error(
            "Conecte sua conta Instagram em Configurações → Integrações para publicar."
          );
        }

        const result = await publishToInstagram(
          imageUrl,
          fullCaption,
          contentType,
          (progress) => {
            setPublishingStates((prev) => ({
              ...prev,
              [postId]: progress,
            }));
          },
          instagramContext,
          post.carouselImageUrls
        );

        if (result.success) {
          await handleUpdateScheduledPost(postId, {
            status: "published",
            publishedAt: Date.now(),
            instagramMediaId: result.mediaId,
          });

          setPublishingStates((prev) => ({
            ...prev,
            [postId]: {
              step: "completed",
              message: "Publicado!",
              progress: 100,
              postId: result.mediaId,
            },
          }));

          // Clear state after 3 seconds
          setTimeout(() => {
            setPublishingStates((prev) => {
              const { [postId]: _, ...rest } = prev;
              return rest;
            });
          }, 3000);
        } else {
          throw new Error(result.errorMessage || "Falha na publicacao");
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Erro desconhecido";

        await handleUpdateScheduledPost(postId, {
          status: "failed",
          errorMessage,
          publishAttempts: (post.publishAttempts || 0) + 1,
          lastPublishAttempt: Date.now(),
        });

        setPublishingStates((prev) => ({
          ...prev,
          [postId]: { step: "failed", message: errorMessage, progress: 0 },
        }));
      }
    },
    [handleUpdateScheduledPost, instagramContext, setPublishingStates]
  );

  const handleSchedulePost = useCallback(
    async (post: Omit<ScheduledPost, "id" | "createdAt" | "updatedAt">) => {
      if (!userId) {
        clientLogger.error("Cannot schedule post without userId");
        return;
      }

      // Validate required fields before attempting to create
      if (
        !post.imageUrl ||
        !post.scheduledDate ||
        !post.scheduledTime ||
        !post.platforms
      ) {
        clientLogger.error("Cannot schedule post: missing required fields", {
          hasImageUrl: !!post.imageUrl,
          hasScheduledDate: !!post.scheduledDate,
          hasScheduledTime: !!post.scheduledTime,
          hasPlatforms: !!post.platforms,
        });
        alert(
          "Erro ao agendar: campos obrigatórios ausentes. Por favor, tente novamente."
        );
        return;
      }

      // Check if this is "publish now" (scheduled within 1 minute of now)
      const isPublishNow = post.scheduledTimestamp <= Date.now() + 60000;

      try {
        // 1. Create post in database
        const payload = {
          content_type: post.type,
          content_id: post.contentId,
          image_url: post.imageUrl,
          carousel_image_urls: post.carouselImageUrls,
          caption: post.caption,
          hashtags: post.hashtags,
          scheduled_date: post.scheduledDate,
          scheduled_time: post.scheduledTime,
          scheduled_timestamp: new Date(post.scheduledTimestamp).toISOString(),
          timezone: post.timezone,
          platforms: post.platforms,
          instagram_content_type: post.instagramContentType,
          instagram_account_id: instagramContext?.instagramAccountId,
          created_from: post.createdFrom,
          organization_id: organizationId,
        };
        clientLogger.debug(
          "[Schedule] Sending payload:",
          payload,
          isPublishNow ? "(PUBLISH NOW)" : ""
        );
        const dbPost = await createScheduledPost(userId, payload);

        // Add to SWR cache (optimistic update)
        swrAddScheduledPost(dbPost);

        const newPost: ScheduledPost = {
          id: dbPost.id,
          type: dbPost.content_type as ScheduledPost["type"],
          contentId: dbPost.content_id || "",
          imageUrl: dbPost.image_url,
          // Use original post data as fallback if DB doesn't return array
          carouselImageUrls: dbPost.carousel_image_urls || post.carouselImageUrls,
          caption: dbPost.caption,
          hashtags: dbPost.hashtags || [],
          scheduledDate: dbPost.scheduled_date,
          scheduledTime: dbPost.scheduled_time,
          scheduledTimestamp: new Date(dbPost.scheduled_timestamp).getTime(),
          timezone: dbPost.timezone,
          platforms: dbPost.platforms as ScheduledPost["platforms"],
          instagramContentType:
            dbPost.instagram_content_type as ScheduledPost["instagramContentType"],
          status: dbPost.status as ScheduledPost["status"],
          createdAt: new Date(dbPost.created_at).getTime(),
          updatedAt: Date.now(),
          createdFrom: (dbPost.created_from ||
            "gallery") as ScheduledPost["createdFrom"],
        };

        // 2. If "Publish Now", immediately publish to Instagram
        if (
          isPublishNow &&
          (post.platforms === "instagram" || post.platforms === "both")
        ) {
          clientLogger.debug("[Schedule] Publishing immediately...");
          // Use setTimeout to ensure state is updated before publishing
          setTimeout(() => {
            handlePublishToInstagram(newPost);
          }, 100);
        } else {
          // Post is saved and scheduled - will need manual publish when time comes
          clientLogger.debug(
            `[Schedule] Post ${dbPost.id} scheduled for ${new Date(post.scheduledTimestamp).toISOString()}`
          );
        }
      } catch (e) {
        clientLogger.error("Failed to schedule post:", e);
      }
    },
    [
      userId,
      organizationId,
      instagramContext?.instagramAccountId,
      swrAddScheduledPost,
      handlePublishToInstagram,
    ]
  );

  const handleDeleteScheduledPost = useCallback(
    async (postId: string) => {
      try {
        // Remove from SWR cache immediately (optimistic update)
        swrRemoveScheduledPost(postId);
        await deleteScheduledPostApi(postId);
      } catch (e) {
        clientLogger.error("Failed to delete scheduled post:", e);
      }
    },
    [swrRemoveScheduledPost]
  );

  const handleRetryScheduledPost = useCallback(
    async (postId: string) => {
      if (!userId) return;
      try {
        const updatedPost = await retryScheduledPostApi(postId, userId);
        // Update SWR cache with the reset post
        swrUpdateScheduledPost(postId, {
          status: updatedPost.status,
          error_message: null,
          publish_attempts: 0,
          instagram_account_id: updatedPost.instagram_account_id,
          scheduled_timestamp: updatedPost.scheduled_timestamp,
        } as Partial<DbScheduledPost>);
      } catch (e: unknown) {
        const errorMsg =
          e instanceof Error ? e.message : "Failed to retry scheduled post";
        clientLogger.error("Failed to retry scheduled post:", errorMsg);
        alert(errorMsg);
      }
    },
    [userId, swrUpdateScheduledPost]
  );

  return {
    handleSchedulePost,
    handleUpdateScheduledPost,
    handleDeleteScheduledPost,
    handleRetryScheduledPost,
    handlePublishToInstagram,
  };
}
