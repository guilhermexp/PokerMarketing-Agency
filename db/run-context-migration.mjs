/**
 * Add context column to generation_jobs table
 * Usage: node db/run-context-migration.mjs
 */

import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';

config();

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL not configured');
  process.exit(1);
}

async function runMigration() {
  const sql = neon(DATABASE_URL);

  console.log('Adding context column to generation_jobs...');

  try {
    // Add context column if it doesn't exist
    await sql`
      ALTER TABLE generation_jobs
      ADD COLUMN IF NOT EXISTS context VARCHAR(255)
    `;
    console.log('✓ Added context column to generation_jobs');

    // Add organization_id column if it doesn't exist (for multi-tenant support)
    await sql`
      ALTER TABLE generation_jobs
      ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE
    `;
    console.log('✓ Added organization_id column to generation_jobs');

    console.log('\n✅ Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  }
}

runMigration();
