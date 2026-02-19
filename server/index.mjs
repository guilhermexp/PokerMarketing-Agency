/**
 * Server entrypoint (dev + production).
 *
 * Imports the Express app from app.mjs, runs startup tasks
 * (database warmup, Redis, scheduled-posts worker), serves
 * static files, and calls app.listen().
 */

import "dotenv/config";

import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import app, { finalizeApp } from "./app.mjs";
import logger from "./lib/logger.mjs";
import { DATABASE_URL, getSql, warmupDatabase, ensureGallerySourceType } from "./lib/db.mjs";
import { initializeScheduledPostsChecker, waitForRedis } from "./helpers/job-queue.mjs";
import { checkAndPublishScheduledPosts, publishScheduledPostById } from "./helpers/scheduled-publisher.mjs";

// ---------------------------------------------------------------------------
// Process handlers (long-running only, not applicable in serverless)
// ---------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

process.on("uncaughtException", (error) => {
  logger.fatal({ err: error }, "Uncaught exception in Production API");
  process.exit(1);
});

process.on("unhandledRejection", (error) => {
  logger.fatal({ err: error }, "Unhandled rejection in Production API");
  process.exit(1);
});

// ---------------------------------------------------------------------------
// Static files (production — Railway serves frontend from dist/)
// ---------------------------------------------------------------------------
const distPath = path.join(__dirname, "../dist");
logger.info({ distPath }, "[Static] Serving static files");
app.use(express.static(distPath));

// SPA catch-all (must come after static files but before error handlers)
app.use((req, res, next) => {
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
  } else {
    logger.warn({}, "Redis not available - job processing disabled");
    logger.warn({}, "Scheduled posts using fallback mode (database polling)");
  }

  app.listen(PORT, () => {
    logger.info(
      { port: PORT, url: `http://localhost:${PORT}`, databaseConfigured: !!DATABASE_URL },
      "API Server started",
    );
  });
};

startup();
