-- Migration: Migrate to Clerk Organizations
-- Clerk uses string IDs like "org_xxx" instead of UUIDs
-- This migration prepares the schema for Clerk Organizations integration

-- ============================================================================
-- STEP 1: Drop foreign key constraints from content tables
-- ============================================================================

-- Drop FK constraints first (they reference the organizations table)
ALTER TABLE brand_profiles DROP CONSTRAINT IF EXISTS brand_profiles_organization_id_fkey;
ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_organization_id_fkey;
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_organization_id_fkey;
ALTER TABLE ad_creatives DROP CONSTRAINT IF EXISTS ad_creatives_organization_id_fkey;
ALTER TABLE video_clip_scripts DROP CONSTRAINT IF EXISTS video_clip_scripts_organization_id_fkey;
ALTER TABLE gallery_images DROP CONSTRAINT IF EXISTS gallery_images_organization_id_fkey;
ALTER TABLE scheduled_posts DROP CONSTRAINT IF EXISTS scheduled_posts_organization_id_fkey;
ALTER TABLE week_schedules DROP CONSTRAINT IF EXISTS week_schedules_organization_id_fkey;
ALTER TABLE tournament_events DROP CONSTRAINT IF EXISTS tournament_events_organization_id_fkey;
ALTER TABLE generation_jobs DROP CONSTRAINT IF EXISTS generation_jobs_organization_id_fkey;
ALTER TABLE chat_sessions DROP CONSTRAINT IF EXISTS chat_sessions_organization_id_fkey;

-- ============================================================================
-- STEP 2: Change organization_id column type to VARCHAR(50)
-- Clerk org IDs are strings like "org_2abc123..."
-- ============================================================================

-- Helper function to safely alter column type
DO $$
BEGIN
    -- brand_profiles
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'brand_profiles' AND column_name = 'organization_id' AND data_type = 'uuid') THEN
        ALTER TABLE brand_profiles ALTER COLUMN organization_id TYPE VARCHAR(50) USING organization_id::text;
    END IF;

    -- campaigns
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'campaigns' AND column_name = 'organization_id' AND data_type = 'uuid') THEN
        ALTER TABLE campaigns ALTER COLUMN organization_id TYPE VARCHAR(50) USING organization_id::text;
    END IF;

    -- posts
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'posts' AND column_name = 'organization_id' AND data_type = 'uuid') THEN
        ALTER TABLE posts ALTER COLUMN organization_id TYPE VARCHAR(50) USING organization_id::text;
    END IF;

    -- ad_creatives
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'ad_creatives' AND column_name = 'organization_id' AND data_type = 'uuid') THEN
        ALTER TABLE ad_creatives ALTER COLUMN organization_id TYPE VARCHAR(50) USING organization_id::text;
    END IF;

    -- video_clip_scripts
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'video_clip_scripts' AND column_name = 'organization_id' AND data_type = 'uuid') THEN
        ALTER TABLE video_clip_scripts ALTER COLUMN organization_id TYPE VARCHAR(50) USING organization_id::text;
    END IF;

    -- gallery_images
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'gallery_images' AND column_name = 'organization_id' AND data_type = 'uuid') THEN
        ALTER TABLE gallery_images ALTER COLUMN organization_id TYPE VARCHAR(50) USING organization_id::text;
    END IF;

    -- scheduled_posts
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'scheduled_posts' AND column_name = 'organization_id' AND data_type = 'uuid') THEN
        ALTER TABLE scheduled_posts ALTER COLUMN organization_id TYPE VARCHAR(50) USING organization_id::text;
    END IF;

    -- week_schedules
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'week_schedules' AND column_name = 'organization_id' AND data_type = 'uuid') THEN
        ALTER TABLE week_schedules ALTER COLUMN organization_id TYPE VARCHAR(50) USING organization_id::text;
    END IF;

    -- tournament_events
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'tournament_events' AND column_name = 'organization_id' AND data_type = 'uuid') THEN
        ALTER TABLE tournament_events ALTER COLUMN organization_id TYPE VARCHAR(50) USING organization_id::text;
    END IF;

    -- generation_jobs
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'generation_jobs' AND column_name = 'organization_id' AND data_type = 'uuid') THEN
        ALTER TABLE generation_jobs ALTER COLUMN organization_id TYPE VARCHAR(50) USING organization_id::text;
    END IF;

    -- chat_sessions
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'chat_sessions' AND column_name = 'organization_id' AND data_type = 'uuid') THEN
        ALTER TABLE chat_sessions ALTER COLUMN organization_id TYPE VARCHAR(50) USING organization_id::text;
    END IF;
END $$;

-- ============================================================================
-- STEP 3: Drop obsolete helper function and trigger
-- ============================================================================

DROP FUNCTION IF EXISTS user_has_organization_permission(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS create_default_organization_roles() CASCADE;

-- ============================================================================
-- STEP 4: Drop obsolete organization tables
-- Order matters due to foreign key dependencies
-- ============================================================================

-- Drop in reverse order of creation
DROP TABLE IF EXISTS organization_invites;
DROP TABLE IF EXISTS organization_members;
DROP TABLE IF EXISTS organization_roles;
DROP TABLE IF EXISTS organizations;

-- Drop custom enum types
DROP TYPE IF EXISTS organization_invite_status;
DROP TYPE IF EXISTS organization_member_status;

-- ============================================================================
-- STEP 5: Add comment for documentation
-- ============================================================================

COMMENT ON COLUMN brand_profiles.organization_id IS 'Clerk organization ID (e.g., org_2abc123...)';
COMMENT ON COLUMN campaigns.organization_id IS 'Clerk organization ID (e.g., org_2abc123...)';
COMMENT ON COLUMN gallery_images.organization_id IS 'Clerk organization ID (e.g., org_2abc123...)';
COMMENT ON COLUMN scheduled_posts.organization_id IS 'Clerk organization ID (e.g., org_2abc123...)';

-- Success message
DO $$ BEGIN
    RAISE NOTICE 'Migration completed: Schema migrated to Clerk Organizations';
    RAISE NOTICE 'organization_id columns now accept Clerk org IDs (VARCHAR)';
    RAISE NOTICE 'Obsolete organization tables have been dropped';
END $$;
