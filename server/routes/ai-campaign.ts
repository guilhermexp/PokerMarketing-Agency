/**
 * AI Campaign Generation Route
 * Extracted from server/index.mjs
 *
 * Route: POST /api/ai/campaign
 */

import type { Application, Request, Response } from "express";
import { getRequestAuthContext } from "../lib/auth.js";
import { getSql } from "../lib/db.js";
import { sanitizeErrorForClient } from "../lib/ai/retry.js";
import { generateStructuredContent } from "../lib/ai/text-generation.js";
import { DEFAULT_TEXT_MODEL } from "../lib/ai/models.js";
import {
  campaignSchema,
  getToneText,
} from "../lib/ai/prompt-builders.js";
import {
  buildCampaignPrompt,
  buildQuantityInstructions,
} from "../helpers/campaign-prompts.js";
import {
  logAiUsage,
  createTimer,
} from "../helpers/usage-tracking.js";
import logger from "../lib/logger.js";
import { validateRequest } from "../middleware/validate.js";
import {
  type AiCampaignBody,
  aiCampaignBodySchema,
} from "../schemas/ai-schemas.js";

// ============================================================================
// TYPES
// ============================================================================

/** Base64-encoded image data */
interface ImageData {
  base64: string;
  mimeType: string;
}

/** Brand profile for AI campaign generation */
interface BrandProfile {
  name?: string;
  description?: string;
  primaryColor?: string;
  secondaryColor?: string;
  toneOfVoice?: string;
  creativeModel?: string;
  [key: string]: unknown;
}

/** Quantity option for campaign elements */
interface QuantityOption {
  count: number;
  generate: boolean;
  slidesPerCarousel?: number;
}

/** Platform-specific quantity options */
interface PlatformQuantityOptions {
  instagram?: QuantityOption;
  facebook?: QuantityOption;
  twitter?: QuantityOption;
  linkedin?: QuantityOption;
  google?: QuantityOption;
}

/** Campaign generation options */
interface CampaignOptions {
  videoClipScripts: QuantityOption;
  posts: PlatformQuantityOptions;
  adCreatives: PlatformQuantityOptions;
  carousels?: QuantityOption;
}

/** Request body for /api/ai/campaign */
/** Carousel slide structure */
interface CarouselSlide {
  slide: number;
  visual: string;
  text: string;
}

/** Raw carousel slide from AI response */
interface RawCarouselSlide {
  visual?: string;
  text?: string;
  [key: string]: unknown;
}

/** Carousel structure */
interface Carousel {
  title?: string;
  hook?: string;
  slides: CarouselSlide[];
  [key: string]: unknown;
}

/** Raw carousel from AI response */
interface RawCarousel {
  title?: string;
  hook?: string;
  slides?: RawCarouselSlide[];
  [key: string]: unknown;
}

/** Video clip script structure */
interface VideoClipScript {
  title: string;
  hook: string;
  scenes: unknown[];
  image_prompt: string;
  audio_script: string;
  [key: string]: unknown;
}

/** Raw video clip script from AI response */
interface RawVideoClipScript {
  title?: string;
  hook?: string;
  scenes?: unknown[];
  image_prompt?: string;
  audio_script?: string;
  [key: string]: unknown;
}

/** Campaign structure from AI response */
interface Campaign {
  posts: unknown[];
  adCreatives: unknown[];
  ad_creatives?: unknown[];
  videoClipScripts: VideoClipScript[];
  video_clip_scripts?: RawVideoClipScript[];
  carousels: Carousel[];
  [key: string]: unknown;
}

/** Text part for Gemini API */
interface TextPart {
  text: string;
}

/** Inline data part for Gemini API */
interface InlineDataPart {
  inlineData: {
    mimeType: string;
    data: string;
  };
}

/** Union type for Gemini content parts */
type ContentPart = TextPart | InlineDataPart;

