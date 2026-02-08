-- Migration 014: Add daily_flyer_day column to gallery_images
-- This allows filtering flyers by day of the week (MONDAY, TUESDAY, etc)

ALTER TABLE gallery_images
ADD COLUMN IF NOT EXISTS daily_flyer_day VARCHAR(20);

-- Create index for efficient queries by week_schedule_id + day + period
CREATE INDEX IF NOT EXISTS idx_gallery_images_daily_flyers
ON gallery_images(week_schedule_id, daily_flyer_day, daily_flyer_period)
WHERE week_schedule_id IS NOT NULL;

COMMENT ON COLUMN gallery_images.daily_flyer_day IS 'Day of week for daily flyer (MONDAY, TUESDAY, etc)';
