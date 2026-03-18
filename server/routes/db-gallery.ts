import type { Express } from "express";
import {
  ValidationError,
  NotFoundError,
  DatabaseError,
} from "../lib/errors/index.js";
import { logError } from "../lib/logging-helpers.js";
import { sanitizeErrorForClient } from "../lib/ai/retry.js";
import {
  OrganizationAccessError,
  PermissionDeniedError,
} from "../helpers/organization-context.js";
import { validateRequest } from "../middleware/validate.js";
import {
  listGallery,
  listDailyFlyers,
  createGalleryImage,
  updateGalleryImageRecord,
  deleteGalleryImageRecord,
} from "../services/gallery-service.js";
import {
  type GalleryCreateBody,
  type GalleryDeleteQuery,
  type GalleryDailyFlyersQuery,
  type GalleryListQuery,
  type GalleryPatchBody,
  type GalleryPatchQuery,
  galleryListQuerySchema,
  galleryDailyFlyersQuerySchema,
  galleryCreateBodySchema,
  galleryPatchQuerySchema,
  galleryPatchBodySchema,
  galleryDeleteQuerySchema,
} from "../schemas/gallery-schemas.js";

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function toDatabaseError(message: string, error: unknown): DatabaseError {
  if (error instanceof Error) {
    return new DatabaseError(message, error);
  }
  return new DatabaseError(message);
}

export function registerGalleryRoutes(app: Express): void {
  app.get("/api/db/gallery", validateRequest({ query: galleryListQuerySchema }), async (req, res) => {
    try {
      const result = await listGallery(req.query as GalleryListQuery);
      res.json(result);
    } catch (error) {
      if (
        error instanceof OrganizationAccessError ||
        error instanceof ValidationError
      ) {
        throw error;
      }
      throw toDatabaseError("Failed to fetch gallery images", error);
    }
  });

  app.get(
    "/api/db/gallery/daily-flyers",
    validateRequest({ query: galleryDailyFlyersQuerySchema }),
    async (req, res) => {
    try {
      const result = await listDailyFlyers(req.query as GalleryDailyFlyersQuery);
      res.json(result);
    } catch (error) {
      if (error instanceof ValidationError) {
        return res.status(400).json({ error: error.message });
      }
      if (error instanceof OrganizationAccessError) {
        return res.status(403).json({ error: error.message });
      }
      logError("Gallery Daily Flyers API GET", toError(error));
      res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
    },
  );

  app.post("/api/db/gallery", validateRequest({ body: galleryCreateBodySchema }), async (req, res) => {
    try {
      const result = await createGalleryImage(req.body as GalleryCreateBody);
      res.status(201).json(result);
    } catch (error) {
      if (error instanceof ValidationError) {
        return res.status(400).json({ error: error.message });
      }
      if (
        error instanceof OrganizationAccessError ||
        error instanceof PermissionDeniedError
      ) {
        return res.status(403).json({ error: error.message });
      }
      logError("Gallery API POST", toError(error));
      res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
  });

  app.patch(
    "/api/db/gallery",
    validateRequest({
      query: galleryPatchQuerySchema,
      body: galleryPatchBodySchema,
    }),
    async (req, res) => {
    try {
      const { id } = req.query as GalleryPatchQuery;
      const body = req.body as GalleryPatchBody;
      const result = await updateGalleryImageRecord(id, {
        ...body,
        src_url: body.src_url ?? undefined,
        style_reference_name: body.style_reference_name ?? undefined,
      });
      return res.status(200).json(result);
    } catch (error) {
      if (error instanceof ValidationError) {
        return res.status(400).json({ error: error.message });
      }
      if (error instanceof NotFoundError) {
        return res.status(404).json({ error: "Gallery image not found" });
      }
      logError("Gallery API PATCH", toError(error));
      res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
    },
  );

  app.delete(
    "/api/db/gallery",
    validateRequest({ query: galleryDeleteQuerySchema }),
    async (req, res) => {
    try {
      const { id, user_id } = req.query as GalleryDeleteQuery;
      await deleteGalleryImageRecord(id, user_id);
      res.status(204).end();
    } catch (error) {
      if (error instanceof ValidationError) {
        return res.status(400).json({ error: error.message });
      }
      if (error instanceof NotFoundError) {
        return res.status(404).json({ error: "Image not found" });
      }
      if (
        error instanceof OrganizationAccessError ||
        error instanceof PermissionDeniedError
      ) {
        return res.status(403).json({ error: error.message });
      }
      logError("Gallery API", toError(error));
      res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
    },
  );
}
