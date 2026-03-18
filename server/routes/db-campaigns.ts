import type { Express } from "express";
import { AppError, ValidationError, NotFoundError, DatabaseError } from "../lib/errors/index.js";
import {
  OrganizationAccessError,
  PermissionDeniedError,
} from "../helpers/organization-context.js";
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
} from "../services/campaigns-service.js";
import { validateRequest } from "../middleware/validate.js";
import {
  type CampaignCreateBody,
  type CampaignScenePatchBody,
  type CampaignScenePatchQuery,
  type CampaignsClipPatchBody,
  type CampaignsClipPatchQuery,
  type CampaignsDeleteQuery,
  type CampaignsQuery,
  type CarouselPatchBody,
  type CarouselPatchQuery,
  type CarouselSlidePatchBody,
  type CarouselSlidePatchQuery,
  type CarouselsQuery,
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
} from "../schemas/campaigns-schemas.js";

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function toDatabaseError(message: string, error: unknown): DatabaseError {
  if (error instanceof Error) {
    return new DatabaseError(message, error);
  }
  return new DatabaseError(message);
}

export function registerCampaignRoutes(app: Express): void {
  app.get("/api/db/campaigns", validateRequest({ query: campaignsQuerySchema }), async (req, res) => {
    try {
      const result = await getCampaigns(req.query as CampaignsQuery);
      return res.status(200).json(result);
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (
        error instanceof OrganizationAccessError ||
        error instanceof ValidationError
      ) {
        throw error;
      }
      throw toDatabaseError("Failed to fetch campaigns", error);
    }
  });

  app.post("/api/db/campaigns", validateRequest({ body: campaignCreateBodySchema }), async (req, res) => {
    try {
      const body = req.body as CampaignCreateBody;
      const result = await createCampaign({
        ...body,
        posts: body.posts?.map((post) => ({
          ...post,
          hashtags: Array.isArray(post.hashtags)
            ? post.hashtags
            : typeof post.hashtags === "string"
              ? post.hashtags
                  .split(/[,\s]+/)
                  .map((tag) => tag.trim())
                  .filter(Boolean)
              : undefined,
        })),
      });
      res.status(201).json(result);
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (
        error instanceof OrganizationAccessError ||
        error instanceof PermissionDeniedError ||
        error instanceof ValidationError ||
        error instanceof NotFoundError
      ) {
        throw error;
      }
      throw toDatabaseError("Failed to create campaign", error);
    }
  });

  app.delete("/api/db/campaigns", validateRequest({ query: campaignsDeleteQuerySchema }), async (req, res) => {
    try {
      const { id, user_id } = req.query as CampaignsDeleteQuery;
      const result = await deleteCampaign(id, user_id);
      res.status(200).json(result);
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof ValidationError) {
        throw new AppError(error.message, 400);
      }
      if (error instanceof NotFoundError) {
        throw new AppError("Campaign not found", 404);
      }
      if (
        error instanceof OrganizationAccessError ||
        error instanceof PermissionDeniedError
      ) {
        throw new AppError(error.message, 403);
      }
      logError("Campaigns API", toError(error));
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
      const { clip_id } = req.query as CampaignsClipPatchQuery;
      const { thumbnail_url } = req.body as CampaignsClipPatchBody;
      const result = await updateCampaignClipThumbnail(
        clip_id,
        thumbnail_url ?? null,
      );
      res.json(result);
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof ValidationError) {
        throw new AppError(error.message, 400);
      }
      if (error instanceof NotFoundError) {
        throw new AppError("Clip not found", 404);
      }
      logError("Campaigns API (PATCH clip)", toError(error));
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
      const { clip_id, scene_number } = req.query as CampaignScenePatchQuery;
      const { image_url } = req.body as CampaignScenePatchBody;
      const result = await updateCampaignSceneImage(
        clip_id,
        scene_number,
        image_url ?? null,
      );
      res.json(result);
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof ValidationError) {
        throw new AppError(error.message, 400);
      }
      if (error instanceof NotFoundError) {
        throw new AppError("Clip not found", 404);
      }
      logError("Campaigns API (PATCH scene)", toError(error));
      res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
    },
  );

  app.get("/api/db/carousels", validateRequest({ query: carouselsQuerySchema }), async (req, res) => {
    try {
      const result = await getCarousels(req.query as CarouselsQuery);
      res.json(result);
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (
        error instanceof OrganizationAccessError ||
        error instanceof ValidationError
      ) {
        return res.status(
          error instanceof ValidationError ? 400 : 403,
        ).json({ error: error.message });
      }
      logError("Carousels API (GET)", toError(error));
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
      const { id } = req.query as CarouselPatchQuery;
      const body = req.body as CarouselPatchBody;
      const result = await updateCarousel(id, body);
      res.json(result);
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof ValidationError) {
        throw new AppError(error.message, 400);
      }
      if (error instanceof NotFoundError) {
        throw new AppError("Carousel not found", 404);
      }
      logError("Carousels API (PATCH)", toError(error));
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
      const { carousel_id, slide_number } = req.query as CarouselSlidePatchQuery;
      const { image_url } = req.body as CarouselSlidePatchBody;
      const result = await updateCarouselSlideImage(
        carousel_id,
        slide_number,
        image_url ?? null,
      );
      res.json(result);
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof ValidationError) {
        throw new AppError(error.message, 400);
      }
      if (error instanceof NotFoundError) {
        throw new AppError("Carousel not found", 404);
      }
      logError("Carousels API (PATCH slide)", toError(error));
      res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
    },
  );
}
