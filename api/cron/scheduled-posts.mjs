/**
 * Vercel Cron handler for scheduled Instagram posts.
 *
 * Runs every 5 minutes (configured in vercel.json).
 * Replaces the BullMQ Worker used in the long-running Railway server.
 */

import "dotenv/config";
import { checkAndPublishScheduledPosts } from "../../server/helpers/scheduled-publisher.mjs";

export default async function handler(req, res) {
  // Verify the request comes from Vercel Cron
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[Cron] CRON_SECRET not configured");
    return res.status(500).json({ error: "Server misconfiguration" });
  }

  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const result = await checkAndPublishScheduledPosts();
    return res.status(200).json({
      ok: true,
      timestamp: new Date().toISOString(),
      result,
    });
  } catch (error) {
    console.error("[Cron] scheduled-posts error:", error);
    return res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
}
