/**
 * AI Image Generation Routes
 * Extracted from server/index.mjs
 *
 * Routes:
 *   POST /api/ai/image
 *   POST /api/ai/edit-image
 *   POST /api/ai/extract-colors
 */

import { getRequestAuthContext } from "../lib/auth.mjs";
import { put } from "@vercel/blob";
import { getSql } from "../lib/db.mjs";
import { callOpenRouterApi } from "../lib/ai/clients.mjs";
import {
  withRetry,
  sanitizeErrorForClient,
  isQuotaOrRateLimitError,
} from "../lib/ai/retry.mjs";
// getGeminiAi — temporarily unused (Gemini image disabled)
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
    const authCtx = getRequestAuthContext(req);
    const userId = authCtx?.userId;
    const organizationId = authCtx?.orgId || null;
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

      // Log prompt as structured summary (not raw dump)
      const jsonMatch = fullPrompt.match(/```json\n([\s\S]*?)```/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[1]);
          logger.debug(
            {
              subject: parsed.subject,
              environment: parsed.environment,
              style: parsed.style?.slice(0, 80),
              text: parsed.text?.content,
              aspectRatio: parsed.output?.aspect_ratio,
              promptChars: fullPrompt.length,
              hasLogo,
              hasStyleRef: !!styleReferenceImage,
              hasPersonRef: hasPersonReference,
            },
            "[Image API] Prompt (JSON estruturado)",
          );
        } catch {
          logger.debug(
            { promptChars: fullPrompt.length, promptPreview: fullPrompt.slice(0, 200) },
            "[Image API] Prompt (parse falhou)",
          );
        }
      } else {
        logger.debug(
          { promptChars: fullPrompt.length, promptPreview: fullPrompt.slice(0, 200) },
          "[Image API] Prompt (texto livre)",
        );
      }

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
    const authCtx = getRequestAuthContext(req);
    const organizationId = authCtx?.orgId || null;
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

      const instructionPrompt = prompt;

      // Validate and clean base64 data
      let cleanBase64 = image.base64;
      if (cleanBase64.startsWith("data:")) {
        cleanBase64 = cleanBase64.split(",")[1];
      }
      if (cleanBase64.length % 4 !== 0) {
        cleanBase64 = cleanBase64.padEnd(
          Math.ceil(cleanBase64.length / 4) * 4,
          "=",
        );
      }

      // TODO: Gemini edit temporarily disabled — using FAL.ai directly.
      // To re-enable: restore Gemini parts/imageConfig/ai logic from git history.
      let imageDataUrl = null;
      let usedProvider = "fal";
      let usedModel = FAL_EDIT_MODEL;

      /*
      // --- Gemini edit (disabled) ---
      usedProvider = "google";
      usedModel = "gemini-3-pro-image-preview";
      try {
        const maxAttempts = 3;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          const response = await withRetry(
            () =>
              ai.models.generateContent({
                model: "gemini-3-pro-image-preview",
                contents: { parts },
                config: { imageConfig },
              }),
            1,
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
          logger.warn({ attempt, maxAttempts, finishReason }, "[Edit Image API] Empty response from Gemini, retrying");
          if (attempt === maxAttempts) throw new Error("Failed to edit image - API returned empty response");
          await new Promise((r) => setTimeout(r, 1000 * attempt));
        }
      } catch (geminiError) {
        if (!isQuotaOrRateLimitError(geminiError)) throw geminiError;
      }
      // --- End Gemini edit ---
      */

      logger.info({}, "[Edit Image API] Using FAL.ai directly (Gemini disabled)");

      const falUrl = await editImageWithFal(
        instructionPrompt,
        cleanBase64,
        image.mimeType,
        referenceImage,
      );

      const falResponse = await fetch(falUrl);
      if (!falResponse.ok) {
        throw new Error(`Failed to fetch FAL image: ${falResponse.status}`);
      }
      const falBuffer = Buffer.from(await falResponse.arrayBuffer());
      const falMimeType = falResponse.headers.get("content-type") || "image/png";
      imageDataUrl = `data:${falMimeType};base64,${falBuffer.toString("base64")}`;

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
    const authCtx = getRequestAuthContext(req);
    const organizationId = authCtx?.orgId || null;
    const sql = getSql();

    try {
      const { logo } = req.body;

      if (!logo) {
        return res.status(400).json({ error: "logo is required" });
      }

      logger.info({}, "[Extract Colors API] Analyzing logo");

      const colorPrompt = `Analise este logo e extraia APENAS as cores que REALMENTE existem na imagem visível.

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

Retorne as cores em formato hexadecimal (#RRGGBB).
Responda APENAS com JSON: {"primaryColor": "#...", "secondaryColor": "#..." ou null, "tertiaryColor": "#..." ou null}`;

      const data = await withRetry(() =>
        callOpenRouterApi({
          model: DEFAULT_TEXT_MODEL,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: colorPrompt },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:${logo.mimeType};base64,${logo.base64}`,
                  },
                },
              ],
            },
          ],
          response_format: { type: "json_object" },
        }),
      );

      const colors = JSON.parse(data.choices[0].message.content.trim());

      logger.info({ colors }, "[Extract Colors API] Colors extracted");

      // Log AI usage
      const inputTokens = data.usage?.prompt_tokens || 0;
      const outputTokens = data.usage?.completion_tokens || 0;
      await logAiUsage(sql, {
        organizationId,
        endpoint: "/api/ai/extract-colors",
        operation: "text",
        model: DEFAULT_TEXT_MODEL,
        inputTokens,
        outputTokens,
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
