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
import {
  withRetry,
  sanitizeErrorForClient,
  isQuotaOrRateLimitError,
} from "../lib/ai/retry.mjs";
import { generateTextFromMessages } from "../lib/ai/text-generation.mjs";
import {
  generateImageWithFallback,
  DEFAULT_IMAGE_MODEL,
} from "../lib/ai/image-generation.mjs";
import { runWithProviderFallback } from "../lib/ai/image-providers.mjs";
import { DEFAULT_TEXT_MODEL } from "../lib/ai/models.mjs";
import {
  buildImagePrompt,
  convertImagePromptToJson,
} from "../lib/ai/prompt-builders.mjs";
import {
  logAiUsage,
  createTimer,
} from "../helpers/usage-tracking.mjs";
import { urlToBase64 } from "../helpers/image-helpers.mjs";
import { validateContentType } from "../lib/validation/contentType.mjs";
import logger from "../lib/logger.mjs";
import {
  enqueueImageGeneration,
  enqueueImageGenerationBatch,
  getImageGenerationJobStatus,
  getUserImageGenerationJobs,
  cancelImageGenerationJob,
} from "../helpers/job-queue.mjs";

const SUPPORTED_IMAGE_MODELS = new Set([
  "gemini-3-pro-image-preview",
  "gemini-3.1-flash-image-preview",
  "gemini-2.5-flash-image",
  "gemini-25-flash-image",
  "nano-banana-2",
  "nano-banana",
  "nano-banana-pro",
  "google/nano-banana-2",
  "google/nano-banana",
  "google/nano-banana-pro",
]);

