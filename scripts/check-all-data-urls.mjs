import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

console.log("🔍 Checking ALL data URLs in database...\n");

// Check gallery_images.src_url - THE MAIN PROBLEM
const gallery = await sql`
  SELECT id,
         LENGTH(src_url) as size,
         CASE WHEN src_url LIKE 'data:%' THEN 'DATA URL' ELSE 'REAL URL' END as type
  FROM gallery_images
  WHERE src_url IS NOT NULL
  ORDER BY size DESC
  LIMIT 10
`;
console.log("🖼️ gallery_images.src_url (top 10 by size):");
gallery.forEach(r => console.log(`  id=${r.id}: ${r.size} chars - ${r.type}`));

// Count gallery data URLs
const galleryDataUrls = await sql`
  SELECT COUNT(*) as count, SUM(LENGTH(src_url)) as total_size
  FROM gallery_images
  WHERE src_url LIKE 'data:%'
`;
const gdu = galleryDataUrls[0];
console.log(`\n  Total gallery data URLs: ${gdu.count} (${Math.round(Number(gdu.total_size || 0)/1024/1024)}MB)`);

// Check scheduled_posts.image_url
const scheduled = await sql`
  SELECT COUNT(*) as count, SUM(LENGTH(image_url)) as total_size
  FROM scheduled_posts
  WHERE image_url LIKE 'data:%'
`;
const sp = scheduled[0];
console.log(`\n📦 scheduled_posts.image_url data URLs: ${sp.count} (${Math.round(Number(sp.total_size || 0)/1024/1024)}MB)`);

// Check brand_profiles.logo_url
const brand = await sql`
  SELECT id,
         LENGTH(logo_url) as logo_size,
         CASE WHEN logo_url LIKE 'data:%' THEN 'DATA' ELSE 'URL' END as logo_type
  FROM brand_profiles
  WHERE logo_url IS NOT NULL
`;
console.log("\n🏷️ brand_profiles.logo_url:");
brand.forEach(r => console.log(`  id=${r.id}: ${r.logo_size} chars (${r.logo_type})`));

// TOTAL
const totalGallery = Number(gdu.total_size || 0);
const totalScheduled = Number(sp.total_size || 0);
const totalMB = Math.round((totalGallery + totalScheduled) / 1024 / 1024);

console.log("\n📊 TOTAL DATA URL PROBLEM:");
console.log(`  gallery_images: ${Math.round(totalGallery/1024/1024)}MB (${gdu.count} images)`);
console.log(`  scheduled_posts: ${Math.round(totalScheduled/1024/1024)}MB (${sp.count} posts)`);
console.log(`  TOTAL: ${totalMB}MB being transferred PER REQUEST!`);

console.log("\n✅ Check complete");
