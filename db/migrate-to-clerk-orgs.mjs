/**
 * Migrate existing organizations to Clerk Organizations
 *
 * This script:
 * 1. Reads existing organizations from the database
 * 2. Creates corresponding organizations in Clerk
 * 3. Maps old UUID → new Clerk org ID
 * 4. Updates all content tables with the new org IDs
 * 5. Adds members to Clerk organizations
 *
 * Prerequisites:
 * - CLERK_SECRET_KEY must be set in .env
 * - DATABASE_URL must be set in .env
 * - Run BEFORE running 003_clerk_organizations.sql migration
 *
 * Usage: node db/migrate-to-clerk-orgs.mjs
 */

import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';

config();

const DATABASE_URL = process.env.DATABASE_URL;
const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not configured');
  process.exit(1);
}

if (!CLERK_SECRET_KEY) {
  console.error('❌ CLERK_SECRET_KEY not configured');
  console.error('   Get it from: https://dashboard.clerk.com → API Keys');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

// Clerk API base URL
const CLERK_API = 'https://api.clerk.com/v1';

/**
 * Make a request to Clerk API
 */
async function clerkApi(endpoint, options = {}) {
  const response = await fetch(`${CLERK_API}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${CLERK_SECRET_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(`Clerk API error: ${response.status} - ${JSON.stringify(error)}`);
  }

  return response.json();
}

/**
 * Get Clerk user by external ID (our database user ID)
 */
async function getClerkUserByExternalId(externalId) {
  try {
    const users = await clerkApi(`/users?external_id=${externalId}`);
    return users[0] || null;
  } catch {
    return null;
  }
}

/**
 * Get Clerk user by email
 */
async function getClerkUserByEmail(email) {
  try {
    const users = await clerkApi(`/users?email_address=${encodeURIComponent(email)}`);
    return users[0] || null;
  } catch {
    return null;
  }
}

/**
 * Create organization in Clerk
 */
async function createClerkOrganization(name, slug, createdByUserId) {
  return clerkApi('/organizations', {
    method: 'POST',
    body: JSON.stringify({
      name,
      slug,
      created_by: createdByUserId,
    }),
  });
}

/**
 * Add member to Clerk organization
 */
async function addClerkOrgMember(organizationId, userId, role = 'org:member') {
  return clerkApi(`/organizations/${organizationId}/memberships`, {
    method: 'POST',
    body: JSON.stringify({
      user_id: userId,
      role,
    }),
  });
}

/**
 * Content tables that have organization_id column
 */
const CONTENT_TABLES = [
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
  'chat_sessions',
];

async function migrate() {
  console.log('🚀 Starting Clerk Organizations migration...\n');

  // Step 1: Check if organizations table exists
  const tableExists = await sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_name = 'organizations'
    )
  `;

  if (!tableExists[0].exists) {
    console.log('ℹ️  No organizations table found. Nothing to migrate.');
    console.log('   You can proceed directly with the SQL migration.');
    return;
  }

  // Step 2: Get all existing organizations
  console.log('📋 Fetching existing organizations...');
  const organizations = await sql`
    SELECT o.*, u.email as owner_email
    FROM organizations o
    LEFT JOIN users u ON o.owner_id = u.id
    WHERE o.deleted_at IS NULL
  `;

  if (organizations.length === 0) {
    console.log('ℹ️  No organizations found. Nothing to migrate.');
    return;
  }

  console.log(`   Found ${organizations.length} organization(s)\n`);

  // Step 3: Create mapping table for old UUID → new Clerk ID
  const orgMapping = new Map(); // oldUUID -> clerkOrgId

  // Step 4: Process each organization
  for (const org of organizations) {
    console.log(`\n📦 Processing: "${org.name}" (${org.id})`);

    try {
      // Find owner in Clerk by email
      let ownerClerkUser = null;
      if (org.owner_email) {
        ownerClerkUser = await getClerkUserByEmail(org.owner_email);
      }

      if (!ownerClerkUser) {
        console.log(`   ⚠️  Owner not found in Clerk (email: ${org.owner_email})`);
        console.log(`   ⚠️  Skipping this organization - owner must sign in first`);
        continue;
      }

      console.log(`   ✓ Found owner in Clerk: ${ownerClerkUser.id}`);

      // Create organization in Clerk
      let clerkOrg;
      try {
        clerkOrg = await createClerkOrganization(
          org.name,
          org.slug,
          ownerClerkUser.id
        );
        console.log(`   ✓ Created in Clerk: ${clerkOrg.id}`);
      } catch (error) {
        // Organization might already exist
        if (error.message.includes('already exists')) {
          console.log(`   ℹ️  Organization already exists in Clerk`);
          // TODO: fetch existing org by slug
          continue;
        }
        throw error;
      }

      // Store mapping
      orgMapping.set(org.id, clerkOrg.id);

      // Step 5: Add members to Clerk organization
      const members = await sql`
        SELECT m.*, u.email, r.name as role_name
        FROM organization_members m
        JOIN users u ON m.user_id = u.id
        JOIN organization_roles r ON m.role_id = r.id
        WHERE m.organization_id = ${org.id}
          AND m.status = 'active'
          AND m.user_id != ${org.owner_id}
      `;

      for (const member of members) {
        const memberClerkUser = await getClerkUserByEmail(member.email);
        if (!memberClerkUser) {
          console.log(`   ⚠️  Member not found in Clerk: ${member.email}`);
          continue;
        }

        // Map role to Clerk role (Admin → org:admin, others → org:member)
        const clerkRole = member.role_name === 'Admin' ? 'org:admin' : 'org:member';

        try {
          await addClerkOrgMember(clerkOrg.id, memberClerkUser.id, clerkRole);
          console.log(`   ✓ Added member: ${member.email} as ${clerkRole}`);
        } catch (error) {
          if (error.message.includes('already a member')) {
            console.log(`   ℹ️  Member already exists: ${member.email}`);
          } else {
            console.log(`   ⚠️  Failed to add member: ${error.message}`);
          }
        }
      }

    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
    }
  }

  // Step 6: Update content tables with new Clerk org IDs
  console.log('\n\n📝 Updating content tables...\n');

  for (const [oldId, newId] of orgMapping) {
    console.log(`   Mapping: ${oldId} → ${newId}`);

    for (const table of CONTENT_TABLES) {
      try {
        // Check if table has organization_id column
        const hasColumn = await sql`
          SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = ${table} AND column_name = 'organization_id'
          )
        `;

        if (!hasColumn[0].exists) continue;

        // Update rows
        const result = await sql`
          UPDATE ${sql(table)}
          SET organization_id = ${newId}
          WHERE organization_id::text = ${oldId}
        `;

        if (result.count > 0) {
          console.log(`   ✓ ${table}: ${result.count} row(s) updated`);
        }
      } catch (error) {
        console.log(`   ⚠️  ${table}: ${error.message}`);
      }
    }
  }

  // Summary
  console.log('\n\n✅ Migration completed!\n');
  console.log(`   Organizations migrated: ${orgMapping.size}/${organizations.length}`);
  console.log('\n📋 Next steps:');
  console.log('   1. Verify data in Clerk Dashboard: https://dashboard.clerk.com');
  console.log('   2. Run SQL migration: psql $DATABASE_URL -f db/migrations/003_clerk_organizations.sql');
  console.log('   3. Test the application');

  // Save mapping for reference
  const mappingFile = 'db/org-migration-mapping.json';
  const mappingData = Object.fromEntries(orgMapping);
  console.log(`\n   Mapping saved to: ${mappingFile}`);
  console.log(JSON.stringify(mappingData, null, 2));
}

// Run migration
migrate().catch(error => {
  console.error('\n❌ Migration failed:', error);
  process.exit(1);
});
