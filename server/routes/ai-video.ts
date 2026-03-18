/**
 * AI Video Generation Route
 * Extracted from server/index.mjs
 *
 * Route: POST /api/ai/video
 */

import type { Express } from "express";
import { put } from "@vercel/blob";
import { getSql } from "../lib/db.js";
import { resolveUserId } from "../lib/user-resolver.js";
import { getRequestAuthContext } from "../lib/auth.js";
import {
  logAiUsage,
  createTimer,
} from "../helpers/usage-tracking.js";
import {
  logExternalAPI,
  logExternalAPIResult,
  logError,
} from "../lib/logging-helpers.js";
import {
  generateVideoWithGoogleVeo,
  generateVideoWithFal,
  uploadDataUrlImageToBlob,
} from "../lib/ai/video-generation.js";
import { buildVideoPrompt } from "../lib/ai/prompt-builders.js";
import logger from "../lib/logger.js";
import { validateRequest } from "../middleware/validate.js";
import { type AiVideoBody, aiVideoBodySchema } from "../schemas/ai-schemas.js";

/** Brand profile mapped from database record for video prompt building */
interface MappedBrandProfile {
  name: string | null;
  description: string | null;
  logo: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  tertiaryColor: string | null;
  toneOfVoice: string | null;
  toneTargets: string[];
}

/** Database brand profile record */
interface BrandProfileRecord {
  name: string | null;
  description: string | null;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  tertiary_color: string | null;
  tone_of_voice: string | null;
  settings?: {
    toneTargets?: string[];
  } | null;
}

export function registerAiVideoRoutes(app: Express): void {
  app.post("/api/ai/video", validateRequest({ body: aiVideoBodySchema }), async (req, res) => {
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
      } = req.body as AiVideoBody;

      const isInterpolationMode = useInterpolation && lastFrameUrl;
      let finalPrompt = prompt;
      let mappedBrandProfile: MappedBrandProfile | null = null;
      let effectiveImageUrl: string | undefined = imageUrl;
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
        const brandProfileRows = brandProfileResult as BrandProfileRecord[];

        const brandProfile = brandProfileRows[0];
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

          // Convert mapped brand profile to the format expected by buildVideoPrompt
          const brandProfileForPrompt = {
            name: mappedBrandProfile.name ?? undefined,
            description: mappedBrandProfile.description ?? undefined,
            logo: mappedBrandProfile.logo ?? undefined,
            primaryColor: mappedBrandProfile.primaryColor ?? undefined,
            secondaryColor: mappedBrandProfile.secondaryColor ?? undefined,
            tertiaryColor: mappedBrandProfile.tertiaryColor ?? undefined,
            toneOfVoice: mappedBrandProfile.toneOfVoice ?? undefined,
            toneTargets: mappedBrandProfile.toneTargets,
          };

          finalPrompt = buildVideoPrompt(prompt, brandProfileForPrompt, {
            resolution,
            aspectRatio,
            hasReferenceImage: !!effectiveImageUrl,
            isInterpolationMode: !!isInterpolationMode,
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

      let videoUrl: string | null = null;
      let videoBuffer: Buffer | null = null;
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

      let videoData: Buffer;
      if (videoBuffer) {
        videoData = videoBuffer;
      } else if (videoUrl) {
        // FAL.ai returns a URL - download it
        const videoResponse = await fetch(videoUrl);
        videoData = Buffer.from(await videoResponse.arrayBuffer());
      } else {
        throw new Error("No video data available");
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
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logError("Video API", error instanceof Error ? error : new Error(errorMessage));
      await logAiUsage(sql, {
        organizationId,
        endpoint: "/api/ai/video",
        operation: "video",
        model: (req.body as AiVideoBody)?.model || "veo-3.1-fast",
        latencyMs: timer(),
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      }).catch((err: unknown) => logger.warn({ err }, "Non-critical usage logging failed"));
      return res.status(500).json({
        error:
          error instanceof Error ? error.message : "Failed to generate video",
      });
    }
  });
}
