/**
 * Migrate data URLs from generation_jobs.result_url to Vercel Blob
 *
 * Usage:
 *   node scripts/migrate-generation-jobs-to-blob.mjs
 *   DRY_RUN=true node scripts/migrate-generation-jobs-to-blob.mjs
 */

import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { put } from "@vercel/blob";

const DATABASE_URL = process.env.DATABASE_URL;
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const DRY_RUN = process.env.DRY_RUN === "true";

if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL not configured");
  process.exit(1);
}

if (!BLOB_TOKEN) {
  console.error("ERROR: BLOB_READ_WRITE_TOKEN not configured");
  process.exit(1);
}

const sql = neon(DATABASE_URL);

const parseDataUrl = (dataUrl) => {
  const match = /^data:(.*?);base64,(.*)$/i.exec(dataUrl);
  if (!match) return null;
  return { mimeType: match[1], base64: match[2] };
};

const getExtension = (mimeType) => {
  const map = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
  };
  return map[mimeType] || "jpg";
};

async function main() {
  console.log("=========================================");
  console.log("  MIGRATE generation_jobs TO BLOB");
  console.log("=========================================");
  if (DRY_RUN) {
    console.log("\n*** DRY RUN MODE - No changes will be made ***\n");
  }

  // Get IDs and sizes first (not full data)
  const ids = await sql`
    SELECT id, LENGTH(result_url) as size
    FROM generation_jobs
    WHERE result_url LIKE 'data:%'
    ORDER BY created_at ASC
  `;

  console.log(`Found ${ids.length} jobs with data URLs`);
  const totalSize = ids.reduce((sum, r) => sum + Number(r.size), 0);
  console.log(`Total size: ${(totalSize / 1024 / 1024).toFixed(2)}MB\n`);

  let migrated = 0;
  let failed = 0;

  for (const { id, size } of ids) {
    try {
      // Fetch full data for this single row
      const [row] = await sql`
        SELECT id, result_url FROM generation_jobs WHERE id = ${id}
      `;
      if (!row) continue;

      const parsed = parseDataUrl(row.result_url);
      if (!parsed) {
        console.log(`  [SKIP] Invalid data URL for ${id}`);
        continue;
      }

      const { mimeType, base64 } = parsed;
      const buffer = Buffer.from(base64, "base64");
      const extension = getExtension(mimeType);
      const filename = `job-result-${id}-${Date.now()}.${extension}`;
      const sizeMB = (buffer.length / 1024 / 1024).toFixed(2);

      if (DRY_RUN) {
        console.log(`  [DRY RUN] Would upload ${filename} (${sizeMB}MB)`);
      } else {
        const { url } = await put(filename, buffer, {
          access: "public",
          contentType: mimeType,
          token: BLOB_TOKEN,
        });

        await sql`
          UPDATE generation_jobs
          SET result_url = ${url}
          WHERE id = ${id}
        `;

        console.log(`  [UPLOADED] ${filename} (${sizeMB}MB)`);
      }

      migrated++;
      console.log(`  [${migrated}/${ids.length}] Processed ${id}`);
    } catch (err) {
      console.log(`  [ERROR] ${id}: ${err.message}`);
      failed++;
    }
  }

  console.log("\n=========================================");
  console.log("  MIGRATION COMPLETE");
  console.log("=========================================");
  console.log(`Migrated: ${migrated}, Failed: ${failed}`);

  if (DRY_RUN) {
    console.log("\n*** This was a DRY RUN - run without DRY_RUN=true to apply changes ***");
  }
}

main().catch((err) => {
  console.error("\n[FATAL ERROR]", err);
  process.exit(1);
});
