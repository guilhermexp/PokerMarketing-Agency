-- Migration 013: Add week_schedule_id columns to tournament_events and gallery_images
-- Links tournament events and gallery images to their week schedule

-- ============================================================================
-- TOURNAMENT_EVENTS: Add week_schedule_id
-- ============================================================================

ALTER TABLE tournament_events
ADD COLUMN IF NOT EXISTS week_schedule_id UUID;

-- Add foreign key constraint (must do separately after column exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_tournament_week'
        AND table_name = 'tournament_events'
    ) THEN
        ALTER TABLE tournament_events
        ADD CONSTRAINT fk_tournament_week
        FOREIGN KEY (week_schedule_id) REFERENCES week_schedules(id) ON DELETE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tournament_events_week ON tournament_events(week_schedule_id);

-- ============================================================================
-- GALLERY_IMAGES: Add week_schedule_id and daily_flyer_period
-- ============================================================================

ALTER TABLE gallery_images
ADD COLUMN IF NOT EXISTS week_schedule_id UUID;

ALTER TABLE gallery_images
ADD COLUMN IF NOT EXISTS daily_flyer_period VARCHAR(50);

-- Add foreign key for gallery_images.week_schedule_id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_gallery_week_schedule'
        AND table_name = 'gallery_images'
    ) THEN
        ALTER TABLE gallery_images
        ADD CONSTRAINT fk_gallery_week_schedule
        FOREIGN KEY (week_schedule_id) REFERENCES week_schedules(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_gallery_images_week_schedule ON gallery_images(week_schedule_id);

-- ============================================================================
-- GALLERY_IMAGES: Add thumbnail_url if missing
-- ============================================================================

ALTER TABLE gallery_images
ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

-- Comments for documentation
COMMENT ON COLUMN tournament_events.week_schedule_id IS 'Reference to the week schedule this event belongs to';
COMMENT ON COLUMN gallery_images.week_schedule_id IS 'Reference to week schedule for daily flyers';
COMMENT ON COLUMN gallery_images.daily_flyer_period IS 'Period for daily flyer (ALL, MORNING, AFTERNOON, NIGHT, HIGHLIGHTS)';
