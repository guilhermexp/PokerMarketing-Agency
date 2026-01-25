/**
 * Migrate data URLs from week_schedules.daily_flyer_urls to Vercel Blob
 *
 * The daily_flyer_urls is a JSONB field with structure like:
 * {
 *   "HIGHLIGHTS": ["data:image/...", "data:image/..."],
 *   "MONDAY": { "TARDE": ["data:image/..."], "NOITE": ["data:image/..."] }
 * }
 *
 * Usage:
 *   node scripts/migrate-flyer-urls-to-blob.mjs
 *   DRY_RUN=true node scripts/migrate-flyer-urls-to-blob.mjs
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

// Parse data URL
const parseDataUrl = (dataUrl) => {
  const match = /^data:(.*?);base64,(.*)$/i.exec(dataUrl);
  if (!match) return null;
  return { mimeType: match[1], base64: match[2] };
};

// Get file extension from mime type
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

// Upload to Vercel Blob
const uploadToBlob = async (dataUrl, prefix) => {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return null;

  const { mimeType, base64 } = parsed;
  const buffer = Buffer.from(base64, "base64");
  const extension = getExtension(mimeType);
  const filename = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
  const sizeMB = (buffer.length / 1024 / 1024).toFixed(2);

  if (DRY_RUN) {
    console.log(`    [DRY RUN] Would upload ${filename} (${sizeMB}MB)`);
    return `https://dry-run.vercel-storage.com/${filename}`;
  }

  const { url } = await put(filename, buffer, {
    access: "public",
    contentType: mimeType,
    token: BLOB_TOKEN,
  });

  console.log(`    [UPLOADED] ${filename} (${sizeMB}MB)`);
  return url;
};

// Recursively process JSONB and replace data URLs
async function processJsonb(obj, scheduleId) {
  if (typeof obj !== "object" || obj === null) {
    return { result: obj, count: 0 };
  }

  if (Array.isArray(obj)) {
    let count = 0;
    const result = [];
    for (const item of obj) {
      if (typeof item === "string" && item.startsWith("data:")) {
        const url = await uploadToBlob(item, `flyer-${scheduleId}`);
        result.push(url || item);
        count++;
      } else if (typeof item === "object") {
        const { result: processed, count: c } = await processJsonb(item, scheduleId);
        result.push(processed);
        count += c;
      } else {
        result.push(item);
      }
    }
    return { result, count };
  }

  // Object
  let count = 0;
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string" && value.startsWith("data:")) {
      const url = await uploadToBlob(value, `flyer-${scheduleId}`);
      result[key] = url || value;
      count++;
    } else if (typeof value === "object") {
      const { result: processed, count: c } = await processJsonb(value, scheduleId);
      result[key] = processed;
      count += c;
    } else {
      result[key] = value;
    }
  }
  return { result, count };
}

async function main() {
  console.log("=========================================");
  console.log("  MIGRATE daily_flyer_urls TO BLOB");
  console.log("=========================================");
  if (DRY_RUN) {
    console.log("\n*** DRY RUN MODE - No changes will be made ***\n");
  }

  // Get schedules with data URLs
  const schedules = await sql`
    SELECT id, original_filename, daily_flyer_urls
    FROM week_schedules
    WHERE daily_flyer_urls::text LIKE '%data:%'
  `;

  console.log(`Found ${schedules.length} schedules with data URLs\n`);

  let totalMigrated = 0;

  for (const schedule of schedules) {
    console.log(`\nProcessing: ${schedule.original_filename} (${schedule.id})`);

    const { result, count } = await processJsonb(schedule.daily_flyer_urls, schedule.id);

    if (count > 0 && !DRY_RUN) {
      await sql`
        UPDATE week_schedules
        SET daily_flyer_urls = ${JSON.stringify(result)}::jsonb,
            updated_at = NOW()
        WHERE id = ${schedule.id}
      `;
      console.log(`  Updated ${count} URLs`);
    } else {
      console.log(`  Found ${count} data URLs`);
    }

    totalMigrated += count;
  }

  console.log("\n=========================================");
  console.log("  MIGRATION COMPLETE");
  console.log("=========================================");
  console.log(`Total data URLs migrated: ${totalMigrated}`);

  if (DRY_RUN) {
    console.log("\n*** This was a DRY RUN - run without DRY_RUN=true to apply changes ***");
  }
}

main().catch((err) => {
  console.error("\n[FATAL ERROR]", err);
  process.exit(1);
});
