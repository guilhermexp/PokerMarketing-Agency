import { z } from "zod";
import {
  idSchema,
  optionalNullableString,
  optionalString,
  organizationIdSchema,
  userIdSchema,
} from "./common.js";

export const scheduledPostsListQuerySchema = z.object({
  user_id: userIdSchema,
  organization_id: organizationIdSchema,
  status: optionalString,
});

export type ScheduledPostsListQuery = z.infer<typeof scheduledPostsListQuerySchema>;

export const scheduledPostCreateBodySchema = z.object({
  user_id: userIdSchema,
  organization_id: organizationIdSchema,
  content_type: optionalString,
  content_id: optionalNullableString,
  image_url: z.string().trim().min(1),
  caption: optionalString,
  hashtags: z.array(z.string().trim()).optional(),
  scheduled_date: z.string().trim().min(1),
  scheduled_time: z.string().trim().min(1),
  scheduled_timestamp: z.union([z.coerce.number().int().positive(), z.string().trim().min(1)]),
  timezone: optionalString,
  platforms: z.string().trim().min(1),
  instagram_content_type: optionalString,
  instagram_account_id: optionalNullableString,
  created_from: optionalNullableString,
});

export type ScheduledPostCreateBody = z.infer<typeof scheduledPostCreateBodySchema>;

export const scheduledPostUpdateQuerySchema = z.object({
  id: idSchema,
});

export type ScheduledPostUpdateQuery = z.infer<typeof scheduledPostUpdateQuerySchema>;

export const scheduledPostUpdateBodySchema = z.object({
  user_id: userIdSchema.optional(),
  status: optionalNullableString,
  published_at: z.union([z.coerce.date(), z.null()]).optional(),
  error_message: optionalNullableString,
  instagram_media_id: optionalNullableString,
  publish_attempts: z.coerce.number().int().nonnegative().nullable().optional(),
  last_publish_attempt: z.union([z.coerce.date(), z.null()]).optional(),
});

export type ScheduledPostUpdateBody = z.infer<typeof scheduledPostUpdateBodySchema>;

export const scheduledPostDeleteQuerySchema = z.object({
  id: idSchema,
  user_id: userIdSchema,
});

export type ScheduledPostDeleteQuery = z.infer<typeof scheduledPostDeleteQuerySchema>;

export const scheduledPostRetryBodySchema = z.object({
  id: idSchema,
  user_id: userIdSchema,
});

export type ScheduledPostRetryBody = z.infer<typeof scheduledPostRetryBodySchema>;
