-- Migration: Add organizations, roles, members and invites tables
-- Enables multi-tenant team collaboration with customizable permissions

-- ============================================================================
-- ORGANIZATIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    logo_url TEXT,

    -- Owner (creator) of the organization
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

    -- Settings (JSONB for flexibility)
    settings JSONB DEFAULT '{}',

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Soft delete
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_organizations_owner ON organizations(owner_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug) WHERE deleted_at IS NULL;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_organizations_updated_at ON organizations;
CREATE TRIGGER update_organizations_updated_at
    BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- ORGANIZATION ROLES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS organization_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    name VARCHAR(100) NOT NULL,
    description TEXT,

    -- Is this a system role (Admin, Editor, Viewer)?
    is_system_role BOOLEAN DEFAULT FALSE,

    -- Permissions stored as JSONB array
    -- Available permissions:
    -- create_campaign, edit_campaign, delete_campaign,
    -- create_flyer, schedule_post, publish_post,
    -- view_gallery, delete_gallery, manage_brand,
    -- manage_members, manage_roles, manage_organization, view_analytics
    permissions JSONB NOT NULL DEFAULT '[]',

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(organization_id, name)
);

CREATE INDEX IF NOT EXISTS idx_organization_roles_org ON organization_roles(organization_id);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_organization_roles_updated_at ON organization_roles;
CREATE TRIGGER update_organization_roles_updated_at
    BEFORE UPDATE ON organization_roles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- ORGANIZATION MEMBERS TABLE
-- ============================================================================

