-- Migration: Fix carousel previews for campaigns
-- This adds carousel_script_id column if missing and populates cover_url

-- 1. Ensure carousel_script_id column exists in gallery_images
ALTER TABLE gallery_images
ADD COLUMN IF NOT EXISTS carousel_script_id UUID REFERENCES carousel_scripts(id) ON DELETE CASCADE;

-- 2. Update existing carousel_scripts to set cover_url from gallery images
-- This finds the first image that was created for a carousel (based on timestamp proximity)
UPDATE carousel_scripts cs
SET cover_url = subquery.src_url
FROM (
  SELECT DISTINCT ON (cs.id)
    cs.id as carousel_id,
    gi.src_url
  FROM carousel_scripts cs
  INNER JOIN campaigns c ON c.id = cs.campaign_id
  INNER JOIN gallery_images gi ON gi.user_id = cs.user_id
    AND gi.organization_id = cs.organization_id
    AND gi.src_url IS NOT NULL
    AND gi.src_url NOT LIKE 'data:%'
    -- Match images created around the same time as the carousel (within 1 hour)
    AND gi.created_at >= cs.created_at - INTERVAL '1 hour'
    AND gi.created_at <= cs.created_at + INTERVAL '2 hours'
  WHERE cs.cover_url IS NULL
  ORDER BY cs.id, ABS(EXTRACT(EPOCH FROM (gi.created_at - cs.created_at)))
) subquery
WHERE cs.id = subquery.carousel_id;

-- 3. Show summary
SELECT
  (SELECT COUNT(*) FROM carousel_scripts WHERE cover_url IS NOT NULL) as "Carousels with cover",
  (SELECT COUNT(*) FROM carousel_scripts WHERE cover_url IS NULL) as "Carousels without cover";
