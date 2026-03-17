import { z } from "zod";
import {
  booleanLikeSchema,
  idSchema,
  mediaUrlSchema,
  optionalNullableString,
  optionalString,
  organizationIdSchema,
  userIdSchema,
} from "./common.js";

export const galleryListQuerySchema = z.object({
  user_id: userIdSchema,
  organization_id: organizationIdSchema,
  source: optionalString,
  limit: z.coerce.number().int().positive().max(500).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
  include_src: booleanLikeSchema.optional(),
}).passthrough();

export const galleryDailyFlyersQuerySchema = z.object({
  user_id: userIdSchema,
  organization_id: organizationIdSchema,
  week_schedule_id: idSchema,
}).passthrough();

export const galleryCreateBodySchema = z.object({
  user_id: userIdSchema,
  organization_id: organizationIdSchema,
  src_url: mediaUrlSchema,
  prompt: optionalNullableString,
  source: z.string().trim().min(1),
  model: z.string().trim().min(1),
  aspect_ratio: optionalNullableString,
  image_size: optionalNullableString,
  post_id: optionalNullableString,
  ad_creative_id: optionalNullableString,
  video_script_id: optionalNullableString,
  is_style_reference: z.boolean().optional(),
  style_reference_name: optionalNullableString,
  media_type: optionalNullableString,
  duration: z.coerce.number().nonnegative().nullable().optional(),
  week_schedule_id: optionalNullableString,
  daily_flyer_day: optionalNullableString,
  daily_flyer_period: optionalNullableString,
}).passthrough();

export const galleryPatchQuerySchema = z.object({
  id: idSchema,
}).passthrough();

export const galleryPatchBodySchema = z.object({
  published_at: optionalNullableString,
  is_style_reference: z.boolean().optional(),
  style_reference_name: optionalNullableString,
  src_url: optionalNullableString,
}).passthrough();

export const galleryDeleteQuerySchema = z.object({
  id: idSchema,
  user_id: userIdSchema.optional(),
}).passthrough();
