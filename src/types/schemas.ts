import { z } from "zod";

// Tone of Voice Schema
export const ToneOfVoiceSchema = z.enum([
  "Profissional",
  "Espirituoso",
  "Casual",
  "Inspirador",
  "Técnico",
]);

// Tone Target Schema
export const ToneTargetSchema = z.enum([
  "campaigns",
  "posts",
  "images",
  "flyers",
  "videos",
]);

// Creative Model Schema
export const CreativeModelSchema = z.string();

// Brand Profile Schema
export const BrandProfileSchema = z.object({
  name: z.string(),
  description: z.string(),
  logo: z.string().nullable(),
  primaryColor: z.string(),
  secondaryColor: z.string(),
  tertiaryColor: z.string(),
  toneOfVoice: ToneOfVoiceSchema,
  toneTargets: z.array(ToneTargetSchema).optional(),
  creativeModel: CreativeModelSchema.optional(),
  industry: z.string().optional(),
});

// Image File Schema
export const ImageFileSchema = z.object({
  base64: z.string(),
  mimeType: z.string(),
});

// Content Input Schema
export const ContentInputSchema = z.object({
  transcript: z.string(),
  productImages: z.array(ImageFileSchema).nullable(),
  inspirationImages: z.array(ImageFileSchema).nullable(),
  collabLogo: ImageFileSchema.nullable().optional(),
  compositionAssets: z.array(ImageFileSchema).nullable().optional(),
  toneOfVoiceOverride: ToneOfVoiceSchema.nullable().optional(),
});

// Video Clip Scene Schema
export const VideoClipSceneSchema = z.object({
  scene: z.number(),
  visual: z.string(),
  narration: z.string(),
  duration_seconds: z.number(),
  image_url: z.string().optional(),
});

// Video Clip Script Schema
export const VideoClipScriptSchema = z.object({
  id: z.string().optional(),
  title: z.string(),
  hook: z.string(),
  scenes: z.array(VideoClipSceneSchema),
  image_prompt: z.string(),
  audio_script: z.string(),
  thumbnail_url: z.string().nullable().optional(),
});

// Post Schema
export const PostSchema = z.object({
  id: z.string().optional(),
  platform: z.enum(["Instagram", "LinkedIn", "Twitter", "Facebook"]),
  content: z.string(),
  hashtags: z.array(z.string()),
  image_prompt: z.string(),
  image_url: z.string().nullable().optional(),
});

// Ad Creative Schema
export const AdCreativeSchema = z.object({
  id: z.string().optional(),
  platform: z.enum(["Facebook", "Google"]),
  headline: z.string(),
  body: z.string(),
  cta: z.string(),
  image_prompt: z.string(),
  image_url: z.string().nullable().optional(),
});

// API Error Schema
export const ApiErrorSchema = z.object({
  message: z.string(),
  code: z.string().optional(),
  details: z.unknown().optional(),
});

// Carousel Slide Schema
export const CarouselSlideSchema = z.object({
  slide: z.number(),
  visual: z.string(),
  text: z.string(),
  image_url: z.string().optional(),
});

// Carousel Script Schema
export const CarouselScriptSchema = z.object({
  id: z.string().optional(),
  title: z.string(),
  hook: z.string(),
  slides: z.array(CarouselSlideSchema),
  cover_prompt: z.string(),
  cover_url: z.string().nullable().optional(),
  caption: z.string().optional(),
});

// Marketing Campaign Schema
export const MarketingCampaignSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  inputTranscript: z.string().optional(),
  videoClipScripts: z.array(VideoClipScriptSchema),
  posts: z.array(PostSchema),
  adCreatives: z.array(AdCreativeSchema),
  carousels: z.array(CarouselScriptSchema),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  generatedWithModel: z.string().optional(),
  toneOfVoiceUsed: ToneOfVoiceSchema.optional(),
});

// Campaign Summary Schema
export const CampaignSummarySchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  status: z.string(),
  createdAt: z.string(),
  videoCount: z.number().optional(),
  postCount: z.number().optional(),
  adCount: z.number().optional(),
  carouselCount: z.number().optional(),
});

// Theme Schema
export const ThemeSchema = z.enum(["light", "dark"]);

// Tournament Event Schema
export const TournamentEventSchema = z.object({
  id: z.string(),
  day: z.string(),
  name: z.string(),
  game: z.string(),
  gtd: z.string(),
  buyIn: z.string(),
  rebuy: z.string(),
  addOn: z.string(),
  stack: z.string(),
  players: z.string(),
  lateReg: z.string(),
  minutes: z.string(),
  structure: z.string(),
  times: z.record(z.string(), z.string()),
  flyer_urls: z.array(z.string()).optional(),
});

// Week Schedule Info Schema
export const WeekScheduleInfoSchema = z.object({
  id: z.string().optional(),
  startDate: z.string(),
  endDate: z.string(),
  filename: z.string(),
  daily_flyer_urls: z.record(z.string(), z.array(z.string())).optional(),
});

// Image Model Schema
export const ImageModelSchema = z.literal("gemini-3-pro-image-preview");

