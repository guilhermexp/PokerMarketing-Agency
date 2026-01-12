-- ============================================================================
-- Migration 011: Enable RLS on New Tables
-- Adds Row Level Security to tables created after initial RLS setup
-- ============================================================================
--
-- TABLES COVERED:
--   - instagram_accounts (from migration 004)
--   - carousel_scripts (from migration 008)
--   - model_pricing (from migration 005)
--   - api_usage_logs (from migration 005)
--   - aggregated_usage (from migration 005)
--   - activity_logs (from migration 005)
--
-- SECURITY MODEL:
--   Same as main rls-policies.sql:
--   - neondb_owner BYPASSES RLS (API backend)
--   - All other roles are blocked by "deny_all" policy
--   - Application layer enforces user_id/organization_id filtering
--
-- ============================================================================

-- ============================================================================
-- ENABLE RLS ON ALL NEW TABLES
-- ============================================================================

-- Instagram accounts (user data)
ALTER TABLE instagram_accounts ENABLE ROW LEVEL SECURITY;

-- Carousel scripts (user content)
ALTER TABLE carousel_scripts ENABLE ROW LEVEL SECURITY;

-- Admin tracking tables
ALTER TABLE model_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE aggregated_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- DROP EXISTING POLICIES IF ANY (clean slate for these tables)
-- ============================================================================

DROP POLICY IF EXISTS "deny_all" ON instagram_accounts;
DROP POLICY IF EXISTS "deny_all" ON carousel_scripts;
DROP POLICY IF EXISTS "deny_all" ON model_pricing;
DROP POLICY IF EXISTS "deny_all" ON api_usage_logs;
DROP POLICY IF EXISTS "deny_all" ON aggregated_usage;
DROP POLICY IF EXISTS "deny_all" ON activity_logs;

-- ============================================================================
-- CREATE DENY_ALL POLICIES
-- The neondb_owner role automatically bypasses RLS
-- ============================================================================

-- Instagram accounts - sensitive tokens, must be protected
CREATE POLICY "deny_all" ON instagram_accounts
    FOR ALL TO PUBLIC
    USING (false);

-- Carousel scripts - user-generated content
CREATE POLICY "deny_all" ON carousel_scripts
    FOR ALL TO PUBLIC
    USING (false);

-- Model pricing - admin only (read-only for most)
CREATE POLICY "deny_all" ON model_pricing
    FOR ALL TO PUBLIC
    USING (false);

-- API usage logs - contains user activity data
CREATE POLICY "deny_all" ON api_usage_logs
    FOR ALL TO PUBLIC
    USING (false);

-- Aggregated usage - billing and analytics data
CREATE POLICY "deny_all" ON aggregated_usage
    FOR ALL TO PUBLIC
    USING (false);

-- Activity logs - audit trail, sensitive
CREATE POLICY "deny_all" ON activity_logs
    FOR ALL TO PUBLIC
    USING (false);

-- ============================================================================
-- FORCE RLS FOR TABLE OWNERS
-- Ensures even table owner follows RLS when not using BYPASSRLS role
-- ============================================================================

ALTER TABLE instagram_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE carousel_scripts FORCE ROW LEVEL SECURITY;
ALTER TABLE model_pricing FORCE ROW LEVEL SECURITY;
ALTER TABLE api_usage_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE aggregated_usage FORCE ROW LEVEL SECURITY;
ALTER TABLE activity_logs FORCE ROW LEVEL SECURITY;

-- ============================================================================
-- VERIFICATION
-- Run these queries to verify RLS is enabled:
--
-- SELECT tablename, rowsecurity, forcerowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public'
--   AND tablename IN (
--     'instagram_accounts', 'carousel_scripts', 'model_pricing',
--     'api_usage_logs', 'aggregated_usage', 'activity_logs'
--   );
--
-- SELECT tablename, policyname, cmd, qual
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename IN (
--     'instagram_accounts', 'carousel_scripts', 'model_pricing',
--     'api_usage_logs', 'aggregated_usage', 'activity_logs'
--   );
-- ============================================================================
