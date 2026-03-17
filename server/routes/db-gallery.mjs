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
} from "../helpers/organization-context.mjs";
import { validateRequest } from "../middleware/validate.js";
import {
  listGallery,
  listDailyFlyers,
  createGalleryImage,
  updateGalleryImageRecord,
  deleteGalleryImageRecord,
} from "../services/gallery-service.mjs";
import {
  galleryListQuerySchema,
  galleryDailyFlyersQuerySchema,
  galleryCreateBodySchema,
  galleryPatchQuerySchema,
  galleryPatchBodySchema,
  galleryDeleteQuerySchema,
} from "../schemas/gallery-schemas.mjs";

export function registerGalleryRoutes(app) {
  app.get("/api/db/gallery", validateRequest({ query: galleryListQuerySchema }), async (req, res) => {
    try {
      const result = await listGallery(req.query);
      res.json(result);
    } catch (error) {
      if (
        error instanceof OrganizationAccessError ||
        error instanceof ValidationError
      ) {
        throw error;
      }
      throw new DatabaseError("Failed to fetch gallery images", error);
    }
  });

  app.get(
    "/api/db/gallery/daily-flyers",
    validateRequest({ query: galleryDailyFlyersQuerySchema }),
    async (req, res) => {
    try {
      const result = await listDailyFlyers(req.query);
      res.json(result);
    } catch (error) {
      if (error instanceof ValidationError) {
        return res.status(400).json({ error: error.message });
      }
      if (error instanceof OrganizationAccessError) {
        return res.status(403).json({ error: error.message });
      }
      logError("Gallery Daily Flyers API GET", error);
      res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
    },
  );

  app.post("/api/db/gallery", validateRequest({ body: galleryCreateBodySchema }), async (req, res) => {
    try {
      const result = await createGalleryImage(req.body);
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
      logError("Gallery API POST", error);
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
      const result = await updateGalleryImageRecord(req.query.id, req.body);
      return res.status(200).json(result);
    } catch (error) {
      if (error instanceof ValidationError) {
        return res.status(400).json({ error: error.message });
      }
      if (error instanceof NotFoundError) {
        return res.status(404).json({ error: "Gallery image not found" });
      }
      logError("Gallery API PATCH", error);
      res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
    },
  );

  app.delete(
    "/api/db/gallery",
    validateRequest({ query: galleryDeleteQuerySchema }),
    async (req, res) => {
    try {
      await deleteGalleryImageRecord(req.query.id, req.query.user_id);
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
      logError("Gallery API", error);
      res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
    },
  );
}
