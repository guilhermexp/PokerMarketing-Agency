import { z } from "zod";

// ============================================================================
// AI SPEECH
// ============================================================================

export const aiSpeechBodySchema = z.object({
  script: z.string().trim().min(1),
  voiceName: z.string().trim().min(1).optional(),
});

export type AiSpeechBody = z.infer<typeof aiSpeechBodySchema>;

// ============================================================================
// AI IMAGE GENERATION
// ============================================================================

const imageReferenceSchema = z.object({
  base64: z.string(),
  mimeType: z.string(),
});

export type ImageReference = z.infer<typeof imageReferenceSchema>;

const brandProfileSchema = z.object({
  name: z.string().optional(),
  logo: z.string().optional(),
  colors: z.object({
    primary: z.string().optional(),
    secondary: z.string().optional(),
    tertiary: z.string().optional(),
  }).optional(),
  tone: z.string().optional(),
}).passthrough();

export type BrandProfile = z.infer<typeof brandProfileSchema>;

export const aiImageBodySchema = z.object({
  prompt: z.string().trim().min(1),
  brandProfile: brandProfileSchema,
  aspectRatio: z.string().optional().default("1:1"),
  imageSize: z.string().optional().default("1K"),
  model: z.string().optional(),
  productImages: z.array(imageReferenceSchema).optional(),
  styleReferenceImage: imageReferenceSchema.optional(),
  personReferenceImage: imageReferenceSchema.optional(),
});

export type AiImageBody = z.infer<typeof aiImageBodySchema>;

export const aiEditImageBodySchema = z.object({
  image: imageReferenceSchema,
  prompt: z.string().trim().min(1),
  mask: imageReferenceSchema.optional(),
  referenceImage: imageReferenceSchema.optional(),
});

export type AiEditImageBody = z.infer<typeof aiEditImageBodySchema>;

export const aiExtractColorsBodySchema = z.object({
  logo: imageReferenceSchema,
});

export type AiExtractColorsBody = z.infer<typeof aiExtractColorsBodySchema>;

// ============================================================================
// AI IMAGE ASYNC GENERATION (Queue-based)
// ============================================================================

export const aiImageAsyncBodySchema = aiImageBodySchema.extend({
  priority: z.number().int().optional(),
});

export type AiImageAsyncBody = z.infer<typeof aiImageAsyncBodySchema>;

const asyncJobSchema = z.object({
  prompt: z.string().trim().min(1),
  brandProfile: brandProfileSchema,
  aspectRatio: z.string().optional().default("1:1"),
  imageSize: z.string().optional().default("1K"),
  model: z.string().optional(),
  productImages: z.array(imageReferenceSchema).optional(),
  styleReferenceImage: imageReferenceSchema.optional(),
  personReferenceImage: imageReferenceSchema.optional(),
});

export const aiImageAsyncBatchBodySchema = z.object({
  jobs: z.array(asyncJobSchema).min(1).max(10),
  priority: z.number().int().optional(),
});

export type AiImageAsyncBatchBody = z.infer<typeof aiImageAsyncBatchBodySchema>;

export const aiImageAsyncJobsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export type AiImageAsyncJobsQuery = z.infer<typeof aiImageAsyncJobsQuerySchema>;

// ============================================================================
// AI VIDEO GENERATION
// ============================================================================

export const aiVideoBodySchema = z.object({
  prompt: z.string().trim().min(1),
  aspectRatio: z.string().trim().min(1),
  model: z.string().trim().min(1),
  resolution: z.string().optional().default("720p"),
  imageUrl: z.string().optional(),
  lastFrameUrl: z.string().optional(),
  sceneDuration: z.number().optional(),
  generateAudio: z.boolean().optional().default(true),
  useInterpolation: z.boolean().optional().default(false),
  useBrandProfile: z.boolean().optional().default(false),
  useCampaignGradePrompt: z.boolean().optional().default(true),
});

export type AiVideoBody = z.infer<typeof aiVideoBodySchema>;
