/**
 * Migrate ALL data URLs from database to Vercel Blob storage.
 *
 * Tables migrated:
 * - gallery_images.src_url (76 images, ~113MB)
 * - scheduled_posts.image_url (18 posts, ~26MB)
 * - brand_profiles.logo_url (3 profiles, ~6MB)
 *
 * Usage:
 *   node scripts/migrate-all-data-urls-to-blob.mjs
 *
 * Options:
 *   DRY_RUN=true node scripts/migrate-all-data-urls-to-blob.mjs  # Preview only
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

// Parse data URL to extract mime type and base64 data
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
    "image/svg+xml": "svg",
  };
  return map[mimeType] || mimeType.split("/")[1] || "bin";
};

// Upload to Vercel Blob
const uploadToBlob = async (dataUrl, prefix, id) => {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) {
    console.log(`  [SKIP] Invalid data URL for ${id}`);
    return null;
  }

  const { mimeType, base64 } = parsed;
  const buffer = Buffer.from(base64, "base64");
  const extension = getExtension(mimeType);
  const filename = `${prefix}-${id}-${Date.now()}.${extension}`;
  const sizeMB = (buffer.length / 1024 / 1024).toFixed(2);

  if (DRY_RUN) {
    console.log(`  [DRY RUN] Would upload ${filename} (${sizeMB}MB)`);
    return "https://dry-run.vercel-storage.com/" + filename;
  }

  const { url } = await put(filename, buffer, {
    access: "public",
    contentType: mimeType,
    token: BLOB_TOKEN,
  });

  console.log(`  [UPLOADED] ${filename} (${sizeMB}MB) -> ${url}`);
  return url;
};

// Migrate gallery_images.src_url (one at a time to avoid response size limits)
async function migrateGalleryImages() {
  console.log("\n========================================");
  console.log("MIGRATING: gallery_images.src_url");
  console.log("========================================");

  // First, get just the IDs and sizes (not the actual data)
  const ids = await sql`
    SELECT id, LENGTH(src_url) as size
    FROM gallery_images
    WHERE src_url LIKE 'data:%' AND deleted_at IS NULL
    ORDER BY created_at ASC
  `;

  console.log(`Found ${ids.length} images with data URLs`);
  const totalSize = ids.reduce((sum, r) => sum + Number(r.size), 0);
  console.log(`Total size: ${(totalSize / 1024 / 1024).toFixed(2)}MB\n`);

  let migrated = 0;
  let failed = 0;

  // Process one at a time
  for (const { id, size } of ids) {
    try {
      // Fetch full data for this single row
      const [row] = await sql`
        SELECT id, src_url FROM gallery_images WHERE id = ${id}
      `;
      if (!row) continue;

      const url = await uploadToBlob(row.src_url, "gallery", row.id);
      if (url && !DRY_RUN) {
        await sql`
          UPDATE gallery_images
          SET src_url = ${url}, updated_at = NOW()
          WHERE id = ${row.id}
        `;
      }
      migrated++;
      console.log(`  [${migrated}/${ids.length}] Processed ${id} (${(size / 1024 / 1024).toFixed(2)}MB)`);
    } catch (err) {
      console.log(`  [ERROR] ${id}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\nResults: ${migrated} migrated, ${failed} failed`);
  return { migrated, failed };
}

// Migrate scheduled_posts.image_url (one at a time)
async function migrateScheduledPosts() {
  console.log("\n========================================");
  console.log("MIGRATING: scheduled_posts.image_url");
  console.log("========================================");

  // First, get just the IDs and sizes
  const ids = await sql`
    SELECT id, LENGTH(image_url) as size
    FROM scheduled_posts
    WHERE image_url LIKE 'data:%'
    ORDER BY created_at ASC
  `;

  console.log(`Found ${ids.length} posts with data URLs`);
  const totalSize = ids.reduce((sum, r) => sum + Number(r.size), 0);
  console.log(`Total size: ${(totalSize / 1024 / 1024).toFixed(2)}MB\n`);

  let migrated = 0;
  let failed = 0;

  for (const { id, size } of ids) {
    try {
      const [row] = await sql`
        SELECT id, image_url FROM scheduled_posts WHERE id = ${id}
      `;
      if (!row) continue;

      const url = await uploadToBlob(row.image_url, "scheduled", row.id);
      if (url && !DRY_RUN) {
        await sql`
          UPDATE scheduled_posts
          SET image_url = ${url}, updated_at = NOW()
          WHERE id = ${row.id}
        `;
      }
      migrated++;
      console.log(`  [${migrated}/${ids.length}] Processed ${id} (${(size / 1024 / 1024).toFixed(2)}MB)`);
    } catch (err) {
      console.log(`  [ERROR] ${id}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\nResults: ${migrated} migrated, ${failed} failed`);
  return { migrated, failed };
}

// Migrate brand_profiles.logo_url (one at a time)
async function migrateBrandProfiles() {
  console.log("\n========================================");
  console.log("MIGRATING: brand_profiles.logo_url");
  console.log("========================================");

  // First, get just the IDs and sizes
  const ids = await sql`
    SELECT id, LENGTH(logo_url) as size
    FROM brand_profiles
    WHERE logo_url LIKE 'data:%' AND deleted_at IS NULL
    ORDER BY created_at ASC
  `;

  console.log(`Found ${ids.length} profiles with data URL logos`);
  const totalSize = ids.reduce((sum, r) => sum + Number(r.size), 0);
  console.log(`Total size: ${(totalSize / 1024 / 1024).toFixed(2)}MB\n`);

  let migrated = 0;
  let failed = 0;

  for (const { id, size } of ids) {
    try {
      const [row] = await sql`
        SELECT id, logo_url FROM brand_profiles WHERE id = ${id}
      `;
      if (!row) continue;

      const url = await uploadToBlob(row.logo_url, "brand-logo", row.id);
      if (url && !DRY_RUN) {
        await sql`
          UPDATE brand_profiles
          SET logo_url = ${url}, updated_at = NOW()
          WHERE id = ${row.id}
        `;
      }
      migrated++;
      console.log(`  [${migrated}/${ids.length}] Processed ${id} (${(size / 1024 / 1024).toFixed(2)}MB)`);
    } catch (err) {
      console.log(`  [ERROR] ${id}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\nResults: ${migrated} migrated, ${failed} failed`);
  return { migrated, failed };
}

// Main
async function main() {
  console.log("=========================================");
  console.log("  DATA URL -> VERCEL BLOB MIGRATION");
  console.log("=========================================");
  if (DRY_RUN) {
    console.log("\n*** DRY RUN MODE - No changes will be made ***\n");
  }

  const results = {
    gallery: await migrateGalleryImages(),
    scheduled: await migrateScheduledPosts(),
    brand: await migrateBrandProfiles(),
  };

  console.log("\n=========================================");
  console.log("  MIGRATION COMPLETE");
  console.log("=========================================");
  console.log(`Gallery Images: ${results.gallery.migrated} migrated, ${results.gallery.failed} failed`);
  console.log(`Scheduled Posts: ${results.scheduled.migrated} migrated, ${results.scheduled.failed} failed`);
  console.log(`Brand Profiles: ${results.brand.migrated} migrated, ${results.brand.failed} failed`);

  const totalMigrated = results.gallery.migrated + results.scheduled.migrated + results.brand.migrated;
  const totalFailed = results.gallery.failed + results.scheduled.failed + results.brand.failed;
  console.log(`\nTOTAL: ${totalMigrated} migrated, ${totalFailed} failed`);

  if (DRY_RUN) {
    console.log("\n*** This was a DRY RUN - run without DRY_RUN=true to apply changes ***");
  }
}

main().catch((err) => {
  console.error("\n[FATAL ERROR]", err);
  process.exit(1);
});
