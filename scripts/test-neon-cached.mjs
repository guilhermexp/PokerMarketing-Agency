/**
 * Test neon with fetchConnectionCache enabled
 */
import "dotenv/config";
import { neon, neonConfig } from "@neondatabase/serverless";

// Enable connection caching
neonConfig.fetchConnectionCache = true;

const DATABASE_URL = process.env.DATABASE_URL;
const sql = neon(DATABASE_URL);

console.log("=== Testing neon() with fetchConnectionCache ===\n");

// Warmup
console.log("Warming up...");
const warmStart = Date.now();
await sql`SELECT 1`;
console.log(`Warmup: ${Date.now() - warmStart}ms\n`);

// Test 5 sequential queries (like the init endpoint)
console.log("Sequential queries (simulating /init):");
const totalStart = Date.now();

const t1 = Date.now();
await sql`SELECT * FROM brand_profiles WHERE organization_id = 'org_37RQsFkujzn77wz4yMECdS362Cq' LIMIT 1`;
console.log(`  brandProfile: ${Date.now() - t1}ms`);

const t2 = Date.now();
await sql`SELECT * FROM gallery_images WHERE organization_id = 'org_37RQsFkujzn77wz4yMECdS362Cq' ORDER BY created_at DESC LIMIT 25`;
console.log(`  gallery: ${Date.now() - t2}ms`);

const t3 = Date.now();
await sql`SELECT * FROM scheduled_posts WHERE organization_id = 'org_37RQsFkujzn77wz4yMECdS362Cq' LIMIT 50`;
console.log(`  scheduledPosts: ${Date.now() - t3}ms`);

const t4 = Date.now();
await sql`SELECT * FROM campaigns WHERE organization_id = 'org_37RQsFkujzn77wz4yMECdS362Cq' LIMIT 10`;
console.log(`  campaigns: ${Date.now() - t4}ms`);

const t5 = Date.now();
await sql`SELECT * FROM week_schedules WHERE organization_id = 'org_37RQsFkujzn77wz4yMECdS362Cq'`;
console.log(`  schedulesList: ${Date.now() - t5}ms`);

console.log(`\nTotal: ${Date.now() - totalStart}ms`);
console.log("\n✅ Test complete");
