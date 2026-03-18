import { getSql } from "../lib/db.js";
import { resolveUserId } from "../lib/user-resolver.js";
import { resolveOrganizationContext } from "../lib/auth.js";
import {
  ValidationError,
  NotFoundError,
} from "../lib/errors/index.js";
import {
  hasPermission,
  PERMISSIONS,
  PermissionDeniedError,
} from "../helpers/organization-context.js";

export interface BrandProfile {
  id: string;
  user_id: string;
  organization_id: string | null;
  name: string;
  description: string | null;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  tone_of_voice: string;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface GetBrandProfileParams {
  user_id?: string;
  id?: string;
  organization_id?: string | null;
}

export async function getBrandProfile({ user_id, id, organization_id }: GetBrandProfileParams): Promise<BrandProfile | null> {
  const sql = getSql();

  if (id) {
    if (!user_id) {
      throw new ValidationError("user_id is required when querying by id");
    }

    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return null;
    }

    const result = await sql`
      SELECT *
      FROM brand_profiles
      WHERE id = ${id}
        AND deleted_at IS NULL
      LIMIT 1
    ` as BrandProfile[];
    const profile = result[0] || null;
    if (!profile) {
      return null;
    }

    if (profile.organization_id) {
      await resolveOrganizationContext(sql, resolvedUserId, profile.organization_id);
    } else if (profile.user_id !== resolvedUserId) {
      throw new PermissionDeniedError(PERMISSIONS.MANAGE_BRAND);
    }

    return profile;
  }

  if (!user_id) {
    throw new ValidationError("user_id or id is required");
  }

  const resolvedUserId = await resolveUserId(sql, user_id);
  if (!resolvedUserId) {
    return null;
  }

  let result: BrandProfile[];
  if (organization_id) {
    await resolveOrganizationContext(sql, resolvedUserId, organization_id);
    result = (await sql`
      SELECT *
      FROM brand_profiles
      WHERE organization_id = ${organization_id}
        AND deleted_at IS NULL
      LIMIT 1
    `) as BrandProfile[];
  } else {
    result = (await sql`
      SELECT *
      FROM brand_profiles
      WHERE user_id = ${resolvedUserId}
        AND organization_id IS NULL
        AND deleted_at IS NULL
      LIMIT 1
    `) as BrandProfile[];
  }

  return result[0] || null;
}

export interface CreateBrandProfileParams {
  user_id: string;
  organization_id?: string | null;
  name: string;
  description?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  tone_of_voice?: string | null;
}

export async function createBrandProfile(payload: CreateBrandProfileParams): Promise<BrandProfile> {
  const {
    user_id,
    organization_id,
    name,
    description,
    logo_url,
    primary_color,
    secondary_color,
    tone_of_voice,
  } = payload;

  if (!user_id || !name) {
    throw new ValidationError("user_id and name are required");
  }

  const sql = getSql();
  const resolvedUserId = await resolveUserId(sql, user_id);
  if (!resolvedUserId) {
    throw new NotFoundError("User", user_id);
  }

  if (organization_id) {
    const context = await resolveOrganizationContext(
      sql,
      resolvedUserId,
      organization_id,
    );
    if (!hasPermission(context.orgRole, PERMISSIONS.MANAGE_BRAND)) {
      throw new PermissionDeniedError(PERMISSIONS.MANAGE_BRAND);
    }
  }

  const result = await sql`
    INSERT INTO brand_profiles (user_id, organization_id, name, description, logo_url, primary_color, secondary_color, tone_of_voice)
    VALUES (${resolvedUserId}, ${organization_id || null}, ${name}, ${description || null}, ${logo_url || null},
            ${primary_color || "#FFFFFF"}, ${secondary_color || "#000000"}, ${tone_of_voice || "Profissional"})
    RETURNING *
  ` as BrandProfile[];

  const item = result[0];
  if (!item) throw new NotFoundError("Brand profile");
  return item;
}

export interface UpdateBrandProfileParams {
  user_id?: string;
  name?: string | null;
  description?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  tone_of_voice?: string | null;
}

export async function updateBrandProfile(id: string, payload: UpdateBrandProfileParams): Promise<BrandProfile> {
  if (!id) {
    throw new ValidationError("id is required");
  }

  const {
    user_id,
    name,
    description,
    logo_url,
    primary_color,
    secondary_color,
    tone_of_voice,
  } = payload;

  const sql = getSql();
  const existing = await sql`
    SELECT organization_id
    FROM brand_profiles
    WHERE id = ${id}
      AND deleted_at IS NULL
  ` as Array<{ organization_id: string | null }>;

  if (existing.length === 0) {
    throw new NotFoundError("Brand profile");
  }

  if (existing[0]?.organization_id && user_id) {
    const resolvedUserId = await resolveUserId(sql, user_id);
    if (resolvedUserId) {
      const context = await resolveOrganizationContext(
        sql,
        resolvedUserId,
        existing[0].organization_id,
      );
      if (!hasPermission(context.orgRole, PERMISSIONS.MANAGE_BRAND)) {
        throw new PermissionDeniedError(PERMISSIONS.MANAGE_BRAND);
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
  ` as BrandProfile[];

  const item = result[0];
  if (!item) throw new NotFoundError("Brand profile");
  return item;
}
