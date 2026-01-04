/**
 * Run organizations migration
 * Usage: node db/run-organizations-migration.mjs
 */

import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';

config();

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL not configured');
  process.exit(1);
}

async function runMigration() {
  const sql = neon(DATABASE_URL);

  console.log('Running organizations migration...\n');

  try {
    // ============================================================================
    // ORGANIZATIONS TABLE
    // ============================================================================
    console.log('Creating organizations table...');
    await sql`
      CREATE TABLE IF NOT EXISTS organizations (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(100) UNIQUE NOT NULL,
        description TEXT,
        logo_url TEXT,
        owner_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        settings JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ
      )
    `;
    console.log('✓ Created organizations table');

    await sql`CREATE INDEX IF NOT EXISTS idx_organizations_owner ON organizations(owner_id) WHERE deleted_at IS NULL`;
    await sql`CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug) WHERE deleted_at IS NULL`;
    console.log('✓ Created organizations indexes');

    // ============================================================================
    // ORGANIZATION ROLES TABLE
    // ============================================================================
    console.log('\nCreating organization_roles table...');
    await sql`
      CREATE TABLE IF NOT EXISTS organization_roles (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        is_system_role BOOLEAN DEFAULT FALSE,
        permissions JSONB NOT NULL DEFAULT '[]',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(organization_id, name)
      )
    `;
    console.log('✓ Created organization_roles table');

    await sql`CREATE INDEX IF NOT EXISTS idx_organization_roles_org ON organization_roles(organization_id)`;
    console.log('✓ Created organization_roles indexes');

    // ============================================================================
    // ORGANIZATION MEMBERS TABLE
    // ============================================================================
    console.log('\nCreating member status enum...');
    await sql`
      DO $$ BEGIN
        CREATE TYPE organization_member_status AS ENUM ('active', 'inactive', 'pending');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$
    `;
    console.log('✓ Created organization_member_status enum');

    console.log('Creating organization_members table...');
    await sql`
      CREATE TABLE IF NOT EXISTS organization_members (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role_id UUID NOT NULL REFERENCES organization_roles(id) ON DELETE RESTRICT,
        status organization_member_status NOT NULL DEFAULT 'active',
        invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
        invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        joined_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(organization_id, user_id)
      )
    `;
    console.log('✓ Created organization_members table');

    await sql`CREATE INDEX IF NOT EXISTS idx_organization_members_org ON organization_members(organization_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_organization_members_user ON organization_members(user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_organization_members_role ON organization_members(role_id)`;
    console.log('✓ Created organization_members indexes');

    // ============================================================================
    // ORGANIZATION INVITES TABLE
    // ============================================================================
    console.log('\nCreating invite status enum...');
    await sql`
      DO $$ BEGIN
        CREATE TYPE organization_invite_status AS ENUM ('pending', 'accepted', 'declined', 'expired', 'cancelled');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$
    `;
    console.log('✓ Created organization_invite_status enum');

    console.log('Creating organization_invites table...');
    await sql`
      CREATE TABLE IF NOT EXISTS organization_invites (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        email VARCHAR(255) NOT NULL,
        role_id UUID NOT NULL REFERENCES organization_roles(id) ON DELETE CASCADE,
        token VARCHAR(64) UNIQUE NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        status organization_invite_status NOT NULL DEFAULT 'pending',
        invited_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        accepted_at TIMESTAMPTZ
      )
    `;
    console.log('✓ Created organization_invites table');

    await sql`CREATE INDEX IF NOT EXISTS idx_organization_invites_org ON organization_invites(organization_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_organization_invites_email ON organization_invites(email)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_organization_invites_token ON organization_invites(token)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_organization_invites_status ON organization_invites(status) WHERE status = 'pending'`;
    console.log('✓ Created organization_invites indexes');

    // ============================================================================
    // TRIGGER FOR DEFAULT ROLES
    // ============================================================================
    console.log('\nCreating default roles trigger...');
    await sql`
      CREATE OR REPLACE FUNCTION create_default_organization_roles()
      RETURNS TRIGGER AS $$
      DECLARE
        admin_role_id UUID;
      BEGIN
        INSERT INTO organization_roles (organization_id, name, description, is_system_role, permissions)
        VALUES (NEW.id, 'Admin', 'Acesso completo a todas as funcionalidades', TRUE,
          '["create_campaign", "edit_campaign", "delete_campaign", "create_flyer", "schedule_post", "publish_post", "view_gallery", "delete_gallery", "manage_brand", "manage_members", "manage_roles", "manage_organization", "view_analytics"]'::jsonb)
        RETURNING id INTO admin_role_id;

        INSERT INTO organization_roles (organization_id, name, description, is_system_role, permissions)
        VALUES (NEW.id, 'Editor', 'Pode criar e editar conteudo, mas nao pode deletar ou gerenciar time', TRUE,
          '["create_campaign", "edit_campaign", "create_flyer", "schedule_post", "publish_post", "view_gallery", "view_analytics"]'::jsonb);

        INSERT INTO organization_roles (organization_id, name, description, is_system_role, permissions)
        VALUES (NEW.id, 'Viewer', 'Acesso somente leitura', TRUE,
          '["view_gallery", "view_analytics"]'::jsonb);

        INSERT INTO organization_members (organization_id, user_id, role_id, status, joined_at)
        VALUES (NEW.id, NEW.owner_id, admin_role_id, 'active', NOW());

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `;
    console.log('✓ Created create_default_organization_roles function');

    await sql`DROP TRIGGER IF EXISTS on_organization_created ON organizations`;
    await sql`
      CREATE TRIGGER on_organization_created
        AFTER INSERT ON organizations
        FOR EACH ROW EXECUTE FUNCTION create_default_organization_roles()
    `;
    console.log('✓ Created on_organization_created trigger');

    // ============================================================================
    // ADD organization_id TO EXISTING TABLES
    // ============================================================================
    console.log('\nAdding organization_id to existing tables...');

    const tables = [
      'brand_profiles',
      'campaigns',
      'posts',
      'ad_creatives',
      'video_clip_scripts',
      'gallery_images',
      'scheduled_posts',
      'week_schedules',
      'tournament_events',
      'generation_jobs',
      'chat_sessions'
    ];

    for (const table of tables) {
      try {
        await sql`
          ALTER TABLE ${sql(table)} ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE
        `;
        console.log(`✓ Added organization_id to ${table}`);
      } catch (e) {
        // Column might already exist or table might not exist
        console.log(`  Skipped ${table}: ${e.message}`);
      }
    }

    // Create indexes for organization queries
    console.log('\nCreating organization indexes on existing tables...');
    const indexQueries = [
      { table: 'brand_profiles', where: 'WHERE deleted_at IS NULL' },
      { table: 'campaigns', where: 'WHERE deleted_at IS NULL' },
      { table: 'posts', where: '' },
      { table: 'ad_creatives', where: '' },
      { table: 'video_clip_scripts', where: '' },
      { table: 'gallery_images', where: 'WHERE deleted_at IS NULL' },
      { table: 'scheduled_posts', where: '' },
      { table: 'week_schedules', where: '' },
      { table: 'tournament_events', where: '' },
      { table: 'generation_jobs', where: '' },
      { table: 'chat_sessions', where: '' }
    ];

    for (const { table } of indexQueries) {
      try {
        const indexName = `idx_${table}_org`;
        await sql`CREATE INDEX IF NOT EXISTS ${sql(indexName)} ON ${sql(table)}(organization_id)`;
        console.log(`✓ Created index on ${table}`);
      } catch (e) {
        console.log(`  Skipped index on ${table}: ${e.message}`);
      }
    }

    // ============================================================================
    // HELPER FUNCTION
    // ============================================================================
    console.log('\nCreating helper function...');
    await sql`
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
      $$ LANGUAGE plpgsql
    `;
    console.log('✓ Created user_has_organization_permission function');

    // ============================================================================
    // UPDATED_AT TRIGGERS
    // ============================================================================
    console.log('\nCreating updated_at triggers...');
    const triggeredTables = ['organizations', 'organization_roles', 'organization_members'];
    for (const table of triggeredTables) {
      await sql`DROP TRIGGER IF EXISTS ${sql(`update_${table}_updated_at`)} ON ${sql(table)}`;
      await sql`
        CREATE TRIGGER ${sql(`update_${table}_updated_at`)}
          BEFORE UPDATE ON ${sql(table)}
          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
      `;
      console.log(`✓ Created trigger for ${table}`);
    }

    console.log('\n✅ Organizations migration completed successfully!');
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

runMigration();
