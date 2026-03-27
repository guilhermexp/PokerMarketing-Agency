/**
 * Express app factory.
 *
 * This module creates and configures the Express app with all middleware and
 * routes but does NOT call app.listen(). That is left to server/index.mjs.
 */

import "dotenv/config";

import type { Request, Response, NextFunction } from "express";
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import crypto from "node:crypto";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/better-auth.js";
import { registerApiDocs } from "./lib/api-docs.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { csrfProtection } from "./middleware/csrfProtection.js";
import logger, { rawLogger } from "./lib/logger.js";
import { buildConnectSrcOrigins, buildScriptSrcOrigins } from "./lib/csp.js";
import { createResponseEnvelopeMiddleware } from "./lib/response-middleware.js";

// Lib imports (used in middleware only)
import { getSql } from "./lib/db.js";
import {
  requireAuthenticatedRequest,
  enforceAuthenticatedIdentity,
  getRequestAuthContext,
  createRateLimitMiddleware,
} from "./lib/auth.js";
import { resourceAccessMiddleware } from "./lib/resource-access.js";
import { resolveUserId } from "./lib/user-resolver.js";
import { buildImagePrompt } from "./lib/ai/prompt-builders.js";

// ---------------------------------------------------------------------------
// Route modules
// ---------------------------------------------------------------------------
import { registerHealthRoutes } from "./routes/health.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerInitRoutes } from "./routes/init.js";
import { registerUserRoutes } from "./routes/db-users.js";
import { registerBrandProfileRoutes } from "./routes/db-brand-profiles.js";
import { registerGalleryRoutes } from "./routes/db-gallery.js";
import { registerPostRoutes } from "./routes/db-posts.js";
import { registerScheduledPostRoutes } from "./routes/db-scheduled-posts.js";
import { registerCampaignRoutes } from "./routes/db-campaigns.js";
import { registerTournamentRoutes } from "./routes/db-tournaments.js";
import { registerGenerationJobRoutes } from "./routes/generation-jobs.js";
import { registerUploadRoutes } from "./routes/upload.js";
import { registerAiCampaignRoutes } from "./routes/ai-campaign.js";
import { registerAiTextRoutes } from "./routes/ai-text.js";
import { registerAiImageRoutes } from "./routes/ai-image.js";
import { registerAiSpeechRoutes } from "./routes/ai-speech.js";
import { registerAiAssistantRoutes } from "./routes/ai-assistant.js";
import { registerAiVideoRoutes } from "./routes/ai-video.js";
import { registerInstagramRoutes } from "./routes/db-instagram.js";
import { registerRubeRoutes } from "./routes/rube.js";
import { registerImagePlaygroundRoutes } from "./routes/image-playground.js";
import { registerVideoPlaygroundRoutes } from "./routes/video-playground.js";
import { registerAgentStudioRoutes } from "./routes/agent-studio.js";
import { registerFeedbackRoutes } from "./routes/feedback.js";
import { registerComposioRoutes } from "./routes/composio.js";

// ---------------------------------------------------------------------------
// App creation
// ---------------------------------------------------------------------------
const app = express();
const isProduction = process.env.NODE_ENV === "production";

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
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.locals.cspNonce = crypto.randomBytes(16).toString("base64");
  next();
});

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          ...buildScriptSrcOrigins(isProduction),
          (_req, res) =>
            `'nonce-${String((res as Response).locals.cspNonce)}'`,
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
        connectSrc: buildConnectSrcOrigins(),
        fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'", "blob:", "https://*.blob.vercel-storage.com"],
        frameSrc: ["'self'", "https://*.sociallab.pro"],
        workerSrc: ["'self'", "blob:"],
      },
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    strictTransportSecurity: {
      maxAge: 31536000,
      includeSubDomains: true,
    },
    xFrameOptions: { action: "deny" },
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
app.use(async (req: Request, _res: Response, next: NextFunction) => {
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
const getHeaderValue = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

app.use((req: Request, res: Response, next: NextFunction) => {
  const token = getHeaderValue(req.headers["x-internal-token"]);
  if (INTERNAL_API_TOKEN && token === INTERNAL_API_TOKEN) {
    const userId =
      getHeaderValue(req.headers["x-internal-user-id"]) ||
      (req.body as Record<string, unknown> | undefined)?.user_id;
    const orgId =
      getHeaderValue(req.headers["x-internal-org-id"]) ||
      (req.body as Record<string, unknown> | undefined)?.organization_id ||
      null;
    if (!userId || typeof userId !== "string") {
      res.status(400).json({ error: "internal user id is required" });
      return;
    }
    req.internalAuth = { userId, orgId: typeof orgId === "string" ? orgId : null };
  }
  next();
});

app.use(requestLogger);
app.use(createResponseEnvelopeMiddleware());

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
  "/api/feedback",
  "/api/composio",
];

for (const prefix of PROTECTED_API_PREFIXES) {
  app.use(prefix, requireAuthenticatedRequest, enforceAuthenticatedIdentity, csrfProtection);
}

// Rate limiting for AI endpoints (applied after auth so identifier is available)
const aiRateLimit = createRateLimitMiddleware(30, 60_000, "ai");     // 30 req/min
const videoRateLimit = createRateLimitMiddleware(5, 60_000, "ai:video");   // 5 req/min (expensive)

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
  logger: rawLogger,
  buildImagePrompt,
});

registerVideoPlaygroundRoutes(app, {
  getRequestAuthContext,
  getSql,
  resolveUserId,
  logger: rawLogger,
});
registerAgentStudioRoutes(app);
registerFeedbackRoutes(app);
registerComposioRoutes(app);
registerApiDocs(app);

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
