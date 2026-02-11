/**
 * Unified API Server (development + production).
 *
 * Development entrypoint (`server/dev-api.mjs`) delegates to this file.
 * Production entrypoint (`server/index.mjs`) runs this file directly.
 *
 * Route handlers live in server/routes/*.mjs.
 * Shared helpers live in server/lib/*.mjs.
 */

// CRITICAL: This import auto-loads .env BEFORE other imports are evaluated
import "dotenv/config";

import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import { fileURLToPath } from "url";
import { clerkMiddleware } from "@clerk/express";
import { requestLogger } from "./middleware/requestLogger.mjs";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.mjs";
import { csrfProtection } from "./middleware/csrfProtection.mjs";
import logger from "./lib/logger.mjs";

// Lib imports (used in middleware/startup only)
import { DATABASE_URL, getSql, warmupDatabase, ensureGallerySourceType } from "./lib/db.mjs";
import { requireAuthenticatedRequest, enforceAuthenticatedIdentity, getRequestAuthContext, createRateLimitMiddleware } from "./lib/auth.mjs";
import { resourceAccessMiddleware } from "./lib/resource-access.mjs";
import { resolveUserId } from "./lib/user-resolver.mjs";
import { convertImagePromptToJson, buildImagePrompt } from "./lib/ai/prompt-builders.mjs";

// Startup dependencies
import { initializeScheduledPostsChecker, waitForRedis } from "./helpers/job-queue.mjs";
import { checkAndPublishScheduledPosts, publishScheduledPostById } from "./helpers/scheduled-publisher.mjs";

// ---------------------------------------------------------------------------
// Route modules
// ---------------------------------------------------------------------------
import { registerHealthRoutes } from "./routes/health.mjs";
import { registerAdminRoutes } from "./routes/admin.mjs";
import { registerInitRoutes } from "./routes/init.mjs";
import { registerUserRoutes } from "./routes/db-users.mjs";
import { registerBrandProfileRoutes } from "./routes/db-brand-profiles.mjs";
import { registerGalleryRoutes } from "./routes/db-gallery.mjs";
import { registerPostRoutes } from "./routes/db-posts.mjs";
import { registerScheduledPostRoutes } from "./routes/db-scheduled-posts.mjs";
import { registerCampaignRoutes } from "./routes/db-campaigns.mjs";
import { registerTournamentRoutes } from "./routes/db-tournaments.mjs";
import { registerGenerationJobRoutes } from "./routes/generation-jobs.mjs";
import { registerUploadRoutes } from "./routes/upload.mjs";
import { registerAiCampaignRoutes } from "./routes/ai-campaign.mjs";
import { registerAiTextRoutes } from "./routes/ai-text.mjs";
import { registerAiImageRoutes } from "./routes/ai-image.mjs";
import { registerAiSpeechRoutes } from "./routes/ai-speech.mjs";
import { registerAiAssistantRoutes } from "./routes/ai-assistant.mjs";
import { registerAiVideoRoutes } from "./routes/ai-video.mjs";
import { registerInstagramRoutes } from "./routes/db-instagram.mjs";
import { registerRubeRoutes } from "./routes/rube.mjs";
import { registerImagePlaygroundRoutes } from "./routes/image-playground.mjs";
import { registerVideoPlaygroundRoutes } from "./routes/video-playground.mjs";

// ---------------------------------------------------------------------------
// App creation & process handlers
// ---------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3002;

process.on("uncaughtException", (error) => {
  logger.fatal({ err: error }, "Uncaught exception in Production API");
  process.exit(1);
});

process.on("unhandledRejection", (error) => {
  logger.fatal({ err: error }, "Unhandled rejection in Production API");
  process.exit(1);
});

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------
const CORS_ORIGINS = (
  process.env.CORS_ORIGINS ||
  process.env.APP_URL ||
  "http://localhost:3010,http://127.0.0.1:3010,http://localhost:3000,http://127.0.0.1:3000"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (CORS_ORIGINS.includes(origin)) return callback(null, true);
      logger.warn({ origin }, "[CORS] Blocked request from unauthorized origin");
      return callback(new Error("Not allowed by CORS"));
    },
  }),
);

