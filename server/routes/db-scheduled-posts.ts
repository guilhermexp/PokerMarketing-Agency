// @ts-nocheck
// TODO: Add proper type annotations to this file
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
  listScheduledPosts,
  createScheduledPost,
  updateScheduledPost,
  deleteScheduledPost,
  retryScheduledPost,
} from "../services/scheduled-posts-service.js";

export function registerScheduledPostRoutes(app) {
  app.get("/api/db/scheduled-posts", async (req, res) => {
    try {
      const result = await listScheduledPosts(req.query);
      res.json(result);
    } catch (error) {
      if (
        error instanceof OrganizationAccessError ||
        error instanceof ValidationError
      ) {
        throw error;
      }
      throw new DatabaseError("Failed to fetch scheduled posts", error);
    }
  });

  app.post("/api/db/scheduled-posts", async (req, res) => {
    try {
      const result = await createScheduledPost(req.body);
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
      logError("Scheduled Posts API", error);
      res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
  });

  app.put("/api/db/scheduled-posts", async (req, res) => {
    try {
      const result = await updateScheduledPost(req.query.id, req.body);
      res.json(result);
    } catch (error) {
      if (error instanceof ValidationError) {
        return res.status(400).json({ error: error.message });
      }
      if (error instanceof NotFoundError) {
        return res.status(404).json({
          error: error.message.includes("Scheduled post")
            ? "Scheduled post not found"
            : error.message,
        });
      }
      if (
        error instanceof OrganizationAccessError ||
        error instanceof PermissionDeniedError
      ) {
        return res.status(403).json({ error: error.message });
      }
      logError("Scheduled Posts API", error);
      res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
  });

  app.delete("/api/db/scheduled-posts", async (req, res) => {
    try {
      await deleteScheduledPost(req.query.id, req.query.user_id);
      res.status(204).end();
    } catch (error) {
      if (error instanceof ValidationError) {
        return res.status(400).json({ error: error.message });
      }
      if (error instanceof NotFoundError) {
        return res.status(404).json({ error: "Scheduled post not found" });
      }
      if (
        error instanceof OrganizationAccessError ||
        error instanceof PermissionDeniedError
      ) {
        return res.status(403).json({ error: error.message });
      }
      logError("Scheduled Posts API", error);
      res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
  });

  app.post("/api/db/scheduled-posts/retry", async (req, res) => {
    try {
      const result = await retryScheduledPost(req.body.id, req.body.user_id);
      res.json(result);
    } catch (error) {
      if (error instanceof ValidationError) {
        return res.status(400).json({ error: error.message });
      }
      if (error instanceof NotFoundError) {
        return res.status(404).json({
          error: error.message.includes("Scheduled post")
            ? "Scheduled post not found"
            : "User not found",
        });
      }
      if (
        error instanceof OrganizationAccessError ||
        error instanceof PermissionDeniedError
      ) {
        return res.status(403).json({ error: error.message });
      }
      logError("Scheduled Posts API", error);
      res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
  });
}
