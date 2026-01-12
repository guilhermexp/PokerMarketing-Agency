#!/usr/bin/env node
/**
 * RLS Verification Script
 *
 * Verifies that Row Level Security is properly configured on all tables.
 * Run with: node db/verify-rls.mjs
 *
 * Requires DATABASE_URL environment variable.
 */

import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

// All tables that should have RLS enabled
const PROTECTED_TABLES = [
  // Core tables
  'users',
  'brand_profiles',
  'campaigns',
  'video_clip_scripts',
  'posts',
  'ad_creatives',
  'gallery_images',
  'scheduled_posts',
  'tournament_events',
  'week_schedules',
  // Chat tables
  'chat_sessions',
  'chat_messages',
  // Background jobs
  'generation_jobs',
  // Analytics
  'analytics_daily',
  'analytics_platform',
  // Audit logs
  'audit_logs',
  // Instagram (migration 004)
  'instagram_accounts',
  // Carousel (migration 008)
  'carousel_scripts',
  // Admin tracking (migration 005)
  'model_pricing',
  'api_usage_logs',
  'aggregated_usage',
  'activity_logs',
];

async function verifyRLS() {
  console.log('🔒 RLS Verification Report');
  console.log('═'.repeat(60));
  console.log();

  let hasErrors = false;
  let hasWarnings = false;

  // 1. Check RLS status on tables
  console.log('📋 Checking RLS Status on Tables...\n');

  const rlsStatus = await sql`
    SELECT
      tablename,
      rowsecurity,
      CASE
        WHEN obj_description((schemaname || '.' || tablename)::regclass, 'pg_class') IS NOT NULL
        THEN true
        ELSE false
      END as has_force_rls
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `;

  // Also get force RLS status from pg_class
  const forceRLSStatus = await sql`
    SELECT
      c.relname as tablename,
      c.relrowsecurity as rowsecurity,
      c.relforcerowsecurity as forcerowsecurity
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
    ORDER BY c.relname
  `;

  const tableMap = new Map();
  forceRLSStatus.forEach(row => {
    tableMap.set(row.tablename, {
      rowsecurity: row.rowsecurity,
      forcerowsecurity: row.forcerowsecurity
    });
  });

  const tablesWithRLS = [];
  const tablesWithoutRLS = [];
  const tablesNotForced = [];

  for (const tableName of PROTECTED_TABLES) {
    const status = tableMap.get(tableName);

    if (!status) {
      console.log(`  ⚠️  ${tableName}: TABLE NOT FOUND`);
      hasWarnings = true;
      continue;
    }

    if (!status.rowsecurity) {
      tablesWithoutRLS.push(tableName);
      console.log(`  ❌ ${tableName}: RLS NOT ENABLED`);
      hasErrors = true;
    } else if (!status.forcerowsecurity) {
      tablesNotForced.push(tableName);
      console.log(`  ⚠️  ${tableName}: RLS enabled but NOT FORCED`);
      hasWarnings = true;
    } else {
      tablesWithRLS.push(tableName);
      console.log(`  ✅ ${tableName}: RLS enabled and forced`);
    }
  }

  console.log();

  // 2. Check policies
  console.log('📋 Checking RLS Policies...\n');

  const policies = await sql`
    SELECT
      tablename,
      policyname,
      permissive,
      roles::text as roles,
      cmd,
      qual::text as qual
    FROM pg_policies
    WHERE schemaname = 'public'
    ORDER BY tablename, policyname
  `;

  const policyMap = new Map();
  policies.forEach(p => {
    if (!policyMap.has(p.tablename)) {
      policyMap.set(p.tablename, []);
    }
    policyMap.get(p.tablename).push(p);
  });

  const tablesWithoutPolicy = [];

  for (const tableName of PROTECTED_TABLES) {
    const tablePolicies = policyMap.get(tableName) || [];

    if (tablePolicies.length === 0) {
      tablesWithoutPolicy.push(tableName);
      console.log(`  ❌ ${tableName}: NO POLICY DEFINED`);
      hasErrors = true;
    } else {
      const hasDenyAll = tablePolicies.some(p =>
        p.policyname === 'deny_all' && p.qual === 'false'
      );

      if (hasDenyAll) {
        console.log(`  ✅ ${tableName}: deny_all policy active`);
      } else {
        console.log(`  ⚠️  ${tableName}: Has ${tablePolicies.length} policy(ies), but no deny_all`);
        tablePolicies.forEach(p => {
          console.log(`      - ${p.policyname} (${p.cmd}): ${p.qual?.substring(0, 50)}...`);
        });
        hasWarnings = true;
      }
    }
  }

  console.log();

  // 3. Check for unprotected tables with user data
  console.log('📋 Checking for Unprotected Tables...\n');

  const allTables = await sql`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT LIKE 'pg_%'
      AND tablename NOT LIKE 'schema_migrations%'
    ORDER BY tablename
  `;

  const protectedSet = new Set(PROTECTED_TABLES);
  const unprotectedTables = allTables
    .map(t => t.tablename)
    .filter(t => !protectedSet.has(t) && !t.startsWith('_'));

  if (unprotectedTables.length > 0) {
    console.log('  ⚠️  Tables without RLS protection:');
    unprotectedTables.forEach(t => {
      const status = tableMap.get(t);
      const rlsEnabled = status?.rowsecurity ? '(RLS enabled)' : '(RLS disabled)';
      console.log(`      - ${t} ${rlsEnabled}`);
    });
    hasWarnings = true;
  } else {
    console.log('  ✅ All tables are in the protection list');
  }

  console.log();

  // 4. Check app_readonly role
  console.log('📋 Checking Roles...\n');

  const roles = await sql`
    SELECT rolname, rolcanlogin, rolbypassrls
    FROM pg_roles
    WHERE rolname IN ('app_readonly', 'neondb_owner')
  `;

  roles.forEach(role => {
    const bypassStatus = role.rolbypassrls ? 'BYPASSES RLS' : 'subject to RLS';
    const loginStatus = role.rolcanlogin ? 'can login' : 'cannot login';
    console.log(`  ℹ️  ${role.rolname}: ${bypassStatus}, ${loginStatus}`);
  });

  const hasReadonly = roles.some(r => r.rolname === 'app_readonly');
  if (!hasReadonly) {
    console.log('  ⚠️  app_readonly role does not exist');
    hasWarnings = true;
  }

  console.log();

  // Summary
  console.log('═'.repeat(60));
  console.log('📊 SUMMARY');
  console.log('═'.repeat(60));
  console.log();
  console.log(`  Total protected tables: ${PROTECTED_TABLES.length}`);
  console.log(`  ✅ Tables with RLS enabled and forced: ${tablesWithRLS.length}`);

  if (tablesWithoutRLS.length > 0) {
    console.log(`  ❌ Tables without RLS: ${tablesWithoutRLS.length}`);
    tablesWithoutRLS.forEach(t => console.log(`      - ${t}`));
  }

  if (tablesNotForced.length > 0) {
    console.log(`  ⚠️  Tables with RLS not forced: ${tablesNotForced.length}`);
    tablesNotForced.forEach(t => console.log(`      - ${t}`));
  }

  if (tablesWithoutPolicy.length > 0) {
    console.log(`  ❌ Tables without policies: ${tablesWithoutPolicy.length}`);
    tablesWithoutPolicy.forEach(t => console.log(`      - ${t}`));
  }

  console.log();

  if (hasErrors) {
    console.log('❌ RESULT: FAILED - RLS not properly configured');
    console.log();
    console.log('🔧 To fix, run:');
    console.log('   psql $DATABASE_URL -f db/rls-policies.sql');
    console.log();
    console.log('   Or run the migration:');
    console.log('   node db/migrate.mjs');
    process.exit(1);
  } else if (hasWarnings) {
    console.log('⚠️  RESULT: PASSED WITH WARNINGS');
    console.log('   Review warnings above for potential issues.');
    process.exit(0);
  } else {
    console.log('✅ RESULT: PASSED - RLS properly configured on all tables');
    process.exit(0);
  }
}

// Run verification
verifyRLS().catch(err => {
  console.error('❌ Error running verification:', err.message);
  process.exit(1);
});
