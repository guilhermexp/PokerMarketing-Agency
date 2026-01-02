/**
 * Run database migration
 * Usage: node db/run-migration.mjs
 */

import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';
import { readFileSync } from 'fs';

config();

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL not configured');
  process.exit(1);
}

async function runMigration() {
  const sql = neon(DATABASE_URL);

  console.log('Running generation_jobs migration...');

  try {
    // Create enums
    await sql`
      DO $$ BEGIN
        CREATE TYPE generation_job_status AS ENUM ('queued', 'processing', 'completed', 'failed');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$
    `;
    console.log('✓ Created generation_job_status enum');

    await sql`
      DO $$ BEGIN
        CREATE TYPE generation_job_type AS ENUM ('flyer', 'flyer_daily', 'post', 'ad');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$
    `;
    console.log('✓ Created generation_job_type enum');

    // Create table
    await sql`
      CREATE TABLE IF NOT EXISTS generation_jobs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
        job_type generation_job_type NOT NULL,
        prompt TEXT NOT NULL,
        config JSONB NOT NULL DEFAULT '{}',
        status generation_job_status NOT NULL DEFAULT 'queued',
        progress INTEGER DEFAULT 0,
        context VARCHAR(255),
        qstash_message_id VARCHAR(255),
        result_url TEXT,
        result_gallery_id UUID REFERENCES gallery_images(id) ON DELETE SET NULL,
        error_message TEXT,
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        attempts INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    console.log('✓ Created generation_jobs table');

    // Add context column if table already exists (migration for existing databases)
    await sql`
      ALTER TABLE generation_jobs
      ADD COLUMN IF NOT EXISTS context VARCHAR(255)
    `;
    await sql`
      ALTER TABLE generation_jobs
      ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE
    `;
    console.log('✓ Ensured context and organization_id columns exist');

    // Create indexes
    await sql`CREATE INDEX IF NOT EXISTS idx_generation_jobs_user ON generation_jobs(user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_generation_jobs_status ON generation_jobs(status) WHERE status IN ('queued', 'processing')`;
    await sql`CREATE INDEX IF NOT EXISTS idx_generation_jobs_created ON generation_jobs(created_at DESC)`;
    console.log('✓ Created indexes');

    // Create trigger
    await sql`
      DROP TRIGGER IF EXISTS update_generation_jobs_updated_at ON generation_jobs
    `;
    await sql`
      CREATE TRIGGER update_generation_jobs_updated_at
        BEFORE UPDATE ON generation_jobs
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
    `;
    console.log('✓ Created updated_at trigger');

    console.log('\n✅ Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  }
}

runMigration();
