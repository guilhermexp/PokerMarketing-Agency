import { z } from "zod";
import { optionalString } from "./common.js";

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

export const imageReferenceSchema = z.object({
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
});

export type BrandProfile = z.infer<typeof brandProfileSchema>;

const aiTextBrandProfileSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  primaryColor: z.string().optional(),
  secondaryColor: z.string().optional(),
  toneOfVoice: z.string().optional(),
  creativeModel: z.string().optional(),
});

const jsonScalarSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const jsonPrimitiveArraySchema = z.union([
  z.array(z.string()),
  z.array(z.number()),
  z.array(z.boolean()),
]);
const jsonLikeSchema = z.union([
  jsonScalarSchema,
  jsonPrimitiveArraySchema,
  z.record(z.string(), z.union([jsonScalarSchema, jsonPrimitiveArraySchema])),
]);

const quantityOptionSchema = z.object({
  count: z.number().int().nonnegative(),
  generate: z.boolean(),
  slidesPerCarousel: z.number().int().positive().optional(),
});

const platformQuantityOptionsSchema = z.object({
  instagram: quantityOptionSchema.optional(),
  facebook: quantityOptionSchema.optional(),
  twitter: quantityOptionSchema.optional(),
  linkedin: quantityOptionSchema.optional(),
  google: quantityOptionSchema.optional(),
});

const campaignOptionsSchema = z.object({
  videoClipScripts: quantityOptionSchema,
  posts: platformQuantityOptionsSchema,
  adCreatives: platformQuantityOptionsSchema,
  carousels: quantityOptionSchema.optional(),
});

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

export const aiImageJobIdParamsSchema = z.object({
  jobId: z.string().trim().min(1),
});

export type AiImageJobIdParams = z.infer<typeof aiImageJobIdParamsSchema>;

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

// ============================================================================
// AI ASSISTANT / CAMPAIGN / TEXT
// ============================================================================

const assistantHistoryPartSchema = z.union([
  z.object({
    text: z.string().trim().min(1),
  }),
  z.object({
    inlineData: z.object({
      mimeType: z.string().trim().min(1),
      data: z.string().trim().min(1),
    }),
  }),
]);

export const aiAssistantBodySchema = z.object({
  history: z.array(z.object({
    role: z.enum(["user", "model"]),
    parts: z.array(assistantHistoryPartSchema).optional(),
  })).min(1),
  brandProfile: z.object({
    name: z.string().optional(),
    logo: z.string().optional(),
    colors: z.object({
      primary: z.string().optional(),
      secondary: z.string().optional(),
    }).optional(),
    description: z.string().optional(),
  }).optional(),
});

export type AiAssistantBody = z.infer<typeof aiAssistantBodySchema>;

export const aiCampaignBodySchema = z.object({
  brandProfile: aiTextBrandProfileSchema,
  transcript: z.string().trim().min(1),
  options: campaignOptionsSchema,
  productImages: z.array(imageReferenceSchema).optional(),
  inspirationImages: z.array(imageReferenceSchema).optional(),
  collabLogo: imageReferenceSchema.optional(),
  compositionAssets: z.array(imageReferenceSchema).optional(),
  toneOfVoiceOverride: optionalString,
});

export type AiCampaignBody = z.infer<typeof aiCampaignBodySchema>;

export const aiFlyerBodySchema = z.object({
  prompt: z.string().trim().min(1),
  brandProfile: aiTextBrandProfileSchema,
  logo: imageReferenceSchema.optional(),
  referenceImage: imageReferenceSchema.optional(),
  aspectRatio: optionalString,
  collabLogo: imageReferenceSchema.optional(),
  collabLogos: z.array(imageReferenceSchema).optional(),
  imageSize: optionalString,
  compositionAssets: z.array(imageReferenceSchema).optional(),
});

export type AiFlyerBody = z.infer<typeof aiFlyerBodySchema>;

export const aiTextBodySchema = z
  .object({
    type: optionalString,
    brandProfile: aiTextBrandProfileSchema,
    context: optionalString,
    systemPrompt: optionalString,
    userPrompt: optionalString,
    image: imageReferenceSchema.optional(),
    temperature: z.number().min(0).max(2).optional(),
    responseSchema: z.record(z.string(), jsonLikeSchema).optional(),
  })
  .refine(
    (value) => value.type === "quickPost" || Boolean(value.systemPrompt || value.userPrompt),
    {
      message: "systemPrompt ou userPrompt é obrigatório para texto customizado.",
      path: ["userPrompt"],
    },
  )
  .refine(
    (value) => value.type !== "quickPost" || Boolean(value.context),
    {
      message: "context é obrigatório para quickPost.",
      path: ["context"],
    },
  );

export type AiTextBody = z.infer<typeof aiTextBodySchema>;

export const aiEnhancePromptBodySchema = z.object({
  prompt: z.string().trim().min(1),
  brandProfile: aiTextBrandProfileSchema.optional(),
});

export type AiEnhancePromptBody = z.infer<typeof aiEnhancePromptBodySchema>;

export const aiConvertPromptBodySchema = z.object({
  prompt: z.string().trim().min(1),
  duration: z.number().positive().optional().default(5),
  aspectRatio: optionalString.optional().default("16:9"),
});

export type AiConvertPromptBody = z.infer<typeof aiConvertPromptBodySchema>;
