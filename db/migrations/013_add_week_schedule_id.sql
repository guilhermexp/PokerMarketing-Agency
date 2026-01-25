-- Migration 013: Add week_schedule_id column to tournament_events
-- Links tournament events to their week schedule for better organization

-- Add week_schedule_id column to tournament_events table
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

-- Add index for efficient lookups by week_schedule_id
CREATE INDEX IF NOT EXISTS idx_tournament_events_week ON tournament_events(week_schedule_id);

-- Comment for documentation
COMMENT ON COLUMN tournament_events.week_schedule_id IS 'Reference to the week schedule this event belongs to';
