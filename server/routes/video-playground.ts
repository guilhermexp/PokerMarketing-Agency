import type { Express, Request, Response } from "express";
import type { Logger } from "pino";
import type { SqlClient } from "../lib/db.js";
import type { AuthContext } from "../lib/auth.js";
import {
  getTopics,
  createTopic,
  updateTopic,
  deleteTopic,
  getSessions,
  createSession,
  deleteSession,
  deleteGeneration,
  updateGeneration,
  generateTopicTitle,
} from "../helpers/video-playground.js";
import { getGeminiAi } from "../lib/ai/clients.js";
import { sanitizeErrorForClient } from "../lib/ai/retry.js";
import { validateRequest } from "../middleware/validate.js";
import {
  type PlaygroundGenerateTitleBody,
  type PlaygroundIdParams,
  type PlaygroundTopicBody,
  type PlaygroundTopicUpdateBody,
  type VideoPlaygroundGenerationUpdateBody,
  type VideoPlaygroundGenerateBody,
  type VideoPlaygroundSessionsQuery,
  playgroundGenerateTitleBodySchema,
  playgroundIdParamsSchema,
  playgroundTopicBodySchema,
  playgroundTopicUpdateBodySchema,
  videoPlaygroundGenerationUpdateBodySchema,
  videoPlaygroundGenerateBodySchema,
  videoPlaygroundSessionsQuerySchema,
} from "../schemas/playground-schemas.js";

// =============================================================================
// Dependencies Interface
// =============================================================================

interface VideoPlaygroundDependencies {
  getRequestAuthContext: (req: Request) => AuthContext | null;
  getSql: () => SqlClient;
  resolveUserId: (sql: SqlClient, userId: string | null | undefined) => Promise<string | null>;
  logger: Logger;
}

// =============================================================================
// Request Body Interfaces
// =============================================================================

interface CreateTopicBody {
  title?: string;
}

interface UpdateTopicBody {
  title?: string;
  coverUrl?: string;
}

interface GenerateSessionBody {
  topicId: string;
  model: string;
  prompt: string;
  aspectRatio?: string;
  resolution?: string;
  referenceImageUrl?: string;
}

type GenerationStatus = "pending" | "generating" | "success" | "error";

interface UpdateGenerationBody {
  status?: GenerationStatus;
  videoUrl?: string;
  duration?: number;
  errorMessage?: string;
}

interface GenerateTitleBody {
  prompts: string[];
}

// =============================================================================
// Database Error Interface
// =============================================================================

interface DatabaseError extends Error {
  code?: string;
}

function isDatabaseError(error: unknown): error is DatabaseError {
  return error instanceof Error && "code" in error;
}

// =============================================================================
// Route Registration
// =============================================================================

