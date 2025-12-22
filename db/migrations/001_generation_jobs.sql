-- Migration: Add generation_jobs table for background image generation
-- Run this migration on your Neon database to enable background processing

-- Create status enum if not exists
DO $$ BEGIN
    CREATE TYPE generation_job_status AS ENUM (
        'queued',
        'processing',
        'completed',
        'failed'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create job type enum if not exists
DO $$ BEGIN
    CREATE TYPE generation_job_type AS ENUM (
        'flyer',
        'flyer_daily',
        'post',
        'ad'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create the generation_jobs table
CREATE TABLE IF NOT EXISTS generation_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

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

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_generation_jobs_user ON generation_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_status ON generation_jobs(status) WHERE status IN ('queued', 'processing');
CREATE INDEX IF NOT EXISTS idx_generation_jobs_created ON generation_jobs(created_at DESC);

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_generation_jobs_updated_at ON generation_jobs;
CREATE TRIGGER update_generation_jobs_updated_at
    BEFORE UPDATE ON generation_jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Success message
DO $$ BEGIN
    RAISE NOTICE 'Migration completed: generation_jobs table created';
END $$;
