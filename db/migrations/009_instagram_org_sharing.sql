-- ============================================================================
-- Migration 009: Fix Instagram Accounts for Organization Sharing
-- ============================================================================
-- This migration fixes the instagram_accounts table to properly support
-- organization-level sharing of Instagram accounts.
--
-- PROBLEM: Previously, accounts were tied to user_id with constraint
-- UNIQUE(user_id, instagram_user_id), meaning only the user who connected
-- could use the account, even within an organization.
--
-- SOLUTION:
-- - For personal accounts: user_id is the owner
-- - For organization accounts: organization_id is the owner, user_id tracks who connected
-- ============================================================================

-- Step 1: Add column to track who connected the account (for audit purposes)
ALTER TABLE instagram_accounts
  ADD COLUMN IF NOT EXISTS connected_by_user_id UUID REFERENCES users(id);

-- Step 2: Copy existing user_id to connected_by_user_id for existing records
UPDATE instagram_accounts
SET connected_by_user_id = user_id
WHERE connected_by_user_id IS NULL;

-- Step 3: Drop the old constraint that was per-user
ALTER TABLE instagram_accounts
  DROP CONSTRAINT IF EXISTS instagram_accounts_user_id_instagram_user_id_key;

-- Step 4: Make user_id nullable (for org accounts, user_id can be null)
ALTER TABLE instagram_accounts
  ALTER COLUMN user_id DROP NOT NULL;

-- Step 5: Add check constraint to ensure either user_id OR organization_id is set
ALTER TABLE instagram_accounts
  ADD CONSTRAINT instagram_accounts_owner_check
  CHECK (user_id IS NOT NULL OR organization_id IS NOT NULL);

-- Step 6: Create partial unique indexes for proper constraints
-- For organization accounts: unique instagram account per organization
CREATE UNIQUE INDEX IF NOT EXISTS idx_instagram_accounts_org_unique
  ON instagram_accounts(organization_id, instagram_user_id)
  WHERE organization_id IS NOT NULL AND is_active = TRUE;

-- For personal accounts: unique instagram account per user (when no org)
CREATE UNIQUE INDEX IF NOT EXISTS idx_instagram_accounts_user_unique
  ON instagram_accounts(user_id, instagram_user_id)
  WHERE organization_id IS NULL AND user_id IS NOT NULL AND is_active = TRUE;

-- Step 7: Add index for connected_by lookup
CREATE INDEX IF NOT EXISTS idx_instagram_accounts_connected_by
  ON instagram_accounts(connected_by_user_id);

-- Step 8: Comments for documentation
COMMENT ON COLUMN instagram_accounts.user_id IS 'Owner user for personal accounts. NULL for organization accounts.';
COMMENT ON COLUMN instagram_accounts.organization_id IS 'Owner organization. When set, all org members can use this account.';
COMMENT ON COLUMN instagram_accounts.connected_by_user_id IS 'User who originally connected this account (for audit trail).';
