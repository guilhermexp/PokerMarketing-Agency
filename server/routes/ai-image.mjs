/**
 * AI Image Generation Routes
 * Extracted from server/index.mjs
 *
 * Routes:
 *   POST /api/ai/image
 *   POST /api/ai/edit-image
 *   POST /api/ai/extract-colors
 */

import { getAuth } from "@clerk/express";
import { put } from "@vercel/blob";
import { getSql } from "../lib/db.mjs";
import { getGeminiAi } from "../lib/ai/clients.mjs";
import {
  withRetry,
  sanitizeErrorForClient,
  isQuotaOrRateLimitError,
} from "../lib/ai/retry.mjs";
import {
  generateImageWithFallback,
  DEFAULT_IMAGE_MODEL,
} from "../lib/ai/image-generation.mjs";
import { editImageWithFal, FAL_EDIT_MODEL } from "../lib/ai/fal-image-generation.mjs";
import {
  buildImagePrompt,
  convertImagePromptToJson,
  Type,
  DEFAULT_TEXT_MODEL,
} from "../lib/ai/prompt-builders.mjs";
import {
  logAiUsage,
  extractGeminiTokens,
  createTimer,
} from "../helpers/usage-tracking.mjs";
import { urlToBase64 } from "../helpers/image-helpers.mjs";
import { validateContentType } from "../lib/validation/contentType.mjs";
import logger from "../lib/logger.mjs";

