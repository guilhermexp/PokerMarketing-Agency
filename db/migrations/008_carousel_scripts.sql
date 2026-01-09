-- Migration: Add carousel_scripts table
-- Similar to video_clip_scripts but for Instagram carousels

-- ============================================================================
-- CAROUSEL SCRIPTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS carousel_scripts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id VARCHAR(50),  -- Clerk organization ID

    title VARCHAR(500) NOT NULL,
    hook TEXT NOT NULL,
    cover_prompt TEXT,
    caption TEXT,

    -- Slides stored as JSONB array
    -- [{slide: number, visual: string, text: string, image_url?: string}]
    slides JSONB NOT NULL DEFAULT '[]',

    -- Generated cover image
    cover_url TEXT,

    -- Order within campaign
    sort_order INTEGER DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_carousel_scripts_campaign ON carousel_scripts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_carousel_scripts_user ON carousel_scripts(user_id);
CREATE INDEX IF NOT EXISTS idx_carousel_scripts_org ON carousel_scripts(organization_id);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_carousel_scripts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_carousel_scripts_updated_at ON carousel_scripts;
CREATE TRIGGER update_carousel_scripts_updated_at
    BEFORE UPDATE ON carousel_scripts
    FOR EACH ROW EXECUTE FUNCTION update_carousel_scripts_updated_at();

-- ============================================================================
-- ADD carousel_script_id TO gallery_images
-- ============================================================================

ALTER TABLE gallery_images
ADD COLUMN IF NOT EXISTS carousel_script_id UUID REFERENCES carousel_scripts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_gallery_images_carousel ON gallery_images(carousel_script_id)
WHERE carousel_script_id IS NOT NULL AND deleted_at IS NULL;

-- ============================================================================
-- UPDATE campaign_summaries VIEW (if exists)
-- ============================================================================

-- Drop and recreate the view to include carousel count
DROP VIEW IF EXISTS campaign_summaries;

CREATE OR REPLACE VIEW campaign_summaries AS
SELECT
    c.id,
    c.user_id,
    c.organization_id,
    c.name,
    c.status,
    c.created_at,
    c.updated_at,
    COALESCE(video_counts.count, 0) as video_count,
    COALESCE(post_counts.count, 0) as post_count,
    COALESCE(ad_counts.count, 0) as ad_count,
    COALESCE(carousel_counts.count, 0) as carousel_count
FROM campaigns c
LEFT JOIN (
    SELECT campaign_id, COUNT(*) as count
    FROM video_clip_scripts
    GROUP BY campaign_id
) video_counts ON c.id = video_counts.campaign_id
LEFT JOIN (
    SELECT campaign_id, COUNT(*) as count
    FROM posts
    WHERE campaign_id IS NOT NULL
    GROUP BY campaign_id
) post_counts ON c.id = post_counts.campaign_id
LEFT JOIN (
    SELECT campaign_id, COUNT(*) as count
    FROM ad_creatives
    WHERE campaign_id IS NOT NULL
    GROUP BY campaign_id
) ad_counts ON c.id = ad_counts.campaign_id
LEFT JOIN (
    SELECT campaign_id, COUNT(*) as count
    FROM carousel_scripts
    GROUP BY campaign_id
) carousel_counts ON c.id = carousel_counts.campaign_id;
