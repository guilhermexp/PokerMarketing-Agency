/**
 * Express app factory.
 *
 * This module creates and configures the Express app with all middleware and
 * routes but does NOT call app.listen(). That is left to server/index.mjs.
 */

import "dotenv/config";

import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/better-auth.mjs";
import { requestLogger } from "./middleware/requestLogger.mjs";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.mjs";
import { csrfProtection } from "./middleware/csrfProtection.mjs";
import logger from "./lib/logger.mjs";

// Lib imports (used in middleware only)
import { getSql } from "./lib/db.mjs";
import {
  requireAuthenticatedRequest,
  enforceAuthenticatedIdentity,
  getRequestAuthContext,
  createRateLimitMiddleware,
} from "./lib/auth.mjs";
import { resourceAccessMiddleware } from "./lib/resource-access.mjs";
import { resolveUserId } from "./lib/user-resolver.mjs";
import { buildImagePrompt } from "./lib/ai/prompt-builders.mjs";

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
import { registerAgentStudioRoutes } from "./routes/agent-studio.mjs";

// ---------------------------------------------------------------------------
// App creation
// ---------------------------------------------------------------------------
const app = express();

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
          "https://*.sociallab.pro",
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
          "https://*.googleusercontent.com",
        ],
        connectSrc: [
          "'self'",
          "https://*.sociallab.pro",
          "https://*.blob.vercel-storage.com",
          "https://cdn.jsdelivr.net",
          "https://aistudiocdn.com",
          "wss:",
        ],
        fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'", "blob:", "https://*.blob.vercel-storage.com"],
        frameSrc: ["'self'", "https://*.sociallab.pro"],
        workerSrc: ["'self'", "blob:"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
);

// Higher limit for routes that send base64 images in the JSON body
app.use(
  ["/api/image-playground/generate", "/api/ai/edit-image", "/api/ai/image"],
  express.json({ limit: "25mb" }),
);
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());

// Better Auth endpoints (sign-in, sign-up, session, org, etc.)
app.all("/api/auth/*splat", toNodeHandler(auth));

// Session extraction middleware (replaces clerkMiddleware)
app.use(async (req, _res, next) => {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    req.authSession = session; // { session, user } or null
  } catch {
    req.authSession = null;
  }
  next();
});

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
  "/api/agent",
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
app.use("/api/agent", aiRateLimit);

// Stricter limits for expensive endpoints (video/campaign generation)
app.use("/api/ai/video", videoRateLimit);
app.use("/api/ai/campaign", videoRateLimit);

// Resource access middleware for DB routes
app.use("/api/db", resourceAccessMiddleware);

// ---------------------------------------------------------------------------
// Route registration
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
  buildImagePrompt,
});

registerVideoPlaygroundRoutes(app, {
  getRequestAuthContext,
  getSql,
  resolveUserId,
  logger,
});
registerAgentStudioRoutes(app);

// ---------------------------------------------------------------------------
// NOTE: notFoundHandler & errorHandler are NOT registered here.
// Each entry point calls finalizeApp() after adding its own middleware
// (e.g. static files, SPA catch-all) so the error handlers come last.
// ---------------------------------------------------------------------------

/**
 * Register the final error-handling middleware.
 * Call this AFTER adding any entry-point-specific middleware
 * (static files, SPA catch-all, etc.).
 */
export function finalizeApp() {
  app.use(notFoundHandler);
  app.use(errorHandler);
}

export default app;
