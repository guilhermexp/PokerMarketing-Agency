import { getSql } from "../lib/db.mjs";
import { resolveUserId } from "../lib/user-resolver.mjs";
import { resolveOrganizationContext } from "../lib/auth.mjs";
import {
  ValidationError,
  DatabaseError,
  NotFoundError,
} from "../lib/errors/index.mjs";
import {
  hasPermission,
  PERMISSIONS,
  PermissionDeniedError,
  OrganizationAccessError,
} from "../helpers/organization-context.mjs";
import { logError } from "../lib/logging-helpers.mjs";
import logger from "../lib/logger.mjs";

export function registerBrandProfileRoutes(app) {
  app.get("/api/db/brand-profiles", async (req, res) => {
    try {
      const sql = getSql();
      const { user_id, id, organization_id } = req.query;

      if (id) {
        if (!user_id) {
          throw new ValidationError("user_id is required when querying by id");
        }

        const resolvedUserId = await resolveUserId(sql, user_id);
        if (!resolvedUserId) {
          return res.json(null);
        }

        const result =
          await sql`SELECT * FROM brand_profiles WHERE id = ${id} AND deleted_at IS NULL LIMIT 1`;
        const profile = result[0] || null;
        if (!profile) {
          return res.json(null);
        }

        if (profile.organization_id) {
          await resolveOrganizationContext(sql, resolvedUserId, profile.organization_id);
        } else if (profile.user_id !== resolvedUserId) {
          return res.status(403).json({ error: "Forbidden" });
        }

        return res.json(profile);
      }

      if (user_id) {
        // Resolve user_id (handles both Clerk IDs and UUIDs)
        const resolvedUserId = await resolveUserId(sql, user_id);
        if (!resolvedUserId) {
          return res.json(null); // No user found, return null
        }

        let result;
        if (organization_id) {
          // Organization context - verify membership
          await resolveOrganizationContext(sql, resolvedUserId, organization_id);
          result = await sql`
            SELECT * FROM brand_profiles
            WHERE organization_id = ${organization_id} AND deleted_at IS NULL
            LIMIT 1
          `;
        } else {
          // Personal context
          result = await sql`
            SELECT * FROM brand_profiles
            WHERE user_id = ${resolvedUserId} AND organization_id IS NULL AND deleted_at IS NULL
            LIMIT 1
          `;
        }
        return res.json(result[0] || null);
      }

      throw new ValidationError("user_id or id is required");
    } catch (error) {
      if (
        error instanceof OrganizationAccessError ||
        error instanceof ValidationError
      ) {
        throw error;
      }
      throw new DatabaseError("Failed to fetch brand profile", error);
    }
  });

  app.post("/api/db/brand-profiles", async (req, res) => {
    try {
      const sql = getSql();
      const {
        user_id,
        organization_id,
        name,
        description,
        logo_url,
        primary_color,
        secondary_color,
        tone_of_voice,
      } = req.body;

      if (!user_id || !name) {
        throw new ValidationError("user_id and name are required");
      }

      // Resolve user_id (handles both Better Auth IDs and UUIDs)
      const resolvedUserId = await resolveUserId(sql, user_id);
      if (!resolvedUserId) {
        throw new NotFoundError("User", user_id);
      }

      // Verify organization membership and permission if organization_id provided
      if (organization_id) {
        const context = await resolveOrganizationContext(
          sql,
          resolvedUserId,
          organization_id,
        );
        if (!hasPermission(context.orgRole, PERMISSIONS.MANAGE_BRAND)) {
          throw new PermissionDeniedError("manage_brand");
        }
      }

      const result = await sql`
        INSERT INTO brand_profiles (user_id, organization_id, name, description, logo_url, primary_color, secondary_color, tone_of_voice)
        VALUES (${resolvedUserId}, ${organization_id || null}, ${name}, ${description || null}, ${logo_url || null},
                ${primary_color || "#FFFFFF"}, ${secondary_color || "#000000"}, ${tone_of_voice || "Profissional"})
        RETURNING *
      `;

      res.status(201).json(result[0]);
    } catch (error) {
      if (
        error instanceof OrganizationAccessError ||
        error instanceof PermissionDeniedError ||
        error instanceof ValidationError ||
        error instanceof NotFoundError
      ) {
        throw error;
      }
      throw new DatabaseError("Failed to create brand profile", error);
    }
  });

  app.put("/api/db/brand-profiles", async (req, res) => {
    try {
      const sql = getSql();
      const { id } = req.query;
      const {
        user_id,
        name,
        description,
        logo_url,
        primary_color,
        secondary_color,
        tone_of_voice,
      } = req.body;

      if (!id) {
        return res.status(400).json({ error: "id is required" });
      }

      // Get the brand profile to check organization
      const existing =
        await sql`SELECT organization_id FROM brand_profiles WHERE id = ${id} AND deleted_at IS NULL`;
      if (existing.length === 0) {
        return res.status(404).json({ error: "Brand profile not found" });
      }

      // If profile belongs to an organization, verify permission
      if (existing[0].organization_id && user_id) {
        const resolvedUserId = await resolveUserId(sql, user_id);
        if (resolvedUserId) {
          const context = await resolveOrganizationContext(
            sql,
            resolvedUserId,
            existing[0].organization_id,
          );
          if (!hasPermission(context.orgRole, PERMISSIONS.MANAGE_BRAND)) {
            return res
              .status(403)
              .json({ error: "Permission denied: manage_brand required" });
          }
        }
      }

      const result = await sql`
        UPDATE brand_profiles
        SET name = COALESCE(${name || null}, name),
            description = COALESCE(${description || null}, description),
            logo_url = COALESCE(${logo_url || null}, logo_url),
            primary_color = COALESCE(${primary_color || null}, primary_color),
            secondary_color = COALESCE(${secondary_color || null}, secondary_color),
            tone_of_voice = COALESCE(${tone_of_voice || null}, tone_of_voice)
        WHERE id = ${id}
        RETURNING *
      `;

      res.json(result[0]);
    } catch (error) {
      if (
        error instanceof OrganizationAccessError ||
        error instanceof PermissionDeniedError
      ) {
        return res.status(403).json({ error: error.message });
      }
      logError("Brand Profiles API", error);
      res.status(500).json({ error: error.message });
    }
  });
}
