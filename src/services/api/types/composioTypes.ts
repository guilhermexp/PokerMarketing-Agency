/**
 * Composio integration types.
 */

export interface ComposioToolkit {
  slug: string;
  name: string;
  description: string;
  logo: string;
  tools_count: number;
  auth_schemes: string[] | null;
  composio_managed_auth_schemes: string[] | null;
}

export interface ComposioProfile {
  id: string;
  user_id: string;
  toolkit_slug: string;
  toolkit_name: string;
  profile_name: string;
  is_active: boolean;
  connected_account_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ComposioTool {
  name: string;
  display_name: string;
  description: string;
  parameters: Record<string, unknown>;
  tags?: string[];
}

export interface CreateProfileResponse {
  profile_id: string;
  redirect_url: string | null;
}

export interface ProfileStatus {
  status: "initiated" | "active" | "failed" | "unknown";
  connected_account_id: string | null;
}
