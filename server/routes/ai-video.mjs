/**
 * AI Video Generation Route
 * Extracted from server/index.mjs
 *
 * Route: POST /api/ai/video
 */

import { put } from "@vercel/blob";
import { getSql } from "../lib/db.mjs";
import { resolveUserId } from "../lib/user-resolver.mjs";
import { getRequestAuthContext } from "../lib/auth.mjs";
import {
  logAiUsage,
  createTimer,
} from "../helpers/usage-tracking.mjs";
import {
  logExternalAPI,
  logExternalAPIResult,
  logError,
} from "../lib/logging-helpers.mjs";
import {
  generateVideoWithGoogleVeo,
  generateVideoWithFal,
  uploadDataUrlImageToBlob,
} from "../lib/ai/video-generation.mjs";
import { buildVideoPrompt } from "../lib/ai/prompt-builders.mjs";
import logger from "../lib/logger.mjs";

export function registerAiVideoRoutes(app) {
  app.post("/api/ai/video", async (req, res) => {
    const timer = createTimer();
    const authContext = getRequestAuthContext(req);
    const organizationId = authContext?.orgId || null;
    const authUserId = authContext?.userId || null;
    const sql = getSql();

    try {
      const {
        prompt,
        aspectRatio,
        resolution = "720p",
        model,
        imageUrl,
        lastFrameUrl,
        sceneDuration,
        generateAudio = true,
        useInterpolation = false,
        useBrandProfile = false,
        useCampaignGradePrompt = true,
      } = req.body;

      if (!prompt || !aspectRatio || !model) {
        return res.status(400).json({
          error: "Missing required fields: prompt, aspectRatio, model",
        });
      }

      const isInterpolationMode = useInterpolation && lastFrameUrl;
      let finalPrompt = prompt;
      let mappedBrandProfile = null;
      let effectiveImageUrl = imageUrl;
      let usedBrandLogoAsReference = false;

      if (useBrandProfile && authUserId) {
        const resolvedUserId = await resolveUserId(sql, authUserId);
        const isOrgContext = !!organizationId;
        const brandProfileResult =
          isOrgContext
            ? await sql`SELECT * FROM brand_profiles WHERE organization_id = ${organizationId} AND deleted_at IS NULL LIMIT 1`
            : resolvedUserId
              ? await sql`SELECT * FROM brand_profiles WHERE user_id = ${resolvedUserId} AND organization_id IS NULL AND deleted_at IS NULL LIMIT 1`
              : [];

        const brandProfile = brandProfileResult[0];
        if (brandProfile) {
          mappedBrandProfile = {
            name: brandProfile.name,
            description: brandProfile.description,
            logo: brandProfile.logo_url,
            primaryColor: brandProfile.primary_color,
            secondaryColor: brandProfile.secondary_color,
            tertiaryColor: brandProfile.tertiary_color,
            toneOfVoice: brandProfile.tone_of_voice,
            toneTargets: brandProfile.settings?.toneTargets || [
              "campaigns",
              "posts",
              "images",
              "flyers",
            ],
          };

          // Use brand logo as reference fallback when user did not provide one.
          if (!effectiveImageUrl && mappedBrandProfile.logo) {
            effectiveImageUrl = mappedBrandProfile.logo;
            usedBrandLogoAsReference = true;
          }

          finalPrompt = buildVideoPrompt(prompt, mappedBrandProfile, {
            resolution,
            aspectRatio,
            hasReferenceImage: !!effectiveImageUrl,
            isInterpolationMode,
            useCampaignGradePrompt,
            hasBrandLogoReference: usedBrandLogoAsReference,
          });
        }
      }

      const isFalProviderModel =
        model !== "veo-3.1" && model !== "veo-3.1-fast-generate-preview";

      // FAL image-to-video requires HTTP URL. Convert data URLs when needed.
      if (
        effectiveImageUrl &&
        effectiveImageUrl.startsWith("data:") &&
        isFalProviderModel
      ) {
        try {
          const uploadedRefUrl = await uploadDataUrlImageToBlob(
            effectiveImageUrl,
            usedBrandLogoAsReference ? "brand-logo-reference" : "video-reference",
          );
          if (uploadedRefUrl) {
            effectiveImageUrl = uploadedRefUrl;
          } else {
            effectiveImageUrl = undefined;
          }
        } catch (uploadErr) {
          logger.warn(
            { err: uploadErr },
            "[Video API] Failed to upload reference image for FAL provider",
          );
          effectiveImageUrl = undefined;
        }
      }

      logger.info(
        {
          model,
          generateAudio,
          isInterpolation: isInterpolationMode,
          useBrandProfile,
          useCampaignGradePrompt,
          hasBrandProfile: !!mappedBrandProfile,
          hasReferenceImage: !!effectiveImageUrl,
          usedBrandLogoAsReference,
        },
        "[Video API] Generating video",
      );

      let videoUrl;
      let videoBuffer;
      let usedProvider = "google";

      // For Veo 3.1, use Google API only (no fallback).
      if (model === "veo-3.1" || model === "veo-3.1-fast-generate-preview") {
        const result = await generateVideoWithGoogleVeo(
          finalPrompt,
          aspectRatio,
          effectiveImageUrl,
          isInterpolationMode ? lastFrameUrl : null,
        );
        // Google Veo returns buffer directly (API key stays server-side)
        videoUrl = null;
        videoBuffer = result.videoBuffer;
      } else {
        // For Sora-2 or other models, use FAL.ai directly.
        usedProvider = "fal.ai";
        videoUrl = await generateVideoWithFal(
          finalPrompt,
          aspectRatio,
          model,
          effectiveImageUrl,
          sceneDuration,
          generateAudio,
        );
      }

      if (!videoUrl && !videoBuffer) {
        throw new Error("Failed to generate video - invalid response");
      }

      // Download video (if needed) and upload to Vercel Blob for permanent storage
      logExternalAPI(
        "Vercel Blob",
        "Upload video",
        `${model} (via ${usedProvider})`,
      );
      const uploadStart = Date.now();

      let videoData;
      if (videoBuffer) {
        videoData = videoBuffer;
      } else {
        // FAL.ai returns a URL - download it
        const videoResponse = await fetch(videoUrl);
        videoData = Buffer.from(await videoResponse.arrayBuffer());
      }

      const filename = `${model}-video-${Date.now()}.mp4`;
      const blob = await put(filename, videoData, {
        access: "public",
        contentType: "video/mp4",
      });

      logExternalAPIResult(
        "Vercel Blob",
        "Upload video",
        Date.now() - uploadStart,
      );

      // Log AI usage - video is priced per second
      const durationSeconds = sceneDuration || 5; // Default 5 seconds
      await logAiUsage(sql, {
        organizationId,
        endpoint: "/api/ai/video",
        operation: "video",
        model: model.includes("veo") ? "veo-3.1-fast" : model,
        videoDurationSeconds: durationSeconds,
        latencyMs: timer(),
        status: "success",
        metadata: {
          aspectRatio,
          resolution,
          provider: usedProvider,
          hasImageUrl: !!effectiveImageUrl,
          isInterpolation: isInterpolationMode,
          useBrandProfile,
          useCampaignGradePrompt,
          hasBrandProfile: !!mappedBrandProfile,
          usedBrandLogoAsReference,
        },
      });

      return res.status(200).json({
        success: true,
        url: blob.url,
        model,
        provider: usedProvider,
      });
    } catch (error) {
      logError("Video API", error);
      await logAiUsage(sql, {
        organizationId,
        endpoint: "/api/ai/video",
        operation: "video",
        model: req.body?.model || "veo-3.1-fast",
        latencyMs: timer(),
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      }).catch(() => {});
      return res.status(500).json({
        error:
          error instanceof Error ? error.message : "Failed to generate video",
      });
    }
  });
}
