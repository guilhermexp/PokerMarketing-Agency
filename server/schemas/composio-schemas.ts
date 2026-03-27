/**
 * Zod schemas for Composio integration endpoints.
 */

import { z } from "zod";

export const createProfileBodySchema = z.object({
  toolkit_slug: z.string().min(1, "toolkit_slug is required"),
  profile_name: z.string().min(1, "profile_name is required").max(100),
});
export type CreateProfileBody = z.infer<typeof createProfileBodySchema>;

export const listToolkitsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  search: z.string().optional(),
});
export type ListToolkitsQuery = z.infer<typeof listToolkitsQuerySchema>;

export const toolkitSlugParamsSchema = z.object({
  slug: z.string().min(1),
});
export type ToolkitSlugParams = z.infer<typeof toolkitSlugParamsSchema>;

export const profileIdParamsSchema = z.object({
  id: z.string().uuid("Invalid profile ID"),
});
export type ProfileIdParams = z.infer<typeof profileIdParamsSchema>;
