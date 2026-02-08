import { GoogleGenAI } from "@google/genai";
import {
  getTopics,
  createTopic,
  updateTopic,
  deleteTopic,
  getSessions,
  createSession,
  deleteSession,
  deleteGeneration,
  generateTopicTitle,
} from "../helpers/video-playground.mjs";

export function registerVideoPlaygroundRoutes(
  app,
  {
    getRequestAuthContext,
    getSql,
    resolveUserId,
    logger,
  },
) {
  // Get all topics
  app.get("/api/video-playground/topics", async (req, res) => {
    try {
      const auth = getRequestAuthContext(req);
      const userId = auth?.userId || null;
      const orgId = auth?.orgId || null;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const sql = getSql();
      const resolvedUserId = await resolveUserId(sql, userId);
      const topics = await getTopics(sql, resolvedUserId, orgId);

      res.json({ topics });
    } catch (error) {
      // Handle missing table gracefully
      if (error?.code === "42P01" || error?.code === "42703") {
        logger.warn(
          { err: error },
          "[VideoPlayground] Topics schema not ready - returning empty list",
        );
        return res.json({ topics: [] });
      }
      logger.error({ err: error }, "[VideoPlayground] Get topics error");
      res.status(500).json({ error: error.message });
    }
  });

  // Create topic
  app.post("/api/video-playground/topics", async (req, res) => {
    try {
      const auth = getRequestAuthContext(req);
      const userId = auth?.userId || null;
      const orgId = auth?.orgId || null;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { title } = req.body;
      const sql = getSql();
      const resolvedUserId = await resolveUserId(sql, userId);
      const topic = await createTopic(sql, resolvedUserId, orgId, title);

      res.json({ success: true, topic });
    } catch (error) {
      logger.error({ err: error }, "[VideoPlayground] Create topic error");
      res.status(500).json({ error: error.message });
    }
  });

  // Update topic
  app.patch("/api/video-playground/topics/:id", async (req, res) => {
    try {
      const auth = getRequestAuthContext(req);
      const userId = auth?.userId || null;
      const orgId = auth?.orgId || null;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { id } = req.params;
      const { title, coverUrl } = req.body;
      const sql = getSql();
      const resolvedUserId = await resolveUserId(sql, userId);
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
      res.status(500).json({ error: error.message });
    }
  });

  // Delete topic
  app.delete("/api/video-playground/topics/:id", async (req, res) => {
    try {
      const auth = getRequestAuthContext(req);
      const userId = auth?.userId || null;
      const orgId = auth?.orgId || null;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { id } = req.params;
      const sql = getSql();
      const resolvedUserId = await resolveUserId(sql, userId);
      await deleteTopic(sql, id, resolvedUserId, orgId);

      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, "[VideoPlayground] Delete topic error");
      res.status(500).json({ error: error.message });
    }
  });

  // Get sessions for topic
  app.get("/api/video-playground/sessions", async (req, res) => {
    try {
      const auth = getRequestAuthContext(req);
      const userId = auth?.userId || null;
      const orgId = auth?.orgId || null;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const topicId = String(req.query.topicId || "");
      if (!topicId) return res.status(400).json({ error: "topicId required" });
      const requestedLimit = Number.parseInt(String(req.query.limit || ""), 10);
      const limit = Number.isFinite(requestedLimit) ? requestedLimit : 100;

      const sql = getSql();
      const resolvedUserId = await resolveUserId(sql, userId);
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
      if (error?.code === "42P01" || error?.code === "42703") {
        logger.warn(
          { err: error },
          "[VideoPlayground] Sessions schema not ready - returning empty list",
        );
        return res.json({ sessions: [] });
      }
      logger.error({ err: error }, "[VideoPlayground] Get sessions error");
      res.status(500).json({ error: error.message });
    }
  });

  // Create video generation session (just the record, actual generation uses /api/ai/video)
  app.post("/api/video-playground/generate", async (req, res) => {
    try {
      const auth = getRequestAuthContext(req);
      const userId = auth?.userId || null;
      const orgId = auth?.orgId || null;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { topicId, model, prompt, aspectRatio, resolution, referenceImageUrl } = req.body;
      if (!topicId || !model || !prompt) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const sql = getSql();
      const resolvedUserId = await resolveUserId(sql, userId);

      const result = await createSession(
        sql,
        { topicId, model, prompt, aspectRatio, resolution, referenceImageUrl },
        resolvedUserId,
        orgId,
      );

      res.json({ success: true, data: result });
    } catch (error) {
      logger.error({ err: error }, "[VideoPlayground] Create session error");
      res.status(500).json({ error: error.message });
    }
  });

  // Delete session
  app.delete("/api/video-playground/sessions/:id", async (req, res) => {
    try {
      const auth = getRequestAuthContext(req);
      const userId = auth?.userId || null;
      const orgId = auth?.orgId || null;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { id } = req.params;
      const sql = getSql();
      const resolvedUserId = await resolveUserId(sql, userId);
      await deleteSession(sql, id, resolvedUserId, orgId);

      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, "[VideoPlayground] Delete session error");
      res.status(500).json({ error: error.message });
    }
  });

  // Delete generation
  app.delete("/api/video-playground/generations/:id", async (req, res) => {
    try {
      const auth = getRequestAuthContext(req);
      const userId = auth?.userId || null;
      const orgId = auth?.orgId || null;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { id } = req.params;
      const sql = getSql();
      const resolvedUserId = await resolveUserId(sql, userId);
      await deleteGeneration(sql, id, resolvedUserId, orgId);

      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, "[VideoPlayground] Delete generation error");
      res.status(500).json({ error: error.message });
    }
  });

  // Generate topic title
  app.post("/api/video-playground/generate-title", async (req, res) => {
    try {
      const auth = getRequestAuthContext(req);
      const userId = auth?.userId || null;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { prompts } = req.body;
      if (!prompts || !Array.isArray(prompts)) {
        return res.status(400).json({ error: "prompts array required" });
      }

      const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const title = await generateTopicTitle(prompts, genai);

      res.json({ title });
    } catch (error) {
      logger.error({ err: error }, "[VideoPlayground] Generate title error");
      res.status(500).json({ error: error.message });
    }
  });
}
