/**
 * Complete Database Setup Script
 * Runs all migrations on a fresh Neon database
 * Usage: node db/setup-database.mjs
 */

import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';

config();

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL not configured');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function runSetup() {
  console.log('🚀 Starting database setup...\n');

  try {
    // ============================================
    // EXTENSIONS
    // ============================================
    console.log('1. Creating extensions...');
    await sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`;
    await sql`CREATE EXTENSION IF NOT EXISTS "pg_trgm"`;
    console.log('   ✓ Extensions created\n');

    // ============================================
    // FUNCTION: update_updated_at_column
    // ============================================
    console.log('2. Creating functions...');
    await sql`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ language 'plpgsql'
    `;
    console.log('   ✓ update_updated_at_column\n');

    // ============================================
    // TABLES
    // ============================================
    console.log('3. Creating tables...');

    // Users
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        avatar_url TEXT,
        auth_provider VARCHAR(50) DEFAULT 'email',
        auth_provider_id VARCHAR(255),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_login_at TIMESTAMPTZ,
        deleted_at TIMESTAMPTZ
      )
    `;
    console.log('   ✓ users');

    // Brand Profiles
    await sql`
      CREATE TABLE IF NOT EXISTS brand_profiles (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        logo_url TEXT,
        primary_color VARCHAR(7) NOT NULL DEFAULT '#FFFFFF',
        secondary_color VARCHAR(7) NOT NULL DEFAULT '#000000',
        tone_of_voice VARCHAR(50) NOT NULL DEFAULT 'Profissional',
        settings JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ
      )
    `;
    console.log('   ✓ brand_profiles');

    // Campaigns
    await sql`
      CREATE TABLE IF NOT EXISTS campaigns (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        brand_profile_id UUID REFERENCES brand_profiles(id) ON DELETE SET NULL,
        name VARCHAR(255),
        description TEXT,
        input_transcript TEXT,
        input_product_images JSONB,
        input_inspiration_images JSONB,
        generation_options JSONB,
        status VARCHAR(50) DEFAULT 'draft',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ
      )
    `;
    console.log('   ✓ campaigns');

    // Video Clip Scripts
    await sql`
      CREATE TABLE IF NOT EXISTS video_clip_scripts (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(500) NOT NULL,
        hook TEXT NOT NULL,
        image_prompt TEXT,
        audio_script TEXT,
        scenes JSONB NOT NULL DEFAULT '[]',
        thumbnail_url TEXT,
        video_url TEXT,
        audio_url TEXT,
        video_model VARCHAR(100),
        generation_status VARCHAR(50) DEFAULT 'pending',
        generation_metadata JSONB,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    console.log('   ✓ video_clip_scripts');

    // Posts
    await sql`
      CREATE TABLE IF NOT EXISTS posts (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        platform VARCHAR(50) NOT NULL,
        content TEXT NOT NULL,
        hashtags TEXT[] DEFAULT '{}',
        image_prompt TEXT,
        image_url TEXT,
        image_model VARCHAR(100),
        likes_count INTEGER DEFAULT 0,
        comments_count INTEGER DEFAULT 0,
        shares_count INTEGER DEFAULT 0,
        reach_count INTEGER DEFAULT 0,
        is_published BOOLEAN DEFAULT FALSE,
        published_at TIMESTAMPTZ,
        external_post_id VARCHAR(255),
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    console.log('   ✓ posts');

    // Ad Creatives
    await sql`
      CREATE TABLE IF NOT EXISTS ad_creatives (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        platform VARCHAR(50) NOT NULL,
        headline VARCHAR(500) NOT NULL,
        body TEXT NOT NULL,
        cta VARCHAR(100) NOT NULL,
        image_prompt TEXT,
        image_url TEXT,
        image_model VARCHAR(100),
        impressions INTEGER DEFAULT 0,
        clicks INTEGER DEFAULT 0,
        conversions INTEGER DEFAULT 0,
        spend_cents INTEGER DEFAULT 0,
        external_ad_id VARCHAR(255),
        external_campaign_id VARCHAR(255),
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    console.log('   ✓ ad_creatives');

    // Gallery Images
    await sql`
      CREATE TABLE IF NOT EXISTS gallery_images (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        src_url TEXT NOT NULL,
        prompt TEXT,
        source VARCHAR(50) NOT NULL,
        model VARCHAR(100) NOT NULL,
        aspect_ratio VARCHAR(20),
        image_size VARCHAR(10),
        post_id UUID REFERENCES posts(id) ON DELETE SET NULL,
        ad_creative_id UUID REFERENCES ad_creatives(id) ON DELETE SET NULL,
        video_script_id UUID REFERENCES video_clip_scripts(id) ON DELETE SET NULL,
        is_style_reference BOOLEAN DEFAULT FALSE,
        style_reference_name VARCHAR(255),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ
      )
    `;
    console.log('   ✓ gallery_images');

    // Scheduled Posts
    await sql`
      CREATE TABLE IF NOT EXISTS scheduled_posts (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        content_type VARCHAR(50) NOT NULL,
        content_id UUID,
        image_url TEXT NOT NULL,
        caption TEXT NOT NULL,
        hashtags TEXT[] DEFAULT '{}',
        scheduled_date DATE NOT NULL,
        scheduled_time TIME NOT NULL,
        scheduled_timestamp BIGINT NOT NULL,
        timezone VARCHAR(50) NOT NULL DEFAULT 'America/Sao_Paulo',
        platforms VARCHAR(50) NOT NULL DEFAULT 'instagram',
        instagram_content_type VARCHAR(50) DEFAULT 'photo',
        status VARCHAR(50) NOT NULL DEFAULT 'scheduled',
        published_at TIMESTAMPTZ,
        error_message TEXT,
        instagram_media_id VARCHAR(255),
        instagram_container_id VARCHAR(255),
        publish_attempts INTEGER DEFAULT 0,
        last_publish_attempt BIGINT,
        created_from VARCHAR(50),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    console.log('   ✓ scheduled_posts');

    // Week Schedules
    await sql`
      CREATE TABLE IF NOT EXISTS week_schedules (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        filename VARCHAR(255),
        original_filename VARCHAR(255),
        file_hash VARCHAR(64),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    console.log('   ✓ week_schedules');

    // Tournament Events
    await sql`
      CREATE TABLE IF NOT EXISTS tournament_events (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        week_schedule_id UUID REFERENCES week_schedules(id) ON DELETE CASCADE,
        day_of_week VARCHAR(20) NOT NULL,
        name VARCHAR(500) NOT NULL,
        game VARCHAR(100),
        gtd VARCHAR(50),
        buy_in VARCHAR(50),
        rebuy VARCHAR(50),
        add_on VARCHAR(50),
        stack VARCHAR(50),
        players VARCHAR(50),
        late_reg VARCHAR(50),
        minutes VARCHAR(50),
        structure VARCHAR(100),
        times JSONB DEFAULT '{}',
        event_date DATE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    console.log('   ✓ tournament_events');

    // Chat Sessions
    await sql`
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255),
        is_active BOOLEAN DEFAULT TRUE,
        last_tool_image_url TEXT,
        last_uploaded_image_url TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    console.log('   ✓ chat_sessions');

    // Chat Messages
    await sql`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
        role VARCHAR(20) NOT NULL,
        parts JSONB NOT NULL DEFAULT '[]',
        grounding_metadata JSONB,
        sequence_number INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    console.log('   ✓ chat_messages');

    // Generation Jobs
    await sql`
      CREATE TABLE IF NOT EXISTS generation_jobs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        job_type VARCHAR(50) NOT NULL,
        prompt TEXT NOT NULL,
        config JSONB NOT NULL DEFAULT '{}',
        status VARCHAR(50) NOT NULL DEFAULT 'queued',
        progress INTEGER DEFAULT 0,
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
    console.log('   ✓ generation_jobs');

    // Organizations
    await sql`
      CREATE TABLE IF NOT EXISTS organizations (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(100) UNIQUE NOT NULL,
        description TEXT,
        logo_url TEXT,
        owner_id UUID NOT NULL REFERENCES users(id),
        settings JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        deleted_at TIMESTAMPTZ
      )
    `;
    console.log('   ✓ organizations');

    // Organization Roles
    await sql`
      CREATE TABLE IF NOT EXISTS organization_roles (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        is_system_role BOOLEAN DEFAULT FALSE,
        permissions JSONB NOT NULL DEFAULT '[]',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(organization_id, name)
      )
    `;
    console.log('   ✓ organization_roles');

    // Organization Members
    await sql`
      CREATE TABLE IF NOT EXISTS organization_members (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role_id UUID NOT NULL REFERENCES organization_roles(id),
        status VARCHAR(20) DEFAULT 'active',
        invited_by UUID REFERENCES users(id),
        invited_at TIMESTAMPTZ DEFAULT NOW(),
        joined_at TIMESTAMPTZ,
        UNIQUE(organization_id, user_id)
      )
    `;
    console.log('   ✓ organization_members');

    // Organization Invites
    await sql`
      CREATE TABLE IF NOT EXISTS organization_invites (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        email VARCHAR(255) NOT NULL,
        role_id UUID NOT NULL REFERENCES organization_roles(id),
        token VARCHAR(64) UNIQUE NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        invited_by UUID NOT NULL REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        accepted_at TIMESTAMPTZ
      )
    `;
    console.log('   ✓ organization_invites\n');

    // ============================================
    // INDEXES
    // ============================================
    console.log('4. Creating indexes...');

    await sql`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE deleted_at IS NULL`;
    await sql`CREATE INDEX IF NOT EXISTS idx_users_auth_provider ON users(auth_provider, auth_provider_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_brand_profiles_user ON brand_profiles(user_id) WHERE deleted_at IS NULL`;
    await sql`CREATE INDEX IF NOT EXISTS idx_campaigns_user ON campaigns(user_id) WHERE deleted_at IS NULL`;
    await sql`CREATE INDEX IF NOT EXISTS idx_campaigns_created ON campaigns(created_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_posts_campaign ON posts(campaign_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_posts_user ON posts(user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_gallery_images_user ON gallery_images(user_id) WHERE deleted_at IS NULL`;
    await sql`CREATE INDEX IF NOT EXISTS idx_gallery_images_created ON gallery_images(created_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_scheduled_posts_user ON scheduled_posts(user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_scheduled_posts_status ON scheduled_posts(status)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_tournament_events_user ON tournament_events(user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_tournament_events_week ON tournament_events(week_schedule_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_week_schedules_user ON week_schedules(user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_generation_jobs_user ON generation_jobs(user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_generation_jobs_status ON generation_jobs(status) WHERE status IN ('queued', 'processing')`;
    await sql`CREATE INDEX IF NOT EXISTS idx_organizations_owner ON organizations(owner_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_organization_members_user ON organization_members(user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_organization_members_org ON organization_members(organization_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_organization_invites_email ON organization_invites(email)`;
    console.log('   ✓ All indexes created\n');

    // ============================================
    // TRIGGERS
    // ============================================
    console.log('5. Creating triggers...');

    const tables = [
      'users', 'brand_profiles', 'campaigns', 'video_clip_scripts',
      'posts', 'ad_creatives', 'gallery_images', 'scheduled_posts',
      'tournament_events', 'week_schedules', 'chat_sessions', 'generation_jobs',
      'organizations', 'organization_roles', 'organization_members'
    ];

    for (const table of tables) {
      await sql.unsafe(`DROP TRIGGER IF EXISTS update_${table}_updated_at ON ${table}`);
      await sql.unsafe(`
        CREATE TRIGGER update_${table}_updated_at
          BEFORE UPDATE ON ${table}
          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
      `);
    }
    console.log('   ✓ All triggers created\n');

    console.log('✅ Database setup completed successfully!\n');

  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

runSetup();