// ---------------------------------------------------------------------------
// Middleware stack
// ---------------------------------------------------------------------------
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
          "https://*.clerk.accounts.dev",
          "https://cdn.jsdelivr.net",
          "https://aistudiocdn.com",
        ],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        imgSrc: [
          "'self'",
          "data:",
          "blob:",
          "https://*.blob.vercel-storage.com",
          "https://*.public.blob.vercel-storage.com",
        ],
        connectSrc: [
          "'self'",
          "https://*.clerk.accounts.dev",
          "https://api.clerk.com",
          "https://*.blob.vercel-storage.com",
          "https://cdn.jsdelivr.net",
          "https://aistudiocdn.com",
          "wss:",
        ],
        fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'", "blob:", "https://*.blob.vercel-storage.com"],
        frameSrc: ["'self'", "https://*.clerk.accounts.dev"],
        workerSrc: ["'self'", "blob:"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
);

app.use(express.json({ limit: "50mb" }));
app.use(cookieParser());

app.use(
  clerkMiddleware({
    publishableKey: process.env.VITE_CLERK_PUBLISHABLE_KEY,
    secretKey: process.env.CLERK_SECRET_KEY,
  }),
);

// Internal auth bridge for server-to-server tool calls
const INTERNAL_API_TOKEN = process.env.INTERNAL_API_TOKEN;
const getHeaderValue = (value) => (Array.isArray(value) ? value[0] : value);

app.use((req, res, next) => {
  const token = getHeaderValue(req.headers["x-internal-token"]);
  if (INTERNAL_API_TOKEN && token === INTERNAL_API_TOKEN) {
    const userId =
      getHeaderValue(req.headers["x-internal-user-id"]) || req.body?.user_id;
    const orgId =
      getHeaderValue(req.headers["x-internal-org-id"]) ||
      req.body?.organization_id ||
      null;
    if (!userId) {
      return res.status(400).json({ error: "internal user id is required" });
    }
    req.internalAuth = { userId, orgId };
  }
  next();
});

app.use(requestLogger);

// Auth + CSRF protection on all protected API prefixes
const PROTECTED_API_PREFIXES = [
  "/api/db",
  "/api/ai",
  "/api/chat",
  "/api/generate",
  "/api/upload",
  "/api/proxy-video",
  "/api/rube",
  "/api/image-playground",
  "/api/video-playground",
  "/api/admin",
];

for (const prefix of PROTECTED_API_PREFIXES) {
  app.use(prefix, requireAuthenticatedRequest, enforceAuthenticatedIdentity, csrfProtection);
}

// Rate limiting for AI endpoints (applied after auth so identifier is available)
const aiRateLimit = createRateLimitMiddleware(30, 60_000);     // 30 req/min
const videoRateLimit = createRateLimitMiddleware(5, 60_000);   // 5 req/min (expensive)

app.use("/api/ai", aiRateLimit);
app.use("/api/chat", aiRateLimit);

// Stricter limits for expensive endpoints (video/campaign generation)
app.use("/api/ai/video", videoRateLimit);
app.use("/api/ai/campaign", videoRateLimit);

// Resource access middleware for DB routes
app.use("/api/db", resourceAccessMiddleware);

// ---------------------------------------------------------------------------
// Static files (production)
// ---------------------------------------------------------------------------
const distPath = path.join(__dirname, "../dist");
logger.info({ distPath }, "[Static] Serving static files");
app.use(express.static(distPath));

// ---------------------------------------------------------------------------
// Route registration (order matches original index.mjs)
// ---------------------------------------------------------------------------
registerHealthRoutes(app);
registerAdminRoutes(app);
registerInitRoutes(app);
registerUserRoutes(app);
registerBrandProfileRoutes(app);
registerGalleryRoutes(app);
registerPostRoutes(app);
registerScheduledPostRoutes(app);
registerCampaignRoutes(app);
registerTournamentRoutes(app);
registerGenerationJobRoutes(app);
registerUploadRoutes(app);
registerAiCampaignRoutes(app);
registerAiTextRoutes(app);
registerAiImageRoutes(app);
registerAiSpeechRoutes(app);
registerAiAssistantRoutes(app);
registerAiVideoRoutes(app);
registerInstagramRoutes(app);
registerRubeRoutes(app);

// Legacy playground routes (use context-passing pattern)
registerImagePlaygroundRoutes(app, {
  getRequestAuthContext,
  getSql,
  resolveUserId,
  logger,
  convertImagePromptToJson,
  buildImagePrompt,
});

registerVideoPlaygroundRoutes(app, {
  getRequestAuthContext,
  getSql,
  resolveUserId,
  logger,
});

// ---------------------------------------------------------------------------
// SPA catch-all + error handling (must be last!)
// ---------------------------------------------------------------------------
app.use((req, res, next) => {
  if (req.path.startsWith("/api/") || req.path.includes(".")) {
    return next();
  }
  res.sendFile(path.join(distPath, "index.html"));
});

app.use(notFoundHandler);
app.use(errorHandler);

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------
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