export function registerAiImageRoutes(app) {
  // -------------------------------------------------------------------------
  // POST /api/ai/image
  // -------------------------------------------------------------------------
  app.post("/api/ai/image", async (req, res) => {
    const timer = createTimer();
    const auth = getAuth(req);
    const userId = auth?.userId;
    const organizationId = auth?.orgId || null;
    const sql = getSql();

    logger.info(
      { userId, organizationId: organizationId || "personal" },
      "[Image API] Nova requisição de geração de imagem",
    );

    try {
      const {
        prompt,
        brandProfile,
        aspectRatio = "1:1",
        imageSize = "1K",
        productImages,
        styleReferenceImage,
        personReferenceImage,
      } = req.body;
      const model = DEFAULT_IMAGE_MODEL;

      logger.debug(
        {
          promptLength: prompt?.length || 0,
          aspectRatio,
          imageSize,
          model,
          hasBrandProfile: !!brandProfile,
          brandProfileName: brandProfile?.name,
          hasBrandLogo: !!brandProfile?.logo,
          hasColors: !!brandProfile?.colors,
          productImagesCount: productImages?.length || 0,
          hasStyleReference: !!styleReferenceImage,
          hasPersonReference: !!personReferenceImage,
        },
        "[Image API] Parâmetros recebidos",
      );

      if (!prompt || !brandProfile) {
        logger.error(
          "[Image API] ❌ Validação falhou: prompt ou brandProfile ausente",
        );
        return res
          .status(400)
          .json({ error: "prompt and brandProfile are required" });
      }

      // Prepare product images array, including brand logo if available
      let allProductImages = productImages ? [...productImages] : [];

      // Auto-include brand logo as reference if it's an HTTP URL
      // (Frontend handles data URLs, server handles HTTP URLs)
      if (brandProfile.logo && brandProfile.logo.startsWith("http")) {
        try {
          const logoBase64 = await urlToBase64(brandProfile.logo);
          if (logoBase64) {
            logger.debug({}, "[Image API] Including brand logo from HTTP URL");
            // Detect mime type from URL or default to png
            const mimeType = brandProfile.logo.includes(".svg")
              ? "image/svg+xml"
              : brandProfile.logo.includes(".jpg") ||
                  brandProfile.logo.includes(".jpeg")
                ? "image/jpeg"
                : "image/png";
            allProductImages.unshift({ base64: logoBase64, mimeType });
          }
        } catch (err) {
          logger.warn(
            { errorMessage: err.message },
            "[Image API] Failed to include brand logo",
          );
        }
      }

      const hasLogo = !!brandProfile.logo && allProductImages.length > 0;
      const hasPersonReference = !!personReferenceImage;
      const jsonPrompt = await convertImagePromptToJson(
        prompt,
        aspectRatio,
        organizationId,
        sql,
      );
      const fullPrompt = buildImagePrompt(
        prompt,
        brandProfile,
        !!styleReferenceImage,
        hasLogo,
        hasPersonReference,
        !!productImages?.length,
        jsonPrompt,
      );

      logger.debug({ fullPrompt }, "[Image API] Prompt completo");

      logger.debug(
        {
          model,
          aspectRatio,
          imageSize,
          productImagesCount: allProductImages.length,
        },
        "[Image API] Chamando generateImageWithFallback",
      );

      const result = await generateImageWithFallback(
        fullPrompt,
        aspectRatio,
        model,
        imageSize,
        allProductImages.length > 0 ? allProductImages : undefined,
        styleReferenceImage,
        personReferenceImage,
      );

      logger.info(
        {
          provider: result.usedProvider,
          imageUrlLength: result.imageUrl?.length || 0,
        },
        "[Image API] Imagem gerada com sucesso",
      );

      // Upload to Vercel Blob for all providers
      let finalImageUrl = result.imageUrl;
      if (result.imageUrl) {
        logger.debug(
          {},
          `[Image API] Uploading ${result.usedProvider} image to Vercel Blob`,
        );
        try {
          let imageBuffer;
          let contentType;

          if (result.imageUrl.startsWith("data:")) {
            // Handle data URL (from Gemini)
            const matches = result.imageUrl.match(/^data:([^;]+);base64,(.+)$/);
            if (!matches) {
              throw new Error("Invalid data URL format");
            }
            contentType = matches[1];
            imageBuffer = Buffer.from(matches[2], "base64");
          } else {
            // Handle HTTP URL (from FAL.ai fallback)
            const imageResponse = await fetch(result.imageUrl);
            if (!imageResponse.ok) {
              throw new Error(`Failed to fetch image: ${imageResponse.status}`);
            }
            imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
            contentType =
              imageResponse.headers.get("content-type") || "image/png";
          }

          // SECURITY: Validate content type before storing in Vercel Blob
          validateContentType(contentType);

          const ext = contentType.includes("png") ? "png" : "jpg";
          const filename = `generated-${Date.now()}.${ext}`;

          const blob = await put(filename, imageBuffer, {
            access: "public",
            contentType,
          });

          finalImageUrl = blob.url;
          logger.info(
            { blobUrl: blob.url },
            "[Image API] Uploaded to Vercel Blob",
          );
        } catch (uploadError) {
          logger.error(
            { err: uploadError },
            "[Image API] Failed to upload to Vercel Blob",
          );
          // Keep using the original URL/data URL as fallback
        }
      }

      // Log AI usage
      await logAiUsage(sql, {
        organizationId,
        endpoint: "/api/ai/image",
        operation: "image",
        model: result.usedModel,
        provider: result.usedProvider,
        imageCount: 1,
        imageSize: imageSize || "1K",
        latencyMs: timer(),
        status: "success",
        metadata: {
          aspectRatio,
          hasProductImages: !!productImages?.length,
          hasStyleRef: !!styleReferenceImage,
          fallbackUsed: result.usedFallback,
        },
      });

      const elapsedTime = timer();
      logger.info(
        { durationMs: elapsedTime },
        "[Image API] SUCESSO - Geração completa",
      );

      res.json({
        success: true,
        imageUrl: finalImageUrl,
        model,
      });
    } catch (error) {
      const elapsedTime = timer();
      logger.error(
        {
          err: error,
          elapsedTime,
          errorType: error.constructor.name,
          stack: error.stack,
        },
        `[Image API] ❌ ERRO após ${elapsedTime}ms`,
      );

      await logAiUsage(sql, {
        organizationId,
        endpoint: "/api/ai/image",
        operation: "image",
        model: DEFAULT_IMAGE_MODEL,
        latencyMs: elapsedTime,
        status: "failed",
        error: error.message,
      }).catch((logError) => {
        logger.error({ err: logError }, "[Image API] Falha ao logar erro no DB");
      });

      const statusCode = isQuotaOrRateLimitError(error) ? 429 : 500;
      return res
        .status(statusCode)
        .json({ error: sanitizeErrorForClient(error, "Falha ao gerar imagem. Tente novamente.") });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/ai/edit-image
  // -------------------------------------------------------------------------
  app.post("/api/ai/edit-image", async (req, res) => {
    const timer = createTimer();
    const auth = getAuth(req);
    const organizationId = auth?.orgId || null;
    const sql = getSql();

    try {
      const { image, prompt, mask, referenceImage } = req.body;

      if (!image || !prompt) {
        return res.status(400).json({ error: "image and prompt are required" });
      }

      logger.info(
        {
          imageSize: image?.base64?.length,
          mimeType: image?.mimeType,
          promptLength: prompt?.length,
          hasMask: !!mask,
          hasReference: !!referenceImage,
        },
        "[Edit Image API] Editing image",
      );

      const ai = getGeminiAi();
      // Usar prompt direto sem adicionar texto extra que pode confundir o modelo
      const instructionPrompt = prompt;

      // Validate and clean base64 data
      let cleanBase64 = image.base64;
      if (cleanBase64.startsWith("data:")) {
        cleanBase64 = cleanBase64.split(",")[1];
      }
      // Check for valid base64
      if (cleanBase64.length % 4 !== 0) {
        logger.debug(
          {},
          "[Edit Image API] Base64 length is not multiple of 4, padding",
        );
        cleanBase64 = cleanBase64.padEnd(
          Math.ceil(cleanBase64.length / 4) * 4,
          "=",
        );
      }

      logger.debug(
        {
          textLength: instructionPrompt.length,
          imageBase64Length: cleanBase64.length,
          mimeType: image.mimeType,
          partsCount: 2 + !!mask + !!referenceImage,
        },
        "[Edit Image API] Parts structure",
      );

      const parts = [
        { text: instructionPrompt },
        { inlineData: { data: cleanBase64, mimeType: image.mimeType } },
      ];

      let imageConfig = { imageSize: "1K" };

      if (mask) {
        logger.debug(
          { maskSize: mask.base64?.length },
          "[Edit Image API] Adding mask",
        );
        imageConfig = {
          ...imageConfig,
          mask: {
            image: {
              inlineData: {
                data: mask.base64,
                mimeType: mask.mimeType || "image/png",
              },
            },
          },
        };
      }

      if (referenceImage) {
        parts.push({
          inlineData: {
            data: referenceImage.base64,
            mimeType: referenceImage.mimeType,
          },
        });
      }

      // Retry wrapper that also handles empty responses (Gemini sometimes returns
      // MALFORMED_FUNCTION_CALL with empty content — transient, retryable)
      let imageDataUrl = null;
      let usedProvider = "google";
      let usedModel = "gemini-3-pro-image-preview";

      try {
        const maxAttempts = 3;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          const response = await withRetry(() =>
            ai.models.generateContent({
              model: "gemini-3-pro-image-preview",
              contents: { parts },
              config: { imageConfig },
            }),
          );

          const contentParts = response.candidates?.[0]?.content?.parts;
          if (Array.isArray(contentParts)) {
            for (const part of contentParts) {
              if (part.inlineData) {
                imageDataUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                break;
              }
            }
          }

          if (imageDataUrl) break;

          const finishReason = response.candidates?.[0]?.finishReason;
          logger.warn(
            { attempt, maxAttempts, finishReason },
            "[Edit Image API] Empty response from Gemini, retrying",
          );
          if (attempt === maxAttempts) {
            logger.error({ response }, "[Edit Image API] All attempts returned empty");
            throw new Error("Failed to edit image - API returned empty response");
          }
          await new Promise((r) => setTimeout(r, 1000 * attempt));
        }
      } catch (geminiError) {
        if (isQuotaOrRateLimitError(geminiError)) {
          logger.warn(
            {},
            "[Edit Image API] Gemini quota exceeded, trying FAL.ai fallback",
          );

          const falUrl = await editImageWithFal(
            instructionPrompt,
            cleanBase64,
            image.mimeType,
            referenceImage,
          );

          // Fetch from FAL and convert to data URL
          const falResponse = await fetch(falUrl);
          if (!falResponse.ok) {
            throw new Error(`Failed to fetch FAL image: ${falResponse.status}`);
          }
          const falBuffer = Buffer.from(await falResponse.arrayBuffer());
          const falMimeType = falResponse.headers.get("content-type") || "image/png";
          imageDataUrl = `data:${falMimeType};base64,${falBuffer.toString("base64")}`;
          usedProvider = "fal";
          usedModel = FAL_EDIT_MODEL;

          logger.info({}, "[Edit Image API] FAL.ai fallback successful");
        } else {
          throw geminiError;
        }
      }

      logger.info({ provider: usedProvider }, "[Edit Image API] Image edited successfully");

      // Log AI usage
      await logAiUsage(sql, {
        organizationId,
        endpoint: "/api/ai/edit-image",
        operation: "edit_image",
        model: usedModel,
        provider: usedProvider,
        imageCount: 1,
        imageSize: "1K",
        latencyMs: timer(),
        status: "success",
        metadata: {
          hasMask: !!mask,
          hasReference: !!referenceImage,
          fallbackUsed: usedProvider !== "google",
        },
      });

      res.json({
        success: true,
        imageUrl: imageDataUrl,
      });
    } catch (error) {
      logger.error({ err: error }, "[Edit Image API] Error");
      await logAiUsage(sql, {
        organizationId,
        endpoint: "/api/ai/edit-image",
        operation: "edit_image",
        model: "gemini-3-pro-image-preview",
        latencyMs: timer(),
        status: "failed",
        error: error.message,
      }).catch(() => {});
      const statusCode = isQuotaOrRateLimitError(error) ? 429 : 500;
      return res
        .status(statusCode)
        .json({ error: sanitizeErrorForClient(error) });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/ai/extract-colors
  // -------------------------------------------------------------------------
  app.post("/api/ai/extract-colors", async (req, res) => {
    const timer = createTimer();
    const auth = getAuth(req);
    const organizationId = auth?.orgId || null;
    const sql = getSql();

    try {
      const { logo } = req.body;

      if (!logo) {
        return res.status(400).json({ error: "logo is required" });
      }

      logger.info({}, "[Extract Colors API] Analyzing logo");

      const ai = getGeminiAi();

      const colorSchema = {
        type: Type.OBJECT,
        properties: {
          primaryColor: { type: Type.STRING },
          secondaryColor: { type: Type.STRING, nullable: true },
          tertiaryColor: { type: Type.STRING, nullable: true },
        },
        required: ["primaryColor"],
      };

      const response = await withRetry(() =>
        ai.models.generateContent({
          model: DEFAULT_TEXT_MODEL,
          contents: {
            parts: [
              {
                text: `Analise este logo e extraia APENAS as cores que REALMENTE existem na imagem visível.

REGRAS IMPORTANTES:
- Extraia somente cores que você pode ver nos pixels da imagem
- NÃO invente cores que não existem
- Ignore áreas transparentes (não conte transparência como cor)
- Se o logo tiver apenas 1 cor visível, retorne null para secondaryColor e tertiaryColor
- Se o logo tiver apenas 2 cores visíveis, retorne null para tertiaryColor

PRIORIDADE DAS CORES:
- primaryColor: A cor mais dominante/presente no logo (maior área)
- secondaryColor: A segunda cor mais presente (se existir), ou null
- tertiaryColor: Uma terceira cor de destaque/acento (se existir), ou null

Retorne as cores em formato hexadecimal (#RRGGBB).`,
              },
              { inlineData: { mimeType: logo.mimeType, data: logo.base64 } },
            ],
          },
          config: {
            responseMimeType: "application/json",
            responseSchema: colorSchema,
          },
        }),
      );

      const colors = JSON.parse(response.text.trim());

      logger.info({ colors }, "[Extract Colors API] Colors extracted");

      // Log AI usage
      const tokens = extractGeminiTokens(response);
      await logAiUsage(sql, {
        organizationId,
        endpoint: "/api/ai/extract-colors",
        operation: "text",
        model: DEFAULT_TEXT_MODEL,
        inputTokens: tokens.inputTokens,
        outputTokens: tokens.outputTokens,
        latencyMs: timer(),
        status: "success",
      });

      res.json(colors);
    } catch (error) {
      logger.error({ err: error }, "[Extract Colors API] Error");
      await logAiUsage(sql, {
        organizationId,
        endpoint: "/api/ai/extract-colors",
        operation: "text",
        model: DEFAULT_TEXT_MODEL,
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