// Image Size Schema
export const ImageSizeSchema = z.enum(["1K", "2K", "4K"]);

// Video Model Schemas
export const VeoVideoModelSchema = z.literal("veo-3.1-fast-generate-preview");
export const FalVideoModelSchema = z.enum([
  "fal-ai/sora-2/text-to-video",
  "fal-ai/veo3.1/fast",
]);
export const VideoModelSchema = z.union([VeoVideoModelSchema, FalVideoModelSchema]);

// Gallery Media Type Schema
export const GalleryMediaTypeSchema = z.enum(["image", "video", "audio"]);

// Gallery Image Schema
export const GalleryImageSchema = z.object({
  id: z.string(),
  src: z.string(),
  prompt: z.string().optional(),
  source: z.string(),
  model: z.union([
    ImageModelSchema,
    z.literal("video-export"),
    z.literal("tts-generation"),
  ]),
  aspectRatio: z.string().optional(),
  imageSize: ImageSizeSchema.optional(),
  mediaType: GalleryMediaTypeSchema.optional(),
  duration: z.number().optional(),
  post_id: z.string().optional(),
  ad_creative_id: z.string().optional(),
  video_script_id: z.string().optional(),
  carousel_script_id: z.string().optional(),
  campaign_id: z.string().optional(),
  tournament_event_id: z.string().optional(),
  week_schedule_id: z.string().optional(),
  daily_flyer_day: z.string().optional(),
  daily_flyer_period: z.string().optional(),
  published_at: z.string().optional(),
  created_at: z.string().optional(),
});

// Style Reference Schema
export const StyleReferenceSchema = z.object({
  id: z.string(),
  src: z.string(),
  name: z.string(),
  createdAt: z.number(),
  prompt: z.string().optional(),
  source: z.string().optional(),
  model: ImageModelSchema.optional(),
  aspectRatio: z.string().optional(),
  imageSize: ImageSizeSchema.optional(),
});

// Chat Reference Image Schema
export const ChatReferenceImageSchema = z.object({
  id: z.string(),
  src: z.string(),
});

// Pending Tool Edit Schema
export const PendingToolEditSchema = z.object({
  toolCallId: z.string(),
  toolName: z.string(),
  prompt: z.string(),
  imageId: z.string(),
  result: z.enum(["approved", "rejected"]).optional(),
  imageUrl: z.string().optional(),
  error: z.string().optional(),
});

// Assistant Function Call Schema
export const AssistantFunctionCallSchema = z.object({
  name: z.string(),
  args: z.record(z.string(), z.unknown()),
});

// Chat Part Schema
export const ChatPartSchema = z.object({
  text: z.string().optional(),
  inlineData: z
    .object({
      data: z.string(),
      mimeType: z.string(),
    })
    .optional(),
  functionCall: AssistantFunctionCallSchema.optional(),
  functionResponse: z.record(z.string(), z.unknown()).optional(),
});

// Grounding Chunk Schema
export const GroundingChunkSchema = z.object({
  web: z
    .object({
      uri: z.string(),
      title: z.string(),
    })
    .optional(),
});

// Chat Message Schema
export const ChatMessageSchema = z.object({
  role: z.enum(["user", "model"]),
  parts: z.array(ChatPartSchema),
  groundingMetadata: z
    .object({
      groundingChunks: z.array(GroundingChunkSchema),
    })
    .optional(),
});

// Generation Setting Schema
export const GenerationSettingSchema = z.object({
  generate: z.boolean(),
  count: z.number(),
});

// Generation Options Schema
export const GenerationOptionsSchema = z.object({
  videoClipScripts: GenerationSettingSchema,
  posts: z.object({
    linkedin: GenerationSettingSchema,
    twitter: GenerationSettingSchema,
    instagram: GenerationSettingSchema,
    facebook: GenerationSettingSchema,
  }),
  adCreatives: z.object({
    facebook: GenerationSettingSchema,
    google: GenerationSettingSchema,
  }),
});

// Calendar & Scheduling Schemas
export const SchedulingPlatformSchema = z.enum(["instagram", "facebook", "both"]);
export const PublicationStatusSchema = z.enum([
  "scheduled",
  "publishing",
  "published",
  "failed",
  "cancelled",
]);
export const CalendarViewTypeSchema = z.enum(["monthly", "weekly"]);
export const InstagramContentTypeSchema = z.enum([
  "photo",
  "video",
  "reel",
  "story",
  "carousel",
]);

// Scheduled Post Schema
export const ScheduledPostSchema = z.object({
  id: z.string(),
  type: z.enum(["flyer", "campaign_post", "ad_creative"]),
  contentId: z.string(),
  imageUrl: z.string(),
  carouselImageUrls: z.array(z.string()).optional(),
  caption: z.string(),
  hashtags: z.array(z.string()),
  scheduledDate: z.string(),
  scheduledTime: z.string(),
  scheduledTimestamp: z.number(),
  timezone: z.string(),
  platforms: SchedulingPlatformSchema,
  status: PublicationStatusSchema,
  publishedAt: z.number().optional(),
  errorMessage: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
  createdFrom: z.enum(["gallery", "campaign", "flyer_generator"]),
  instagramContentType: InstagramContentTypeSchema.optional(),
  instagramMediaId: z.string().optional(),
  instagramContainerId: z.string().optional(),
  instagramAccountId: z.string().optional(),
  publishAttempts: z.number().optional(),
  lastPublishAttempt: z.number().optional(),
});

