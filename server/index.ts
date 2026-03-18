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
import { initializeScheduledPostsChecker, waitForRedis, initializeImageGenerationWorker, registerImageGenerationProcessor } from "./helpers/job-queue.js";
import { checkAndPublishScheduledPosts, publishScheduledPostById } from "./helpers/scheduled-publisher.js";
import { generateImageWithFallback, type ImageReference } from "./lib/ai/image-generation.js";
import type { FallbackResult } from "./lib/ai/image-providers.js";
import type { BrandProfile } from "./lib/ai/prompt-builders.js";
import { put } from "@vercel/blob";
import { validateContentType } from "./lib/validation/contentType.js";

// ============================================================================
// TYPES
// ============================================================================

interface ImageGenerationJobData {
  userId: string;
  organizationId: string;
  prompt: string;
  brandProfile: BrandProfile | null;
  aspectRatio: string;
  imageSize: string;
  model: string;
  productImages?: ImageReference[];
  styleReferenceImage?: ImageReference;
  personReferenceImage?: ImageReference;
}

interface ImageGenerationResult {
  imageUrl: string | undefined;
  usedProvider: string;
  usedModel: string;
  usedFallback: boolean;
}

type ProgressCallback = (progress: number) => void;

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
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.path.startsWith("/api/") || req.path.includes(".")) {
    return next();
  }
  res.sendFile(path.join(distPath, "index.html"));
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
          brandProfile,
          aspectRatio,
          imageSize,
          model,
          productImages,
          styleReferenceImage,
          personReferenceImage,
        } = jobData;

        progressCallback(20);

        // Build prompt with brand context
        const { buildImagePrompt, convertImagePromptToJson } = await import("./lib/ai/prompt-builders.js");
        const { getSql } = await import("./lib/db.js");
        const sql = getSql();
        
        const jsonPrompt = await convertImagePromptToJson(
          prompt,
          aspectRatio,
          jobData.organizationId,
          sql,
        );
        
        const fullPrompt = buildImagePrompt(
          prompt,
          brandProfile,
          !!styleReferenceImage,
          !!(brandProfile?.logo || productImages?.length),
          !!personReferenceImage,
          !!productImages?.length,
          jsonPrompt,
        );

        progressCallback(40);

        // Generate image
        const result = await generateImageWithFallback(
          fullPrompt,
          aspectRatio,
          model,
          imageSize,
          productImages,
          styleReferenceImage,
          personReferenceImage,
        );

        progressCallback(80);

        // Upload to Vercel Blob if needed
        let finalImageUrl = result.imageUrl;
        if (result.imageUrl?.startsWith("data:")) {
          try {
            const matches = result.imageUrl.match(/^data:([^;]+);base64,(.+)$/);
            if (matches) {
              const contentType = matches[1];
              const buffer = Buffer.from(matches[2], "base64");
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
