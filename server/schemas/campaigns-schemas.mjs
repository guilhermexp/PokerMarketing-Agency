import { z } from "zod";
import {
  adCreativeSchema,
  carouselScriptSchema,
  idSchema,
  optionalNullableString,
  organizationIdSchema,
  postSchema,
  userIdSchema,
  clipScriptSchema,
} from "./common.mjs";

export const campaignsQuerySchema = z.object({
  user_id: userIdSchema.optional(),
  organization_id: organizationIdSchema,
  id: idSchema.optional(),
  include_content: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
}).refine(
  (value) => Boolean(value.id || value.user_id),
  {
    message: "user_id is required",
    path: ["user_id"],
  },
).passthrough();

export const campaignCreateBodySchema = z.object({
  user_id: userIdSchema,
  organization_id: organizationIdSchema,
  name: optionalNullableString,
  brand_profile_id: optionalNullableString,
  input_transcript: optionalNullableString,
  generation_options: z.record(z.string(), z.unknown()).nullable().optional(),
  status: optionalNullableString,
  video_clip_scripts: z.array(clipScriptSchema).optional(),
  posts: z.array(postSchema).optional(),
  ad_creatives: z.array(adCreativeSchema).optional(),
  carousel_scripts: z.array(carouselScriptSchema).optional(),
}).passthrough();

export const campaignsDeleteQuerySchema = z.object({
  id: idSchema,
  user_id: userIdSchema.optional(),
}).passthrough();

export const campaignsClipPatchQuerySchema = z.object({
  clip_id: idSchema,
}).passthrough();

export const campaignsClipPatchBodySchema = z.object({
  thumbnail_url: optionalNullableString,
}).passthrough();

export const campaignScenePatchQuerySchema = z.object({
  clip_id: idSchema,
  scene_number: z.coerce.number().int().nonnegative(),
}).passthrough();

export const campaignScenePatchBodySchema = z.object({
  image_url: optionalNullableString,
}).passthrough();

export const carouselsQuerySchema = z.object({
  user_id: userIdSchema,
  organization_id: organizationIdSchema,
}).passthrough();

export const carouselPatchQuerySchema = z.object({
  id: idSchema,
}).passthrough();

export const carouselPatchBodySchema = z.object({
  cover_url: optionalNullableString,
  caption: optionalNullableString,
}).refine(
  (value) => value.cover_url !== undefined || value.caption !== undefined,
  {
    message: "No fields to update",
    path: ["cover_url"],
  },
).passthrough();

export const carouselSlidePatchQuerySchema = z.object({
  carousel_id: idSchema,
  slide_number: z.coerce.number().int().nonnegative(),
}).passthrough();

export const carouselSlidePatchBodySchema = z.object({
  image_url: optionalNullableString,
}).passthrough();
