import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

function createNoopMiddleware() {
  return (_req: unknown, _res: unknown, next: () => void) => next();
}

describe("app security headers", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("sets the expected Helmet security headers", async () => {
    const loggerMock = {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };

    vi.doMock("better-auth/node", () => ({
      toNodeHandler: () => createNoopMiddleware(),
    }));
    vi.doMock("../../server/lib/better-auth.js", () => ({
      auth: {
        api: {
          getSession: vi.fn().mockResolvedValue(null),
        },
      },
    }));
    vi.doMock("../../server/lib/api-docs.js", () => ({
      registerApiDocs: vi.fn(),
    }));
    vi.doMock("../../server/middleware/requestLogger.js", () => ({
      requestLogger: createNoopMiddleware(),
    }));
    vi.doMock("../../server/middleware/errorHandler.js", () => ({
      errorHandler: createNoopMiddleware(),
      notFoundHandler: createNoopMiddleware(),
    }));
    vi.doMock("../../server/middleware/csrfProtection.js", () => ({
      csrfProtection: createNoopMiddleware(),
    }));
    vi.doMock("../../server/lib/logger.js", () => ({
      default: loggerMock,
      rawLogger: loggerMock,
    }));
    vi.doMock("../../server/lib/response-middleware.js", () => ({
      createResponseEnvelopeMiddleware: () => createNoopMiddleware(),
    }));
    vi.doMock("../../server/lib/db.js", () => ({
      getSql: vi.fn(),
    }));
    vi.doMock("../../server/lib/auth.js", () => ({
      requireAuthenticatedRequest: createNoopMiddleware(),
      enforceAuthenticatedIdentity: createNoopMiddleware(),
      getRequestAuthContext: vi.fn(() => null),
      createRateLimitMiddleware: () => createNoopMiddleware(),
    }));
    vi.doMock("../../server/lib/resource-access.js", () => ({
      resourceAccessMiddleware: createNoopMiddleware(),
    }));
    vi.doMock("../../server/lib/user-resolver.js", () => ({
      resolveUserId: vi.fn(),
    }));
    vi.doMock("../../server/lib/ai/prompt-builders.js", () => ({
      buildImagePrompt: vi.fn(() => ""),
    }));

    const registerHelmetProbeRoute = (path: string) =>
      vi.fn((app: { get: (route: string, handler: (req: unknown, res: { json: (body: unknown) => void }) => void) => void }) => {
        app.get(path, (_req, res) => {
          res.json({ ok: true });
        });
      });

    vi.doMock("../../server/routes/health.js", () => ({
      registerHealthRoutes: registerHelmetProbeRoute("/helmet-probe"),
    }));

    const noopRouteModule = { registerAdminRoutes: vi.fn(), registerInitRoutes: vi.fn() };
    vi.doMock("../../server/routes/admin.js", () => noopRouteModule);
    vi.doMock("../../server/routes/init.js", () => noopRouteModule);
    vi.doMock("../../server/routes/db-users.js", () => ({ registerUserRoutes: vi.fn() }));
    vi.doMock("../../server/routes/db-brand-profiles.js", () => ({ registerBrandProfileRoutes: vi.fn() }));
    vi.doMock("../../server/routes/db-gallery.js", () => ({ registerGalleryRoutes: vi.fn() }));
    vi.doMock("../../server/routes/db-posts.js", () => ({ registerPostRoutes: vi.fn() }));
    vi.doMock("../../server/routes/db-scheduled-posts.js", () => ({ registerScheduledPostRoutes: vi.fn() }));
    vi.doMock("../../server/routes/db-campaigns.js", () => ({ registerCampaignRoutes: vi.fn() }));
    vi.doMock("../../server/routes/db-tournaments.js", () => ({ registerTournamentRoutes: vi.fn() }));
    vi.doMock("../../server/routes/generation-jobs.js", () => ({ registerGenerationJobRoutes: vi.fn() }));
    vi.doMock("../../server/routes/upload.js", () => ({ registerUploadRoutes: vi.fn() }));
    vi.doMock("../../server/routes/ai-campaign.js", () => ({ registerAiCampaignRoutes: vi.fn() }));
    vi.doMock("../../server/routes/ai-text.js", () => ({ registerAiTextRoutes: vi.fn() }));
    vi.doMock("../../server/routes/ai-image.js", () => ({ registerAiImageRoutes: vi.fn() }));
    vi.doMock("../../server/routes/ai-speech.js", () => ({ registerAiSpeechRoutes: vi.fn() }));
    vi.doMock("../../server/routes/ai-assistant.js", () => ({ registerAiAssistantRoutes: vi.fn() }));
    vi.doMock("../../server/routes/ai-video.js", () => ({ registerAiVideoRoutes: vi.fn() }));
    vi.doMock("../../server/routes/db-instagram.js", () => ({ registerInstagramRoutes: vi.fn() }));
    vi.doMock("../../server/routes/rube.js", () => ({ registerRubeRoutes: vi.fn() }));
    vi.doMock("../../server/routes/image-playground.js", () => ({ registerImagePlaygroundRoutes: vi.fn() }));
    vi.doMock("../../server/routes/video-playground.js", () => ({ registerVideoPlaygroundRoutes: vi.fn() }));
    vi.doMock("../../server/routes/agent-studio.js", () => ({ registerAgentStudioRoutes: vi.fn() }));
    vi.doMock("../../server/routes/feedback.js", () => ({ registerFeedbackRoutes: vi.fn() }));

    const { default: app } = await import("../../server/app.js");

    const response = await request(app).get("/helmet-probe");

    expect(response.status).toBe(200);
    expect(response.headers["x-frame-options"]).toBe("DENY");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["strict-transport-security"]).toBe(
      "max-age=31536000; includeSubDomains",
    );
    expect(response.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  });
});
