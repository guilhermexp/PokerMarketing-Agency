/**
 * Server entrypoint (dev + production).
 *
 * Imports the Express app from app.mjs, runs startup tasks
 * (database warmup, Redis, scheduled-posts worker), serves
 * static files, and calls app.listen().
 */

import "dotenv/config";

import { validateEnv } from "./lib/env.js";
import path from "path";
import { fileURLToPath } from "url";
import express, { type Request, type Response, type NextFunction } from "express";
import app, { finalizeApp } from "./app.js";
import logger from "./lib/logger.js";
import { DATABASE_URL, getSql, warmupDatabase, ensureGallerySourceType } from "./lib/db.js";
import { initializeScheduledPostsChecker, waitForRedis, initializeImageGenerationWorker, registerImageGenerationProcessor, type ImageGenerationJobData as JobQueueImageData, type ImageGenerationResult as JobQueueImageResult, type ImageProgressCallback } from "./helpers/job-queue.js";
import { checkAndPublishScheduledPosts, publishScheduledPostById } from "./helpers/scheduled-publisher.js";
import { generateImageWithFallback, type ImageReference } from "./lib/ai/image-generation.js";
import type { FallbackResult } from "./lib/ai/image-providers.js";
import type { BrandProfile } from "./lib/ai/prompt-builders.js";
import { put } from "@vercel/blob";
import { validateContentType } from "./lib/validation/contentType.js";
import { injectNonceIntoHtml } from "./lib/spa-html.js";

// ============================================================================
// TYPES
// ============================================================================

// Re-export job queue types for local use
type ImageGenerationJobData = JobQueueImageData;
type ImageGenerationResult = JobQueueImageResult;
type ProgressCallback = ImageProgressCallback;

validateEnv();

// ---------------------------------------------------------------------------
// Process handlers (long-running only, not applicable in serverless)
// ---------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function isTransientRedisError(error: unknown): boolean {
  const msg = (error instanceof Error ? error.message : "") || "";
  return msg.includes("ECONNRESET") || msg.includes("ECONNREFUSED") || msg.includes("Connection is closed");
}

process.on("uncaughtException", (error: Error) => {
  if (isTransientRedisError(error)) return; // Redis is optional — ignore
  logger.fatal({ err: error }, "Uncaught exception in Production API");
  process.exit(1);
});

process.on("unhandledRejection", (error: unknown) => {
  if (isTransientRedisError(error)) return; // Redis is optional — ignore
  logger.fatal({ err: error }, "Unhandled rejection in Production API");
  process.exit(1);
});

// ---------------------------------------------------------------------------
// Static files (production — serves frontend from dist/)
// ---------------------------------------------------------------------------
const distPath = path.join(__dirname, "../dist");
logger.info({ distPath }, "[Static] Serving static files");
app.use(express.static(distPath));

// SPA catch-all (must come after static files but before error handlers)
app.use(async (req: Request, res: Response, next: NextFunction) => {
  if (req.path.startsWith("/api/") || req.path.includes(".")) {
    return next();
  }

  try {
    const { readFile } = await import("node:fs/promises");
    const html = await readFile(path.join(distPath, "index.html"), "utf8");
    const cspNonce =
      typeof res.locals.cspNonce === "string" ? res.locals.cspNonce : null;

    res
      .type("html")
      .send(cspNonce ? injectNonceIntoHtml(html, cspNonce) : html);
  } catch (error) {
    next(error);
  }
});

// Finalize: register notFoundHandler + errorHandler (must be last)
finalizeApp();

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 3002;

