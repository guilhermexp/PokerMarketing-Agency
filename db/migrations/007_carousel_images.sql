-- Migration 007: Add carousel images support
-- Adds column to store multiple image URLs for carousel posts

-- Add carousel_image_urls column to scheduled_posts table
ALTER TABLE scheduled_posts
ADD COLUMN IF NOT EXISTS carousel_image_urls TEXT[];

-- Comment for documentation
COMMENT ON COLUMN scheduled_posts.carousel_image_urls IS 'Array of image URLs for carousel posts, in display order';
