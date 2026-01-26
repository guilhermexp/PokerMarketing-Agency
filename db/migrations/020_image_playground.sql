-- Migration: Image Generation Playground
-- Created: 2026-01-26
-- Description: Add tables for image generation playground feature

-- Topics: Container for generation sessions
CREATE TABLE IF NOT EXISTS image_generation_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id TEXT, -- Clerk organization ID (not FK)
  title TEXT,
  cover_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Batches: Group of generations from single request
CREATE TABLE IF NOT EXISTS image_generation_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL REFERENCES image_generation_topics(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id TEXT, -- Clerk organization ID (not FK)
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  width INTEGER,
  height INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Generations: Individual images in a batch
CREATE TABLE IF NOT EXISTS image_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES image_generation_batches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  async_task_id UUID,
  seed INTEGER,
  asset JSONB, -- {url, thumbnailUrl, width, height}
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Async Tasks: Track background processing
CREATE TABLE IF NOT EXISTS image_async_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'image_generation',
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, success, error
  metadata JSONB NOT NULL DEFAULT '{}',
  error JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_img_topics_user ON image_generation_topics(user_id, organization_id);
CREATE INDEX IF NOT EXISTS idx_img_topics_updated ON image_generation_topics(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_img_batches_topic ON image_generation_batches(topic_id);
CREATE INDEX IF NOT EXISTS idx_img_batches_created ON image_generation_batches(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_img_generations_batch ON image_generations(batch_id);
CREATE INDEX IF NOT EXISTS idx_img_tasks_user_status ON image_async_tasks(user_id, status);
CREATE INDEX IF NOT EXISTS idx_img_tasks_updated ON image_async_tasks(updated_at DESC);

-- Add comment for documentation
COMMENT ON TABLE image_generation_topics IS 'Topics for organizing image generation sessions in the playground';
COMMENT ON TABLE image_generation_batches IS 'Batches of images generated from a single prompt request';
COMMENT ON TABLE image_generations IS 'Individual generated images within a batch';
COMMENT ON TABLE image_async_tasks IS 'Async task tracking for image generation processing';