const startup = async () => {
  if (DATABASE_URL) {
    try {
      await warmupDatabase();
      const sql = getSql();
      await ensureGallerySourceType(sql);
    } catch (error) {
      logger.error("Startup check failed");
    }
  }

  logger.info({}, "Waiting for Redis");
  const redisConnected = await waitForRedis(5000);

  if (redisConnected) {
    logger.info({}, "Redis connected");
    
    // Initialize scheduled posts worker
    try {
      const worker = await initializeScheduledPostsChecker(
        checkAndPublishScheduledPosts,
        publishScheduledPostById,
      );
      if (worker) {
        logger.info({}, "Scheduled posts worker initialized");
      }
    } catch (error) {
      logger.error({ err: error }, "Failed to initialize scheduled posts worker");
    }

    // Initialize image generation worker
    try {
      // Register the processor function
      registerImageGenerationProcessor(async (jobData: ImageGenerationJobData, progressCallback: ProgressCallback): Promise<ImageGenerationResult> => {
        const {
          prompt,
          brandProfile: rawBrandProfile,
          aspectRatio: rawAspectRatio,
          imageSize: rawImageSize,
          model: rawModel,
          productImages: rawProductImages,
          styleReferenceImage: rawStyleRef,
          personReferenceImage: rawPersonRef,
        } = jobData;

        // Normalize optional fields with defaults
        const aspectRatio = rawAspectRatio || "1:1";
        const imageSize = rawImageSize || "1K";
        const model = rawModel || "gemini";

        // Cast brand profile to expected type (it's serialized JSON from the queue)
        const brandProfile = rawBrandProfile as BrandProfile | null | undefined;
        const brandHasLogo = brandProfile && typeof brandProfile === "object" && "logo" in brandProfile && !!brandProfile.logo;

        progressCallback(20);

        // Build prompt with brand context
        const { buildImagePrompt, convertImagePromptToJson } = await import("./lib/ai/prompt-builders.js");
        const { getSql } = await import("./lib/db.js");
        const sql = getSql();

        const jsonPrompt = await convertImagePromptToJson(
          prompt,
          aspectRatio,
          jobData.organizationId || null,
          sql,
        );

        const fullPrompt = buildImagePrompt(
          prompt,
          brandProfile,
          !!rawStyleRef,
          !!(brandHasLogo || (rawProductImages && rawProductImages.length > 0)),
          !!rawPersonRef,
          !!(rawProductImages && rawProductImages.length > 0),
          jsonPrompt,
        );

        progressCallback(40);

        // Generate image
        const result = await generateImageWithFallback(
          fullPrompt,
          aspectRatio,
          model,
          imageSize,
          undefined, // productImages - these are strings in job queue, not ImageReference
          undefined, // styleReferenceImage
          undefined, // personReferenceImage
        );

        progressCallback(80);

        // Upload to Vercel Blob if needed
        let finalImageUrl = result.imageUrl;
        if (result.imageUrl?.startsWith("data:")) {
          try {
            const matches = result.imageUrl.match(/^data:([^;]+);base64,(.+)$/);
            if (matches) {
              const contentType = matches[1] as string;
              const base64Data = matches[2] as string;
              const buffer = Buffer.from(base64Data, "base64");
              validateContentType(contentType);
              const ext = contentType.includes("png") ? "png" : "jpg";
              const filename = `generated-${Date.now()}.${ext}`;
              const blob = await put(filename, buffer, {
                access: "public",
                contentType,
              });
              finalImageUrl = blob.url;
            }
          } catch (uploadError) {
            logger.error({ err: uploadError }, "[ImageGenWorker] Blob upload failed");
          }
        }

        progressCallback(100);

        return {
          success: true,
          imageUrl: finalImageUrl,
          usedProvider: result.usedProvider,
          usedModel: result.usedModel,
          usedFallback: result.usedFallback,
        };
      });

      // Start the worker
      const imgWorker = await initializeImageGenerationWorker();
      if (imgWorker) {
        logger.info({}, "Image generation worker initialized");
      }
    } catch (error) {
      logger.error({ err: error }, "Failed to initialize image generation worker");
    }
  } else {
    logger.warn({}, "Redis not available - job processing disabled");
    logger.warn({}, "Scheduled posts using fallback mode (database polling)");
    logger.warn({}, "Image generation using synchronous mode only");
  }

  app.listen(PORT, () => {
    logger.info(
      { port: PORT, url: `http://localhost:${PORT}`, databaseConfigured: !!DATABASE_URL },
      "API Server started",
    );
  });
};

startup();
