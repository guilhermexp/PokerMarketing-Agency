/**
 * Migrate Users & Organizations from Clerk Dev → Clerk Prod
 *
 * This script:
 * 1. Exports all users, orgs, and memberships from Clerk DEV
 * 2. Creates them in Clerk PROD
 * 3. Updates the Neon database with new Clerk PROD IDs
 *
 * Prerequisites:
 * - CLERK_DEV_SECRET_KEY: Secret key from the Clerk DEV instance (sk_test_...)
 * - CLERK_SECRET_KEY: Secret key from the Clerk PROD instance (sk_live_... or sk_test_...)
 * - DATABASE_URL: Neon Postgres connection string
 *
 * Usage:
 *   CLERK_DEV_SECRET_KEY=sk_test_xxx node scripts/clerk-dev-to-prod-migration.mjs
 *
 * Dry run (no writes):
 *   CLERK_DEV_SECRET_KEY=sk_test_xxx DRY_RUN=true node scripts/clerk-dev-to-prod-migration.mjs
 */

import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";
import { writeFileSync } from "fs";

config();

const DATABASE_URL = process.env.DATABASE_URL;
const CLERK_DEV_SECRET_KEY = process.env.CLERK_DEV_SECRET_KEY;
const CLERK_PROD_SECRET_KEY = process.env.CLERK_SECRET_KEY;
const DRY_RUN = process.env.DRY_RUN === "true";

if (!DATABASE_URL) {
  console.error("DATABASE_URL not configured");
  process.exit(1);
}
if (!CLERK_DEV_SECRET_KEY) {
  console.error("CLERK_DEV_SECRET_KEY not configured");
  console.error("  Pass it as: CLERK_DEV_SECRET_KEY=sk_test_xxx");
  process.exit(1);
}
if (!CLERK_PROD_SECRET_KEY) {
  console.error("CLERK_SECRET_KEY not configured (prod key)");
  process.exit(1);
}

const sql = neon(DATABASE_URL);
const CLERK_API = "https://api.clerk.com/v1";

// ─── Clerk API helpers ───────────────────────────────────────────────

