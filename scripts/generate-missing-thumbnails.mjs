/**
 * Generate thumbnails for gallery images that don't have them
 * Fetches the original image, resizes with Sharp, uploads to Vercel Blob
 */

import { neon } from '@neondatabase/serverless';
import { put } from '@vercel/blob';
import sharp from 'sharp';
import 'dotenv/config';

const sql = neon(process.env.DATABASE_URL);

const THUMBNAIL_WIDTH = 400;
const THUMBNAIL_QUALITY = 80;
const DRY_RUN = process.env.DRY_RUN === 'true';

async function generateThumbnails() {
  console.log('🖼️  Generating missing thumbnails...');
  console.log(`   Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE'}\n`);

  // Find images without thumbnails
  const images = await sql`
    SELECT id, src_url, source
    FROM gallery_images
    WHERE thumbnail_url IS NULL
    AND src_url IS NOT NULL
    AND src_url LIKE 'https://%'
    AND deleted_at IS NULL
    ORDER BY created_at DESC
  `;

  console.log(`Found ${images.length} images without thumbnails\n`);

  if (images.length === 0) {
    console.log('✅ All images have thumbnails!');
    return;
  }

  let success = 0;
  let failed = 0;

  for (const image of images) {
    try {
      console.log(`Processing ${image.id} (${image.source})...`);
      console.log(`  Source: ${image.src_url.substring(0, 60)}...`);

      if (DRY_RUN) {
        console.log(`  [DRY RUN] Would generate thumbnail\n`);
        success++;
        continue;
      }

      // Fetch original image
      const response = await fetch(image.src_url);
      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Generate thumbnail
      const thumbnailBuffer = await sharp(buffer)
        .resize(THUMBNAIL_WIDTH, null, { withoutEnlargement: true })
        .jpeg({ quality: THUMBNAIL_QUALITY })
        .toBuffer();

      // Upload to Vercel Blob
      const thumbnailFilename = `gallery/thumb-${image.id}.jpg`;
      const thumbnailBlob = await put(thumbnailFilename, thumbnailBuffer, {
        access: 'public',
        contentType: 'image/jpeg',
      });

      // Update database
      await sql`
        UPDATE gallery_images
        SET thumbnail_url = ${thumbnailBlob.url}
        WHERE id = ${image.id}
      `;

      console.log(`  ✅ Thumbnail: ${thumbnailBlob.url}\n`);
      success++;

    } catch (error) {
      console.error(`  ❌ Error: ${error.message}\n`);
      failed++;
    }
  }

  console.log('\n========================================');
  console.log('RESULTS');
  console.log('========================================');
  console.log(`Success: ${success}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${images.length}`);
}

generateThumbnails().catch(console.error);
