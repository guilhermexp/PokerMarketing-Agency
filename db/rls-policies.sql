-- ============================================================================
-- RLS Policies for Neon + Clerk (Production Setup)
-- Run this AFTER the main schema is created
-- ============================================================================
--
-- SECURITY MODEL:
-- ===============
-- 1. API Security (PRIMARY):
--    - All queries include WHERE user_id = X or organization_id = X
--    - Validated at application level before each query
--    - Works with Neon serverless pooler
--
-- 2. RLS Security (SECONDARY):
--    - Protects direct database access (psql, DB clients, SQL injection)
--    - neondb_owner BYPASSES RLS (used by API - has superuser rights)
--    - Other roles blocked by RLS policies
--
-- 3. Role-based Access:
--    - neondb_owner: Full access (API backend)
--    - app_readonly: Read-only for analytics/reporting
--    - No public access
--
-- ============================================================================

-- ============================================================================
-- CREATE RESTRICTED ROLES (for future use)
-- ============================================================================

-- Read-only role for analytics/reporting dashboards
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_readonly') THEN
    CREATE ROLE app_readonly NOLOGIN;
  END IF;
END $$;

-- Grant read-only access to app_readonly
GRANT USAGE ON SCHEMA public TO app_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO app_readonly;

-- ============================================================================
-- ENABLE RLS ON ALL USER-DATA TABLES
-- ============================================================================

-- Core tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_clip_scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_creatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE gallery_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE week_schedules ENABLE ROW LEVEL SECURITY;

-- Chat tables
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Background jobs
ALTER TABLE generation_jobs ENABLE ROW LEVEL SECURITY;

-- Analytics (read-only for users)
ALTER TABLE analytics_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_platform ENABLE ROW LEVEL SECURITY;

-- Audit logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- DROP EXISTING POLICIES (clean slate)
-- ============================================================================

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

-- ============================================================================
-- POLICIES: Block all access for non-owner roles
-- The neondb_owner role automatically bypasses RLS
-- ============================================================================

-- Users table
CREATE POLICY "deny_all" ON users FOR ALL TO PUBLIC USING (false);

-- Brand profiles
CREATE POLICY "deny_all" ON brand_profiles FOR ALL TO PUBLIC USING (false);

-- Campaigns
CREATE POLICY "deny_all" ON campaigns FOR ALL TO PUBLIC USING (false);

-- Video clip scripts
CREATE POLICY "deny_all" ON video_clip_scripts FOR ALL TO PUBLIC USING (false);

-- Posts
CREATE POLICY "deny_all" ON posts FOR ALL TO PUBLIC USING (false);

-- Ad creatives
CREATE POLICY "deny_all" ON ad_creatives FOR ALL TO PUBLIC USING (false);

-- Gallery images
CREATE POLICY "deny_all" ON gallery_images FOR ALL TO PUBLIC USING (false);

-- Scheduled posts
CREATE POLICY "deny_all" ON scheduled_posts FOR ALL TO PUBLIC USING (false);

-- Tournament events
CREATE POLICY "deny_all" ON tournament_events FOR ALL TO PUBLIC USING (false);

-- Week schedules
CREATE POLICY "deny_all" ON week_schedules FOR ALL TO PUBLIC USING (false);

-- Chat sessions
CREATE POLICY "deny_all" ON chat_sessions FOR ALL TO PUBLIC USING (false);

-- Chat messages
CREATE POLICY "deny_all" ON chat_messages FOR ALL TO PUBLIC USING (false);

-- Generation jobs
CREATE POLICY "deny_all" ON generation_jobs FOR ALL TO PUBLIC USING (false);

-- Analytics daily
CREATE POLICY "deny_all" ON analytics_daily FOR ALL TO PUBLIC USING (false);

-- Analytics platform
CREATE POLICY "deny_all" ON analytics_platform FOR ALL TO PUBLIC USING (false);

-- Audit logs
CREATE POLICY "deny_all" ON audit_logs FOR ALL TO PUBLIC USING (false);

-- ============================================================================
-- FORCE RLS FOR TABLE OWNERS
-- This ensures even the table owner follows RLS when not using BYPASSRLS role
-- ============================================================================

ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE brand_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE campaigns FORCE ROW LEVEL SECURITY;
ALTER TABLE video_clip_scripts FORCE ROW LEVEL SECURITY;
ALTER TABLE posts FORCE ROW LEVEL SECURITY;
ALTER TABLE ad_creatives FORCE ROW LEVEL SECURITY;
ALTER TABLE gallery_images FORCE ROW LEVEL SECURITY;
ALTER TABLE scheduled_posts FORCE ROW LEVEL SECURITY;
ALTER TABLE tournament_events FORCE ROW LEVEL SECURITY;
ALTER TABLE week_schedules FORCE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE chat_messages FORCE ROW LEVEL SECURITY;
ALTER TABLE generation_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE analytics_daily FORCE ROW LEVEL SECURITY;
ALTER TABLE analytics_platform FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Check RLS status:
-- SELECT tablename, rowsecurity, forcerowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;

-- Check policies:
-- SELECT tablename, policyname, permissive, roles, cmd, qual FROM pg_policies WHERE schemaname = 'public';

-- Test access (should fail with permission denied):
-- SET ROLE app_readonly;
-- SELECT * FROM users LIMIT 1;
-- RESET ROLE;

-- ============================================================================
-- NOTES FOR PRODUCTION
-- ============================================================================
--
-- 1. The API connects as neondb_owner which has BYPASSRLS privilege
--    This means RLS doesn't affect the API - it relies on WHERE clauses
--
-- 2. RLS blocks:
--    - Direct psql access with non-owner roles
--    - SQL injection attempts to read other users' data
--    - Any third-party tools connecting with restricted roles
--
-- 3. To create a read-only connection for analytics:
--    CREATE USER analytics_user WITH PASSWORD 'xxx' IN ROLE app_readonly;
--    (This user will be blocked by RLS policies)
--
-- 4. For per-user RLS with Neon, you would need:
--    - Neon's direct connection (not pooler)
--    - Or wrap all queries in transactions with SET LOCAL
--    - Or use Neon Authorize (if available)
--
-- ============================================================================
