-- Migration 006: Add flyer_urls columns for persistent flyer storage
-- This migration adds columns to store generated flyer URLs in the database

-- Add flyer_urls JSONB column to tournament_events table
ALTER TABLE tournament_events
ADD COLUMN IF NOT EXISTS flyer_urls JSONB DEFAULT '[]';

-- Add daily_flyer_urls JSONB column to week_schedules table
ALTER TABLE week_schedules
ADD COLUMN IF NOT EXISTS daily_flyer_urls JSONB DEFAULT '{}';

-- Comments for documentation
COMMENT ON COLUMN tournament_events.flyer_urls IS 'Array of generated flyer image URLs for this event';
COMMENT ON COLUMN week_schedules.daily_flyer_urls IS 'Object mapping period (MORNING, AFTERNOON, etc) to array of flyer URLs';
