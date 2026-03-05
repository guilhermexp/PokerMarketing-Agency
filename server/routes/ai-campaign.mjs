/**
 * AI Campaign Generation Route
 * Extracted from server/index.mjs
 *
 * Route: POST /api/ai/campaign
 */

import { getRequestAuthContext } from "../lib/auth.mjs";
import { getSql } from "../lib/db.mjs";
import { sanitizeErrorForClient } from "../lib/ai/retry.mjs";
import { generateStructuredContent } from "../lib/ai/text-generation.mjs";
import { DEFAULT_TEXT_MODEL } from "../lib/ai/models.mjs";
import {
  campaignSchema,
  getToneText,
} from "../lib/ai/prompt-builders.mjs";
import {
  buildCampaignPrompt,
  buildQuantityInstructions,
} from "../helpers/campaign-prompts.mjs";
import {
  logAiUsage,
  createTimer,
} from "../helpers/usage-tracking.mjs";
import logger from "../lib/logger.mjs";

function normalizeCarouselSlides(carousels, expectedSlides) {
  if (!Array.isArray(carousels)) return [];

  return carousels
    .filter((carousel) => carousel && typeof carousel === "object")
    .map((carousel) => {
      const rawSlides = Array.isArray(carousel.slides) ? carousel.slides : [];
      const sanitized = rawSlides
        .filter((slide) => slide && typeof slide === "object")
        .map((slide) => ({
          visual: String(slide.visual || "").trim(),
          text: String(slide.text || "").trim(),
        }));

      const normalized = sanitized.slice(0, expectedSlides).map((slide, index) => ({
        slide: index + 1,
        visual:
          slide.visual ||
          `Composição premium com cores da marca para o slide ${index + 1}`,
        text: slide.text || `MENSAGEM ${index + 1}`,
      }));

      while (normalized.length < expectedSlides) {
        const slideNumber = normalized.length + 1;
        normalized.push({
          slide: slideNumber,
          visual: `Composição premium com cores da marca para o slide ${slideNumber}`,
          text: `MENSAGEM ${slideNumber}`,
        });
      }

      return {
        ...carousel,
        slides: normalized,
      };
    });
}