function normalizeCarouselSlides(carousels: unknown, expectedSlides: number): Carousel[] {
  if (!Array.isArray(carousels)) return [];

  return carousels
    .filter((carousel): carousel is RawCarousel => carousel !== null && typeof carousel === "object")
    .map((carousel) => {
      const rawSlides = Array.isArray(carousel.slides) ? carousel.slides : [];
      const sanitized = rawSlides
        .filter((slide): slide is RawCarouselSlide => slide !== null && typeof slide === "object")
        .map((slide) => ({
          visual: String(slide.visual || "").trim(),
          text: String(slide.text || "").trim(),
        }));

      const normalized: CarouselSlide[] = sanitized.slice(0, expectedSlides).map((slide, index) => ({
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

export function registerAiCampaignRoutes(app: Application): void {
  app.post("/api/ai/campaign", validateRequest({ body: aiCampaignBodySchema }), async (req: Request, res: Response) => {
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
      } = req.body as AiCampaignBody;

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
      const allImages: ImageData[] = [];
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

      const parts: ContentPart[] = [{ text: prompt }];

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
        campaignSchema as unknown as Record<string, unknown>,
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

      const parsedCampaign = JSON.parse(cleanResult) as Partial<Campaign>;

      // Normalize field names (ensure arrays exist)
      const campaign: Campaign = {
        ...parsedCampaign,
        posts: parsedCampaign.posts || [],
        adCreatives: parsedCampaign.adCreatives || parsedCampaign.ad_creatives || [],
        videoClipScripts: [],
        carousels: [],
      };

      // Get raw video clip scripts from either field name
      const rawVideoScripts: RawVideoClipScript[] =
        (parsedCampaign.videoClipScripts as RawVideoClipScript[] | undefined) ||
        parsedCampaign.video_clip_scripts ||
        [];

      // Validate videoClipScripts have required fields
      campaign.videoClipScripts = rawVideoScripts
        .filter(
          (script): script is RawVideoClipScript =>
            script !== null &&
            typeof script === "object" &&
            Boolean(script.title) &&
            Boolean(script.hook) &&
            Boolean(script.scenes),
        )
        .map((script): VideoClipScript => ({
          ...script,
          title: script.title || "Sem título",
          hook: script.hook || "",
          scenes: script.scenes || [],
          image_prompt: script.image_prompt || "",
          audio_script: script.audio_script || "",
        }));

      campaign.carousels = normalizeCarouselSlides(
        parsedCampaign.carousels,
        slidesPerCarousel,
      );

      // Debug: log carousel summary (not raw data which is huge)
      logger.debug(
        {
          carouselsCount: campaign.carousels.length,
          carousels: campaign.carousels.map((c) => ({
            title: c.title,
            slides: c.slides.length,
            hook: c.hook?.slice(0, 60),
          })),
        },
        "[Campaign API v2] Carousels from AI",
      );
      logger.debug(
        {
          hasPosts: campaign.posts.length > 0,
          postsCount: campaign.posts.length,
          hasAdCreatives: campaign.adCreatives.length > 0,
          adCreativesCount: campaign.adCreatives.length,
          hasVideoScripts: campaign.videoClipScripts.length > 0,
          videoScriptsCount: campaign.videoClipScripts.length,
          hasCarousels: campaign.carousels.length > 0,
          carouselsCount: campaign.carousels.length,
          hasProductImages: (productImages?.length ?? 0) > 0,
          productImagesCount: productImages?.length ?? 0,
          hasInspirationImages: (inspirationImages?.length ?? 0) > 0,
          inspirationImagesCount: inspirationImages?.length ?? 0,
          hasCollabLogo: !!collabLogo,
          compositionAssetsCount: compositionAssets?.length ?? 0,
          toneOverride: toneOfVoiceOverride ?? null,
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
          productImagesCount: productImages?.length ?? 0,
          inspirationImagesCount: inspirationImages?.length ?? 0,
          hasCollabLogo: !!collabLogo,
          postsCount: campaign.posts.length,
          videoScriptsCount: campaign.videoClipScripts.length,
        },
      });

      res.json({
        success: true,
        campaign,
        model,
      });
    } catch (error) {
      const err = error as Error;
      logger.error({ err }, "[Campaign API] Error");
      // Log failed usage
      const body = req.body as AiCampaignBody | undefined;
      await logAiUsage(sql, {
        organizationId,
        endpoint: "/api/ai/campaign",
        operation: "campaign",
        model: body?.brandProfile?.creativeModel || DEFAULT_TEXT_MODEL,
        latencyMs: timer(),
        status: "error",
        error: err.message,
      }).catch(logErr => logger.warn({ err: logErr }, "Non-critical usage logging failed"));
      return res
        .status(500)
        .json({ error: sanitizeErrorForClient(error) });
    }
  });
}
