import {
  ValidationError,
  NotFoundError,
  DatabaseError,
} from "../lib/errors/index.js";
import {
  OrganizationAccessError,
  PermissionDeniedError,
} from "../helpers/organization-context.mjs";
import { logError } from "../lib/logging-helpers.js";
import { sanitizeErrorForClient } from "../lib/ai/retry.js";
import {
  getCampaigns,
  createCampaign,
  deleteCampaign,
  updateCampaignClipThumbnail,
  updateCampaignSceneImage,
  getCarousels,
  updateCarousel,
  updateCarouselSlideImage,
} from "../services/campaigns-service.mjs";
import { validateRequest } from "../middleware/validate.mjs";
import {
  campaignsQuerySchema,
  campaignCreateBodySchema,
  campaignsDeleteQuerySchema,
  campaignsClipPatchQuerySchema,
  campaignsClipPatchBodySchema,
  campaignScenePatchQuerySchema,
  campaignScenePatchBodySchema,
  carouselsQuerySchema,
  carouselPatchQuerySchema,
  carouselPatchBodySchema,
  carouselSlidePatchQuerySchema,
  carouselSlidePatchBodySchema,
} from "../schemas/campaigns-schemas.mjs";

export function registerCampaignRoutes(app) {
  app.get("/api/db/campaigns", validateRequest({ query: campaignsQuerySchema }), async (req, res) => {
    try {
      const result = await getCampaigns(req.query);
      return res.status(200).json(result);
    } catch (error) {
      if (
        error instanceof OrganizationAccessError ||
        error instanceof ValidationError
      ) {
        throw error;
      }
      throw new DatabaseError("Failed to fetch campaigns", error);
    }
  });

  app.post("/api/db/campaigns", validateRequest({ body: campaignCreateBodySchema }), async (req, res) => {
    try {
      const result = await createCampaign(req.body);
      res.status(201).json(result);
    } catch (error) {
      if (
        error instanceof OrganizationAccessError ||
        error instanceof PermissionDeniedError ||
        error instanceof ValidationError ||
        error instanceof NotFoundError
      ) {
        throw error;
      }
      throw new DatabaseError("Failed to create campaign", error);
    }
  });

  app.delete("/api/db/campaigns", validateRequest({ query: campaignsDeleteQuerySchema }), async (req, res) => {
    try {
      const result = await deleteCampaign(req.query.id, req.query.user_id);
      res.status(200).json(result);
    } catch (error) {
      if (error instanceof ValidationError) {
        return res.status(400).json({ error: error.message });
      }
      if (error instanceof NotFoundError) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      if (
        error instanceof OrganizationAccessError ||
        error instanceof PermissionDeniedError
      ) {
        return res.status(403).json({ error: error.message });
      }
      logError("Campaigns API", error);
      res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
  });

  app.patch(
    "/api/db/campaigns",
    validateRequest({
      query: campaignsClipPatchQuerySchema,
      body: campaignsClipPatchBodySchema,
    }),
    async (req, res) => {
    try {
      const result = await updateCampaignClipThumbnail(
        req.query.clip_id,
        req.body.thumbnail_url,
      );
      res.json(result);
    } catch (error) {
      if (error instanceof ValidationError) {
        return res.status(400).json({ error: error.message });
      }
      if (error instanceof NotFoundError) {
        return res.status(404).json({ error: "Clip not found" });
      }
      logError("Campaigns API (PATCH clip)", error);
      res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
    },
  );

  app.patch(
    "/api/db/campaigns/scene",
    validateRequest({
      query: campaignScenePatchQuerySchema,
      body: campaignScenePatchBodySchema,
    }),
    async (req, res) => {
    try {
      const result = await updateCampaignSceneImage(
        req.query.clip_id,
        req.query.scene_number,
        req.body.image_url,
      );
      res.json(result);
    } catch (error) {
      if (error instanceof ValidationError) {
        return res.status(400).json({ error: error.message });
      }
      if (error instanceof NotFoundError) {
        return res.status(404).json({ error: "Clip not found" });
      }
      logError("Campaigns API (PATCH scene)", error);
      res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
    },
  );

  app.get("/api/db/carousels", validateRequest({ query: carouselsQuerySchema }), async (req, res) => {
    try {
      const result = await getCarousels(req.query);
      res.json(result);
    } catch (error) {
      if (
        error instanceof OrganizationAccessError ||
        error instanceof ValidationError
      ) {
        return res.status(
          error instanceof ValidationError ? 400 : 403,
        ).json({ error: error.message });
      }
      logError("Carousels API (GET)", error);
      res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
  });

  app.patch(
    "/api/db/carousels",
    validateRequest({
      query: carouselPatchQuerySchema,
      body: carouselPatchBodySchema,
    }),
    async (req, res) => {
    try {
      const result = await updateCarousel(req.query.id, req.body);
      res.json(result);
    } catch (error) {
      if (error instanceof ValidationError) {
        return res.status(400).json({ error: error.message });
      }
      if (error instanceof NotFoundError) {
        return res.status(404).json({ error: "Carousel not found" });
      }
      logError("Carousels API (PATCH)", error);
      res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
    },
  );

  app.patch(
    "/api/db/carousels/slide",
    validateRequest({
      query: carouselSlidePatchQuerySchema,
      body: carouselSlidePatchBodySchema,
    }),
    async (req, res) => {
    try {
      const result = await updateCarouselSlideImage(
        req.query.carousel_id,
        req.query.slide_number,
        req.body.image_url,
      );
      res.json(result);
    } catch (error) {
      if (error instanceof ValidationError) {
        return res.status(400).json({ error: error.message });
      }
      if (error instanceof NotFoundError) {
        return res.status(404).json({ error: "Carousel not found" });
      }
      logError("Carousels API (PATCH slide)", error);
      res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
    },
  );
}
