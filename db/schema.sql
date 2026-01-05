-- ============================================================================
-- DirectorAi PostgreSQL Schema for Neon
-- Multi-tenant poker marketing platform with full campaign history and analytics
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

-- ============================================================================
-- USERS TABLE
-- ============================================================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    avatar_url TEXT,

    -- Auth metadata (Supabase Auth or Clerk compatible)
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

-- ============================================================================
-- BRAND PROFILES TABLE
-- ============================================================================

CREATE TABLE brand_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id VARCHAR(50),  -- Clerk organization ID

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

-- ============================================================================
-- CAMPAIGNS TABLE
-- ============================================================================

CREATE TABLE campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    brand_profile_id UUID REFERENCES brand_profiles(id) ON DELETE SET NULL,
    organization_id VARCHAR(50),  -- Clerk organization ID

    name VARCHAR(255),
    description TEXT,

    -- Input content that generated this campaign
    input_transcript TEXT,
    input_product_images JSONB,
    input_inspiration_images JSONB,

    -- Generation options used
    generation_options JSONB,

    -- Status: draft, active, archived
    status VARCHAR(50) DEFAULT 'draft',

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Soft delete
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_campaigns_user ON campaigns(user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_campaigns_brand ON campaigns(brand_profile_id);
CREATE INDEX idx_campaigns_org ON campaigns(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_campaigns_status ON campaigns(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_campaigns_created ON campaigns(created_at DESC);

-- ============================================================================
-- VIDEO CLIP SCRIPTS TABLE
-- ============================================================================

CREATE TABLE video_clip_scripts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id VARCHAR(50),  -- Clerk organization ID

    title VARCHAR(500) NOT NULL,
    hook TEXT NOT NULL,
    image_prompt TEXT,
    audio_script TEXT,

    -- Scenes stored as JSONB array
    -- [{scene: number, visual: string, narration: string, duration_seconds: number}]
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

-- ============================================================================
-- POSTS TABLE
-- ============================================================================

CREATE TABLE posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id VARCHAR(50),  -- Clerk organization ID

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
CREATE INDEX idx_posts_org ON posts(organization_id);
CREATE INDEX idx_posts_platform ON posts(platform);
CREATE INDEX idx_posts_published ON posts(is_published, published_at DESC);

-- ============================================================================
-- AD CREATIVES TABLE
-- ============================================================================

CREATE TABLE ad_creatives (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id VARCHAR(50),  -- Clerk organization ID

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
CREATE INDEX idx_ad_creatives_org ON ad_creatives(organization_id);
CREATE INDEX idx_ad_creatives_platform ON ad_creatives(platform);

-- ============================================================================
-- GALLERY IMAGES TABLE
-- ============================================================================

CREATE TABLE gallery_images (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id VARCHAR(50),  -- Clerk organization ID

    src_url TEXT NOT NULL,
    prompt TEXT,
    source VARCHAR(100) NOT NULL,
    model image_model NOT NULL,
    aspect_ratio VARCHAR(20),
    image_size image_size,

    -- Linked content
    post_id UUID REFERENCES posts(id) ON DELETE SET NULL,
    ad_creative_id UUID REFERENCES ad_creatives(id) ON DELETE SET NULL,
    video_script_id UUID REFERENCES video_clip_scripts(id) ON DELETE SET NULL,

    -- Style reference
    is_style_reference BOOLEAN DEFAULT FALSE,
    style_reference_name VARCHAR(255),

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Soft delete
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_gallery_images_user ON gallery_images(user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_gallery_images_org ON gallery_images(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_gallery_images_source ON gallery_images(source);
CREATE INDEX idx_gallery_images_style_ref ON gallery_images(user_id, is_style_reference)
    WHERE is_style_reference = TRUE AND deleted_at IS NULL;
CREATE INDEX idx_gallery_images_created ON gallery_images(created_at DESC);

-- ============================================================================
-- SCHEDULED POSTS TABLE
-- ============================================================================

CREATE TABLE scheduled_posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id VARCHAR(50),  -- Clerk organization ID

    -- Content reference
    content_type post_content_type NOT NULL,
    content_id UUID,

    -- Content data (denormalized for reliability)
    image_url TEXT NOT NULL,
    caption TEXT NOT NULL,
    hashtags TEXT[] DEFAULT '{}',

    -- Scheduling
    scheduled_date DATE NOT NULL,
    scheduled_time TIME NOT NULL,
    scheduled_timestamp TIMESTAMPTZ NOT NULL,
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
CREATE INDEX idx_scheduled_posts_org ON scheduled_posts(organization_id);
CREATE INDEX idx_scheduled_posts_date ON scheduled_posts(scheduled_date, scheduled_time);
CREATE INDEX idx_scheduled_posts_status ON scheduled_posts(status);
CREATE INDEX idx_scheduled_posts_timestamp ON scheduled_posts(scheduled_timestamp)
    WHERE status = 'scheduled';
CREATE INDEX idx_scheduled_posts_user_calendar ON scheduled_posts(user_id, scheduled_date);

-- ============================================================================
-- INSTAGRAM ACCOUNTS TABLE (Multi-tenant Rube MCP Integration)
-- ============================================================================

CREATE TABLE instagram_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id VARCHAR(50),

    -- Instagram account details
    instagram_user_id VARCHAR(255) NOT NULL,
    instagram_username VARCHAR(255),

    -- Rube MCP token for this account
    rube_token TEXT NOT NULL,

    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    UNIQUE(user_id, instagram_user_id)
);

CREATE INDEX idx_instagram_accounts_user ON instagram_accounts(user_id) WHERE is_active = TRUE;
CREATE INDEX idx_instagram_accounts_org ON instagram_accounts(organization_id) WHERE is_active = TRUE;

-- Add FK from scheduled_posts to instagram_accounts
ALTER TABLE scheduled_posts
    ADD COLUMN instagram_account_id UUID REFERENCES instagram_accounts(id) ON DELETE SET NULL;

CREATE INDEX idx_scheduled_posts_instagram ON scheduled_posts(instagram_account_id);

-- ============================================================================
-- TOURNAMENT EVENTS TABLE
-- ============================================================================

CREATE TABLE tournament_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id VARCHAR(50),  -- Clerk organization ID

    week_schedule_id UUID,

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

    -- Generated flyers (array of URLs)
    flyer_urls JSONB DEFAULT '[]',

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tournament_events_user ON tournament_events(user_id);
CREATE INDEX idx_tournament_events_org ON tournament_events(organization_id);
CREATE INDEX idx_tournament_events_week ON tournament_events(week_schedule_id);
CREATE INDEX idx_tournament_events_day ON tournament_events(day_of_week);
CREATE INDEX idx_tournament_events_date ON tournament_events(event_date);

-- ============================================================================
-- WEEK SCHEDULES TABLE
-- ============================================================================

CREATE TABLE week_schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id VARCHAR(50),  -- Clerk organization ID

    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    filename VARCHAR(255),

    original_filename VARCHAR(255),
    file_hash VARCHAR(64),

    -- Daily flyers by period: { "MORNING": [...urls], "AFTERNOON": [...urls], ... }
    daily_flyer_urls JSONB DEFAULT '{}',

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_week_schedules_user ON week_schedules(user_id);
CREATE INDEX idx_week_schedules_org ON week_schedules(organization_id);
CREATE INDEX idx_week_schedules_dates ON week_schedules(start_date, end_date);

ALTER TABLE tournament_events
    ADD CONSTRAINT fk_tournament_week
    FOREIGN KEY (week_schedule_id) REFERENCES week_schedules(id) ON DELETE CASCADE;

-- ============================================================================
-- CHAT SESSIONS TABLE
-- ============================================================================

CREATE TABLE chat_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id VARCHAR(50),  -- Clerk organization ID

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
    'ad',
    'clip'
);

-- Note: 'clip' value added for video clip generation support

CREATE TABLE generation_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id VARCHAR(50),  -- Clerk organization ID

    -- Job configuration
    job_type generation_job_type NOT NULL,
    prompt TEXT NOT NULL,

    -- Brand and style config stored as JSON
    config JSONB NOT NULL DEFAULT '{}',

    -- Status tracking
    status generation_job_status NOT NULL DEFAULT 'queued',
    progress INTEGER DEFAULT 0,

    -- Context for matching job with UI component (e.g., "flyer-period-ALL")
    context VARCHAR(255),

    -- QStash message ID for cancellation (legacy)
    qstash_message_id VARCHAR(255),

    -- Result
    result_url TEXT,
    result_gallery_id UUID REFERENCES gallery_images(id) ON DELETE SET NULL,
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
CREATE INDEX idx_generation_jobs_org ON generation_jobs(organization_id);
CREATE INDEX idx_generation_jobs_status ON generation_jobs(status) WHERE status IN ('queued', 'processing');
CREATE INDEX idx_generation_jobs_created ON generation_jobs(created_at DESC);

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
-- FUNCTIONS AND TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at trigger to all tables
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_brand_profiles_updated_at
    BEFORE UPDATE ON brand_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_campaigns_updated_at
    BEFORE UPDATE ON campaigns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_video_clip_scripts_updated_at
    BEFORE UPDATE ON video_clip_scripts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_posts_updated_at
    BEFORE UPDATE ON posts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ad_creatives_updated_at
    BEFORE UPDATE ON ad_creatives
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_gallery_images_updated_at
    BEFORE UPDATE ON gallery_images
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_scheduled_posts_updated_at
    BEFORE UPDATE ON scheduled_posts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_instagram_accounts_updated_at
    BEFORE UPDATE ON instagram_accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tournament_events_updated_at
    BEFORE UPDATE ON tournament_events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_week_schedules_updated_at
    BEFORE UPDATE ON week_schedules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_chat_sessions_updated_at
    BEFORE UPDATE ON chat_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_analytics_daily_updated_at
    BEFORE UPDATE ON analytics_daily
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_analytics_platform_updated_at
    BEFORE UPDATE ON analytics_platform
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- SECURITY NOTE
-- ============================================================================
-- This application uses Clerk for authentication.
-- Row-level security is enforced at the application layer (API endpoints)
-- by validating Clerk JWT tokens and filtering by user_id/organization_id.
--
-- All API endpoints use requireAuth() middleware which:
-- 1. Validates the Clerk JWT token
-- 2. Extracts user_id and organization_id
-- 3. Filters queries by these identifiers
-- ============================================================================

-- ============================================================================
-- VIEWS
-- ============================================================================

CREATE VIEW campaign_summary AS
SELECT
    c.id,
    c.user_id,
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
GROUP BY c.id, c.user_id, c.name, c.status, c.created_at;

CREATE VIEW upcoming_scheduled_posts AS
SELECT
    sp.*,
    u.name as user_name,
    u.email as user_email
FROM scheduled_posts sp
JOIN users u ON u.id = sp.user_id
WHERE sp.status = 'scheduled'
    AND sp.scheduled_timestamp > NOW()
ORDER BY sp.scheduled_timestamp ASC;

CREATE VIEW analytics_overview AS
SELECT
    user_id,
    DATE_TRUNC('week', date) as week,
    SUM(campaigns_created) as campaigns,
    SUM(images_generated) as images,
    SUM(posts_published) as published,
    SUM(total_likes) as likes,
    SUM(total_reach) as reach
FROM analytics_daily
GROUP BY user_id, DATE_TRUNC('week', date)
ORDER BY week DESC;

-- ============================================================================
-- ADMIN TRACKING SYSTEM
-- AI usage tracking, activity logging, and admin features
-- ============================================================================

-- Admin tracking enums
CREATE TYPE ai_provider AS ENUM (
    'google',      -- Gemini and Imagen
    'openrouter',  -- GPT-5.2, Grok 4.1, Claude
    'fal'          -- Sora 2, Veo 3.1
);

CREATE TYPE ai_operation AS ENUM (
    'text',        -- Text generation
    'image',       -- Image generation
    'video',       -- Video generation
    'speech',      -- TTS
    'flyer',       -- Flyer generation
    'edit_image',  -- Image editing
    'campaign'     -- Full campaign generation
);

CREATE TYPE usage_status AS ENUM (
    'success',
    'failed',
    'timeout',
    'rate_limited'
);

CREATE TYPE activity_category AS ENUM (
    'auth',           -- Login, logout, session events
    'crud',           -- Create, read, update, delete operations
    'ai_generation',  -- AI content generation requests
    'publishing',     -- Instagram/social media publishing
    'settings',       -- User/org settings changes
    'admin',          -- Admin actions
    'system',         -- System events, cron jobs
    'error'           -- Error events
);

CREATE TYPE activity_severity AS ENUM (
    'info',      -- Normal operations
    'warning',   -- Potential issues
    'error',     -- Failed operations
    'critical'   -- Critical failures
);

-- ============================================================================
-- MODEL PRICING TABLE
-- ============================================================================

CREATE TABLE model_pricing (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Model identification
    provider ai_provider NOT NULL,
    model_id VARCHAR(100) NOT NULL,
    display_name VARCHAR(100) NOT NULL,

    -- Pricing (in USD cents for precision)
    input_cost_per_million_tokens INTEGER,
    output_cost_per_million_tokens INTEGER,
    cost_per_image_cents INTEGER,
    cost_per_second_cents INTEGER,
    cost_per_generation_cents INTEGER,
    cost_per_million_characters INTEGER,

    -- Metadata
    is_active BOOLEAN DEFAULT TRUE,
    effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_until DATE,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(provider, model_id, effective_from)
);

CREATE INDEX idx_model_pricing_lookup ON model_pricing(provider, model_id, is_active);

-- ============================================================================
-- API USAGE LOGS TABLE
-- ============================================================================

CREATE TABLE api_usage_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- User context
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    organization_id VARCHAR(50),

    -- Request identification
    request_id VARCHAR(64) NOT NULL,
    endpoint VARCHAR(50) NOT NULL,
    operation ai_operation NOT NULL,

    -- Model info
    provider ai_provider NOT NULL,
    model_id VARCHAR(100) NOT NULL,

    -- Usage metrics
    input_tokens INTEGER,
    output_tokens INTEGER,
    total_tokens INTEGER,
    image_count INTEGER DEFAULT 1,
    image_size VARCHAR(10),
    aspect_ratio VARCHAR(10),
    video_duration_seconds INTEGER,
    audio_duration_seconds INTEGER,
    character_count INTEGER,

    -- Cost calculation (in USD cents)
    estimated_cost_cents INTEGER NOT NULL DEFAULT 0,

    -- Performance metrics
    latency_ms INTEGER,

    -- Status
    status usage_status NOT NULL DEFAULT 'success',
    error_message TEXT,

    -- Additional context
    metadata JSONB DEFAULT '{}',

    -- Timestamp
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_usage_logs_user ON api_usage_logs(user_id, created_at DESC);
CREATE INDEX idx_usage_logs_org ON api_usage_logs(organization_id, created_at DESC);
CREATE INDEX idx_usage_logs_operation ON api_usage_logs(operation, created_at DESC);
CREATE INDEX idx_usage_logs_provider ON api_usage_logs(provider, created_at DESC);
CREATE INDEX idx_usage_logs_date ON api_usage_logs((created_at::DATE));

-- ============================================================================
-- AGGREGATED USAGE TABLE
-- ============================================================================

CREATE TABLE aggregated_usage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Aggregation dimensions
    date DATE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    organization_id VARCHAR(50),
    provider ai_provider NOT NULL,
    model_id VARCHAR(100) NOT NULL,
    operation ai_operation NOT NULL,

    -- Aggregated metrics
    request_count INTEGER NOT NULL DEFAULT 0,
    success_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,

    -- Token usage
    total_input_tokens BIGINT DEFAULT 0,
    total_output_tokens BIGINT DEFAULT 0,

    -- Media counts
    total_images INTEGER DEFAULT 0,
    total_video_seconds INTEGER DEFAULT 0,
    total_audio_seconds INTEGER DEFAULT 0,
    total_characters BIGINT DEFAULT 0,

    -- Cost
    total_cost_cents INTEGER NOT NULL DEFAULT 0,

    -- Performance
    avg_latency_ms INTEGER,
    max_latency_ms INTEGER,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(date, user_id, organization_id, provider, model_id, operation)
);

CREATE INDEX idx_aggregated_usage_date ON aggregated_usage(date DESC);
CREATE INDEX idx_aggregated_usage_user ON aggregated_usage(user_id, date DESC);
CREATE INDEX idx_aggregated_usage_org ON aggregated_usage(organization_id, date DESC);

-- ============================================================================
-- ACTIVITY LOGS TABLE
-- ============================================================================

CREATE TABLE activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- WHO
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    organization_id VARCHAR(50),
    actor_email VARCHAR(255),
    actor_name VARCHAR(255),

    -- WHAT
    category activity_category NOT NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100),
    entity_id UUID,
    entity_name VARCHAR(255),

    -- DETAILS
    details JSONB DEFAULT '{}',
    before_state JSONB,
    after_state JSONB,

    -- WHERE
    ip_address INET,
    user_agent TEXT,
    request_id VARCHAR(100),

    -- STATUS
    severity activity_severity NOT NULL DEFAULT 'info',
    success BOOLEAN NOT NULL DEFAULT TRUE,
    error_message TEXT,
    error_stack TEXT,

    -- PERFORMANCE
    duration_ms INTEGER,

    -- TIMESTAMP
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_activity_logs_user ON activity_logs(user_id, created_at DESC);
CREATE INDEX idx_activity_logs_org ON activity_logs(organization_id, created_at DESC);
CREATE INDEX idx_activity_logs_category ON activity_logs(category, created_at DESC);
CREATE INDEX idx_activity_logs_severity ON activity_logs(severity) WHERE severity IN ('error', 'critical');

-- ============================================================================
-- MONTHLY USAGE SUMMARY VIEW
-- ============================================================================

CREATE VIEW monthly_usage_summary AS
SELECT
    DATE_TRUNC('month', date) AS month,
    organization_id,
    provider,
    SUM(request_count) AS total_requests,
    SUM(success_count) AS successful_requests,
    SUM(total_cost_cents) AS total_cost_cents,
    SUM(total_cost_cents) / 100.0 AS total_cost_usd,
    SUM(total_input_tokens) AS total_input_tokens,
    SUM(total_output_tokens) AS total_output_tokens,
    SUM(total_images) AS total_images,
    SUM(total_video_seconds) AS total_video_seconds
FROM aggregated_usage
GROUP BY DATE_TRUNC('month', date), organization_id, provider;

-- Triggers for admin tables
CREATE TRIGGER update_model_pricing_updated_at
    BEFORE UPDATE ON model_pricing
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_aggregated_usage_updated_at
    BEFORE UPDATE ON aggregated_usage
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- SEED DATA: Model Pricing
-- ============================================================================

INSERT INTO model_pricing (provider, model_id, display_name, input_cost_per_million_tokens, output_cost_per_million_tokens, cost_per_image_cents, cost_per_second_cents, cost_per_million_characters) VALUES
-- Google
('google', 'gemini-3-pro-preview', 'Gemini 3 Pro', 125, 500, NULL, NULL, NULL),
('google', 'gemini-3-pro-image-preview', 'Gemini 3 Pro Image', NULL, NULL, 4, NULL, NULL),
('google', 'imagen-4.0-generate-001', 'Imagen 4', NULL, NULL, 4, NULL, NULL),
('google', 'gemini-2.5-flash-preview-tts', 'Gemini TTS', NULL, NULL, NULL, NULL, 1500),
-- OpenRouter
('openrouter', 'openai/gpt-5.2', 'GPT-5.2', 500, 1500, NULL, NULL, NULL),
('openrouter', 'x-ai/grok-4.1', 'Grok 4.1', 300, 900, NULL, NULL, NULL),
('openrouter', 'anthropic/claude-opus-4', 'Claude Opus 4', 1500, 7500, NULL, NULL, NULL),
('openrouter', 'anthropic/claude-sonnet-4', 'Claude Sonnet 4', 300, 1500, NULL, NULL, NULL),
-- FAL.ai
('fal', 'fal-ai/sora-2/text-to-video', 'Sora 2', NULL, NULL, NULL, 10, NULL),
('fal', 'fal-ai/sora-2/image-to-video', 'Sora 2 (img2vid)', NULL, NULL, NULL, 10, NULL),
('fal', 'fal-ai/veo3.1/fast', 'Veo 3.1 Fast', NULL, NULL, NULL, 8, NULL),
('fal', 'fal-ai/veo3.1/fast/image-to-video', 'Veo 3.1 Fast (img2vid)', NULL, NULL, NULL, 8, NULL)
ON CONFLICT (provider, model_id, effective_from) DO NOTHING;
