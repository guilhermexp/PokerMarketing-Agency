-- ============================================================================
-- Migration 004: Instagram Accounts (Multi-tenant Rube MCP Integration)
-- ============================================================================
-- Run this migration to add multi-user Instagram publishing support

-- Create instagram_accounts table
CREATE TABLE IF NOT EXISTS instagram_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id VARCHAR(50),

    -- Instagram account details
    instagram_user_id VARCHAR(255) NOT NULL,
    instagram_username VARCHAR(255),

    -- Rube MCP token for this account
    rube_token TEXT NOT NULL,

    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    UNIQUE(user_id, instagram_user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_instagram_accounts_user
    ON instagram_accounts(user_id) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_instagram_accounts_org
    ON instagram_accounts(organization_id) WHERE is_active = TRUE;

-- Add FK column to scheduled_posts
ALTER TABLE scheduled_posts
    ADD COLUMN IF NOT EXISTS instagram_account_id UUID REFERENCES instagram_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_scheduled_posts_instagram
    ON scheduled_posts(instagram_account_id);

-- Trigger for updated_at
CREATE TRIGGER update_instagram_accounts_updated_at
    BEFORE UPDATE ON instagram_accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Note: Security is enforced at the application layer via Clerk JWT validation.
-- API endpoints filter by user_id/organization_id after token verification.