// Instagram Publishing Schemas
export const InstagramPublishStepSchema = z.enum([
  "idle",
  "uploading_image",
  "creating_container",
  "checking_status",
  "publishing",
  "completed",
  "failed",
]);

export const InstagramPublishStateSchema = z.object({
  step: InstagramPublishStepSchema,
  message: z.string(),
  progress: z.number(),
  postId: z.string().optional(),
});

// Instagram Account Schema
export const InstagramAccountSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  organization_id: z.string().nullable(),
  instagram_user_id: z.string(),
  instagram_username: z.string(),
  is_active: z.boolean(),
  connected_at: z.string(),
  last_used_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

// Instagram Context Schema
export const InstagramContextSchema = z.object({
  instagramAccountId: z.string(),
  userId: z.string(),
});

// Schedule Notification Schema
export const ScheduleNotificationSchema = z.object({
  postId: z.string(),
  scheduledTime: z.number(),
  shown: z.boolean(),
});

// Calendar Day Schema
export const CalendarDaySchema = z.object({
  date: z.string(),
  dayOfWeek: z.number(),
  isCurrentMonth: z.boolean(),
  isToday: z.boolean(),
  scheduledPosts: z.array(ScheduledPostSchema),
});

// Type inference helpers - extract TypeScript types from Zod schemas
export type ToneOfVoice = z.infer<typeof ToneOfVoiceSchema>;
export type ToneTarget = z.infer<typeof ToneTargetSchema>;
export type CreativeModel = z.infer<typeof CreativeModelSchema>;
export type BrandProfile = z.infer<typeof BrandProfileSchema>;
export type ImageFile = z.infer<typeof ImageFileSchema>;
export type ContentInput = z.infer<typeof ContentInputSchema>;
export type VideoClipScene = z.infer<typeof VideoClipSceneSchema>;
export type VideoClipScript = z.infer<typeof VideoClipScriptSchema>;
export type Post = z.infer<typeof PostSchema>;
export type AdCreative = z.infer<typeof AdCreativeSchema>;
export type ApiError = z.infer<typeof ApiErrorSchema>;
export type CarouselSlide = z.infer<typeof CarouselSlideSchema>;
export type CarouselScript = z.infer<typeof CarouselScriptSchema>;
export type MarketingCampaign = z.infer<typeof MarketingCampaignSchema>;
export type CampaignSummary = z.infer<typeof CampaignSummarySchema>;
export type Theme = z.infer<typeof ThemeSchema>;
export type TournamentEvent = z.infer<typeof TournamentEventSchema>;
export type WeekScheduleInfo = z.infer<typeof WeekScheduleInfoSchema>;
export type ImageModel = z.infer<typeof ImageModelSchema>;
export type ImageSize = z.infer<typeof ImageSizeSchema>;
export type VeoVideoModel = z.infer<typeof VeoVideoModelSchema>;
export type FalVideoModel = z.infer<typeof FalVideoModelSchema>;
export type VideoModel = z.infer<typeof VideoModelSchema>;
export type GalleryMediaType = z.infer<typeof GalleryMediaTypeSchema>;
export type GalleryImage = z.infer<typeof GalleryImageSchema>;
export type StyleReference = z.infer<typeof StyleReferenceSchema>;
export type ChatReferenceImage = z.infer<typeof ChatReferenceImageSchema>;
export type PendingToolEdit = z.infer<typeof PendingToolEditSchema>;
export type AssistantFunctionCall = z.infer<typeof AssistantFunctionCallSchema>;
export type ChatPart = z.infer<typeof ChatPartSchema>;
export type GroundingChunk = z.infer<typeof GroundingChunkSchema>;
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type GenerationSetting = z.infer<typeof GenerationSettingSchema>;
export type GenerationOptions = z.infer<typeof GenerationOptionsSchema>;
export type SchedulingPlatform = z.infer<typeof SchedulingPlatformSchema>;
export type PublicationStatus = z.infer<typeof PublicationStatusSchema>;
export type CalendarViewType = z.infer<typeof CalendarViewTypeSchema>;
export type InstagramContentType = z.infer<typeof InstagramContentTypeSchema>;
export type ScheduledPost = z.infer<typeof ScheduledPostSchema>;
export type InstagramPublishStep = z.infer<typeof InstagramPublishStepSchema>;
export type InstagramPublishState = z.infer<typeof InstagramPublishStateSchema>;
export type InstagramAccount = z.infer<typeof InstagramAccountSchema>;
export type InstagramContext = z.infer<typeof InstagramContextSchema>;
export type ScheduleNotification = z.infer<typeof ScheduleNotificationSchema>;
export type CalendarDay = z.infer<typeof CalendarDaySchema>;