async function clerkApi(endpoint, secretKey, options = {}) {
  const response = await fetch(`${CLERK_API}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const err = new Error(
      `Clerk ${response.status}: ${JSON.stringify(body)}`
    );
    err.status = response.status;
    err.body = body;
    throw err;
  }
  return body;
}

const devApi = (endpoint, opts) =>
  clerkApi(endpoint, CLERK_DEV_SECRET_KEY, opts);
const prodApi = (endpoint, opts) =>
  clerkApi(endpoint, CLERK_PROD_SECRET_KEY, opts);

// ─── Paginated fetch (Clerk uses offset-based pagination) ────────────

async function fetchAllPages(apiFn, endpoint) {
  const all = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const separator = endpoint.includes("?") ? "&" : "?";
    const page = await apiFn(
      `${endpoint}${separator}limit=${limit}&offset=${offset}`
    );
    const items = Array.isArray(page) ? page : page.data ?? [];
    all.push(...items);
    if (items.length < limit) break;
    offset += limit;
  }
  return all;
}

// ─── Tables with organization_id ─────────────────────────────────────

const CONTENT_TABLES = [
  "brand_profiles",
  "campaigns",
  "posts",
  "ad_creatives",
  "video_clip_scripts",
  "gallery_images",
  "scheduled_posts",
  "week_schedules",
  "tournament_events",
  "generation_jobs",
  "chat_sessions",
  "instagram_accounts",
  "api_usage_logs",
  "aggregated_usage",
  "activity_logs",
];

// ─── Main migration ──────────────────────────────────────────────────

async function migrate() {
  console.log(
    DRY_RUN
      ? "=== DRY RUN — no writes will be made ===\n"
      : "=== LIVE RUN ===\n"
  );

  // ── Phase 1: Export from Clerk DEV ──────────────────────────────

  console.log("Phase 1: Exporting from Clerk DEV...\n");

  const devUsers = await fetchAllPages(devApi, "/users");
  console.log(`  Found ${devUsers.length} user(s) in DEV`);

  const devOrgs = await fetchAllPages(devApi, "/organizations");
  console.log(`  Found ${devOrgs.length} organization(s) in DEV`);

  // Fetch memberships per org
  const devMemberships = new Map(); // orgId → [{userId, role}]
  for (const org of devOrgs) {
    const members = await fetchAllPages(
      devApi,
      `/organizations/${org.id}/memberships`
    );
    devMemberships.set(org.id, members);
    console.log(
      `  Org "${org.name}" (${org.id}): ${members.length} member(s)`
    );
  }

  // ── Phase 2: Create in Clerk PROD ──────────────────────────────

  console.log("\nPhase 2: Creating in Clerk PROD...\n");

  // 2a. Users
  const userMapping = new Map(); // devId → prodId
  const usersNeedingPasswordReset = [];

  for (const devUser of devUsers) {
    const email =
      devUser.email_addresses?.[0]?.email_address;
    if (!email) {
      console.log(
        `  SKIP user ${devUser.id} — no email address`
      );
      continue;
    }

    const firstName = devUser.first_name || "";
    const lastName = devUser.last_name || "";

    console.log(`  User: ${email} (dev: ${devUser.id})`);

    if (DRY_RUN) {
      userMapping.set(devUser.id, `dry-run-${devUser.id}`);
      usersNeedingPasswordReset.push(email);
      continue;
    }

    try {
      // Try to create user in prod
      const prodUser = await prodApi("/users", {
        method: "POST",
        body: JSON.stringify({
          email_address: [email],
          first_name: firstName,
          last_name: lastName,
          skip_password_requirement: true,
        }),
      });
      userMapping.set(devUser.id, prodUser.id);
      usersNeedingPasswordReset.push(email);
      console.log(`    -> Created in PROD: ${prodUser.id}`);
    } catch (err) {
      // 422 = user already exists (email taken)
      if (err.status === 422) {
        console.log(`    -> Already exists in PROD, looking up by email...`);
        try {
          const existing = await fetchAllPages(
            prodApi,
            `/users?email_address=${encodeURIComponent(email)}`
          );
          if (existing.length > 0) {
            userMapping.set(devUser.id, existing[0].id);
            console.log(`    -> Mapped to existing: ${existing[0].id}`);
          } else {
            console.log(`    -> ERROR: 422 but user not found by email`);
          }
        } catch (lookupErr) {
          console.log(`    -> ERROR looking up user: ${lookupErr.message}`);
        }
      } else {
        console.log(`    -> ERROR creating user: ${err.message}`);
      }
    }
  }

  console.log(`\n  User mapping: ${userMapping.size}/${devUsers.length}\n`);

  // 2b. Organizations
  const orgMapping = new Map(); // devOrgId → prodOrgId

  for (const devOrg of devOrgs) {
    console.log(`  Org: "${devOrg.name}" (dev: ${devOrg.id})`);

    // Find creator in prod mapping
    const prodCreatorId = userMapping.get(devOrg.created_by);
    if (!prodCreatorId) {
      console.log(
        `    -> SKIP: creator ${devOrg.created_by} not mapped to PROD`
      );
      continue;
    }

    if (DRY_RUN) {
      orgMapping.set(devOrg.id, `dry-run-${devOrg.id}`);
      continue;
    }

    try {
      const prodOrg = await prodApi("/organizations", {
        method: "POST",
        body: JSON.stringify({
          name: devOrg.name,
          slug: devOrg.slug,
          created_by: prodCreatorId,
        }),
      });
      orgMapping.set(devOrg.id, prodOrg.id);
      console.log(`    -> Created in PROD: ${prodOrg.id}`);
    } catch (err) {
      if (
        err.status === 422 &&
        JSON.stringify(err.body).includes("already")
      ) {
        console.log(`    -> Org slug already exists, looking up...`);
        try {
          const existingOrgs = await fetchAllPages(prodApi, "/organizations");
          const match = existingOrgs.find((o) => o.slug === devOrg.slug);
          if (match) {
            orgMapping.set(devOrg.id, match.id);
            console.log(`    -> Mapped to existing: ${match.id}`);
          } else {
            console.log(`    -> ERROR: could not find org by slug "${devOrg.slug}"`);
          }
        } catch (lookupErr) {
          console.log(`    -> ERROR looking up org: ${lookupErr.message}`);
        }
      } else {
        console.log(`    -> ERROR creating org: ${err.message}`);
      }
    }
  }

  console.log(`\n  Org mapping: ${orgMapping.size}/${devOrgs.length}\n`);

  // 2c. Memberships
  console.log("  Adding memberships...\n");

  for (const [devOrgId, members] of devMemberships) {
    const prodOrgId = orgMapping.get(devOrgId);
    if (!prodOrgId) {
      console.log(`    SKIP memberships for unmapped org ${devOrgId}`);
      continue;
    }

    for (const member of members) {
      const prodUserId = userMapping.get(member.public_user_data?.user_id);
      if (!prodUserId) {
        console.log(
          `    SKIP member ${member.public_user_data?.user_id} — not mapped`
        );
        continue;
      }

      const role = member.role || "org:member";

      if (DRY_RUN) {
        console.log(
          `    [DRY] Would add ${prodUserId} to ${prodOrgId} as ${role}`
        );
        continue;
      }

      try {
        await prodApi(`/organizations/${prodOrgId}/memberships`, {
          method: "POST",
          body: JSON.stringify({
            user_id: prodUserId,
            role,
          }),
        });
        console.log(`    Added ${prodUserId} to ${prodOrgId} as ${role}`);
      } catch (err) {
        if (JSON.stringify(err.body).includes("already")) {
          console.log(`    Already a member: ${prodUserId} in ${prodOrgId}`);
        } else {
          console.log(`    ERROR adding member: ${err.message}`);
        }
      }
    }
  }

  // ── Phase 3: Update Neon database ──────────────────────────────

  console.log("\nPhase 3: Updating Neon database...\n");

  // 3a. Update users table — auth_provider_id
  for (const [devId, prodId] of userMapping) {
    console.log(`  users: ${devId} -> ${prodId}`);
    if (DRY_RUN) continue;

    try {
      const result =
        await sql`UPDATE users SET auth_provider_id = ${prodId} WHERE auth_provider_id = ${devId}`;
      console.log(`    ${result.length ?? 0} row(s) updated`);
    } catch (err) {
      console.log(`    ERROR: ${err.message}`);
    }
  }

  // 3b. Update content tables — organization_id
  for (const [devOrgId, prodOrgId] of orgMapping) {
    console.log(`\n  Org mapping: ${devOrgId} -> ${prodOrgId}`);
    if (DRY_RUN) continue;

    for (const table of CONTENT_TABLES) {
      try {
        const result =
          await sql`UPDATE ${sql(table)} SET organization_id = ${prodOrgId} WHERE organization_id = ${devOrgId}`;
        const count = result.length ?? result.count ?? 0;
        if (count > 0) {
          console.log(`    ${table}: ${count} row(s) updated`);
        }
      } catch (err) {
        console.log(`    ${table}: ERROR — ${err.message}`);
      }
    }
  }

  // ── Phase 4: Output summary ────────────────────────────────────

  console.log("\n\n=== Migration Summary ===\n");

  const mappingData = {
    users: Object.fromEntries(userMapping),
    organizations: Object.fromEntries(orgMapping),
    usersNeedingPasswordReset,
    migratedAt: new Date().toISOString(),
  };

  console.log(
    `Users migrated:   ${userMapping.size}/${devUsers.length}`
  );
  console.log(
    `Orgs migrated:    ${orgMapping.size}/${devOrgs.length}`
  );
  console.log(
    `\nUsers needing password reset (Forgot Password):`
  );
  for (const email of usersNeedingPasswordReset) {
    console.log(`  - ${email}`);
  }

  // Save mapping file
  const mappingPath = "scripts/clerk-migration-mapping.json";
  if (!DRY_RUN) {
    writeFileSync(mappingPath, JSON.stringify(mappingData, null, 2));
    console.log(`\nMapping saved to: ${mappingPath}`);
  } else {
    console.log("\n[DRY RUN] Mapping would be saved to:", mappingPath);
    console.log(JSON.stringify(mappingData, null, 2));
  }

  console.log("\n=== Next Steps ===");
  console.log("1. Verify users/orgs in Clerk Dashboard (prod)");
  console.log("2. Verify DB: SELECT email, auth_provider_id FROM users");
  console.log(
    '3. Each user must go to https://sociallab.pro/ and click "Forgot Password"'
  );
  console.log("4. On first login, auth_provider_id auto-updates via the fixed endpoint");
}

migrate().catch((err) => {
  console.error("\nMigration failed:", err);
  process.exit(1);
});
