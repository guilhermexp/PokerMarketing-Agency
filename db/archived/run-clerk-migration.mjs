import { neon } from '@neondatabase/serverless';

const DATABASE_URL = 'postgresql://neondb_owner:npg_6NlSD1GcXsnd@ep-holy-sky-a4cxe005-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require';

const sql = neon(DATABASE_URL);

async function runMigration() {
  console.log('🚀 Running Clerk Organizations migration...\n');

  try {
    // Step 1: Drop FK constraints
    console.log('Step 1: Dropping FK constraints...');
    await sql`ALTER TABLE brand_profiles DROP CONSTRAINT IF EXISTS brand_profiles_organization_id_fkey`;
    console.log('   ✓ brand_profiles');
    await sql`ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_organization_id_fkey`;
    console.log('   ✓ campaigns');
    await sql`ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_organization_id_fkey`;
    console.log('   ✓ posts');
    await sql`ALTER TABLE ad_creatives DROP CONSTRAINT IF EXISTS ad_creatives_organization_id_fkey`;
    console.log('   ✓ ad_creatives');
    await sql`ALTER TABLE video_clip_scripts DROP CONSTRAINT IF EXISTS video_clip_scripts_organization_id_fkey`;
    console.log('   ✓ video_clip_scripts');
    await sql`ALTER TABLE gallery_images DROP CONSTRAINT IF EXISTS gallery_images_organization_id_fkey`;
    console.log('   ✓ gallery_images');
    await sql`ALTER TABLE scheduled_posts DROP CONSTRAINT IF EXISTS scheduled_posts_organization_id_fkey`;
    console.log('   ✓ scheduled_posts');
    await sql`ALTER TABLE week_schedules DROP CONSTRAINT IF EXISTS week_schedules_organization_id_fkey`;
    console.log('   ✓ week_schedules');
    await sql`ALTER TABLE tournament_events DROP CONSTRAINT IF EXISTS tournament_events_organization_id_fkey`;
    console.log('   ✓ tournament_events');
    await sql`ALTER TABLE generation_jobs DROP CONSTRAINT IF EXISTS generation_jobs_organization_id_fkey`;
    console.log('   ✓ generation_jobs');
    await sql`ALTER TABLE chat_sessions DROP CONSTRAINT IF EXISTS chat_sessions_organization_id_fkey`;
    console.log('   ✓ chat_sessions');

    // Step 2: Change column types to VARCHAR using DO block
    console.log('\nStep 2: Changing organization_id to VARCHAR...');

    await sql`
      DO $$
      BEGIN
        -- brand_profiles
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'brand_profiles' AND column_name = 'organization_id' AND data_type = 'uuid') THEN
            ALTER TABLE brand_profiles ALTER COLUMN organization_id TYPE VARCHAR(50) USING organization_id::text;
            RAISE NOTICE 'brand_profiles: converted to VARCHAR';
        END IF;

        -- campaigns
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'campaigns' AND column_name = 'organization_id' AND data_type = 'uuid') THEN
            ALTER TABLE campaigns ALTER COLUMN organization_id TYPE VARCHAR(50) USING organization_id::text;
            RAISE NOTICE 'campaigns: converted to VARCHAR';
        END IF;

        -- posts
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'posts' AND column_name = 'organization_id' AND data_type = 'uuid') THEN
            ALTER TABLE posts ALTER COLUMN organization_id TYPE VARCHAR(50) USING organization_id::text;
            RAISE NOTICE 'posts: converted to VARCHAR';
        END IF;

        -- ad_creatives
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'ad_creatives' AND column_name = 'organization_id' AND data_type = 'uuid') THEN
            ALTER TABLE ad_creatives ALTER COLUMN organization_id TYPE VARCHAR(50) USING organization_id::text;
            RAISE NOTICE 'ad_creatives: converted to VARCHAR';
        END IF;

        -- video_clip_scripts
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'video_clip_scripts' AND column_name = 'organization_id' AND data_type = 'uuid') THEN
            ALTER TABLE video_clip_scripts ALTER COLUMN organization_id TYPE VARCHAR(50) USING organization_id::text;
            RAISE NOTICE 'video_clip_scripts: converted to VARCHAR';
        END IF;

        -- gallery_images
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'gallery_images' AND column_name = 'organization_id' AND data_type = 'uuid') THEN
            ALTER TABLE gallery_images ALTER COLUMN organization_id TYPE VARCHAR(50) USING organization_id::text;
            RAISE NOTICE 'gallery_images: converted to VARCHAR';
        END IF;

        -- scheduled_posts
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'scheduled_posts' AND column_name = 'organization_id' AND data_type = 'uuid') THEN
            ALTER TABLE scheduled_posts ALTER COLUMN organization_id TYPE VARCHAR(50) USING organization_id::text;
            RAISE NOTICE 'scheduled_posts: converted to VARCHAR';
        END IF;

        -- week_schedules
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'week_schedules' AND column_name = 'organization_id' AND data_type = 'uuid') THEN
            ALTER TABLE week_schedules ALTER COLUMN organization_id TYPE VARCHAR(50) USING organization_id::text;
            RAISE NOTICE 'week_schedules: converted to VARCHAR';
        END IF;

        -- tournament_events
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'tournament_events' AND column_name = 'organization_id' AND data_type = 'uuid') THEN
            ALTER TABLE tournament_events ALTER COLUMN organization_id TYPE VARCHAR(50) USING organization_id::text;
            RAISE NOTICE 'tournament_events: converted to VARCHAR';
        END IF;

        -- generation_jobs
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'generation_jobs' AND column_name = 'organization_id' AND data_type = 'uuid') THEN
            ALTER TABLE generation_jobs ALTER COLUMN organization_id TYPE VARCHAR(50) USING organization_id::text;
            RAISE NOTICE 'generation_jobs: converted to VARCHAR';
        END IF;

        -- chat_sessions
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'chat_sessions' AND column_name = 'organization_id' AND data_type = 'uuid') THEN
            ALTER TABLE chat_sessions ALTER COLUMN organization_id TYPE VARCHAR(50) USING organization_id::text;
            RAISE NOTICE 'chat_sessions: converted to VARCHAR';
        END IF;
      END $$
    `;
    console.log('   ✓ All columns converted');

    // Step 3: Drop helper functions
    console.log('\nStep 3: Dropping obsolete functions...');
    await sql`DROP FUNCTION IF EXISTS user_has_organization_permission(UUID, UUID, TEXT)`;
    console.log('   ✓ user_has_organization_permission');
    await sql`DROP FUNCTION IF EXISTS create_default_organization_roles() CASCADE`;
    console.log('   ✓ create_default_organization_roles');

    // Step 4: Drop obsolete tables
    console.log('\nStep 4: Dropping obsolete organization tables...');
    await sql`DROP TABLE IF EXISTS organization_invites`;
    console.log('   ✓ organization_invites');
    await sql`DROP TABLE IF EXISTS organization_members`;
    console.log('   ✓ organization_members');
    await sql`DROP TABLE IF EXISTS organization_roles`;
    console.log('   ✓ organization_roles');
    await sql`DROP TABLE IF EXISTS organizations`;
    console.log('   ✓ organizations');

    // Step 5: Drop enums
    console.log('\nStep 5: Dropping obsolete enum types...');
    await sql`DROP TYPE IF EXISTS organization_invite_status`;
    console.log('   ✓ organization_invite_status');
    await sql`DROP TYPE IF EXISTS organization_member_status`;
    console.log('   ✓ organization_member_status');

    // Verify
    console.log('\nStep 6: Verifying migration...');
    const check = await sql`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE column_name = 'organization_id'
      ORDER BY table_name
    `;
    console.log('   organization_id columns:');
    for (const row of check) {
      console.log(`   - ${row.table_name}: ${row.data_type}`);
    }

    console.log('\n✅ Migration completed successfully!');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  }
}

runMigration();
