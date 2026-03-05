import { getSql } from "../lib/db.mjs";
import { logError } from "../lib/logging-helpers.mjs";
import { sanitizeErrorForClient } from "../lib/ai/retry.mjs";

export function registerPostRoutes(app) {
  app.patch("/api/db/posts", async (req, res) => {
    try {
      const sql = getSql();
      const { id } = req.query;
      const { image_url } = req.body;

      if (!id) {
        return res.status(400).json({ error: "id is required" });
      }

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
      logError("Posts API", error);
      res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
  });

  // Ad Creatives API - Update image_url
  app.patch("/api/db/ad-creatives", async (req, res) => {
    try {
      const sql = getSql();
      const { id } = req.query;
      const { image_url } = req.body;

      if (!id) {
        return res.status(400).json({ error: "id is required" });
      }

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
      logError("Ad Creatives API", error);
      res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
  });
}
