/**
 * Migration script to convert scheduled_posts data URLs to Vercel Blob URLs
 *
 * This script finds all scheduled posts with base64 data URLs in the image_url column
 * and uploads them to Vercel Blob, then updates the database with the new URLs.
 */

import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { put } from "@vercel/blob";

const sql = neon(process.env.DATABASE_URL);

console.log("🔄 Migrating scheduled posts data URLs to Vercel Blob...\n");

// Find all scheduled posts with data URLs
const postsWithDataUrls = await sql`
  SELECT id, image_url, scheduled_date, scheduled_time, status
  FROM scheduled_posts
  WHERE image_url LIKE 'data:%'
  ORDER BY scheduled_date DESC
`;

console.log(`📦 Found ${postsWithDataUrls.length} posts with data URLs\n`);

if (postsWithDataUrls.length === 0) {
  console.log("✅ No posts to migrate!");
  process.exit(0);
}

let successCount = 0;
let errorCount = 0;

for (const post of postsWithDataUrls) {
  console.log(`Processing post ${post.id} (${post.scheduled_date} ${post.scheduled_time})...`);

  try {
    // Parse the data URL
    const matches = post.image_url.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) {
      console.error(`  ❌ Invalid data URL format`);
      errorCount++;
      continue;
    }

    const contentType = matches[1];
    const base64Data = matches[2];
    const imageBuffer = Buffer.from(base64Data, 'base64');

    // Upload to Vercel Blob
    const ext = contentType.includes('png') ? 'png' : 'jpg';
    const filename = `scheduled-post-${post.id}.${ext}`;

    console.log(`  📤 Uploading ${Math.round(imageBuffer.length / 1024)}KB to Vercel Blob...`);

    const blob = await put(filename, imageBuffer, {
      access: 'public',
      contentType,
    });

    console.log(`  ✅ Uploaded: ${blob.url}`);

    // Update the database
    await sql`
      UPDATE scheduled_posts
      SET image_url = ${blob.url}, updated_at = NOW()
      WHERE id = ${post.id}
    `;

    console.log(`  ✅ Database updated\n`);
    successCount++;
  } catch (error) {
    console.error(`  ❌ Error: ${error.message}\n`);
    errorCount++;
  }
}

console.log("========================================");
console.log(`✅ Successfully migrated: ${successCount} posts`);
if (errorCount > 0) {
  console.log(`❌ Failed: ${errorCount} posts`);
}
console.log("========================================");
