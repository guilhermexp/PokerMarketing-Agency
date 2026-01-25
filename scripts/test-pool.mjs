/**
 * Test Pool vs HTTP performance
 */
import "dotenv/config";
import { neon, Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const DATABASE_URL = process.env.DATABASE_URL;
const pool = new Pool({ connectionString: DATABASE_URL });
const httpSql = neon(DATABASE_URL);

async function testPool() {
  console.log("Testing Pool (WebSocket)...\n");

  // Warmup
  await pool.query('SELECT 1');

  // Test 5 sequential queries
  console.log("Sequential queries:");
  const seqStart = Date.now();
  for (let i = 0; i < 5; i++) {
    const start = Date.now();
    await pool.query('SELECT * FROM scheduled_posts LIMIT 10');
    console.log(`  Query ${i + 1}: ${Date.now() - start}ms`);
  }
  console.log(`  Total sequential: ${Date.now() - seqStart}ms\n`);

  // Test 5 parallel queries
  console.log("Parallel queries:");
  const parStart = Date.now();
  const results = await Promise.all([
    pool.query('SELECT * FROM scheduled_posts LIMIT 10'),
    pool.query('SELECT * FROM gallery_images LIMIT 10'),
    pool.query('SELECT * FROM brand_profiles LIMIT 1'),
    pool.query('SELECT * FROM campaigns LIMIT 5'),
    pool.query('SELECT * FROM week_schedules LIMIT 5'),
  ]);
  console.log(`  Total parallel: ${Date.now() - parStart}ms\n`);

  await pool.end();
}

async function testHttp() {
  console.log("Testing HTTP (neon)...\n");

  // Warmup
  await httpSql`SELECT 1`;

  // Test 5 sequential queries
  console.log("Sequential queries:");
  const seqStart = Date.now();
  for (let i = 0; i < 5; i++) {
    const start = Date.now();
    await httpSql`SELECT * FROM scheduled_posts LIMIT 10`;
    console.log(`  Query ${i + 1}: ${Date.now() - start}ms`);
  }
  console.log(`  Total sequential: ${Date.now() - seqStart}ms\n`);

  // Test 5 parallel queries
  console.log("Parallel queries:");
  const parStart = Date.now();
  await Promise.all([
    httpSql`SELECT * FROM scheduled_posts LIMIT 10`,
    httpSql`SELECT * FROM gallery_images LIMIT 10`,
    httpSql`SELECT * FROM brand_profiles LIMIT 1`,
    httpSql`SELECT * FROM campaigns LIMIT 5`,
    httpSql`SELECT * FROM week_schedules LIMIT 5`,
  ]);
  console.log(`  Total parallel: ${Date.now() - parStart}ms\n`);
}

console.log("=== Database Performance Test ===\n");
await testPool();
await testHttp();
console.log("✅ Test complete");