function normalizeRequestedImageModel(model) {
  if (typeof model !== "string") return DEFAULT_IMAGE_MODEL;
  const normalized = model.trim().toLowerCase();
  if (!SUPPORTED_IMAGE_MODELS.has(normalized)) {
    return DEFAULT_IMAGE_MODEL;
  }

  // Upgrade legacy standard IDs/aliases to Nano Banana 2 (Gemini 3.1 Flash Image preview)
  if (
    normalized === "gemini-25-flash-image" ||
    normalized === "gemini-2.5-flash-image"
  ) return "gemini-3.1-flash-image-preview";
  if (
    normalized === "nano-banana" ||
    normalized === "google/nano-banana" ||
    normalized === "google/nano-banana-2"
  ) return "nano-banana-2";
  if (normalized === "google/nano-banana-pro") return "nano-banana-pro";
  return normalized;
}

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
    let selectedModelForLogs = DEFAULT_IMAGE_MODEL;

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
        model: requestedModel,
        productImages,
        styleReferenceImage,
        personReferenceImage,
      } = req.body;
      const model = normalizeRequestedImageModel(requestedModel);
      selectedModelForLogs = model;

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
        model: selectedModelForLogs,
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

      logger.info({}, "[Edit Image API] Using provider chain");

      const result = await runWithProviderFallback("edit", {
        prompt: instructionPrompt,
        imageBase64: cleanBase64,
        mimeType: image.mimeType,
        referenceImage,
      });

      const { usedProvider, usedModel } = result;

      // Convert to data URL for the response (endpoint contract is data URL)
      let imageDataUrl;
      if (result.imageUrl.startsWith("data:")) {
        imageDataUrl = result.imageUrl;
      } else {
        // HTTP URL (from FAL.ai or Replicate) — fetch and convert to data URL
        const imgResponse = await fetch(result.imageUrl);
        if (!imgResponse.ok) {
          throw new Error(`Failed to fetch edited image: ${imgResponse.status}`);
        }
        const imgBuffer = Buffer.from(await imgResponse.arrayBuffer());
        const imgMimeType = imgResponse.headers.get("content-type") || "image/png";
        imageDataUrl = `data:${imgMimeType};base64,${imgBuffer.toString("base64")}`;
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
      }).catch(err => logger.warn({ err }, "Non-critical usage logging failed"));
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

      const { text, usage } = await withRetry(() =>
        generateTextFromMessages({
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
          jsonMode: true,
        }),
      );

      const colors = JSON.parse(text.trim());

      logger.info({ colors }, "[Extract Colors API] Colors extracted");

      // Log AI usage
      const inputTokens = usage.inputTokens || 0;
      const outputTokens = usage.outputTokens || 0;
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
      }).catch(err => logger.warn({ err }, "Non-critical usage logging failed"));
      return res
        .status(500)
        .json({ error: sanitizeErrorForClient(error) });
    }
  });

  // ============================================================================
  // ASYNC IMAGE GENERATION ROUTES (Queue-based)
  // ============================================================================

  // -------------------------------------------------------------------------
  // POST /api/ai/image/async - Queue a single image generation
  // -------------------------------------------------------------------------
  app.post("/api/ai/image/async", async (req, res) => {
    const authCtx = getRequestAuthContext(req);
    const userId = authCtx?.userId;
    const organizationId = authCtx?.orgId || null;

    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    try {
      const {
        prompt,
        brandProfile,
        aspectRatio = "1:1",
        imageSize = "1K",
        model: requestedModel,
        productImages,
        styleReferenceImage,
        personReferenceImage,
        priority,
      } = req.body;

      const model = normalizeRequestedImageModel(requestedModel);

      if (!prompt || !brandProfile) {
        return res.status(400).json({ error: "prompt and brandProfile are required" });
      }

      // Queue the job
      const result = await enqueueImageGeneration({
        userId,
        organizationId,
        prompt,
        brandProfile,
        aspectRatio,
        imageSize,
        model,
        productImages,
        styleReferenceImage,
        personReferenceImage,
      }, { priority });

      logger.info(
        { jobId: result.jobId, userId, queuePosition: result.queuePosition },
        "[Image Async] Job queued"
      );

      res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      logger.error({ err: error, userId }, "[Image Async] Failed to queue job");
      
      if (error.message.includes("Redis not available")) {
        return res.status(503).json({ 
          error: "Image queue temporarily unavailable. Use /api/ai/image for synchronous generation.",
          useSyncEndpoint: true 
        });
      }
      
      return res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/ai/image/async/batch - Queue multiple images
  // -------------------------------------------------------------------------
  app.post("/api/ai/image/async/batch", async (req, res) => {
    const authCtx = getRequestAuthContext(req);
    const userId = authCtx?.userId;
    const organizationId = authCtx?.orgId || null;

    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    try {
      const { jobs, priority } = req.body;

      if (!Array.isArray(jobs) || jobs.length === 0) {
        return res.status(400).json({ error: "jobs array is required" });
      }

      if (jobs.length > 10) {
        return res.status(400).json({ error: "Maximum 10 images per batch" });
      }

      // Add user context to each job
      const jobsWithContext = jobs.map(job => ({
        ...job,
        userId,
        organizationId,
        model: normalizeRequestedImageModel(job.model),
      }));

      const results = await enqueueImageGenerationBatch(jobsWithContext, { priority });

      const successCount = results.filter(r => !r.error).length;
      logger.info(
        { userId, batchSize: jobs.length, successCount },
        "[Image Async] Batch queued"
      );

      res.json({
        success: true,
        batchSize: jobs.length,
        queued: successCount,
        jobs: results,
      });
    } catch (error) {
      logger.error({ err: error, userId }, "[Image Async] Failed to queue batch");
      
      if (error.message.includes("Redis not available")) {
        return res.status(503).json({ 
          error: "Image queue temporarily unavailable. Use /api/ai/image for synchronous generation.",
          useSyncEndpoint: true 
        });
      }
      
      return res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/ai/image/async/status/:jobId - Check job status
  // -------------------------------------------------------------------------
  app.get("/api/ai/image/async/status/:jobId", async (req, res) => {
    const authCtx = getRequestAuthContext(req);
    const userId = authCtx?.userId;

    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    try {
      const { jobId } = req.params;
      const status = await getImageGenerationJobStatus(jobId);

      if (!status) {
        return res.status(404).json({ error: "Job not found" });
      }

      // Verify ownership
      if (status.data.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      res.json(status);
    } catch (error) {
      logger.error({ err: error, userId }, "[Image Async] Failed to get status");
      return res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/ai/image/async/jobs - List user's jobs
  // -------------------------------------------------------------------------
  app.get("/api/ai/image/async/jobs", async (req, res) => {
    const authCtx = getRequestAuthContext(req);
    const userId = authCtx?.userId;
    const organizationId = authCtx?.orgId || null;

    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    try {
      const limit = Math.min(parseInt(req.query.limit || '20', 10), 100);
      const jobs = await getUserImageGenerationJobs(userId, organizationId, limit);

      res.json({ jobs });
    } catch (error) {
      logger.error({ err: error, userId }, "[Image Async] Failed to list jobs");
      return res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
  });

  // -------------------------------------------------------------------------
  // DELETE /api/ai/image/async/cancel/:jobId - Cancel a job
  // -------------------------------------------------------------------------
  app.delete("/api/ai/image/async/cancel/:jobId", async (req, res) => {
    const authCtx = getRequestAuthContext(req);
    const userId = authCtx?.userId;

    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    try {
      const { jobId } = req.params;
      
      // Verify ownership first
      const status = await getImageGenerationJobStatus(jobId);
      if (!status) {
        return res.status(404).json({ error: "Job not found" });
      }
      if (status.data.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const cancelled = await cancelImageGenerationJob(jobId);

      if (cancelled) {
        res.json({ success: true, message: "Job cancelled" });
      } else {
        res.status(400).json({ success: false, message: "Job already completed or failed" });
      }
    } catch (error) {
      logger.error({ err: error, userId }, "[Image Async] Failed to cancel job");
      return res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
  });
}