export function registerVideoPlaygroundRoutes(
  app: Express,
  {
    getRequestAuthContext,
    getSql,
    resolveUserId,
    logger,
  }: VideoPlaygroundDependencies,
): void {
  // Get all topics
  app.get("/api/video-playground/topics", async (req: Request, res: Response) => {
    try {
      const auth = getRequestAuthContext(req);
      const userId = auth?.userId || null;
      const orgId = auth?.orgId || null;
      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const sql = getSql();
      const resolvedUserId = await resolveUserId(sql, userId);
      if (!resolvedUserId) {
        res.status(401).json({ error: "User not found" });
        return;
      }
      const topics = await getTopics(sql, resolvedUserId, orgId);

      res.json({ topics });
    } catch (error) {
      // Handle missing table gracefully
      if (isDatabaseError(error) && (error.code === "42P01" || error.code === "42703")) {
        logger.warn(
          { err: error },
          "[VideoPlayground] Topics schema not ready - returning empty list",
        );
        res.json({ topics: [] });
        return;
      }
      logger.error({ err: error }, "[VideoPlayground] Get topics error");
      res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
  });

  // Create topic
  app.post("/api/video-playground/topics", validateRequest({ body: playgroundTopicBodySchema }), async (req: Request, res: Response) => {
    try {
      const auth = getRequestAuthContext(req);
      const userId = auth?.userId || null;
      const orgId = auth?.orgId || null;
      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const { title } = req.body as PlaygroundTopicBody;
      const sql = getSql();
      const resolvedUserId = await resolveUserId(sql, userId);
      if (!resolvedUserId) {
        res.status(401).json({ error: "User not found" });
        return;
      }
      const topic = await createTopic(sql, resolvedUserId, orgId, title);

      res.json({ success: true, topic });
    } catch (error) {
      logger.error({ err: error }, "[VideoPlayground] Create topic error");
      res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
  });

  // Update topic
  app.patch("/api/video-playground/topics/:id", validateRequest({ params: playgroundIdParamsSchema, body: playgroundTopicUpdateBodySchema }), async (req: Request, res: Response) => {
    try {
      const auth = getRequestAuthContext(req);
      const userId = auth?.userId || null;
      const orgId = auth?.orgId || null;
      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const { id } = req.params as PlaygroundIdParams;
      const { title, coverUrl } = req.body as PlaygroundTopicUpdateBody;
      const sql = getSql();
      const resolvedUserId = await resolveUserId(sql, userId);
      if (!resolvedUserId) {
        res.status(401).json({ error: "User not found" });
        return;
      }
      const topic = await updateTopic(
        sql,
        id,
        resolvedUserId,
        { title, coverUrl },
        orgId,
      );

      res.json({ success: true, topic });
    } catch (error) {
      logger.error({ err: error }, "[VideoPlayground] Update topic error");
      res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
  });

  // Delete topic
  app.delete("/api/video-playground/topics/:id", validateRequest({ params: playgroundIdParamsSchema }), async (req: Request, res: Response) => {
    try {
      const auth = getRequestAuthContext(req);
      const userId = auth?.userId || null;
      const orgId = auth?.orgId || null;
      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const { id } = req.params as PlaygroundIdParams;
      const sql = getSql();
      const resolvedUserId = await resolveUserId(sql, userId);
      if (!resolvedUserId) {
        res.status(401).json({ error: "User not found" });
        return;
      }
      await deleteTopic(sql, id, resolvedUserId, orgId);

      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, "[VideoPlayground] Delete topic error");
      res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
  });

  // Get sessions for topic
  app.get("/api/video-playground/sessions", validateRequest({ query: videoPlaygroundSessionsQuerySchema }), async (req: Request, res: Response) => {
    try {
      const auth = getRequestAuthContext(req);
      const userId = auth?.userId || null;
      const orgId = auth?.orgId || null;
      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const { topicId, limit } = req.query as VideoPlaygroundSessionsQuery;

      const sql = getSql();
      const resolvedUserId = await resolveUserId(sql, userId);
      if (!resolvedUserId) {
        res.status(401).json({ error: "User not found" });
        return;
      }
      const sessions = await getSessions(
        sql,
        topicId,
        resolvedUserId,
        orgId,
        limit,
      );

      res.json({ sessions });
    } catch (error) {
      // Handle missing table gracefully
      if (isDatabaseError(error) && (error.code === "42P01" || error.code === "42703")) {
        logger.warn(
          { err: error },
          "[VideoPlayground] Sessions schema not ready - returning empty list",
        );
        res.json({ sessions: [] });
        return;
      }
      logger.error({ err: error }, "[VideoPlayground] Get sessions error");
      res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
  });

  // Create video generation session (just the record, actual generation uses /api/ai/video)
  app.post("/api/video-playground/generate", validateRequest({ body: videoPlaygroundGenerateBodySchema }), async (req: Request, res: Response) => {
    try {
      const auth = getRequestAuthContext(req);
      const userId = auth?.userId || null;
      const orgId = auth?.orgId || null;
      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const { topicId, model, prompt, aspectRatio, resolution, referenceImageUrl } = req.body as VideoPlaygroundGenerateBody;
      const sql = getSql();
      const resolvedUserId = await resolveUserId(sql, userId);
      if (!resolvedUserId) {
        res.status(401).json({ error: "User not found" });
        return;
      }

      const result = await createSession(
        sql,
        { topicId, model, prompt, aspectRatio, resolution, referenceImageUrl },
        resolvedUserId,
        orgId,
      );

      res.json({ success: true, data: result });
    } catch (error) {
      logger.error({ err: error }, "[VideoPlayground] Create session error");
      res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
  });

  // Delete session
  app.delete("/api/video-playground/sessions/:id", validateRequest({ params: playgroundIdParamsSchema }), async (req: Request, res: Response) => {
    try {
      const auth = getRequestAuthContext(req);
      const userId = auth?.userId || null;
      const orgId = auth?.orgId || null;
      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const { id } = req.params as PlaygroundIdParams;
      const sql = getSql();
      const resolvedUserId = await resolveUserId(sql, userId);
      if (!resolvedUserId) {
        res.status(401).json({ error: "User not found" });
        return;
      }
      await deleteSession(sql, id, resolvedUserId, orgId);

      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, "[VideoPlayground] Delete session error");
      res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
  });

  // Delete generation
  app.delete("/api/video-playground/generations/:id", validateRequest({ params: playgroundIdParamsSchema }), async (req: Request, res: Response) => {
    try {
      const auth = getRequestAuthContext(req);
      const userId = auth?.userId || null;
      const orgId = auth?.orgId || null;
      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const { id } = req.params as PlaygroundIdParams;
      const sql = getSql();
      const resolvedUserId = await resolveUserId(sql, userId);
      if (!resolvedUserId) {
        res.status(401).json({ error: "User not found" });
        return;
      }
      await deleteGeneration(sql, id, resolvedUserId, orgId);

      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, "[VideoPlayground] Delete generation error");
      res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
  });

  // Update generation (set video URL and status after generation completes)
  app.patch("/api/video-playground/generations/:id", validateRequest({ params: playgroundIdParamsSchema, body: videoPlaygroundGenerationUpdateBodySchema }), async (req: Request, res: Response) => {
    try {
      const auth = getRequestAuthContext(req);
      const userId = auth?.userId || null;
      const orgId = auth?.orgId || null;
      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const { id } = req.params as PlaygroundIdParams;
      const { status, videoUrl, duration, errorMessage } = req.body as VideoPlaygroundGenerationUpdateBody;

      const sql = getSql();
      const resolvedUserId = await resolveUserId(sql, userId);
      if (!resolvedUserId) {
        res.status(401).json({ error: "User not found" });
        return;
      }
      const generation = await updateGeneration(sql, id, { status, videoUrl, duration, errorMessage }, resolvedUserId, orgId);

      res.json({ success: true, generation });
    } catch (error) {
      logger.error({ err: error }, "[VideoPlayground] Update generation error");
      res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
  });

  // Generate topic title
  app.post("/api/video-playground/generate-title", validateRequest({ body: playgroundGenerateTitleBodySchema }), async (req: Request, res: Response) => {
    try {
      const auth = getRequestAuthContext(req);
      const userId = auth?.userId || null;
      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const { prompts } = req.body as PlaygroundGenerateTitleBody;

      const genai = getGeminiAi();
      const title = await generateTopicTitle(prompts, genai);

      res.json({ title });
    } catch (error) {
      logger.error({ err: error }, "[VideoPlayground] Generate title error");
      res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
  });
}
