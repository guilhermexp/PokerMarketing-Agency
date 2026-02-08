-- Migration: Video Generation Playground
-- Created: 2026-02-07
-- Description: Add tables for video generation playground feature

-- Topics: Container for generation sessions
CREATE TABLE IF NOT EXISTS video_generation_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id TEXT, -- Clerk organization ID (not FK)
  title TEXT,
  cover_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Sessions: Individual video generation sessions
CREATE TABLE IF NOT EXISTS video_generation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL REFERENCES video_generation_topics(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id TEXT, -- Clerk organization ID (not FK)
  model TEXT NOT NULL,
  prompt TEXT NOT NULL,
  aspect_ratio TEXT NOT NULL DEFAULT '9:16',
  resolution TEXT NOT NULL DEFAULT '720p',
  reference_image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Generations: Individual generated videos in a session
CREATE TABLE IF NOT EXISTS video_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES video_generation_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, generating, success, error
  video_url TEXT,
  duration INTEGER, -- Duration in seconds
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_vid_topics_user ON video_generation_topics(user_id, organization_id);
CREATE INDEX IF NOT EXISTS idx_vid_topics_updated ON video_generation_topics(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_vid_sessions_topic ON video_generation_sessions(topic_id);
CREATE INDEX IF NOT EXISTS idx_vid_sessions_created ON video_generation_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vid_generations_session ON video_generations(session_id);
CREATE INDEX IF NOT EXISTS idx_vid_generations_status ON video_generations(status);

-- Add comment for documentation
COMMENT ON TABLE video_generation_topics IS 'Topics for organizing video generation sessions in the playground';
COMMENT ON TABLE video_generation_sessions IS 'Video generation sessions with prompt and settings';
COMMENT ON TABLE video_generations IS 'Individual generated videos within a session';
