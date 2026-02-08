#!/usr/bin/env node
/**
 * Apply RLS using Pool (WebSocket) for DDL operations
 * The HTTP driver doesn't properly execute DDL statements
 */

import pg from 'pg';
const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

const tables = [
  'instagram_accounts',
  'carousel_scripts',
  'model_pricing',
  'api_usage_logs',
  'aggregated_usage',
  'activity_logs'
];

async function main() {
  console.log('🔒 Applying RLS using Pool driver...\n');

  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  const client = await pool.connect();

  try {
    // Check status BEFORE
    console.log('📊 BEFORE:');
    const before = await client.query(`
      SELECT
        c.relname as tablename,
        c.relrowsecurity as rls_enabled,
        c.relforcerowsecurity as rls_forced,
        EXISTS (
          SELECT 1 FROM pg_policies p
          WHERE p.tablename = c.relname AND p.policyname = 'deny_all'
        ) as has_policy
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND c.relname = ANY($1)
      ORDER BY c.relname
    `, [tables]);

    for (const row of before.rows) {
      console.log(`  ${row.tablename}: RLS=${row.rls_enabled ? '✅' : '❌'} Force=${row.rls_forced ? '✅' : '❌'} Policy=${row.has_policy ? '✅' : '❌'}`);
    }

    // Apply RLS
    console.log('\n🔧 Applying RLS...');

    for (const table of tables) {
      console.log(`  ${table}...`);

      // Enable RLS
      await client.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);

      // Drop existing policy if any
      await client.query(`DROP POLICY IF EXISTS "deny_all" ON ${table}`);

      // Create deny_all policy
      await client.query(`CREATE POLICY "deny_all" ON ${table} FOR ALL TO PUBLIC USING (false)`);

      // Force RLS
      await client.query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);

      console.log(`    ✅ Done`);
    }

    // Check status AFTER
    console.log('\n📊 AFTER:');
    const after = await client.query(`
      SELECT
        c.relname as tablename,
        c.relrowsecurity as rls_enabled,
        c.relforcerowsecurity as rls_forced,
        EXISTS (
          SELECT 1 FROM pg_policies p
          WHERE p.tablename = c.relname AND p.policyname = 'deny_all'
        ) as has_policy
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND c.relname = ANY($1)
      ORDER BY c.relname
    `, [tables]);

    let allGood = true;
    for (const row of after.rows) {
      const ok = row.rls_enabled && row.rls_forced && row.has_policy;
      if (!ok) allGood = false;
      console.log(`  ${row.tablename}: RLS=${row.rls_enabled ? '✅' : '❌'} Force=${row.rls_forced ? '✅' : '❌'} Policy=${row.has_policy ? '✅' : '❌'}`);
    }

    console.log();
    if (allGood) {
      console.log('✅ All tables now have RLS enabled and forced!');
    } else {
      console.log('⚠️  Some tables still need attention');
    }

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