-- Create member status enum if not exists
DO $$ BEGIN
    CREATE TYPE organization_member_status AS ENUM (
        'active',
        'inactive',
        'pending'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS organization_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES organization_roles(id) ON DELETE RESTRICT,

    -- Member status
    status organization_member_status NOT NULL DEFAULT 'active',

    -- Who invited this member
    invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
    invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    joined_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_organization_members_org ON organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_organization_members_user ON organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_organization_members_role ON organization_members(role_id);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_organization_members_updated_at ON organization_members;
CREATE TRIGGER update_organization_members_updated_at
    BEFORE UPDATE ON organization_members
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- ORGANIZATION INVITES TABLE
-- ============================================================================

-- Create invite status enum if not exists
DO $$ BEGIN
    CREATE TYPE organization_invite_status AS ENUM (
        'pending',
        'accepted',
        'declined',
        'expired',
        'cancelled'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS organization_invites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Invite details
    email VARCHAR(255) NOT NULL,
    role_id UUID NOT NULL REFERENCES organization_roles(id) ON DELETE CASCADE,

    -- Invite token (for link-based invites)
    token VARCHAR(64) UNIQUE NOT NULL,

    -- Expiration (default 7 days)
    expires_at TIMESTAMPTZ NOT NULL,

    -- Status
    status organization_invite_status NOT NULL DEFAULT 'pending',

    -- Who created the invite
    invited_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    accepted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_organization_invites_org ON organization_invites(organization_id);
CREATE INDEX IF NOT EXISTS idx_organization_invites_email ON organization_invites(email);
CREATE INDEX IF NOT EXISTS idx_organization_invites_token ON organization_invites(token);
CREATE INDEX IF NOT EXISTS idx_organization_invites_status ON organization_invites(status) WHERE status = 'pending';

-- ============================================================================
-- FUNCTION: Create default roles when organization is created
-- ============================================================================

CREATE OR REPLACE FUNCTION create_default_organization_roles()
RETURNS TRIGGER AS $$
DECLARE
    admin_role_id UUID;
BEGIN
    -- Create Admin role (all permissions)
    INSERT INTO organization_roles (organization_id, name, description, is_system_role, permissions)
    VALUES (NEW.id, 'Admin', 'Acesso completo a todas as funcionalidades', TRUE,
        '["create_campaign", "edit_campaign", "delete_campaign", "create_flyer", "schedule_post", "publish_post", "view_gallery", "delete_gallery", "manage_brand", "manage_members", "manage_roles", "manage_organization", "view_analytics"]'::jsonb)
    RETURNING id INTO admin_role_id;

    -- Create Editor role
    INSERT INTO organization_roles (organization_id, name, description, is_system_role, permissions)
    VALUES (NEW.id, 'Editor', 'Pode criar e editar conteudo, mas nao pode deletar ou gerenciar time', TRUE,
        '["create_campaign", "edit_campaign", "create_flyer", "schedule_post", "publish_post", "view_gallery", "view_analytics"]'::jsonb);

    -- Create Viewer role
    INSERT INTO organization_roles (organization_id, name, description, is_system_role, permissions)
    VALUES (NEW.id, 'Viewer', 'Acesso somente leitura', TRUE,
        '["view_gallery", "view_analytics"]'::jsonb);

    -- Add owner as Admin member
    INSERT INTO organization_members (organization_id, user_id, role_id, status, joined_at)
    VALUES (NEW.id, NEW.owner_id, admin_role_id, 'active', NOW());

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS on_organization_created ON organizations;
CREATE TRIGGER on_organization_created
    AFTER INSERT ON organizations
    FOR EACH ROW EXECUTE FUNCTION create_default_organization_roles();

-- ============================================================================
-- ADD organization_id TO EXISTING TABLES
-- ============================================================================

-- Add organization_id column to existing tables (nullable for backwards compatibility)
DO $$ BEGIN
    -- brand_profiles
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'brand_profiles' AND column_name = 'organization_id') THEN
        ALTER TABLE brand_profiles ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
        CREATE INDEX idx_brand_profiles_org ON brand_profiles(organization_id) WHERE deleted_at IS NULL;
    END IF;

    -- campaigns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'campaigns' AND column_name = 'organization_id') THEN
        ALTER TABLE campaigns ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
        CREATE INDEX idx_campaigns_org ON campaigns(organization_id) WHERE deleted_at IS NULL;
    END IF;

    -- posts
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'posts' AND column_name = 'organization_id') THEN
        ALTER TABLE posts ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
        CREATE INDEX idx_posts_org ON posts(organization_id);
    END IF;

    -- ad_creatives
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ad_creatives' AND column_name = 'organization_id') THEN
        ALTER TABLE ad_creatives ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
        CREATE INDEX idx_ad_creatives_org ON ad_creatives(organization_id);
    END IF;

    -- video_clip_scripts
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'video_clip_scripts' AND column_name = 'organization_id') THEN
        ALTER TABLE video_clip_scripts ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
        CREATE INDEX idx_video_scripts_org ON video_clip_scripts(organization_id);
    END IF;

    -- gallery_images
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'gallery_images' AND column_name = 'organization_id') THEN
        ALTER TABLE gallery_images ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
        CREATE INDEX idx_gallery_org ON gallery_images(organization_id) WHERE deleted_at IS NULL;
    END IF;

    -- scheduled_posts
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scheduled_posts' AND column_name = 'organization_id') THEN
        ALTER TABLE scheduled_posts ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
        CREATE INDEX idx_scheduled_posts_org ON scheduled_posts(organization_id);
    END IF;

    -- week_schedules
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'week_schedules' AND column_name = 'organization_id') THEN
        ALTER TABLE week_schedules ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
        CREATE INDEX idx_week_schedules_org ON week_schedules(organization_id);
    END IF;

    -- tournament_events
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tournament_events' AND column_name = 'organization_id') THEN
        ALTER TABLE tournament_events ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
        CREATE INDEX idx_tournaments_org ON tournament_events(organization_id);
    END IF;

    -- generation_jobs
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'generation_jobs' AND column_name = 'organization_id') THEN
        ALTER TABLE generation_jobs ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
        CREATE INDEX idx_generation_jobs_org ON generation_jobs(organization_id);
    END IF;

    -- chat_sessions
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_sessions' AND column_name = 'organization_id') THEN
        ALTER TABLE chat_sessions ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
        CREATE INDEX idx_chat_sessions_org ON chat_sessions(organization_id);
    END IF;
END $$;

-- ============================================================================
-- HELPER FUNCTION: Check if user has permission in organization
-- ============================================================================

CREATE OR REPLACE FUNCTION user_has_organization_permission(
    p_user_id UUID,
    p_organization_id UUID,
    p_permission TEXT
) RETURNS BOOLEAN AS $$
DECLARE
    user_permissions JSONB;
BEGIN
    SELECT r.permissions INTO user_permissions
    FROM organization_members m
    JOIN organization_roles r ON m.role_id = r.id
    WHERE m.user_id = p_user_id
      AND m.organization_id = p_organization_id
      AND m.status = 'active'
    LIMIT 1;

    IF user_permissions IS NULL THEN
        RETURN FALSE;
    END IF;

    RETURN user_permissions ? p_permission;
END;
$$ LANGUAGE plpgsql;

-- Success message
DO $$ BEGIN
    RAISE NOTICE 'Migration completed: organizations, roles, members, and invites tables created';
END $$;
