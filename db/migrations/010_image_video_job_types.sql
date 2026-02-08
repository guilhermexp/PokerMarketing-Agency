-- ============================================================================
-- Migration 010: Add 'image' and 'video' job types
-- ============================================================================
-- Adds support for generic image generation and video generation jobs

-- Add 'image' to generation_job_type enum if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'image' AND enumtypid = 'generation_job_type'::regtype) THEN
    ALTER TYPE generation_job_type ADD VALUE 'image';
  END IF;
END$$;

-- Add 'video' to generation_job_type enum if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'video' AND enumtypid = 'generation_job_type'::regtype) THEN
    ALTER TYPE generation_job_type ADD VALUE 'video';
  END IF;
END$$;
