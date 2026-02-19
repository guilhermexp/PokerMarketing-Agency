/**
 * AI Campaign Generation Route
 * Extracted from server/index.mjs
 *
 * Route: POST /api/ai/campaign
 */

import { getAuth } from "@clerk/express";
import { getSql } from "../lib/db.mjs";
import { sanitizeErrorForClient } from "../lib/ai/retry.mjs";
import {
  generateStructuredContent,
  generateTextWithOpenRouter,
  generateTextWithOpenRouterVision,
} from "../lib/ai/image-generation.mjs";
import {
  campaignSchema,
  DEFAULT_TEXT_MODEL,
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
    const auth = getAuth(req);
    const organizationId = auth?.orgId || null;
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

      // Model selection - config in config/ai-models.ts
      // OpenRouter models have "/" in their ID (e.g., "openai/gpt-5.2")
      const model = brandProfile.creativeModel || DEFAULT_TEXT_MODEL;
      const isOpenRouter = model.includes("/");

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

      let result;

      if (isOpenRouter) {
        const slideExamples = Array.from({ length: slidesPerCarousel })
          .map((_, idx) => {
            const slideNumber = idx + 1;
            const role =
              slideNumber === 1
                ? "capa/título"
                : slideNumber === slidesPerCarousel
                  ? "CTA/final"
                  : "conteúdo";
            return `        {"slide": ${slideNumber}, "visual": "descrição visual detalhada do slide ${slideNumber} - ${role}", "text": "TEXTO CURTO EM MAIÚSCULAS"}`;
          })
          .join(",\n");

        // Add explicit JSON schema for OpenRouter models
        const jsonSchemaPrompt = `${prompt}

**FORMATO JSON OBRIGATÓRIO - TODOS OS CAMPOS SÃO OBRIGATÓRIOS:**

ATENÇÃO: Você DEVE gerar TODOS os 4 arrays: videoClipScripts, posts, adCreatives E carousels.
O campo "carousels" é OBRIGATÓRIO e NÃO pode ser omitido.

\`\`\`json
{
  "videoClipScripts": [
    {
      "title": "Título do vídeo",
      "hook": "Gancho inicial do vídeo",
      "scenes": [
        {"scene": 1, "visual": "descrição visual", "narration": "narração", "duration_seconds": 5}
      ],
      "image_prompt": "prompt para thumbnail com cores da marca, estilo cinematográfico",
      "audio_script": "script de áudio completo"
    }
  ],
  "posts": [
    {
      "platform": "Instagram|Facebook|Twitter|LinkedIn",
      "content": "texto do post",
      "hashtags": ["tag1", "tag2"],
      "image_prompt": "descrição da imagem com cores da marca, estilo cinematográfico"
    }
  ],
  "adCreatives": [
    {
      "platform": "Facebook|Google",
      "headline": "título do anúncio",
      "body": "corpo do anúncio",
      "cta": "call to action",
      "image_prompt": "descrição da imagem com cores da marca, estilo cinematográfico"
    }
  ],
  "carousels": [
    {
      "title": "Título do carrossel Instagram",
      "hook": "Gancho/abertura impactante do carrossel",
      "cover_prompt": "Imagem de capa cinematográfica com cores da marca, título em fonte bold condensed sans-serif, estilo luxuoso e premium, composição visual impactante",
      "slides": [
${slideExamples}
      ]
    }
  ]
}
\`\`\`

REGRAS CRÍTICAS:
1. O JSON DEVE conter EXATAMENTE os 4 arrays: videoClipScripts, posts, adCreatives, carousels
2. O array "carousels" NUNCA pode estar vazio - gere pelo menos 1 carrossel com EXATAMENTE ${slidesPerCarousel} slides
3. Responda APENAS com o JSON válido, sem texto adicional.`;

        const textParts = [jsonSchemaPrompt];

        if (allImages.length > 0) {
          result = await generateTextWithOpenRouterVision(
            model,
            textParts,
            allImages,
            0.7,
          );
        } else {
          result = await generateTextWithOpenRouter(
            model,
            "",
            jsonSchemaPrompt,
            0.7,
          );
        }
      } else {
        const parts = [{ text: prompt }];

        if (allImages.length > 0) {
          allImages.forEach((img) => {
            parts.push({
              inlineData: { mimeType: img.mimeType, data: img.base64 },
            });
          });
        }

        result = await generateStructuredContent(
          model,
          parts,
          campaignSchema,
          0.7,
        );
      }

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

      // Debug: log structure for troubleshooting (v2 - with carousels)
      logger.debug(
        { carousels: campaign.carousels },
        "[Campaign API v2] Raw carousels from AI",
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
      }).catch(() => {});
      return res
        .status(500)
        .json({ error: sanitizeErrorForClient(error) });
    }
  });
}
