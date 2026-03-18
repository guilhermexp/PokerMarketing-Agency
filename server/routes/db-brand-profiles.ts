import type { Express } from "express";
import {
  ValidationError,
  NotFoundError,
  DatabaseError,
} from "../lib/errors/index.js";
import {
  OrganizationAccessError,
  PermissionDeniedError,
} from "../helpers/organization-context.js";
import { logError } from "../lib/logging-helpers.js";
import { sanitizeErrorForClient } from "../lib/ai/retry.js";
import {
  getBrandProfile,
  createBrandProfile,
  updateBrandProfile,
} from "../services/brand-profiles-service.js";
import { validateRequest } from "../middleware/validate.js";
import {
  type BrandProfileCreateBody,
  type BrandProfileQuery,
  type BrandProfileUpdateBody,
  type BrandProfileUpdateQuery,
  brandProfileQuerySchema,
  brandProfileCreateBodySchema,
  brandProfileUpdateQuerySchema,
  brandProfileUpdateBodySchema,
} from "../schemas/brand-profiles-schemas.js";

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function toDatabaseError(message: string, error: unknown): DatabaseError {
  if (error instanceof Error) {
    return new DatabaseError(message, error);
  }
  return new DatabaseError(message);
}

export function registerBrandProfileRoutes(app: Express): void {
  app.get(
    "/api/db/brand-profiles",
    validateRequest({ query: brandProfileQuerySchema }),
    async (req, res) => {
    try {
      const result = await getBrandProfile(req.query as BrandProfileQuery);
      return res.json(result);
    } catch (error) {
      if (
        error instanceof OrganizationAccessError ||
        error instanceof ValidationError ||
        error instanceof PermissionDeniedError
      ) {
        throw error;
      }
      throw toDatabaseError("Failed to fetch brand profile", error);
    }
    },
  );

  app.post(
    "/api/db/brand-profiles",
    validateRequest({ body: brandProfileCreateBodySchema }),
    async (req, res) => {
    try {
      const result = await createBrandProfile(req.body as BrandProfileCreateBody);
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
      throw toDatabaseError("Failed to create brand profile", error);
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
      const { id } = req.query as BrandProfileUpdateQuery;
      const body = req.body as BrandProfileUpdateBody;
      const result = await updateBrandProfile(id, body);
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
      logError("Brand Profiles API", toError(error));
      res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
    },
  );
}
