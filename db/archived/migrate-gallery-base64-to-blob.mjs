/**
 * Migrate gallery_images.src_url from base64 data URLs to Vercel Blob URLs.
 * Usage:
 *   DATABASE_URL=... BLOB_READ_WRITE_TOKEN=... node db/migrate-gallery-base64-to-blob.mjs
 */

import { neon } from "@neondatabase/serverless";
import { put } from "@vercel/blob";
import { config } from "dotenv";

config();

const DATABASE_URL = process.env.DATABASE_URL;
const BLOB_READ_WRITE_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const BATCH_SIZE = Number(process.env.MIGRATION_BATCH_SIZE || "50");

if (!DATABASE_URL) {
  console.error("DATABASE_URL not configured");
  process.exit(1);
}

if (!BLOB_READ_WRITE_TOKEN) {
  console.error("BLOB_READ_WRITE_TOKEN not configured");
  process.exit(1);
}

const sql = neon(DATABASE_URL);

const parseDataUrl = (dataUrl) => {
  const match = /^data:(.*?);base64,(.*)$/i.exec(dataUrl);
  if (!match) return null;
  return { mimeType: match[1], base64: match[2] };
};

const getExtension = (mimeType) => {
  const parts = mimeType.split("/");
  return parts[1] || "bin";
};

async function migrateBatch() {
  const rows = await sql`
    SELECT id, src_url
    FROM gallery_images
    WHERE src_url LIKE 'data:%' AND deleted_at IS NULL
    ORDER BY created_at ASC
    LIMIT ${BATCH_SIZE}
  `;

  if (!rows.length) return 0;

  for (const row of rows) {
    const parsed = parseDataUrl(row.src_url);
    if (!parsed) continue;

    const { mimeType, base64 } = parsed;
    const buffer = Buffer.from(base64, "base64");
    const extension = getExtension(mimeType);
    const filename = `gallery-${row.id}-${Date.now()}.${extension}`;

    const { url } = await put(filename, buffer, {
      access: "public",
      contentType: mimeType,
      token: BLOB_READ_WRITE_TOKEN,
    });

    await sql`
      UPDATE gallery_images
      SET src_url = ${url}, updated_at = NOW()
      WHERE id = ${row.id}
    `;

    console.log(`[migrate] ${row.id} -> ${url}`);
  }

  return rows.length;
}

async function run() {
  console.log("[migrate] Starting base64 gallery migration...");
  let total = 0;

  while (true) {
    const count = await migrateBatch();
    total += count;
    if (count === 0) break;
  }

  console.log(`[migrate] Done. Migrated ${total} rows.`);
}

run().catch((err) => {
  console.error("[migrate] Failed:", err);
  process.exit(1);
});
