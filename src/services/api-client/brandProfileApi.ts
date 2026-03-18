import { fetchApi } from "./base";

export interface DbBrandProfile {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  tertiary_color: string;
  tone_of_voice: string;
  settings: Record<string, unknown>;
  created_at: string;
}

export async function getBrandProfile(
  userId: string,
  organizationId?: string | null,
): Promise<DbBrandProfile | null> {
  const params = new URLSearchParams({ user_id: userId });
  if (organizationId) {
    params.append("organization_id", organizationId);
  }

  return fetchApi<DbBrandProfile | null>(`/brand-profiles?${params}`);
}

export async function createBrandProfile(
  userId: string,
  data: {
    name: string;
    description?: string;
    logo_url?: string;
    primary_color: string;
    secondary_color: string;
    tertiary_color: string;
    tone_of_voice: string;
    organization_id?: string | null;
  },
): Promise<DbBrandProfile> {
  return fetchApi<DbBrandProfile>("/brand-profiles", {
    method: "POST",
    body: JSON.stringify({ user_id: userId, ...data }),
  });
}

export async function updateBrandProfile(
  id: string,
  data: Partial<DbBrandProfile>,
): Promise<DbBrandProfile> {
  return fetchApi<DbBrandProfile>(`/brand-profiles?id=${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}
