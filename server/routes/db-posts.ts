import type { Express } from "express";
import { getSql } from "../lib/db.js";
import { logError } from "../lib/logging-helpers.js";
import { sanitizeErrorForClient } from "../lib/ai/retry.js";
import { validateRequest } from "../middleware/validate.js";
import {
  type PostsPatchBody,
  type PostsPatchQuery,
  postsPatchBodySchema,
  postsPatchQuerySchema,
} from "../schemas/posts-schemas.js";

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export function registerPostRoutes(app: Express): void {
  app.patch(
    "/api/db/posts",
    validateRequest({ query: postsPatchQuerySchema, body: postsPatchBodySchema }),
    async (req, res) => {
    try {
      const sql = getSql();
      const { id } = req.query as PostsPatchQuery;
      const { image_url } = req.body as PostsPatchBody;

      const result = await sql`
        UPDATE posts SET image_url = ${image_url}, updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `;

      if (result.length === 0) {
        return res.status(404).json({ error: "Post not found" });
      }

      res.json(result[0]);
    } catch (error) {
      logError("Posts API", toError(error));
      res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
    },
  );

  // Ad Creatives API - Update image_url
  app.patch(
    "/api/db/ad-creatives",
    validateRequest({ query: postsPatchQuerySchema, body: postsPatchBodySchema }),
    async (req, res) => {
    try {
      const sql = getSql();
      const { id } = req.query as PostsPatchQuery;
      const { image_url } = req.body as PostsPatchBody;

      const result = await sql`
        UPDATE ad_creatives SET image_url = ${image_url}, updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `;

      if (result.length === 0) {
        return res.status(404).json({ error: "Ad creative not found" });
      }

      res.json(result[0]);
    } catch (error) {
      logError("Ad Creatives API", toError(error));
      res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
    },
  );
}
