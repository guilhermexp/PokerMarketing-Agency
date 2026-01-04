-- ============================================================================
-- Migration 005: Admin Tracking System
-- Creates tables for AI usage tracking, activity logging, and admin features
-- ============================================================================

-- ============================================================================
-- ENUMS
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE ai_provider AS ENUM (
        'google',      -- Gemini and Imagen
        'openrouter',  -- GPT-5.2, Grok 4.1, Claude
        'fal'          -- Sora 2, Veo 3.1
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE ai_operation AS ENUM (
        'text',        -- Text generation
        'image',       -- Image generation
        'video',       -- Video generation
        'speech',      -- TTS
        'flyer',       -- Flyer generation
        'edit_image',  -- Image editing
        'campaign'     -- Full campaign generation
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE usage_status AS ENUM (
        'success',
        'failed',
        'timeout',
        'rate_limited'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
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
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE activity_severity AS ENUM (
        'info',      -- Normal operations
        'warning',   -- Potential issues
        'error',     -- Failed operations
        'critical'   -- Critical failures
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- MODEL PRICING TABLE
-- Static pricing configuration per model
-- ============================================================================

CREATE TABLE IF NOT EXISTS model_pricing (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Model identification
    provider ai_provider NOT NULL,
    model_id VARCHAR(100) NOT NULL,           -- e.g., 'gemini-3-pro-preview', 'openai/gpt-5.2'
    display_name VARCHAR(100) NOT NULL,

    -- Pricing (in USD cents for precision)
    -- Text models: per 1M tokens
    input_cost_per_million_tokens INTEGER,    -- NULL for non-text models
    output_cost_per_million_tokens INTEGER,

    -- Image models: per image
    cost_per_image_cents INTEGER,             -- Cost per image generation

    -- Video models: per second or per generation
    cost_per_second_cents INTEGER,            -- For video models
    cost_per_generation_cents INTEGER,        -- Fixed cost per generation

    -- Speech models: per 1M characters
    cost_per_million_characters INTEGER,

    -- Metadata
    is_active BOOLEAN DEFAULT TRUE,
    effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_until DATE,                     -- NULL means currently active

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(provider, model_id, effective_from)
);

CREATE INDEX IF NOT EXISTS idx_model_pricing_lookup ON model_pricing(provider, model_id, is_active);
CREATE INDEX IF NOT EXISTS idx_model_pricing_effective ON model_pricing(effective_from, effective_until);

-- ============================================================================
-- API USAGE LOGS TABLE
-- Individual API call tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS api_usage_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- User context
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    organization_id VARCHAR(50),

    -- Request identification
    request_id VARCHAR(64) NOT NULL,          -- UUID for tracing
    endpoint VARCHAR(50) NOT NULL,            -- e.g., '/api/ai/image'
    operation ai_operation NOT NULL,

    -- Model info
    provider ai_provider NOT NULL,
    model_id VARCHAR(100) NOT NULL,

    -- Usage metrics (varies by operation type)
    input_tokens INTEGER,                     -- For text models
    output_tokens INTEGER,
    total_tokens INTEGER,                     -- Computed: input + output

    image_count INTEGER DEFAULT 1,            -- For image models
    image_size VARCHAR(10),                   -- '1K', '2K', '4K'
    aspect_ratio VARCHAR(10),

    video_duration_seconds INTEGER,           -- For video models
    audio_duration_seconds INTEGER,           -- For speech models
    character_count INTEGER,                  -- For speech models

    -- Cost calculation (in USD cents)
    estimated_cost_cents INTEGER NOT NULL DEFAULT 0,

    -- Performance metrics
    latency_ms INTEGER,                       -- Request duration

    -- Status
    status usage_status NOT NULL DEFAULT 'success',
    error_message TEXT,

    -- Additional context (JSONB for flexibility)
    metadata JSONB DEFAULT '{}',              -- e.g., { "aspectRatio": "16:9", "quality": "high" }

    -- Timestamp
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_usage_logs_user ON api_usage_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_logs_org ON api_usage_logs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_logs_operation ON api_usage_logs(operation, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_logs_provider ON api_usage_logs(provider, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_logs_model ON api_usage_logs(model_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_logs_status ON api_usage_logs(status) WHERE status != 'success';
CREATE INDEX IF NOT EXISTS idx_usage_logs_created ON api_usage_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_logs_date ON api_usage_logs((created_at::DATE));

-- ============================================================================
-- AGGREGATED USAGE TABLE
-- Daily summaries for efficient reporting
-- ============================================================================

CREATE TABLE IF NOT EXISTS aggregated_usage (
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

    -- Token usage (for text models)
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

    -- Unique constraint for upserts
    UNIQUE(date, user_id, organization_id, provider, model_id, operation)
);

CREATE INDEX IF NOT EXISTS idx_aggregated_usage_date ON aggregated_usage(date DESC);
CREATE INDEX IF NOT EXISTS idx_aggregated_usage_user ON aggregated_usage(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_aggregated_usage_org ON aggregated_usage(organization_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_aggregated_usage_provider ON aggregated_usage(provider, date DESC);

-- ============================================================================
-- ACTIVITY LOGS TABLE
-- Comprehensive audit trail for all actions
-- ============================================================================

CREATE TABLE IF NOT EXISTS activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- WHO
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    organization_id VARCHAR(50),  -- Clerk org_id
    actor_email VARCHAR(255),     -- Denormalized for display
    actor_name VARCHAR(255),      -- Denormalized for display

    -- WHAT
    category activity_category NOT NULL,
    action VARCHAR(100) NOT NULL,      -- e.g., 'campaign.create', 'post.publish'
    entity_type VARCHAR(100),          -- e.g., 'campaign', 'scheduled_post'
    entity_id UUID,
    entity_name VARCHAR(255),          -- Denormalized for display

    -- DETAILS
    details JSONB DEFAULT '{}',        -- Action-specific details
    before_state JSONB,                -- State before change (for updates)
    after_state JSONB,                 -- State after change (for updates)

    -- WHERE
    ip_address INET,
    user_agent TEXT,
    request_id VARCHAR(100),           -- For correlating related logs

    -- STATUS
    severity activity_severity NOT NULL DEFAULT 'info',
    success BOOLEAN NOT NULL DEFAULT TRUE,
    error_message TEXT,
    error_stack TEXT,

    -- PERFORMANCE
    duration_ms INTEGER,               -- Operation duration

    -- TIMESTAMP
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for query performance
CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON activity_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_org ON activity_logs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_category ON activity_logs(category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity ON activity_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_severity ON activity_logs(severity) WHERE severity IN ('error', 'critical');
CREATE INDEX IF NOT EXISTS idx_activity_logs_date ON activity_logs(created_at DESC);

-- Composite index for common admin queries
CREATE INDEX IF NOT EXISTS idx_activity_logs_admin_query ON activity_logs(
    organization_id,
    category,
    created_at DESC
) WHERE severity IN ('error', 'critical', 'warning');

-- ============================================================================
-- MONTHLY USAGE SUMMARY VIEW
-- For billing and reporting
-- ============================================================================

CREATE OR REPLACE VIEW monthly_usage_summary AS
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

-- ============================================================================
-- SEED DATA: Initial Model Pricing
-- Prices are estimates - update with actual provider pricing
-- ============================================================================

INSERT INTO model_pricing (provider, model_id, display_name, input_cost_per_million_tokens, output_cost_per_million_tokens, cost_per_image_cents, cost_per_second_cents, cost_per_generation_cents, cost_per_million_characters) VALUES
-- Google Gemini Text
('google', 'gemini-3-pro-preview', 'Gemini 3 Pro', 125, 500, NULL, NULL, NULL, NULL),
('google', 'gemini-3-pro-image-preview', 'Gemini 3 Pro Image', NULL, NULL, 4, NULL, NULL, NULL),
('google', 'imagen-4.0-generate-001', 'Imagen 4', NULL, NULL, 4, NULL, NULL, NULL),
('google', 'gemini-2.5-flash-preview-tts', 'Gemini TTS', NULL, NULL, NULL, NULL, NULL, 1500),

-- OpenRouter Models (prices vary, these are estimates)
('openrouter', 'openai/gpt-5.2', 'GPT-5.2', 500, 1500, NULL, NULL, NULL, NULL),
('openrouter', 'x-ai/grok-4.1', 'Grok 4.1', 300, 900, NULL, NULL, NULL, NULL),
('openrouter', 'anthropic/claude-opus-4', 'Claude Opus 4', 1500, 7500, NULL, NULL, NULL, NULL),
('openrouter', 'anthropic/claude-sonnet-4', 'Claude Sonnet 4', 300, 1500, NULL, NULL, NULL, NULL),

-- FAL.ai Video Models
('fal', 'fal-ai/sora-2/text-to-video', 'Sora 2', NULL, NULL, NULL, 10, NULL, NULL),
('fal', 'fal-ai/sora-2/image-to-video', 'Sora 2 (img2vid)', NULL, NULL, NULL, 10, NULL, NULL),
('fal', 'fal-ai/veo3.1/fast', 'Veo 3.1 Fast', NULL, NULL, NULL, 8, NULL, NULL),
('fal', 'fal-ai/veo3.1/fast/image-to-video', 'Veo 3.1 Fast (img2vid)', NULL, NULL, NULL, 8, NULL, NULL)
ON CONFLICT (provider, model_id, effective_from) DO NOTHING;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update timestamp trigger for model_pricing
DROP TRIGGER IF EXISTS update_model_pricing_updated_at ON model_pricing;
CREATE TRIGGER update_model_pricing_updated_at
    BEFORE UPDATE ON model_pricing
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Update timestamp trigger for aggregated_usage
DROP TRIGGER IF EXISTS update_aggregated_usage_updated_at ON aggregated_usage;
CREATE TRIGGER update_aggregated_usage_updated_at
    BEFORE UPDATE ON aggregated_usage
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
