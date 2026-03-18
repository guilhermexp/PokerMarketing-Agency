import type { Express } from "express";
import { AppError, ValidationError, NotFoundError, DatabaseError } from "../lib/errors/index.js";
import {
  OrganizationAccessError,
  PermissionDeniedError,
} from "../helpers/organization-context.js";
import { logError } from "../lib/logging-helpers.js";
import { sanitizeErrorForClient } from "../lib/ai/retry.js";
import { validateRequest } from "../middleware/validate.js";
import {
  type ScheduledPostCreateBody,
  type ScheduledPostDeleteQuery,
  type ScheduledPostRetryBody,
  type ScheduledPostUpdateBody,
  type ScheduledPostUpdateQuery,
  type ScheduledPostsListQuery,
  scheduledPostCreateBodySchema,
  scheduledPostDeleteQuerySchema,
  scheduledPostRetryBodySchema,
  scheduledPostUpdateBodySchema,
  scheduledPostUpdateQuerySchema,
  scheduledPostsListQuerySchema,
} from "../schemas/scheduled-posts-schemas.js";
import {
  listScheduledPosts,
  createScheduledPost,
  updateScheduledPost,
  deleteScheduledPost,
  retryScheduledPost,
} from "../services/scheduled-posts-service.js";

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function toDatabaseError(message: string, error: unknown): DatabaseError {
  if (error instanceof Error) {
    return new DatabaseError(message, error);
  }
  return new DatabaseError(message);
}

export function registerScheduledPostRoutes(app: Express): void {
  app.get("/api/db/scheduled-posts", validateRequest({ query: scheduledPostsListQuerySchema }), async (req, res) => {
    try {
      const result = await listScheduledPosts(req.query as ScheduledPostsListQuery);
      res.json(result);
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (
        error instanceof OrganizationAccessError ||
        error instanceof ValidationError
      ) {
        throw error;
      }
      throw toDatabaseError("Failed to fetch scheduled posts", error);
    }
  });

  app.post("/api/db/scheduled-posts", validateRequest({ body: scheduledPostCreateBodySchema }), async (req, res) => {
    try {
      const result = await createScheduledPost(req.body as ScheduledPostCreateBody);
      res.status(201).json(result);
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof ValidationError) {
        throw new AppError(error.message, 400);
      }
      if (
        error instanceof OrganizationAccessError ||
        error instanceof PermissionDeniedError
      ) {
        throw new AppError(error.message, 403);
      }
      logError("Scheduled Posts API", toError(error));
      res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
  });

  app.put(
    "/api/db/scheduled-posts",
    validateRequest({
      query: scheduledPostUpdateQuerySchema,
      body: scheduledPostUpdateBodySchema,
    }),
    async (req, res) => {
    try {
      const { id } = req.query as ScheduledPostUpdateQuery;
      const body = req.body as ScheduledPostUpdateBody;
      const result = await updateScheduledPost(id, body);
      res.json(result);
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof ValidationError) {
        throw new AppError(error.message, 400);
      }
      if (error instanceof NotFoundError) {
        throw new AppError(error.message.includes("Scheduled post")
            ? "Scheduled post not found"
            : error.message, 404);
      }
      if (
        error instanceof OrganizationAccessError ||
        error instanceof PermissionDeniedError
      ) {
        throw new AppError(error.message, 403);
      }
      logError("Scheduled Posts API", toError(error));
      res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
    },
  );

  app.delete("/api/db/scheduled-posts", validateRequest({ query: scheduledPostDeleteQuerySchema }), async (req, res) => {
    try {
      const { id, user_id } = req.query as ScheduledPostDeleteQuery;
      await deleteScheduledPost(id, user_id);
      res.status(204).end();
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof ValidationError) {
        throw new AppError(error.message, 400);
      }
      if (error instanceof NotFoundError) {
        throw new AppError("Scheduled post not found", 404);
      }
      if (
        error instanceof OrganizationAccessError ||
        error instanceof PermissionDeniedError
      ) {
        throw new AppError(error.message, 403);
      }
      logError("Scheduled Posts API", toError(error));
      res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
  });

  app.post("/api/db/scheduled-posts/retry", validateRequest({ body: scheduledPostRetryBodySchema }), async (req, res) => {
    try {
      const { id, user_id } = req.body as ScheduledPostRetryBody;
      const result = await retryScheduledPost(id, user_id);
      res.json(result);
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof ValidationError) {
        throw new AppError(error.message, 400);
      }
      if (error instanceof NotFoundError) {
        throw new AppError(error.message.includes("Scheduled post")
            ? "Scheduled post not found"
            : "User not found", 404);
      }
      if (
        error instanceof OrganizationAccessError ||
        error instanceof PermissionDeniedError
      ) {
        throw new AppError(error.message, 403);
      }
      logError("Scheduled Posts API", toError(error));
      res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
  });
}
