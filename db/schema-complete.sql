-- ============================================================================
-- DirectorAi PostgreSQL Schema - COMPLETE (Consolidated)
-- For fresh Neon database setup
-- Last updated: 2025-12-28
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE tone_of_voice AS ENUM (
    'Profissional',
    'Espirituoso',
    'Casual',
    'Inspirador',
    'Técnico'
);

CREATE TYPE social_platform AS ENUM (
    'Instagram',
    'LinkedIn',
    'Twitter',
    'Facebook'
);

CREATE TYPE ad_platform AS ENUM (
    'Facebook',
    'Google'
);

CREATE TYPE scheduling_platform AS ENUM (
    'instagram',
    'facebook',
    'both'
);

CREATE TYPE publication_status AS ENUM (
    'scheduled',
    'publishing',
    'published',
    'failed',
    'cancelled'
);

CREATE TYPE instagram_content_type AS ENUM (
    'photo',
    'video',
    'reel',
    'story',
    'carousel'
);

CREATE TYPE image_source AS ENUM (
    'Post',
    'Anúncio',
    'Clipe',
    'Flyer',
    'Flyer Diário',
    'Logo',
    'Edição'
);

CREATE TYPE image_model AS ENUM (
    'gemini-3-pro-image-preview',
    'imagen-4.0-generate-001'
);

CREATE TYPE image_size AS ENUM (
    '1K',
    '2K',
    '4K'
);

CREATE TYPE video_model AS ENUM (
    'veo-3.1-fast-generate-preview',
    'fal-ai/sora-2/text-to-video'
);

CREATE TYPE post_content_type AS ENUM (
    'flyer',
    'campaign_post',
    'ad_creative'
);

CREATE TYPE chat_role AS ENUM (
    'user',
    'model'
);

CREATE TYPE generation_job_status AS ENUM (
    'queued',
    'processing',
    'completed',
    'failed'
);

CREATE TYPE generation_job_type AS ENUM (
    'flyer',
    'flyer_daily',
    'post',
    'ad'
);

-- ============================================================================
-- FUNCTION: update_updated_at_column (must be created before triggers)
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- ============================================================================
-- USERS TABLE
-- ============================================================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    avatar_url TEXT,

    -- Auth metadata (Clerk compatible)
    auth_provider VARCHAR(50) DEFAULT 'email',
    auth_provider_id VARCHAR(255),

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ,

    -- Soft delete
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_auth_provider ON users(auth_provider, auth_provider_id);

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- BRAND PROFILES TABLE
-- ============================================================================

