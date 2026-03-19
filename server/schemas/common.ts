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

// AI-generated text field: accept empty strings since LLMs may return blank fields
const aiText = z.string().trim().default("");

export const clipScriptSchema = z.object({
  title: aiText,
  hook: aiText,
  image_prompt: optionalNullableString,
  audio_script: optionalNullableString,
  scenes: z.array(z.object({
    scene: z.number().int().nonnegative(),
    visual: aiText,
    narration: aiText,
    image_url: optionalNullableString,
  })).optional(),
}).passthrough();

export const postSchema = z.object({
  platform: aiText,
  content: aiText,
  hashtags: z.union([z.array(z.string()), z.string()]).optional(),
  image_prompt: optionalNullableString,
}).passthrough();

export const adCreativeSchema = z.object({
  platform: aiText,
  headline: aiText,
  body: aiText,
  cta: aiText,
  image_prompt: optionalNullableString,
}).passthrough();

export const carouselSlideSchema = z.object({
  slide: z.number().int().nonnegative(),
  title: aiText,
  content: aiText,
  image_prompt: optionalNullableString,
  image_url: optionalNullableString,
}).passthrough();

export const carouselScriptSchema = z.object({
  title: aiText,
  hook: aiText,
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
