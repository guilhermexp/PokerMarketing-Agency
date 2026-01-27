import { neon } from '@neondatabase/serverless';
import 'dotenv/config';

const sql = neon(process.env.DATABASE_URL);

async function check() {
  // Check image_generations table
  const generations = await sql`
    SELECT id,
           LENGTH(asset::text) as asset_size,
           asset->>'url' as url
    FROM image_generations
    WHERE asset IS NOT NULL
    ORDER BY LENGTH(asset::text) DESC
    LIMIT 10
  `;

  console.log('\n🎨 image_generations.asset (top 10 by size):');
  for (const g of generations) {
    const isDataUrl = g.url && g.url.startsWith('data:');
    const preview = g.url ? g.url.substring(0, 60) : 'null';
    console.log(`  id=${g.id}: ${g.asset_size} chars - ${isDataUrl ? 'DATA URL!' : 'OK'}`);
    console.log(`    ${preview}...`);
  }

  // Count all data URLs in image_generations
  const countResult = await sql`
    SELECT COUNT(*) as count, COALESCE(SUM(LENGTH(asset::text)), 0) as total_size
    FROM image_generations
    WHERE asset IS NOT NULL
    AND asset->>'url' LIKE 'data:%'
  `;

  console.log(`\n📊 Total image_generations with data URLs: ${countResult[0].count}`);
  console.log(`   Total size: ${Math.round((countResult[0].total_size || 0) / 1024 / 1024)}MB`);

  // Also check gallery images from playground source
  const playgroundGallery = await sql`
    SELECT id, source, LENGTH(src_url) as url_size,
           LEFT(src_url, 60) as url_preview,
           CASE WHEN src_url LIKE 'data:%' THEN 'DATA URL' ELSE 'OK' END as status
    FROM gallery_images
    WHERE source = 'playground'
    ORDER BY LENGTH(src_url) DESC
    LIMIT 10
  `;

  console.log('\n🖼️ gallery_images from playground:');
  if (playgroundGallery.length === 0) {
    console.log('  (nenhuma imagem do playground na galeria)');
  }
  for (const g of playgroundGallery) {
    console.log(`  id=${g.id}: ${g.url_size} chars - ${g.status}`);
    console.log(`    ${g.url_preview}...`);
  }

  // Check total counts
  const totals = await sql`
    SELECT
      (SELECT COUNT(*) FROM image_generations WHERE asset IS NOT NULL) as total_generations,
      (SELECT COUNT(*) FROM image_generations WHERE asset IS NOT NULL AND asset->>'url' LIKE 'data:%') as data_url_generations,
      (SELECT COUNT(*) FROM gallery_images WHERE source = 'playground') as playground_gallery,
      (SELECT COUNT(*) FROM gallery_images WHERE source = 'playground' AND src_url LIKE 'data:%') as playground_data_urls
  `;

  console.log('\n📈 RESUMO:');
  console.log(`  image_generations total: ${totals[0].total_generations}`);
  console.log(`  image_generations com data URL: ${totals[0].data_url_generations}`);
  console.log(`  gallery_images do playground: ${totals[0].playground_gallery}`);
  console.log(`  gallery_images do playground com data URL: ${totals[0].playground_data_urls}`);
}

check().catch(console.error);
