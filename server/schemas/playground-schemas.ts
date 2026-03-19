import { z } from "zod";
import { idSchema } from "./common.js";

const nonEmptyStringSchema = z.string().trim().min(1);
const nonDataUrlStringSchema = z.string().trim().min(1).refine(
  (value) => !value.startsWith("data:"),
  {
    message: "Base64 data URLs not allowed; upload to blob storage first",
  },
);

const imageDataSchema = z.object({
  base64: nonEmptyStringSchema,
  mimeType: nonEmptyStringSchema,
});

const referenceImageSchema = z.object({
  id: z.string().trim().min(1).optional(),
  dataUrl: nonEmptyStringSchema,
  mimeType: z.string().trim().min(1).optional(),
});

const brandProfileSchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional(),
  logo: z.string().trim().min(1).optional(),
  primaryColor: z.string().trim().min(1).optional(),
  secondaryColor: z.string().trim().min(1).optional(),
  toneOfVoice: z.string().trim().min(1).optional(),
  toneTargets: z.array(nonEmptyStringSchema).optional(),
});

const imageGenerationParamsSchema = z.object({
  prompt: nonEmptyStringSchema,
  userPrompt: z.string().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  aspectRatio: z.string().trim().min(1).optional(),
  imageSize: z.string().trim().min(1).optional(),
  seed: z.number().int().optional(),
  useInstagramMode: z.boolean().optional(),
  useAiInfluencerMode: z.boolean().optional(),
  useProductHeroMode: z.boolean().optional(),
  useExplodedProductMode: z.boolean().optional(),
  useBrandIdentityMode: z.boolean().optional(),
  useBrandProfile: z.boolean().optional(),
  toneOfVoiceOverride: z.string().trim().min(1).optional(),
  fontStyleOverride: z.string().trim().min(1).optional(),
  referenceImages: z.array(referenceImageSchema).optional(),
  productImages: z.array(imageDataSchema).optional(),
  personReferenceImage: z.string().trim().min(1).optional(),
  imageUrl: z.string().trim().min(1).optional(),
  brandProfile: brandProfileSchema.optional(),
  model: z.string().trim().min(1).optional(),
});

export const playgroundTopicCreateBodySchema = z.object({
  title: z.string().trim().min(1).optional(),
});

export const playgroundTopicUpdateBodySchema = z.object({
  title: z.string().trim().min(1).optional(),
  coverUrl: nonDataUrlStringSchema.optional(),
});

export const playgroundTopicParamsSchema = z.object({
  id: idSchema,
});

export const imagePlaygroundBatchesQuerySchema = z.object({
  topicId: nonEmptyStringSchema,
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export const imagePlaygroundGenerateBodySchema = z.object({
  topicId: nonEmptyStringSchema,
  provider: nonEmptyStringSchema,
  model: nonEmptyStringSchema,
  imageNum: z.number().int().min(1).max(10).optional(),
  params: imageGenerationParamsSchema,
});

export const imagePlaygroundStatusParamsSchema = z.object({
  generationId: idSchema,
});

export const imagePlaygroundStatusQuerySchema = z.object({
  asyncTaskId: z.string().trim().min(1).optional(),
});

export const imagePlaygroundGenerationUpdateBodySchema = z.object({
  url: nonDataUrlStringSchema,
});

export const playgroundGenerateTitleBodySchema = z.object({
  prompts: z.array(nonEmptyStringSchema).min(1),
});

export const videoPlaygroundSessionsQuerySchema = z.object({
  topicId: nonEmptyStringSchema,
  limit: z.coerce.number().int().min(1).max(100).default(100),
});

export const videoPlaygroundGenerateBodySchema = z.object({
  topicId: nonEmptyStringSchema,
  model: nonEmptyStringSchema,
  prompt: nonEmptyStringSchema,
  aspectRatio: z.string().trim().min(1).optional(),
  resolution: z.string().trim().min(1).optional(),
  referenceImageUrl: nonDataUrlStringSchema.optional(),
});

export const videoPlaygroundGenerationUpdateBodySchema = z.object({
  status: z.enum(["pending", "generating", "success", "error"]).optional(),
  videoUrl: nonDataUrlStringSchema.optional(),
  duration: z.number().nonnegative().optional(),
  errorMessage: z.string().trim().min(1).optional(),
});

export const playgroundTopicBodySchema = playgroundTopicCreateBodySchema;
export const playgroundIdParamsSchema = playgroundTopicParamsSchema;

export type PlaygroundTopicCreateBody = z.infer<typeof playgroundTopicCreateBodySchema>;
export type PlaygroundTopicUpdateBody = z.infer<typeof playgroundTopicUpdateBodySchema>;
export type PlaygroundTopicParams = z.infer<typeof playgroundTopicParamsSchema>;
export type PlaygroundTopicBody = PlaygroundTopicCreateBody;
export type PlaygroundIdParams = PlaygroundTopicParams;
export type ImagePlaygroundBatchesQuery = z.infer<typeof imagePlaygroundBatchesQuerySchema>;
export type ImagePlaygroundGenerateBody = z.infer<typeof imagePlaygroundGenerateBodySchema>;
export type ImagePlaygroundStatusParams = z.infer<typeof imagePlaygroundStatusParamsSchema>;
export type ImagePlaygroundStatusQuery = z.infer<typeof imagePlaygroundStatusQuerySchema>;
export type ImagePlaygroundGenerationUpdateBody = z.infer<typeof imagePlaygroundGenerationUpdateBodySchema>;
export type PlaygroundGenerateTitleBody = z.infer<typeof playgroundGenerateTitleBodySchema>;
export type VideoPlaygroundSessionsQuery = z.infer<typeof videoPlaygroundSessionsQuerySchema>;
export type VideoPlaygroundGenerateBody = z.infer<typeof videoPlaygroundGenerateBodySchema>;
export type VideoPlaygroundGenerationUpdateBody = z.infer<typeof videoPlaygroundGenerationUpdateBodySchema>;
