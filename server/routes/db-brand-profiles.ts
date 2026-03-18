import type { Express, NextFunction } from "express";
import { AppError, ValidationError, NotFoundError, DatabaseError } from "../lib/errors/index.js";
import {
  OrganizationAccessError,
  PermissionDeniedError,
} from "../helpers/organization-context.js";
import { logError } from "../lib/logging-helpers.js";
import { sendError } from "../lib/response.js";
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
      if (error instanceof AppError) throw error;
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
      if (error instanceof AppError) throw error;
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
    async (req, res, next: NextFunction) => {
    try {
      const { id } = req.query as BrandProfileUpdateQuery;
      const body = req.body as BrandProfileUpdateBody;
      const result = await updateBrandProfile(id, body);
      res.json(result);
    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode);
        sendError(res, error);
        return;
      }
      if (error instanceof ValidationError) {
        res.status(400);
        sendError(res, new AppError(error.message, 400));
        return;
      }
      if (error instanceof NotFoundError) {
        res.status(404);
        sendError(res, new AppError("Brand profile not found", 404));
        return;
      }
      if (
        error instanceof OrganizationAccessError ||
        error instanceof PermissionDeniedError
      ) {
        res.status(403);
        sendError(res, new AppError(error.message, 403));
        return;
      }
      logError("Brand Profiles API", toError(error));
      res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
    },
  );
}