export function registerAiCampaignRoutes(app) {
  app.post("/api/ai/campaign", async (req, res) => {
    const timer = createTimer();
    const authCtx = getRequestAuthContext(req);
    const organizationId = authCtx?.orgId || null;
    const sql = getSql();

    try {
      const {
        brandProfile,
        transcript,
        options,
        productImages,
        inspirationImages,
        collabLogo,
        compositionAssets,
        toneOfVoiceOverride,
      } = req.body;

      if (!brandProfile || !transcript || !options) {
        return res.status(400).json({
          error: "brandProfile, transcript, and options are required",
        });
      }

      logger.info(
        {
          productImagesCount: productImages?.length || 0,
          inspirationImagesCount: inspirationImages?.length || 0,
          hasCollabLogo: !!collabLogo,
          compositionAssetsCount: compositionAssets?.length || 0,
          hasToneOverride: !!toneOfVoiceOverride,
        },
        "[Campaign API] Generating campaign",
      );

      // Collect all images for vision models
      const allImages = [];
      if (productImages) allImages.push(...productImages);
      if (inspirationImages) allImages.push(...inspirationImages);
      if (collabLogo) allImages.push(collabLogo);
      if (compositionAssets) allImages.push(...compositionAssets);

      // Normalize model: strip "google/" prefix if present (legacy brand profiles)
      const rawModel = brandProfile.creativeModel || DEFAULT_TEXT_MODEL;
      const model = rawModel.replace(/^google\//, "");

      const quantityInstructions = buildQuantityInstructions(options, "dev");
      const slidesPerCarousel = Math.max(
        1,
        Math.min(8, Number(options?.carousels?.slidesPerCarousel || 5)),
      );
      const effectiveBrandProfile = toneOfVoiceOverride
        ? { ...brandProfile, toneOfVoice: toneOfVoiceOverride }
        : brandProfile;
      const prompt = buildCampaignPrompt(
        effectiveBrandProfile,
        transcript,
        quantityInstructions,
        getToneText(effectiveBrandProfile, "campaigns"),
        slidesPerCarousel,
      );

      const parts = [{ text: prompt }];

      if (allImages.length > 0) {
        allImages.forEach((img) => {
          parts.push({
            inlineData: { mimeType: img.mimeType, data: img.base64 },
          });
        });
      }

      const result = await generateStructuredContent(
        model,
        parts,
        campaignSchema,
        0.7,
      );

      // Clean markdown code blocks if present
      let cleanResult = result.trim();
      if (cleanResult.startsWith("```json")) {
        cleanResult = cleanResult.slice(7);
      } else if (cleanResult.startsWith("```")) {
        cleanResult = cleanResult.slice(3);
      }
      if (cleanResult.endsWith("```")) {
        cleanResult = cleanResult.slice(0, -3);
      }
      cleanResult = cleanResult.trim();

      const campaign = JSON.parse(cleanResult);

      // Normalize field names (ensure arrays exist)
      campaign.posts = campaign.posts || [];
      campaign.adCreatives = campaign.adCreatives || campaign.ad_creatives || [];
      campaign.videoClipScripts =
        campaign.videoClipScripts || campaign.video_clip_scripts || [];

      // Validate videoClipScripts have required fields
      campaign.videoClipScripts = campaign.videoClipScripts
        .filter(
          (script) => script && script.title && script.hook && script.scenes,
        )
        .map((script) => ({
          ...script,
          title: script.title || "Sem título",
          hook: script.hook || "",
          scenes: script.scenes || [],
          image_prompt: script.image_prompt || "",
          audio_script: script.audio_script || "",
        }));

      campaign.carousels = normalizeCarouselSlides(
        campaign.carousels,
        slidesPerCarousel,
      );

      // Debug: log carousel summary (not raw data which is huge)
      logger.debug(
        {
          carouselsCount: campaign.carousels?.length || 0,
          carousels: campaign.carousels?.map((c) => ({
            title: c.title,
            slides: c.slides?.length || 0,
            hook: c.hook?.slice(0, 60),
          })),
        },
        "[Campaign API v2] Carousels from AI",
      );
      logger.debug(
        {
          hasPosts: !!campaign.posts,
          postsCount: campaign.posts?.length,
          hasAdCreatives: !!campaign.adCreatives,
          adCreativesCount: campaign.adCreatives?.length,
          hasVideoScripts: !!campaign.videoClipScripts,
          videoScriptsCount: campaign.videoClipScripts?.length,
          hasCarousels: !!campaign.carousels,
          carouselsCount: campaign.carousels?.length,
          hasProductImages: !!productImages?.length,
          productImagesCount: productImages?.length || 0,
          hasInspirationImages: !!inspirationImages?.length,
          inspirationImagesCount: inspirationImages?.length || 0,
          hasCollabLogo: !!collabLogo,
          compositionAssetsCount: compositionAssets?.length || 0,
          toneOverride: toneOfVoiceOverride || null,
        },
        "[Campaign API v2] Campaign structure",
      );

      logger.info({}, "[Campaign API] Campaign generated successfully");

      // Log AI usage
      const inputTokens = prompt.length / 4; // Estimate: ~4 chars per token
      const outputTokens = cleanResult.length / 4;
      await logAiUsage(sql, {
        organizationId,
        endpoint: "/api/ai/campaign",
        operation: "campaign",
        model,
        inputTokens: Math.round(inputTokens),
        outputTokens: Math.round(outputTokens),
        latencyMs: timer(),
        status: "success",
        metadata: {
          productImagesCount: productImages?.length || 0,
          inspirationImagesCount: inspirationImages?.length || 0,
          hasCollabLogo: !!collabLogo,
          postsCount: campaign.posts?.length || 0,
          videoScriptsCount: campaign.videoClipScripts?.length || 0,
        },
      });

      res.json({
        success: true,
        campaign,
        model,
      });
    } catch (error) {
      logger.error({ err: error }, "[Campaign API] Error");
      // Log failed usage
      await logAiUsage(sql, {
        organizationId,
        endpoint: "/api/ai/campaign",
        operation: "campaign",
        model: req.body?.brandProfile?.creativeModel || DEFAULT_TEXT_MODEL,
        latencyMs: timer(),
        status: "failed",
        error: error.message,
      }).catch(err => logger.warn({ err }, "Non-critical usage logging failed"));
      return res
        .status(500)
        .json({ error: sanitizeErrorForClient(error) });
    }
  });
}
