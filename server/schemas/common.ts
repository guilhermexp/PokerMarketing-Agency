import { z } from "zod";

export const optionalString = z.string().trim().optional();
export const optionalNullableString = z.string().trim().nullable().optional();
export const userIdSchema = z.string().trim().min(1);
export const organizationIdSchema = z.string().trim().min(1).optional();
export const idSchema = z.string().trim().min(1);
export const booleanLikeSchema = z.union([z.boolean(), z.enum(["true", "false"])]);
export const sortIndexSchema = z.coerce.number().int().nonnegative();

export const mediaUrlSchema = z.string().trim().min(1);
export const imagePromptSchema = optionalNullableString;

export const clipScriptSchema = z.object({
  title: z.string().trim().min(1),
  hook: z.string().trim().min(1),
  image_prompt: optionalNullableString,
  audio_script: optionalNullableString,
  scenes: z.array(z.record(z.string(), z.unknown())).optional(),
}).passthrough();

export const postSchema = z.object({
  platform: z.string().trim().min(1),
  content: z.string().trim().min(1),
  hashtags: z.union([z.array(z.string()), z.string()]).optional(),
  image_prompt: optionalNullableString,
}).passthrough();

export const adCreativeSchema = z.object({
  platform: z.string().trim().min(1),
  headline: z.string().trim().min(1),
  body: z.string().trim().min(1),
  cta: z.string().trim().min(1),
  image_prompt: optionalNullableString,
}).passthrough();

export const carouselSlideSchema = z.record(z.string(), z.unknown());

export const carouselScriptSchema = z.object({
  title: z.string().trim().min(1),
  hook: z.string().trim().min(1),
  cover_prompt: optionalNullableString,
  cover_url: optionalNullableString,
  caption: optionalNullableString,
  slides: z.array(carouselSlideSchema).optional(),
}).passthrough();

// Inferred types
export type OptionalString = z.infer<typeof optionalString>;
export type OptionalNullableString = z.infer<typeof optionalNullableString>;
export type UserId = z.infer<typeof userIdSchema>;
export type OrganizationId = z.infer<typeof organizationIdSchema>;
export type Id = z.infer<typeof idSchema>;
export type BooleanLike = z.infer<typeof booleanLikeSchema>;
export type SortIndex = z.infer<typeof sortIndexSchema>;
export type MediaUrl = z.infer<typeof mediaUrlSchema>;
export type ImagePrompt = z.infer<typeof imagePromptSchema>;
export type ClipScript = z.infer<typeof clipScriptSchema>;
export type Post = z.infer<typeof postSchema>;
export type AdCreative = z.infer<typeof adCreativeSchema>;
export type CarouselSlide = z.infer<typeof carouselSlideSchema>;
export type CarouselScript = z.infer<typeof carouselScriptSchema>;
