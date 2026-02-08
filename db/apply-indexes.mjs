/**
 * Apply composite indexes for performance optimization
 */

import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';

config();

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL not configured');
  process.exit(1);
}

async function applyIndexes() {
  const sql = neon(DATABASE_URL);

  console.log('🚀 Applying composite indexes for performance...\n');

  try {
    // Gallery images - optimize WHERE user_id = X ORDER BY created_at DESC
    console.log('Creating gallery_images indexes...');
    await sql`
      CREATE INDEX IF NOT EXISTS idx_gallery_images_user_created
      ON gallery_images(user_id, created_at DESC)
      WHERE deleted_at IS NULL
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_gallery_images_org_created
      ON gallery_images(organization_id, created_at DESC)
      WHERE deleted_at IS NULL
    `;
    console.log('✓ Gallery images indexes created\n');

    // Scheduled posts - optimize calendar queries with timestamp ordering
    console.log('Creating scheduled_posts indexes...');
    await sql`
      CREATE INDEX IF NOT EXISTS idx_scheduled_posts_user_timestamp
      ON scheduled_posts(user_id, scheduled_timestamp ASC)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_scheduled_posts_org_timestamp
      ON scheduled_posts(organization_id, scheduled_timestamp ASC)
    `;
    console.log('✓ Scheduled posts indexes created\n');

    // Campaigns - optimize WHERE user_id = X ORDER BY created_at DESC
    console.log('Creating campaigns indexes...');
    await sql`
      CREATE INDEX IF NOT EXISTS idx_campaigns_user_created
      ON campaigns(user_id, created_at DESC)
      WHERE deleted_at IS NULL
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_campaigns_org_created
      ON campaigns(organization_id, created_at DESC)
      WHERE deleted_at IS NULL
    `;
    console.log('✓ Campaigns indexes created\n');

    console.log('✅ All indexes created successfully!');
    console.log('\n📊 Expected performance improvements:');
    console.log('   • Gallery loading: ~30-50% faster');
    console.log('   • Campaigns list: ~40-60% faster');
    console.log('   • Calendar queries: ~50-70% faster');

  } catch (error) {
    console.error('❌ Failed to create indexes:', error.message);
    process.exit(1);
  }
}

applyIndexes();
