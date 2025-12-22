/**
 * Add organization_id columns to existing tables
 * Usage: node db/add-org-columns.mjs
 */

import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';

config();

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL not configured');
  process.exit(1);
}

async function run() {
  const sql = neon(DATABASE_URL);

  console.log('Adding organization_id columns to existing tables...\n');

  try {
    // brand_profiles
    try {
      await sql`ALTER TABLE brand_profiles ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE`;
      await sql`CREATE INDEX IF NOT EXISTS idx_brand_profiles_org ON brand_profiles(organization_id)`;
      console.log('✓ brand_profiles');
    } catch (e) { console.log(`  Skipped brand_profiles: ${e.message}`); }

    // campaigns
    try {
      await sql`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE`;
      await sql`CREATE INDEX IF NOT EXISTS idx_campaigns_org ON campaigns(organization_id)`;
      console.log('✓ campaigns');
    } catch (e) { console.log(`  Skipped campaigns: ${e.message}`); }

    // posts
    try {
      await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE`;
      await sql`CREATE INDEX IF NOT EXISTS idx_posts_org ON posts(organization_id)`;
      console.log('✓ posts');
    } catch (e) { console.log(`  Skipped posts: ${e.message}`); }

    // ad_creatives
    try {
      await sql`ALTER TABLE ad_creatives ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE`;
      await sql`CREATE INDEX IF NOT EXISTS idx_ad_creatives_org ON ad_creatives(organization_id)`;
      console.log('✓ ad_creatives');
    } catch (e) { console.log(`  Skipped ad_creatives: ${e.message}`); }

    // video_clip_scripts
    try {
      await sql`ALTER TABLE video_clip_scripts ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE`;
      await sql`CREATE INDEX IF NOT EXISTS idx_video_scripts_org ON video_clip_scripts(organization_id)`;
      console.log('✓ video_clip_scripts');
    } catch (e) { console.log(`  Skipped video_clip_scripts: ${e.message}`); }

    // gallery_images
    try {
      await sql`ALTER TABLE gallery_images ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE`;
      await sql`CREATE INDEX IF NOT EXISTS idx_gallery_org ON gallery_images(organization_id)`;
      console.log('✓ gallery_images');
    } catch (e) { console.log(`  Skipped gallery_images: ${e.message}`); }

    // scheduled_posts
    try {
      await sql`ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE`;
      await sql`CREATE INDEX IF NOT EXISTS idx_scheduled_posts_org ON scheduled_posts(organization_id)`;
      console.log('✓ scheduled_posts');
    } catch (e) { console.log(`  Skipped scheduled_posts: ${e.message}`); }

    // week_schedules
    try {
      await sql`ALTER TABLE week_schedules ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE`;
      await sql`CREATE INDEX IF NOT EXISTS idx_week_schedules_org ON week_schedules(organization_id)`;
      console.log('✓ week_schedules');
    } catch (e) { console.log(`  Skipped week_schedules: ${e.message}`); }

    // tournament_events
    try {
      await sql`ALTER TABLE tournament_events ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE`;
      await sql`CREATE INDEX IF NOT EXISTS idx_tournament_events_org ON tournament_events(organization_id)`;
      console.log('✓ tournament_events');
    } catch (e) { console.log(`  Skipped tournament_events: ${e.message}`); }

    // generation_jobs
    try {
      await sql`ALTER TABLE generation_jobs ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE`;
      await sql`CREATE INDEX IF NOT EXISTS idx_generation_jobs_org ON generation_jobs(organization_id)`;
      console.log('✓ generation_jobs');
    } catch (e) { console.log(`  Skipped generation_jobs: ${e.message}`); }

    // chat_sessions
    try {
      await sql`ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE`;
      await sql`CREATE INDEX IF NOT EXISTS idx_chat_sessions_org ON chat_sessions(organization_id)`;
      console.log('✓ chat_sessions');
    } catch (e) { console.log(`  Skipped chat_sessions: ${e.message}`); }

    console.log('\n✅ Done adding organization_id columns!');
  } catch (error) {
    console.error('\n❌ Failed:', error.message);
    process.exit(1);
  }
}

run();