CREATE TABLE brand_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Clerk organization ID (e.g., org_2abc123...)
    organization_id VARCHAR(50),

    name VARCHAR(255) NOT NULL,
    description TEXT,
    logo_url TEXT,
    primary_color VARCHAR(7) NOT NULL DEFAULT '#FFFFFF',
    secondary_color VARCHAR(7) NOT NULL DEFAULT '#000000',
    tone_of_voice tone_of_voice NOT NULL DEFAULT 'Profissional',

    -- Additional brand settings (JSONB for flexibility)
    settings JSONB DEFAULT '{}',

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Soft delete
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_brand_profiles_user ON brand_profiles(user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_brand_profiles_org ON brand_profiles(organization_id) WHERE deleted_at IS NULL;

CREATE TRIGGER update_brand_profiles_updated_at
    BEFORE UPDATE ON brand_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- CAMPAIGNS TABLE
-- ============================================================================

CREATE TABLE campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    brand_profile_id UUID REFERENCES brand_profiles(id) ON DELETE SET NULL,
    organization_id VARCHAR(50),

    name VARCHAR(255),
    description TEXT,

    -- Input content that generated this campaign
    input_transcript TEXT,
    input_product_images JSONB,
    input_inspiration_images JSONB,

    -- Generation options used
    generation_options JSONB,

    -- Status: draft, active, archived, completed
    status VARCHAR(50) DEFAULT 'draft',

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Soft delete
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_campaigns_user ON campaigns(user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_campaigns_brand ON campaigns(brand_profile_id);
CREATE INDEX idx_campaigns_status ON campaigns(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_campaigns_created ON campaigns(created_at DESC);
CREATE INDEX idx_campaigns_org ON campaigns(organization_id) WHERE deleted_at IS NULL;

CREATE TRIGGER update_campaigns_updated_at
    BEFORE UPDATE ON campaigns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- VIDEO CLIP SCRIPTS TABLE
-- ============================================================================

CREATE TABLE video_clip_scripts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id VARCHAR(50),

    title VARCHAR(500) NOT NULL,
    hook TEXT NOT NULL,
    image_prompt TEXT,
    audio_script TEXT,

    -- Scenes stored as JSONB array
    scenes JSONB NOT NULL DEFAULT '[]',

    -- Generated assets
    thumbnail_url TEXT,
    video_url TEXT,
    audio_url TEXT,

    -- Video generation metadata
    video_model video_model,
    generation_status VARCHAR(50) DEFAULT 'pending',
    generation_metadata JSONB,

    -- Order within campaign
    sort_order INTEGER DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_video_scripts_campaign ON video_clip_scripts(campaign_id);
CREATE INDEX idx_video_scripts_user ON video_clip_scripts(user_id);
CREATE INDEX idx_video_scripts_org ON video_clip_scripts(organization_id);

CREATE TRIGGER update_video_clip_scripts_updated_at
    BEFORE UPDATE ON video_clip_scripts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- POSTS TABLE
-- ============================================================================

CREATE TABLE posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id VARCHAR(50),

    platform social_platform NOT NULL,
    content TEXT NOT NULL,
    hashtags TEXT[] DEFAULT '{}',
    image_prompt TEXT,

    -- Generated image
    image_url TEXT,
    image_model image_model,

    -- Analytics
    likes_count INTEGER DEFAULT 0,
    comments_count INTEGER DEFAULT 0,
    shares_count INTEGER DEFAULT 0,
    reach_count INTEGER DEFAULT 0,

    -- Publishing status
    is_published BOOLEAN DEFAULT FALSE,
    published_at TIMESTAMPTZ,
    external_post_id VARCHAR(255),

    -- Order within campaign
    sort_order INTEGER DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_posts_campaign ON posts(campaign_id);
CREATE INDEX idx_posts_user ON posts(user_id);
CREATE INDEX idx_posts_platform ON posts(platform);
CREATE INDEX idx_posts_published ON posts(is_published, published_at DESC);
CREATE INDEX idx_posts_org ON posts(organization_id);

CREATE TRIGGER update_posts_updated_at
    BEFORE UPDATE ON posts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- AD CREATIVES TABLE
-- ============================================================================

CREATE TABLE ad_creatives (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id VARCHAR(50),

    platform ad_platform NOT NULL,
    headline VARCHAR(500) NOT NULL,
    body TEXT NOT NULL,
    cta VARCHAR(100) NOT NULL,
    image_prompt TEXT,

    -- Generated image
    image_url TEXT,
    image_model image_model,

    -- Ad performance metrics
    impressions INTEGER DEFAULT 0,
    clicks INTEGER DEFAULT 0,
    conversions INTEGER DEFAULT 0,
    spend_cents INTEGER DEFAULT 0,

    -- External ad IDs
    external_ad_id VARCHAR(255),
    external_campaign_id VARCHAR(255),

    -- Order within campaign
    sort_order INTEGER DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ad_creatives_campaign ON ad_creatives(campaign_id);
CREATE INDEX idx_ad_creatives_user ON ad_creatives(user_id);
CREATE INDEX idx_ad_creatives_platform ON ad_creatives(platform);
CREATE INDEX idx_ad_creatives_org ON ad_creatives(organization_id);

CREATE TRIGGER update_ad_creatives_updated_at
    BEFORE UPDATE ON ad_creatives
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- GALLERY IMAGES TABLE
-- ============================================================================

CREATE TABLE gallery_images (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id VARCHAR(50),

    src_url TEXT NOT NULL,
    prompt TEXT,
    source image_source NOT NULL,
    model image_model NOT NULL,
    aspect_ratio VARCHAR(20),
    image_size image_size,

    -- Linked content (IDs for future reference)
    post_id UUID,
    ad_creative_id UUID,
    video_script_id UUID,

    -- Style reference
    is_style_reference BOOLEAN DEFAULT FALSE,
    style_reference_name VARCHAR(255),

    -- Publishing status
    published_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Soft delete
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_gallery_images_user ON gallery_images(user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_gallery_images_source ON gallery_images(source);
CREATE INDEX idx_gallery_images_style_ref ON gallery_images(user_id, is_style_reference)
    WHERE is_style_reference = TRUE AND deleted_at IS NULL;
CREATE INDEX idx_gallery_images_created ON gallery_images(created_at DESC);
CREATE INDEX idx_gallery_org ON gallery_images(organization_id) WHERE deleted_at IS NULL;

CREATE TRIGGER update_gallery_images_updated_at
    BEFORE UPDATE ON gallery_images
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- WEEK SCHEDULES TABLE (must be created before tournament_events)
-- ============================================================================

CREATE TABLE week_schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id VARCHAR(50),

    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    filename VARCHAR(255),

    original_filename VARCHAR(255),
    file_hash VARCHAR(64),

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_week_schedules_user ON week_schedules(user_id);
CREATE INDEX idx_week_schedules_dates ON week_schedules(start_date, end_date);
CREATE INDEX idx_week_schedules_org ON week_schedules(organization_id);

CREATE TRIGGER update_week_schedules_updated_at
    BEFORE UPDATE ON week_schedules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- SCHEDULED POSTS TABLE
-- ============================================================================

CREATE TABLE scheduled_posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id VARCHAR(50),

    -- Content reference
    content_type post_content_type NOT NULL,
    content_id UUID,

    -- Content data (denormalized for reliability)
    image_url TEXT NOT NULL,
    caption TEXT NOT NULL,
    hashtags TEXT[] DEFAULT '{}',

    -- Scheduling (scheduled_timestamp as BIGINT for milliseconds)
    scheduled_date DATE NOT NULL,
    scheduled_time TIME NOT NULL,
    scheduled_timestamp BIGINT NOT NULL,
    timezone VARCHAR(50) NOT NULL DEFAULT 'America/Sao_Paulo',

    -- Platform configuration
    platforms scheduling_platform NOT NULL DEFAULT 'instagram',
    instagram_content_type instagram_content_type DEFAULT 'photo',

    -- Publishing status
    status publication_status NOT NULL DEFAULT 'scheduled',
    published_at TIMESTAMPTZ,
    error_message TEXT,

    -- Instagram metadata
    instagram_media_id VARCHAR(255),
    instagram_container_id VARCHAR(255),
    publish_attempts INTEGER DEFAULT 0,
    last_publish_attempt TIMESTAMPTZ,

    -- Source tracking
    created_from VARCHAR(50),

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_scheduled_posts_user ON scheduled_posts(user_id);
CREATE INDEX idx_scheduled_posts_date ON scheduled_posts(scheduled_date, scheduled_time);
CREATE INDEX idx_scheduled_posts_status ON scheduled_posts(status);
CREATE INDEX idx_scheduled_posts_timestamp ON scheduled_posts(scheduled_timestamp)
    WHERE status = 'scheduled';
CREATE INDEX idx_scheduled_posts_user_calendar ON scheduled_posts(user_id, scheduled_date);
CREATE INDEX idx_scheduled_posts_org ON scheduled_posts(organization_id);

CREATE TRIGGER update_scheduled_posts_updated_at
    BEFORE UPDATE ON scheduled_posts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TOURNAMENT EVENTS TABLE
-- ============================================================================

CREATE TABLE tournament_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id VARCHAR(50),

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

    -- Times by timezone
    times JSONB DEFAULT '{}',

    -- Event date
    event_date DATE,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tournament_events_user ON tournament_events(user_id);
CREATE INDEX idx_tournament_events_week ON tournament_events(week_schedule_id);
CREATE INDEX idx_tournament_events_day ON tournament_events(day_of_week);
CREATE INDEX idx_tournament_events_date ON tournament_events(event_date);
CREATE INDEX idx_tournaments_org ON tournament_events(organization_id);

CREATE TRIGGER update_tournament_events_updated_at
    BEFORE UPDATE ON tournament_events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- CHAT SESSIONS TABLE
-- ============================================================================

CREATE TABLE chat_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id VARCHAR(50),

    title VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,

    last_tool_image_url TEXT,
    last_uploaded_image_url TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chat_sessions_user ON chat_sessions(user_id, is_active);
CREATE INDEX idx_chat_sessions_org ON chat_sessions(organization_id);

CREATE TRIGGER update_chat_sessions_updated_at
    BEFORE UPDATE ON chat_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- CHAT MESSAGES TABLE
-- ============================================================================

CREATE TABLE chat_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,

    role chat_role NOT NULL,

    -- Message content as JSONB array
    parts JSONB NOT NULL DEFAULT '[]',

    -- Grounding metadata from AI
    grounding_metadata JSONB,

    -- Message order
    sequence_number INTEGER NOT NULL,

    -- Timestamp
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chat_messages_user ON chat_messages(user_id);
CREATE INDEX idx_chat_messages_session ON chat_messages(session_id, sequence_number);
CREATE INDEX idx_chat_messages_created ON chat_messages(created_at DESC);

-- ============================================================================
-- GENERATION JOBS TABLE (Background Image Generation)
-- ============================================================================

CREATE TABLE generation_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id VARCHAR(50),

    -- Job configuration
    job_type generation_job_type NOT NULL,
    prompt TEXT NOT NULL,

    -- Brand and style config stored as JSON
    config JSONB NOT NULL DEFAULT '{}',

    -- Status tracking
    status generation_job_status NOT NULL DEFAULT 'queued',
    progress INTEGER DEFAULT 0,

    -- QStash message ID for cancellation
    qstash_message_id VARCHAR(255),

    -- Result
    result_url TEXT,
    result_gallery_id UUID,
    error_message TEXT,

    -- Processing metadata
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    attempts INTEGER DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_generation_jobs_user ON generation_jobs(user_id);
CREATE INDEX idx_generation_jobs_status ON generation_jobs(status) WHERE status IN ('queued', 'processing');
CREATE INDEX idx_generation_jobs_created ON generation_jobs(created_at DESC);
CREATE INDEX idx_generation_jobs_org ON generation_jobs(organization_id);

CREATE TRIGGER update_generation_jobs_updated_at
    BEFORE UPDATE ON generation_jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- ANALYTICS DAILY TABLE
-- ============================================================================

CREATE TABLE analytics_daily (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date DATE NOT NULL,

    -- Campaign metrics
    campaigns_created INTEGER DEFAULT 0,
    video_scripts_generated INTEGER DEFAULT 0,
    posts_generated INTEGER DEFAULT 0,
    ad_creatives_generated INTEGER DEFAULT 0,

    -- Image generation
    images_generated INTEGER DEFAULT 0,
    flyers_generated INTEGER DEFAULT 0,

    -- Publishing metrics
    posts_scheduled INTEGER DEFAULT 0,
    posts_published INTEGER DEFAULT 0,
    posts_failed INTEGER DEFAULT 0,

    -- Engagement
    total_likes INTEGER DEFAULT 0,
    total_comments INTEGER DEFAULT 0,
    total_shares INTEGER DEFAULT 0,
    total_reach INTEGER DEFAULT 0,

    -- AI usage
    ai_tokens_used BIGINT DEFAULT 0,
    ai_image_generations INTEGER DEFAULT 0,
    ai_video_generations INTEGER DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(user_id, date)
);

CREATE INDEX idx_analytics_daily_user ON analytics_daily(user_id, date DESC);

CREATE TRIGGER update_analytics_daily_updated_at
    BEFORE UPDATE ON analytics_daily
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- ANALYTICS PLATFORM TABLE
-- ============================================================================

CREATE TABLE analytics_platform (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform social_platform NOT NULL,
    date DATE NOT NULL,

    posts_created INTEGER DEFAULT 0,
    posts_published INTEGER DEFAULT 0,

    likes INTEGER DEFAULT 0,
    comments INTEGER DEFAULT 0,
    shares INTEGER DEFAULT 0,
    reach INTEGER DEFAULT 0,

    top_post_id UUID REFERENCES posts(id) ON DELETE SET NULL,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(user_id, platform, date)
);

CREATE INDEX idx_analytics_platform_user ON analytics_platform(user_id, date DESC);
CREATE INDEX idx_analytics_platform_type ON analytics_platform(platform, date DESC);

CREATE TRIGGER update_analytics_platform_updated_at
    BEFORE UPDATE ON analytics_platform
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- AUDIT LOGS TABLE
-- ============================================================================

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,

    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id UUID,

    old_values JSONB,
    new_values JSONB,

    ip_address INET,
    user_agent TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action, created_at DESC);

-- ============================================================================
-- VIEWS
-- ============================================================================

CREATE VIEW campaign_summary AS
SELECT
    c.id,
    c.user_id,
    c.organization_id,
    c.name,
    c.status,
    c.created_at,
    COUNT(DISTINCT v.id) as video_count,
    COUNT(DISTINCT p.id) as post_count,
    COUNT(DISTINCT a.id) as ad_count
FROM campaigns c
LEFT JOIN video_clip_scripts v ON v.campaign_id = c.id
LEFT JOIN posts p ON p.campaign_id = c.id
LEFT JOIN ad_creatives a ON a.campaign_id = c.id
WHERE c.deleted_at IS NULL
GROUP BY c.id, c.user_id, c.organization_id, c.name, c.status, c.created_at;

CREATE VIEW upcoming_scheduled_posts AS
SELECT
    sp.*,
    u.name as user_name,
    u.email as user_email
FROM scheduled_posts sp
JOIN users u ON u.id = sp.user_id
WHERE sp.status = 'scheduled'
    AND sp.scheduled_timestamp > (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
ORDER BY sp.scheduled_timestamp ASC;

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================

DO $$ BEGIN
    RAISE NOTICE '============================================';
    RAISE NOTICE 'Schema created successfully!';
    RAISE NOTICE 'All tables with organization_id support';
    RAISE NOTICE 'scheduled_timestamp is BIGINT (milliseconds)';
    RAISE NOTICE '============================================';
END $$;
