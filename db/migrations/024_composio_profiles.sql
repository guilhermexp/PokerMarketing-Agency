-- ============================================================================
-- Composio MCP Integration - Profile Storage
-- Stores encrypted MCP connection profiles for external app integrations
-- ============================================================================

CREATE TABLE IF NOT EXISTS composio_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  toolkit_slug TEXT NOT NULL,
  toolkit_name TEXT NOT NULL,
  profile_name TEXT NOT NULL,
  encrypted_config TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  connected_account_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, toolkit_slug, profile_name)
);

CREATE INDEX IF NOT EXISTS idx_composio_profiles_user ON composio_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_composio_profiles_toolkit ON composio_profiles(toolkit_slug);
