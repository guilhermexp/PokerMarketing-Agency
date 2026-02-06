import { GoogleGenAI } from "@google/genai";
import { urlToBase64 } from "../helpers/image-helpers.mjs";
import {
  getTopics,
  createTopic,
  updateTopic,
  deleteTopic,
  getBatches,
  deleteBatch,
  deleteGeneration,
  getGenerationStatus,
  createImageBatch,
  generateTopicTitle,
} from "../helpers/image-playground.mjs";

export function registerImagePlaygroundRoutes(
  app,
  {
    getRequestAuthContext,
    getSql,
    resolveUserId,
    logger,
    convertImagePromptToJson,
    buildImagePrompt,
  },
) {
  // Get all topics
  app.get("/api/image-playground/topics", async (req, res) => {
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
      logger.error({ err: error }, "[ImagePlayground] Get topics error");
      res.status(500).json({ error: error.message });
    }
  });

  // Create topic
  app.post("/api/image-playground/topics", async (req, res) => {
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
      logger.error({ err: error }, "[ImagePlayground] Create topic error");
      res.status(500).json({ error: error.message });
    }
  });

  // Update topic
  app.patch("/api/image-playground/topics/:id", async (req, res) => {
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
      logger.error({ err: error }, "[ImagePlayground] Update topic error");
      res.status(500).json({ error: error.message });
    }
  });

  // Delete topic
  app.delete("/api/image-playground/topics/:id", async (req, res) => {
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
      logger.error({ err: error }, "[ImagePlayground] Delete topic error");
      res.status(500).json({ error: error.message });
    }
  });

  // Get batches for topic
  app.get("/api/image-playground/batches", async (req, res) => {
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
      const batches = await getBatches(
        sql,
        topicId,
        resolvedUserId,
        orgId,
        limit,
      );

      res.json({ batches });
    } catch (error) {
      if (
        typeof error?.message === "string" &&
        error.message.toLowerCase().includes("response is too large")
      ) {
        logger.warn(
          { err: error },
          "[ImagePlayground] Batches payload too large - returning empty list",
        );
        return res.json({ batches: [] });
      }
      if (error?.code === "42P01" || error?.code === "42703") {
        logger.warn(
          { err: error },
          "[ImagePlayground] Batches schema not ready - returning empty list",
        );
        return res.json({ batches: [] });
      }
      logger.error({ err: error }, "[ImagePlayground] Get batches error");
      res.status(500).json({ error: error.message });
    }
  });

  // Delete batch
  app.delete("/api/image-playground/batches/:id", async (req, res) => {
    try {
      const auth = getRequestAuthContext(req);
      const userId = auth?.userId || null;
      const orgId = auth?.orgId || null;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { id } = req.params;
      const sql = getSql();
      const resolvedUserId = await resolveUserId(sql, userId);
      await deleteBatch(sql, id, resolvedUserId, orgId);

      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, "[ImagePlayground] Delete batch error");
      res.status(500).json({ error: error.message });
    }
  });

  // Create image generation
  app.post("/api/image-playground/generate", async (req, res) => {
    try {
      const auth = getRequestAuthContext(req);
      const userId = auth?.userId || null;
      const orgId = auth?.orgId || null;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { topicId, provider, model, imageNum, params } = req.body;
      if (!topicId || !provider || !model || !params?.prompt) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const sql = getSql();
      const resolvedUserId = await resolveUserId(sql, userId);

      // Enhanced params to pass to helper
      let enhancedParams = { ...params };

      // If useBrandProfile is enabled, use SAME logic as /api/ai/image
      if (params.useBrandProfile) {
        const isOrgContext = !!orgId;
        const brandProfileResult = isOrgContext
          ? await sql`SELECT * FROM brand_profiles WHERE organization_id = ${orgId} AND deleted_at IS NULL LIMIT 1`
          : await sql`SELECT * FROM brand_profiles WHERE user_id = ${resolvedUserId} AND organization_id IS NULL AND deleted_at IS NULL LIMIT 1`;

        const brandProfile = brandProfileResult[0];
        if (brandProfile) {
          // Map DB columns to expected format (same as /api/ai/image)
          const mappedBrandProfile = {
            name: brandProfile.name,
            description: brandProfile.description,
            logo: brandProfile.logo_url,
            primaryColor: brandProfile.primary_color,
            secondaryColor: brandProfile.secondary_color,
            toneOfVoice: brandProfile.tone_of_voice,
            toneTargets: brandProfile.settings?.toneTargets || [
              "campaigns",
              "posts",
              "images",
              "flyers",
            ],
          };

          // 1. Prepare productImages with logo (same as /api/ai/image)
          let productImages = [];
          if (
            mappedBrandProfile.logo &&
            mappedBrandProfile.logo.startsWith("http")
          ) {
            try {
              const logoBase64 = await urlToBase64(mappedBrandProfile.logo);
              if (logoBase64) {
                logger.debug(
                  {},
                  "[ImagePlayground] Including brand logo from HTTP URL",
                );
                const mimeType = mappedBrandProfile.logo.includes(".svg")
                  ? "image/svg+xml"
                  : mappedBrandProfile.logo.includes(".jpg") ||
                      mappedBrandProfile.logo.includes(".jpeg")
                    ? "image/jpeg"
                    : "image/png";
                productImages.push({ base64: logoBase64, mimeType });
              }
            } catch (err) {
              logger.warn(
                { errorMessage: err.message },
                "[ImagePlayground] Failed to include brand logo",
              );
            }
          }

          // 2. Convert prompt to JSON structured format (same as /api/ai/image)
          const jsonPrompt = await convertImagePromptToJson(
            params.prompt,
            params.aspectRatio || "1:1",
            orgId,
            sql,
          );

          // 3. Build full prompt using buildImagePrompt (same as /api/ai/image)
          const hasLogo = productImages.length > 0;
          const fullPrompt = buildImagePrompt(
            params.prompt,
            mappedBrandProfile,
            false, // hasStyleReference
            hasLogo,
            false, // hasPersonReference
            false, // hasProductImages (beyond logo)
            jsonPrompt,
          );

          logger.debug({ fullPrompt }, "[ImagePlayground] Brand profile prompt");

          // 4. Update enhanced params with full prompt and product images
          enhancedParams = {
            ...params,
            prompt: fullPrompt,
            productImages: productImages.length > 0 ? productImages : undefined,
            brandProfile: mappedBrandProfile,
          };

          logger.info(
            { brandName: mappedBrandProfile.name, hasLogo },
            "[ImagePlayground] Brand profile applied",
          );
        }
      }

      // Initialize Gemini
      const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

      const result = await createImageBatch(
        sql,
        {
          topicId,
          provider,
          model,
          imageNum: imageNum || 1,
          params: enhancedParams,
        },
        resolvedUserId,
        orgId,
        genai,
      );

      res.json({ success: true, data: result });
    } catch (error) {
      if (req.destroyed || res.headersSent) {
        logger.warn(
          { err: error },
          "[ImagePlayground] Client disconnected during generate",
        );
        return;
      }
      logger.error({ err: error }, "[ImagePlayground] Generate error");
      res.status(500).json({ error: error.message });
    }
  });

  // Get generation status (for polling)
  app.get("/api/image-playground/status/:generationId", async (req, res) => {
    try {
      const auth = getRequestAuthContext(req);
      const userId = auth?.userId || null;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { generationId } = req.params;
      const { asyncTaskId } = req.query;

      const sql = getSql();
      const status = await getGenerationStatus(sql, generationId, asyncTaskId);

      res.json(status);
    } catch (error) {
      logger.error({ err: error }, "[ImagePlayground] Get status error");
      res.status(500).json({ error: error.message });
    }
  });

  // Delete generation
  app.delete("/api/image-playground/generations/:id", async (req, res) => {
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
      logger.error({ err: error }, "[ImagePlayground] Delete generation error");
      res.status(500).json({ error: error.message });
    }
  });

  // Generate topic title
  app.post("/api/image-playground/generate-title", async (req, res) => {
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
      logger.error({ err: error }, "[ImagePlayground] Generate title error");
      res.status(500).json({ error: error.message });
    }
  });
}
