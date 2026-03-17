import {
  ValidationError,
  NotFoundError,
  DatabaseError,
} from "../lib/errors/index.js";
import {
  OrganizationAccessError,
  PermissionDeniedError,
} from "../helpers/organization-context.mjs";
import { logError } from "../lib/logging-helpers.mjs";
import { sanitizeErrorForClient } from "../lib/ai/retry.js";
import {
  getBrandProfile,
  createBrandProfile,
  updateBrandProfile,
} from "../services/brand-profiles-service.mjs";
import { validateRequest } from "../middleware/validate.mjs";
import {
  brandProfileQuerySchema,
  brandProfileCreateBodySchema,
  brandProfileUpdateQuerySchema,
  brandProfileUpdateBodySchema,
} from "../schemas/brand-profiles-schemas.mjs";

export function registerBrandProfileRoutes(app) {
  app.get(
    "/api/db/brand-profiles",
    validateRequest({ query: brandProfileQuerySchema }),
    async (req, res) => {
    try {
      const result = await getBrandProfile(req.query);
      return res.json(result);
    } catch (error) {
      if (
        error instanceof OrganizationAccessError ||
        error instanceof ValidationError ||
        error instanceof PermissionDeniedError
      ) {
        throw error;
      }
      throw new DatabaseError("Failed to fetch brand profile", error);
    }
    },
  );

  app.post(
    "/api/db/brand-profiles",
    validateRequest({ body: brandProfileCreateBodySchema }),
    async (req, res) => {
    try {
      const result = await createBrandProfile(req.body);
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
      throw new DatabaseError("Failed to create brand profile", error);
    }
    },
  );

  app.put(
    "/api/db/brand-profiles",
    validateRequest({
      query: brandProfileUpdateQuerySchema,
      body: brandProfileUpdateBodySchema,
    }),
    async (req, res) => {
    try {
      const result = await updateBrandProfile(req.query.id, req.body);
      res.json(result);
    } catch (error) {
      if (error instanceof ValidationError) {
        return res.status(400).json({ error: error.message });
      }
      if (error instanceof NotFoundError) {
        return res.status(404).json({ error: "Brand profile not found" });
      }
      if (
        error instanceof OrganizationAccessError ||
        error instanceof PermissionDeniedError
      ) {
        return res.status(403).json({ error: error.message });
      }
      logError("Brand Profiles API", error);
      res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
    },
  );
}
