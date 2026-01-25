/**
 * Database diagnostic script
 * Run: node scripts/diagnose-db.mjs
 */
import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function diagnose() {
  console.log("🔍 Database Diagnostic\n");

  // 1. Count records
  console.log("📊 Record counts:");
  const counts = await sql`
    SELECT 'gallery_images' as table_name, COUNT(*)::int as count FROM gallery_images
    UNION ALL SELECT 'scheduled_posts', COUNT(*)::int FROM scheduled_posts
    UNION ALL SELECT 'brand_profiles', COUNT(*)::int FROM brand_profiles
  `;
  counts.forEach(r => console.log(`   ${r.table_name}: ${r.count} rows`));

  // 2. Check indexes
  console.log("\n📑 Indexes on key tables:");
  const indexes = await sql`
    SELECT tablename, indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
    AND tablename IN ('gallery_images', 'scheduled_posts', 'brand_profiles')
    ORDER BY tablename, indexname
  `;
  if (indexes.length === 0) {
    console.log("   ⚠️  NO INDEXES FOUND!");
  } else {
    indexes.forEach(r => console.log(`   ${r.tablename}: ${r.indexname}`));
  }

  // 3. Test query performance
  console.log("\n⏱️  Query performance test:");

  const start1 = Date.now();
  await sql`SELECT * FROM gallery_images WHERE organization_id = 'org_37RQsFkujzn77wz4yMECdS362Cq' AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 25`;
  console.log(`   gallery_images: ${Date.now() - start1}ms`);

  const start2 = Date.now();
  await sql`SELECT * FROM scheduled_posts WHERE organization_id = 'org_37RQsFkujzn77wz4yMECdS362Cq' LIMIT 50`;
  console.log(`   scheduled_posts: ${Date.now() - start2}ms`);

  const start3 = Date.now();
  await sql`SELECT * FROM brand_profiles WHERE organization_id = 'org_37RQsFkujzn77wz4yMECdS362Cq' AND deleted_at IS NULL LIMIT 1`;
  console.log(`   brand_profiles: ${Date.now() - start3}ms`);

  // 4. Check explain plan
  console.log("\n📋 Query plan for scheduled_posts:");
  const plan = await sql`
    EXPLAIN (FORMAT TEXT)
    SELECT * FROM scheduled_posts
    WHERE organization_id = 'org_37RQsFkujzn77wz4yMECdS362Cq'
    ORDER BY scheduled_timestamp ASC
  `;
  plan.forEach(r => console.log(`   ${r["QUERY PLAN"]}`));

  console.log("\n✅ Diagnostic complete");
}

diagnose().catch(console.error);
