import {
  OpenApiGeneratorV3,
  OpenAPIRegistry,
} from "@asteasolutions/zod-to-openapi";
import { z, type ZodType } from "zod";
import { chatBodySchema } from "../api/chat/schema.js";
import {
  adminLogParamsSchema,
  adminLogsQuerySchema,
  adminOrganizationsQuerySchema,
  adminUsageQuerySchema,
  adminUsersQuerySchema,
} from "./admin-schemas.js";
import {
  aiAssistantBodySchema,
  aiCampaignBodySchema,
  aiConvertPromptBodySchema,
  aiEditImageBodySchema,
  aiEnhancePromptBodySchema,
  aiExtractColorsBodySchema,
  aiFlyerBodySchema,
  aiImageAsyncBatchBodySchema,
  aiImageAsyncBodySchema,
  aiImageAsyncJobsQuerySchema,
  aiImageBodySchema,
  aiImageJobIdParamsSchema,
  aiTextBodySchema,
  aiVideoBodySchema,
} from "./ai-schemas.js";
import {
  studioAnswerBodySchema,
  studioContentSearchQuerySchema,
  studioFilesQuerySchema,
  studioHistoryQuerySchema,
  studioResetBodySchema,
  studioStreamBodySchema,
} from "./agent-studio-schemas.js";
import {
  brandProfileCreateBodySchema,
  brandProfileQuerySchema,
  brandProfileUpdateBodySchema,
  brandProfileUpdateQuerySchema,
} from "./brand-profiles-schemas.js";
import {
  campaignCreateBodySchema,
  campaignScenePatchBodySchema,
  campaignScenePatchQuerySchema,
  campaignsClipPatchBodySchema,
  campaignsClipPatchQuerySchema,
  campaignsDeleteQuerySchema,
  campaignsQuerySchema,
  carouselPatchBodySchema,
  carouselPatchQuerySchema,
  carouselSlidePatchBodySchema,
  carouselSlidePatchQuerySchema,
  carouselsQuerySchema,
} from "./campaigns-schemas.js";
import { idSchema } from "./common.js";
import {
  galleryCreateBodySchema,
  galleryDailyFlyersQuerySchema,
  galleryDeleteQuerySchema,
  galleryListQuerySchema,
  galleryPatchBodySchema,
  galleryPatchQuerySchema,
} from "./gallery-schemas.js";
import { initQuerySchema } from "./init-schemas.js";
import {
  imagePlaygroundBatchesQuerySchema,
  imagePlaygroundGenerateBodySchema,
  imagePlaygroundStatusParamsSchema,
  imagePlaygroundStatusQuerySchema,
  playgroundGenerateTitleBodySchema,
  playgroundIdParamsSchema,
  playgroundTopicBodySchema,
  playgroundTopicUpdateBodySchema,
  videoPlaygroundGenerationUpdateBodySchema,
  videoPlaygroundGenerateBodySchema,
  videoPlaygroundSessionsQuerySchema,
} from "./playground-schemas.js";
import { proxyVideoQuerySchema, uploadBodySchema } from "./upload-schemas.js";

export type ApiRouteMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type JsonResponseContract = {
  description: string;
  kind: "json";
  schema: ZodType;
  status: number;
};

type StreamResponseContract = {
  contentType: "text/event-stream";
  description: string;
  kind: "stream";
  status: number;
};

type BinaryResponseContract = {
  contentType: "application/octet-stream" | "text/plain";
  description: string;
  kind: "binary";
  status: number;
};

type EmptyResponseContract = {
  description: string;
  kind: "empty";
  status: 204;
};

type ApiRouteResponseContract =
  | JsonResponseContract
  | StreamResponseContract
  | BinaryResponseContract
  | EmptyResponseContract;

type ApiRouteRequestContract = {
  body?: ZodType;
  params?: ZodType;
  query?: ZodType;
};

export interface ApiRouteContract {
  method: ApiRouteMethod;
  path: string;
  request?: ApiRouteRequestContract;
  response: ApiRouteResponseContract;
  summary: string;
  tags: string[];
}

const isoDateSchema = z.union([z.date(), z.string().trim().min(1)]);
const optionalNullableIsoDateSchema = isoDateSchema.nullable().optional();
const jsonScalarSchema = z.union([z.string(), z.number(), z.boolean(), z.null(), z.date()]);
const jsonPrimitiveArraySchema = z.union([
  z.array(z.string()),
  z.array(z.number()),
  z.array(z.boolean()),
]);
const jsonObjectSchema = z.record(
  z.string(),
  z.union([jsonScalarSchema, jsonPrimitiveArraySchema]),
);
const jsonLikeSchema = z.union([jsonScalarSchema, jsonPrimitiveArraySchema, jsonObjectSchema]);
// Dynamic API payloads that vary by provider/model stay explicit and OpenAPI-safe.
const genericRecordSchema = z.record(z.string(), jsonLikeSchema);
const genericEntitySchema = z.object({ id: idSchema.optional() }).catchall(jsonLikeSchema);
const genericListSchema = z.array(genericEntitySchema);
const genericSuccessSchema = z
  .object({
    success: z.boolean(),
    message: z.string().trim().min(1).optional(),
  })
  .catchall(jsonLikeSchema);
const simpleIdParamsSchema = z.object({
  id: z.string().trim().min(1),
});
const jobIdParamsSchema = z.object({
  jobId: z.string().trim().min(1),
});
const generationIdParamsSchema = z.object({
  generationId: z.string().trim().min(1),
});
const emptyQuerySchema = z.object({});

const healthOutputSchema = z.object({
  status: z.string().trim().min(1),
  timestamp: z.string().trim().min(1),
});

const csrfTokenOutputSchema = z.object({
  csrfToken: z.string().trim().min(1),
});

const dbStatsOutputSchema = z.object({
  cachedUserIds: z.number().int().nonnegative(),
  timestamp: z.string().trim().min(1),
});

const brandProfileOutputSchema = z
  .object({
    id: idSchema.optional(),
    user_id: z.string().trim().min(1).optional(),
    organization_id: z.string().trim().min(1).nullable().optional(),
    name: z.string().trim().min(1).optional(),
    description: z.string().nullable().optional(),
    logo_url: z.string().nullable().optional(),
    primary_color: z.string().optional(),
    secondary_color: z.string().optional(),
    tone_of_voice: z.string().optional(),
    created_at: optionalNullableIsoDateSchema,
    updated_at: optionalNullableIsoDateSchema,
    deleted_at: optionalNullableIsoDateSchema,
  })
  .catchall(jsonLikeSchema);

const galleryImageOutputSchema = z
  .object({
    id: idSchema,
    user_id: z.string().trim().min(1).optional(),
    organization_id: z.string().trim().min(1).nullable().optional(),
    source: z.string().trim().min(1).optional(),
    src_url: z.string().trim().min(1).optional(),
    thumbnail_url: z.string().nullable().optional(),
    prompt: z.string().nullable().optional(),
    model: z.string().nullable().optional(),
    aspect_ratio: z.string().nullable().optional(),
    image_size: z.string().nullable().optional(),
    is_style_reference: z.boolean().optional(),
    style_reference_name: z.string().nullable().optional(),
    week_schedule_id: z.string().nullable().optional(),
    daily_flyer_day: z.string().nullable().optional(),
    daily_flyer_period: z.string().nullable().optional(),
    created_at: optionalNullableIsoDateSchema,
    updated_at: optionalNullableIsoDateSchema,
    deleted_at: optionalNullableIsoDateSchema,
  })
  .catchall(jsonLikeSchema);

const dailyFlyersOutputSchema = z.object({
  images: z.array(galleryImageOutputSchema),
  structured: z.record(
    z.string(),
    z.record(z.string(), z.array(galleryImageOutputSchema)),
  ),
});

const scheduledPostOutputSchema = z
  .object({
    id: idSchema.optional(),
    image_url: z.string().trim().min(1).optional(),
    scheduled_timestamp: z.union([z.number(), z.string().trim().min(1)]).optional(),
    status: z.string().trim().min(1).optional(),
  })
  .catchall(jsonLikeSchema);

const campaignOutputSchema = z
  .object({
    id: idSchema.optional(),
    user_id: z.string().trim().min(1).optional(),
    organization_id: z.string().trim().min(1).nullable().optional(),
    name: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    status: z.string().trim().min(1).optional(),
    created_at: optionalNullableIsoDateSchema,
    updated_at: optionalNullableIsoDateSchema,
  })
  .catchall(jsonLikeSchema);

const campaignWithContentOutputSchema = campaignOutputSchema.extend({
  video_clip_scripts: z.array(genericEntitySchema).optional(),
  posts: z.array(genericEntitySchema).optional(),
  ad_creatives: z.array(genericEntitySchema).optional(),
  carousel_scripts: z.array(genericEntitySchema).optional(),
});

const campaignsGetOutputSchema = z.union([
  z.array(campaignOutputSchema),
  campaignWithContentOutputSchema,
  campaignOutputSchema,
  z.null(),
]);

const carouselOutputSchema = z
  .object({
    id: idSchema.optional(),
    title: z.string().trim().min(1).optional(),
    caption: z.string().nullable().optional(),
    cover_url: z.string().nullable().optional(),
  })
  .catchall(jsonLikeSchema);

const uploadOutputSchema = z.object({
  success: z.boolean(),
  url: z.string().trim().min(1),
  filename: z.string().trim().min(1),
  size: z.number().nonnegative(),
});

const extractColorsOutputSchema = z.object({
  primaryColor: z.string().trim().min(1),
  secondaryColor: z.string().trim().min(1).nullable(),
  tertiaryColor: z.string().trim().min(1).nullable().optional(),
});

const initOutputSchema = z
  .object({
    brandProfile: brandProfileOutputSchema.nullable(),
    gallery: z.array(galleryImageOutputSchema),
    scheduledPosts: z.array(scheduledPostOutputSchema),
    campaigns: z.array(campaignOutputSchema),
    tournamentSchedule: genericRecordSchema.nullable(),
    tournamentEvents: z.array(genericRecordSchema),
    schedulesList: z.array(genericEntitySchema),
    _meta: z
      .object({
        loadTime: z.number().optional(),
        queriesExecuted: z.number().optional(),
        timestamp: z.string().trim().min(1).optional(),
        userNotFound: z.boolean().optional(),
      })
      .partial()
      .catchall(jsonLikeSchema)
      .optional(),
  })
  .catchall(jsonLikeSchema);

const userOutputSchema = z
  .object({
    id: idSchema.optional(),
    email: z.string().trim().min(1).optional(),
    name: z.string().trim().min(1).optional(),
    avatar_url: z.string().nullable().optional(),
  })
  .catchall(jsonLikeSchema);

const instagramAccountOutputSchema = z
  .object({
    id: idSchema,
    instagram_user_id: z.string().trim().min(1).optional(),
    instagram_username: z.string().trim().min(1).optional(),
    is_active: z.boolean().optional(),
  })
  .catchall(jsonLikeSchema);

const instagramConnectOutputSchema = z
  .object({
    success: z.boolean(),
    account: instagramAccountOutputSchema,
    message: z.string().trim().min(1),
  })
  .catchall(jsonLikeSchema);

const feedbackOutputSchema = z
  .object({
    success: z.boolean(),
    data: z.record(z.string(), jsonLikeSchema),
    annotationsCount: z.number().int().nonnegative(),
  })
  .catchall(jsonLikeSchema);

const topicsOutputSchema = z.object({
  topics: z.array(genericRecordSchema),
});

const sessionsOutputSchema = z.object({
  sessions: z.array(genericRecordSchema),
});

const batchesOutputSchema = z.object({
  batches: z.array(genericRecordSchema),
});

const filesOutputSchema = z.object({
  files: z.array(z.string().trim().min(1)),
});

const resultsOutputSchema = z.object({
  results: z.array(genericRecordSchema),
});

const threadHistoryOutputSchema = z.object({
  thread: genericRecordSchema.nullable(),
  messages: z.array(genericRecordSchema),
});

const titleOutputSchema = z.object({
  title: z.string().trim().min(1),
});

const jobsOutputSchema = z.object({
  jobs: z.array(genericRecordSchema),
  total: z.number().int().nonnegative().optional(),
});

const tournamentsListOutputSchema = z.object({
  schedules: z.array(genericRecordSchema),
});

const tournamentsOutputSchema = z.object({
  schedule: genericRecordSchema.nullable(),
  events: z.array(genericRecordSchema),
});

export const routeContracts: ApiRouteContract[] = [
  {
    method: "GET",
    path: "/health",
    response: {
      kind: "json",
      status: 200,
      schema: healthOutputSchema,
      description: "Application health status",
    },
    summary: "Health check",
    tags: ["Health"],
  },
  {
    method: "GET",
    path: "/api/db/health",
    response: {
      kind: "json",
      status: 200,
      schema: healthOutputSchema,
      description: "Database health status",
    },
    summary: "Database health check",
    tags: ["Health"],
  },
  {
    method: "GET",
    path: "/api/csrf-token",
    response: {
      kind: "json",
      status: 200,
      schema: csrfTokenOutputSchema,
      description: "CSRF token payload",
    },
    summary: "Fetch CSRF token",
    tags: ["Health"],
  },
  {
    method: "GET",
    path: "/api/db/stats",
    response: {
      kind: "json",
      status: 200,
      schema: dbStatsOutputSchema,
      description: "Runtime DB cache stats",
    },
    summary: "Get DB stats",
    tags: ["Health"],
  },
  {
    method: "POST",
    path: "/api/db/stats/reset",
    response: {
      kind: "json",
      status: 200,
      schema: genericSuccessSchema,
      description: "Reset stats acknowledgement",
    },
    summary: "Reset DB stats",
    tags: ["Health"],
  },
  {
    method: "GET",
    path: "/api/db/init",
    request: { query: initQuerySchema },
    response: {
      kind: "json",
      status: 200,
      schema: initOutputSchema,
      description: "Bootstrap payload",
    },
    summary: "Initialize dashboard data",
    tags: ["Init"],
  },
  {
    method: "GET",
    path: "/api/db/brand-profiles",
    request: { query: brandProfileQuerySchema },
    response: {
      kind: "json",
      status: 200,
      schema: brandProfileOutputSchema.nullable(),
      description: "Brand profile record",
    },
    summary: "Get brand profile",
    tags: ["Brand Profiles"],
  },
  {
    method: "POST",
    path: "/api/db/brand-profiles",
    request: { body: brandProfileCreateBodySchema },
    response: {
      kind: "json",
      status: 201,
      schema: brandProfileOutputSchema,
      description: "Created brand profile",
    },
    summary: "Create brand profile",
    tags: ["Brand Profiles"],
  },
  {
    method: "PUT",
    path: "/api/db/brand-profiles",
    request: {
      body: brandProfileUpdateBodySchema,
      query: brandProfileUpdateQuerySchema,
    },
    response: {
      kind: "json",
      status: 200,
      schema: brandProfileOutputSchema,
      description: "Updated brand profile",
    },
    summary: "Update brand profile",
    tags: ["Brand Profiles"],
  },
  {
    method: "GET",
    path: "/api/db/gallery",
    request: { query: galleryListQuerySchema },
    response: {
      kind: "json",
      status: 200,
      schema: z.array(galleryImageOutputSchema),
      description: "Gallery image list",
    },
    summary: "List gallery images",
    tags: ["Gallery"],
  },
  {
    method: "GET",
    path: "/api/db/gallery/daily-flyers",
    request: { query: galleryDailyFlyersQuerySchema },
    response: {
      kind: "json",
      status: 200,
      schema: dailyFlyersOutputSchema,
      description: "Grouped daily flyers",
    },
    summary: "List daily flyers",
    tags: ["Gallery"],
  },
  {
    method: "POST",
    path: "/api/db/gallery",
    request: { body: galleryCreateBodySchema },
    response: {
      kind: "json",
      status: 201,
      schema: galleryImageOutputSchema,
      description: "Created gallery image",
    },
    summary: "Create gallery image",
    tags: ["Gallery"],
  },
  {
    method: "PATCH",
    path: "/api/db/gallery",
    request: {
      body: galleryPatchBodySchema,
      query: galleryPatchQuerySchema,
    },
    response: {
      kind: "json",
      status: 200,
      schema: galleryImageOutputSchema,
      description: "Updated gallery image",
    },
    summary: "Update gallery image",
    tags: ["Gallery"],
  },
  {
    method: "DELETE",
    path: "/api/db/gallery",
    request: { query: galleryDeleteQuerySchema },
    response: {
      kind: "empty",
      status: 204,
      description: "Gallery image deleted",
    },
    summary: "Delete gallery image",
    tags: ["Gallery"],
  },
  {
    method: "GET",
    path: "/api/db/campaigns",
    request: { query: campaignsQuerySchema },
    response: {
      kind: "json",
      status: 200,
      schema: campaignsGetOutputSchema,
      description: "Campaign list or single campaign",
    },
    summary: "Get campaigns",
    tags: ["Campaigns"],
  },
  {
    method: "POST",
    path: "/api/db/campaigns",
    request: { body: campaignCreateBodySchema },
    response: {
      kind: "json",
      status: 201,
      schema: campaignWithContentOutputSchema,
      description: "Created campaign",
    },
    summary: "Create campaign",
    tags: ["Campaigns"],
  },
  {
    method: "DELETE",
    path: "/api/db/campaigns",
    request: { query: campaignsDeleteQuerySchema },
    response: {
      kind: "json",
      status: 200,
      schema: genericSuccessSchema.or(campaignOutputSchema),
      description: "Deleted campaign acknowledgement",
    },
    summary: "Delete campaign",
    tags: ["Campaigns"],
  },
  {
    method: "PATCH",
    path: "/api/db/campaigns",
    request: {
      body: campaignsClipPatchBodySchema,
      query: campaignsClipPatchQuerySchema,
    },
    response: {
      kind: "json",
      status: 200,
      schema: genericEntitySchema,
      description: "Updated clip thumbnail",
    },
    summary: "Update clip thumbnail",
    tags: ["Campaigns"],
  },
  {
    method: "PATCH",
    path: "/api/db/campaigns/scene",
    request: {
      body: campaignScenePatchBodySchema,
      query: campaignScenePatchQuerySchema,
    },
    response: {
      kind: "json",
      status: 200,
      schema: genericEntitySchema,
      description: "Updated scene image",
    },
    summary: "Update campaign scene image",
    tags: ["Campaigns"],
  },
  {
    method: "GET",
    path: "/api/db/carousels",
    request: { query: carouselsQuerySchema },
    response: {
      kind: "json",
      status: 200,
      schema: z.array(carouselOutputSchema),
      description: "Carousel list",
    },
    summary: "Get carousels",
    tags: ["Campaigns"],
  },
  {
    method: "PATCH",
    path: "/api/db/carousels",
    request: {
      body: carouselPatchBodySchema,
      query: carouselPatchQuerySchema,
    },
    response: {
      kind: "json",
      status: 200,
      schema: carouselOutputSchema,
      description: "Updated carousel",
    },
    summary: "Update carousel",
    tags: ["Campaigns"],
  },
  {
    method: "PATCH",
    path: "/api/db/carousels/slide",
    request: {
      body: carouselSlidePatchBodySchema,
      query: carouselSlidePatchQuerySchema,
    },
    response: {
      kind: "json",
      status: 200,
      schema: carouselOutputSchema,
      description: "Updated carousel slide",
    },
    summary: "Update carousel slide",
    tags: ["Campaigns"],
  },
  {
    method: "POST",
    path: "/api/upload",
    request: { body: uploadBodySchema },
    response: {
      kind: "json",
      status: 200,
      schema: uploadOutputSchema,
      description: "Uploaded asset metadata",
    },
    summary: "Upload asset",
    tags: ["Upload"],
  },
  {
    method: "GET",
    path: "/api/proxy-video",
    request: { query: proxyVideoQuerySchema },
    response: {
      kind: "binary",
      status: 200,
      contentType: "application/octet-stream",
      description: "Video proxy stream",
    },
    summary: "Proxy blob video",
    tags: ["Upload"],
  },
  {
    method: "GET",
    path: "/api/db/users",
    response: {
      kind: "json",
      status: 200,
      schema: userOutputSchema.nullable(),
      description: "User record",
    },
    summary: "Get user",
    tags: ["Users"],
  },
  {
    method: "POST",
    path: "/api/db/users",
    response: {
      kind: "json",
      status: 201,
      schema: userOutputSchema,
      description: "Created or updated user",
    },
    summary: "Create or update user",
    tags: ["Users"],
  },
  {
    method: "GET",
    path: "/api/db/scheduled-posts",
    response: {
      kind: "json",
      status: 200,
      schema: z.array(scheduledPostOutputSchema),
      description: "Scheduled post list",
    },
    summary: "List scheduled posts",
    tags: ["Scheduled Posts"],
  },
  {
    method: "POST",
    path: "/api/db/scheduled-posts",
    response: {
      kind: "json",
      status: 201,
      schema: scheduledPostOutputSchema,
      description: "Created scheduled post",
    },
    summary: "Create scheduled post",
    tags: ["Scheduled Posts"],
  },
  {
    method: "PUT",
    path: "/api/db/scheduled-posts",
    response: {
      kind: "json",
      status: 200,
      schema: scheduledPostOutputSchema,
      description: "Updated scheduled post",
    },
    summary: "Update scheduled post",
    tags: ["Scheduled Posts"],
  },
  {
    method: "DELETE",
    path: "/api/db/scheduled-posts",
    response: {
      kind: "empty",
      status: 204,
      description: "Scheduled post deleted",
    },
    summary: "Delete scheduled post",
    tags: ["Scheduled Posts"],
  },
  {
    method: "POST",
    path: "/api/db/scheduled-posts/retry",
    response: {
      kind: "json",
      status: 200,
      schema: scheduledPostOutputSchema,
      description: "Retried scheduled post",
    },
    summary: "Retry scheduled post",
    tags: ["Scheduled Posts"],
  },
  {
    method: "GET",
    path: "/api/db/instagram-accounts",
    response: {
      kind: "json",
      status: 200,
      schema: z.union([
        z.array(instagramAccountOutputSchema),
        instagramAccountOutputSchema.nullable(),
      ]),
      description: "Instagram accounts",
    },
    summary: "List Instagram accounts",
    tags: ["Instagram"],
  },
  {
    method: "POST",
    path: "/api/db/instagram-accounts",
    response: {
      kind: "json",
      status: 201,
      schema: instagramConnectOutputSchema,
      description: "Connected Instagram account",
    },
    summary: "Connect Instagram account",
    tags: ["Instagram"],
  },
  {
    method: "PUT",
    path: "/api/db/instagram-accounts",
    response: {
      kind: "json",
      status: 200,
      schema: instagramConnectOutputSchema.or(instagramAccountOutputSchema),
      description: "Updated Instagram account",
    },
    summary: "Update Instagram account",
    tags: ["Instagram"],
  },
  {
    method: "DELETE",
    path: "/api/db/instagram-accounts",
    response: {
      kind: "json",
      status: 200,
      schema: genericSuccessSchema,
      description: "Disconnected Instagram account",
    },
    summary: "Disconnect Instagram account",
    tags: ["Instagram"],
  },
  {
    method: "PATCH",
    path: "/api/db/posts",
    response: {
      kind: "json",
      status: 200,
      schema: genericEntitySchema,
      description: "Updated post",
    },
    summary: "Update post",
    tags: ["Posts"],
  },
  {
    method: "PATCH",
    path: "/api/db/ad-creatives",
    response: {
      kind: "json",
      status: 200,
      schema: genericEntitySchema,
      description: "Updated ad creative",
    },
    summary: "Update ad creative",
    tags: ["Posts"],
  },
  {
    method: "GET",
    path: "/api/db/tournaments/list",
    response: {
      kind: "json",
      status: 200,
      schema: tournamentsListOutputSchema,
      description: "Tournament schedules list",
    },
    summary: "List tournament schedules",
    tags: ["Tournaments"],
  },
  {
    method: "GET",
    path: "/api/db/tournaments",
    response: {
      kind: "json",
      status: 200,
      schema: tournamentsOutputSchema,
      description: "Tournament schedule and events",
    },
    summary: "Get tournament schedule",
    tags: ["Tournaments"],
  },
  {
    method: "POST",
    path: "/api/db/tournaments",
    response: {
      kind: "json",
      status: 200,
      schema: genericEntitySchema,
      description: "Created tournament schedule",
    },
    summary: "Create tournament schedule",
    tags: ["Tournaments"],
  },
  {
    method: "DELETE",
    path: "/api/db/tournaments",
    response: {
      kind: "json",
      status: 200,
      schema: genericSuccessSchema,
      description: "Deleted tournament schedule",
    },
    summary: "Delete tournament schedule",
    tags: ["Tournaments"],
  },
  {
    method: "PATCH",
    path: "/api/db/tournaments/event-flyer",
    response: {
      kind: "json",
      status: 200,
      schema: genericEntitySchema,
      description: "Updated event flyer",
    },
    summary: "Update tournament event flyer",
    tags: ["Tournaments"],
  },
  {
    method: "PATCH",
    path: "/api/db/tournaments/daily-flyer",
    response: {
      kind: "json",
      status: 200,
      schema: genericEntitySchema,
      description: "Updated daily flyer",
    },
    summary: "Update tournament daily flyer",
    tags: ["Tournaments"],
  },
  {
    method: "POST",
    path: "/api/feedback",
    response: {
      kind: "json",
      status: 200,
      schema: feedbackOutputSchema,
      description: "Feedback persistence result",
    },
    summary: "Submit client feedback",
    tags: ["Feedback"],
  },
  {
    method: "GET",
    path: "/api/admin/stats",
    response: {
      kind: "json",
      status: 200,
      schema: genericRecordSchema,
      description: "Admin stats",
    },
    summary: "Get admin stats",
    tags: ["Admin"],
  },
  {
    method: "GET",
    path: "/api/admin/usage",
    request: { query: adminUsageQuerySchema },
    response: {
      kind: "json",
      status: 200,
      schema: genericRecordSchema,
      description: "Admin usage analytics",
    },
    summary: "Get AI usage analytics",
    tags: ["Admin"],
  },
  {
    method: "GET",
    path: "/api/admin/users",
    request: { query: adminUsersQuerySchema },
    response: {
      kind: "json",
      status: 200,
      schema: genericRecordSchema,
      description: "Admin users list",
    },
    summary: "List admin users",
    tags: ["Admin"],
  },
  {
    method: "GET",
    path: "/api/admin/organizations",
    request: { query: adminOrganizationsQuerySchema },
    response: {
      kind: "json",
      status: 200,
      schema: genericRecordSchema,
      description: "Admin organizations list",
    },
    summary: "List organizations",
    tags: ["Admin"],
  },
  {
    method: "GET",
    path: "/api/admin/logs",
    request: { query: adminLogsQuerySchema },
    response: {
      kind: "json",
      status: 200,
      schema: genericRecordSchema,
      description: "Admin logs list",
    },
    summary: "List audit logs",
    tags: ["Admin"],
  },
  {
    method: "GET",
    path: "/api/admin/logs/:id",
    request: { params: adminLogParamsSchema },
    response: {
      kind: "json",
      status: 200,
      schema: genericRecordSchema,
      description: "Single audit log",
    },
    summary: "Get audit log",
    tags: ["Admin"],
  },
  {
    method: "POST",
    path: "/api/admin/logs/:id/ai-suggestions",
    request: { params: adminLogParamsSchema },
    response: {
      kind: "json",
      status: 200,
      schema: genericRecordSchema,
      description: "AI suggestions for an audit log",
    },
    summary: "Generate AI suggestions",
    tags: ["Admin"],
  },
  {
    method: "POST",
    path: "/api/agent/studio/stream",
    request: { body: studioStreamBodySchema },
    response: {
      kind: "stream",
      status: 200,
      contentType: "text/event-stream",
      description: "Studio streaming response",
    },
    summary: "Stream studio agent execution",
    tags: ["Agent Studio"],
  },
  {
    method: "POST",
    path: "/api/agent/studio/answer",
    request: { body: studioAnswerBodySchema },
    response: {
      kind: "json",
      status: 200,
      schema: z.object({ ok: z.boolean() }),
      description: "Answer acknowledgement",
    },
    summary: "Answer pending interaction",
    tags: ["Agent Studio"],
  },
  {
    method: "GET",
    path: "/api/agent/studio/history",
    request: { query: studioHistoryQuerySchema },
    response: {
      kind: "json",
      status: 200,
      schema: threadHistoryOutputSchema,
      description: "Thread history",
    },
    summary: "Get thread history",
    tags: ["Agent Studio"],
  },
  {
    method: "GET",
    path: "/api/agent/studio/content-search",
    request: { query: studioContentSearchQuerySchema },
    response: {
      kind: "json",
      status: 200,
      schema: resultsOutputSchema,
      description: "Content search results",
    },
    summary: "Search studio content",
    tags: ["Agent Studio"],
  },
  {
    method: "GET",
    path: "/api/agent/studio/files",
    request: { query: studioFilesQuerySchema },
    response: {
      kind: "json",
      status: 200,
      schema: filesOutputSchema,
      description: "Thread files",
    },
    summary: "List studio files",
    tags: ["Agent Studio"],
  },
  {
    method: "POST",
    path: "/api/agent/studio/reset",
    request: { body: studioResetBodySchema },
    response: {
      kind: "json",
      status: 200,
      schema: genericSuccessSchema.extend({
        threadId: z.string().trim().min(1).optional(),
      }),
      description: "Thread reset result",
    },
    summary: "Reset studio thread",
    tags: ["Agent Studio"],
  },
  {
    method: "POST",
    path: "/api/ai/campaign",
    request: { body: aiCampaignBodySchema },
    response: {
      kind: "json",
      status: 200,
      schema: genericRecordSchema,
      description: "Generated AI campaign",
    },
    summary: "Generate AI campaign",
    tags: ["AI"],
  },
  {
    method: "POST",
    path: "/api/ai/image",
    request: { body: aiImageBodySchema },
    response: {
      kind: "json",
      status: 200,
      schema: genericRecordSchema,
      description: "Generated AI image",
    },
    summary: "Generate AI image",
    tags: ["AI"],
  },
  {
    method: "POST",
    path: "/api/ai/edit-image",
    request: { body: aiEditImageBodySchema },
    response: {
      kind: "json",
      status: 200,
      schema: genericRecordSchema,
      description: "Edited AI image",
    },
    summary: "Edit AI image",
    tags: ["AI"],
  },
  {
    method: "POST",
    path: "/api/ai/extract-colors",
    request: { body: aiExtractColorsBodySchema },
    response: {
      kind: "json",
      status: 200,
      schema: extractColorsOutputSchema,
      description: "Extracted colors",
    },
    summary: "Extract colors",
    tags: ["AI"],
  },
  {
    method: "POST",
    path: "/api/ai/image/async",
    request: { body: aiImageAsyncBodySchema },
    response: {
      kind: "json",
      status: 200,
      schema: genericRecordSchema,
      description: "Queued async image generation",
    },
    summary: "Queue async image generation",
    tags: ["AI"],
  },
  {
    method: "POST",
    path: "/api/ai/image/async/batch",
    request: { body: aiImageAsyncBatchBodySchema },
    response: {
      kind: "json",
      status: 200,
      schema: genericRecordSchema,
      description: "Queued async image batch",
    },
    summary: "Queue async image batch",
    tags: ["AI"],
  },
  {
    method: "GET",
    path: "/api/ai/image/async/status/:jobId",
    request: { params: jobIdParamsSchema },
    response: {
      kind: "json",
      status: 200,
      schema: genericRecordSchema,
      description: "Async image job status",
    },
    summary: "Get async image status",
    tags: ["AI"],
  },
  {
    method: "GET",
    path: "/api/ai/image/async/jobs",
    request: { query: aiImageAsyncJobsQuerySchema },
    response: {
      kind: "json",
      status: 200,
      schema: jobsOutputSchema,
      description: "Async image jobs",
    },
    summary: "List async image jobs",
    tags: ["AI"],
  },
  {
    method: "DELETE",
    path: "/api/ai/image/async/cancel/:jobId",
    request: { params: jobIdParamsSchema },
    response: {
      kind: "json",
      status: 200,
      schema: genericSuccessSchema,
      description: "Async image cancel result",
    },
    summary: "Cancel async image job",
    tags: ["AI"],
  },
  {
    method: "POST",
    path: "/api/ai/speech",
    response: {
      kind: "json",
      status: 200,
      schema: genericRecordSchema,
      description: "Speech generation result",
    },
    summary: "Generate speech",
    tags: ["AI"],
  },
  {
    method: "POST",
    path: "/api/ai/flyer",
    request: { body: aiFlyerBodySchema },
    response: {
      kind: "json",
      status: 200,
      schema: genericRecordSchema,
      description: "Generated flyer copy",
    },
    summary: "Generate flyer text",
    tags: ["AI"],
  },
  {
    method: "POST",
    path: "/api/ai/text",
    request: { body: aiTextBodySchema },
    response: {
      kind: "json",
      status: 200,
      schema: genericRecordSchema,
      description: "Generated text",
    },
    summary: "Generate text",
    tags: ["AI"],
  },
  {
    method: "POST",
    path: "/api/ai/enhance-prompt",
    request: { body: aiEnhancePromptBodySchema },
    response: {
      kind: "json",
      status: 200,
      schema: z.object({ enhancedPrompt: z.string().trim().min(1) }),
      description: "Enhanced prompt",
    },
    summary: "Enhance prompt",
    tags: ["AI"],
  },
  {
    method: "POST",
    path: "/api/ai/convert-prompt",
    request: { body: aiConvertPromptBodySchema },
    response: {
      kind: "json",
      status: 200,
      schema: genericRecordSchema,
      description: "Converted prompt",
    },
    summary: "Convert prompt",
    tags: ["AI"],
  },
  {
    method: "POST",
    path: "/api/ai/video",
    response: {
      kind: "json",
      status: 200,
      schema: genericRecordSchema,
      description: "Video generation result",
    },
    summary: "Generate video",
    tags: ["AI"],
  },
  {
    method: "POST",
    path: "/api/chat",
    request: { body: chatBodySchema },
    response: {
      kind: "stream",
      status: 200,
      contentType: "text/event-stream",
      description: "Streaming chat response",
    },
    summary: "Chat stream",
    tags: ["AI"],
  },
  {
    method: "POST",
    path: "/api/ai/assistant",
    request: { body: aiAssistantBodySchema },
    response: {
      kind: "stream",
      status: 200,
      contentType: "text/event-stream",
      description: "Assistant streaming response",
    },
    summary: "Assistant stream",
    tags: ["AI"],
  },
  {
    method: "POST",
    path: "/api/rube",
    response: {
      kind: "binary",
      status: 200,
      contentType: "text/plain",
      description: "Raw Rube proxy response",
    },
    summary: "Proxy Rube MCP",
    tags: ["Rube"],
  },
  {
    method: "POST",
    path: "/api/generate/queue",
    response: {
      kind: "json",
      status: 200,
      schema: genericRecordSchema,
      description: "Queued generation job",
    },
    summary: "Queue generation job",
    tags: ["Generation Jobs"],
  },
  {
    method: "GET",
    path: "/api/generate/status",
    response: {
      kind: "json",
      status: 200,
      schema: genericRecordSchema.or(jobsOutputSchema),
      description: "Generation job status",
    },
    summary: "Get generation status",
    tags: ["Generation Jobs"],
  },
  {
    method: "POST",
    path: "/api/generate/cancel-all",
    response: {
      kind: "json",
      status: 200,
      schema: genericRecordSchema,
      description: "Cancelled jobs result",
    },
    summary: "Cancel all jobs",
    tags: ["Generation Jobs"],
  },
  {
    method: "GET",
    path: "/api/image-playground/topics",
    request: { query: emptyQuerySchema },
    response: {
      kind: "json",
      status: 200,
      schema: topicsOutputSchema,
      description: "Image playground topics",
    },
    summary: "List image topics",
    tags: ["Image Playground"],
  },
  {
    method: "POST",
    path: "/api/image-playground/topics",
    request: { body: playgroundTopicBodySchema },
    response: {
      kind: "json",
      status: 200,
      schema: genericSuccessSchema.extend({ topic: genericRecordSchema.optional() }),
      description: "Created image topic",
    },
    summary: "Create image topic",
    tags: ["Image Playground"],
  },
  {
    method: "PATCH",
    path: "/api/image-playground/topics/:id",
    request: { params: playgroundIdParamsSchema, body: playgroundTopicUpdateBodySchema },
    response: {
      kind: "json",
      status: 200,
      schema: genericSuccessSchema.extend({ topic: genericRecordSchema.optional() }),
      description: "Updated image topic",
    },
    summary: "Update image topic",
    tags: ["Image Playground"],
  },
  {
    method: "DELETE",
    path: "/api/image-playground/topics/:id",
    request: { params: playgroundIdParamsSchema },
    response: {
      kind: "json",
      status: 200,
      schema: genericSuccessSchema,
      description: "Deleted image topic",
    },
    summary: "Delete image topic",
    tags: ["Image Playground"],
  },
  {
    method: "GET",
    path: "/api/image-playground/batches",
    request: { query: imagePlaygroundBatchesQuerySchema },
    response: {
      kind: "json",
      status: 200,
      schema: batchesOutputSchema,
      description: "Image generation batches",
    },
    summary: "List image batches",
    tags: ["Image Playground"],
  },
  {
    method: "DELETE",
    path: "/api/image-playground/batches/:id",
    request: { params: playgroundIdParamsSchema },
    response: {
      kind: "json",
      status: 200,
      schema: genericSuccessSchema,
      description: "Deleted image batch",
    },
    summary: "Delete image batch",
    tags: ["Image Playground"],
  },
  {
    method: "POST",
    path: "/api/image-playground/generate",
    request: { body: imagePlaygroundGenerateBodySchema },
    response: {
      kind: "json",
      status: 200,
      schema: genericSuccessSchema.extend({ data: genericRecordSchema.optional() }),
      description: "Image generation result",
    },
    summary: "Generate image",
    tags: ["Image Playground"],
  },
  {
    method: "GET",
    path: "/api/image-playground/status/:generationId",
    request: { params: imagePlaygroundStatusParamsSchema, query: imagePlaygroundStatusQuerySchema },
    response: {
      kind: "json",
      status: 200,
      schema: genericRecordSchema,
      description: "Image generation status",
    },
    summary: "Get image generation status",
    tags: ["Image Playground"],
  },
  {
    method: "DELETE",
    path: "/api/image-playground/generations/:id",
    request: { params: playgroundIdParamsSchema },
    response: {
      kind: "json",
      status: 200,
      schema: genericSuccessSchema,
      description: "Deleted image generation",
    },
    summary: "Delete image generation",
    tags: ["Image Playground"],
  },
  {
    method: "POST",
    path: "/api/image-playground/generate-title",
    request: { body: playgroundGenerateTitleBodySchema },
    response: {
      kind: "json",
      status: 200,
      schema: titleOutputSchema,
      description: "Generated topic title",
    },
    summary: "Generate image topic title",
    tags: ["Image Playground"],
  },
  {
    method: "GET",
    path: "/api/video-playground/topics",
    request: { query: emptyQuerySchema },
    response: {
      kind: "json",
      status: 200,
      schema: topicsOutputSchema,
      description: "Video playground topics",
    },
    summary: "List video topics",
    tags: ["Video Playground"],
  },
  {
    method: "POST",
    path: "/api/video-playground/topics",
    request: { body: playgroundTopicBodySchema },
    response: {
      kind: "json",
      status: 200,
      schema: genericSuccessSchema.extend({ topic: genericRecordSchema.optional() }),
      description: "Created video topic",
    },
    summary: "Create video topic",
    tags: ["Video Playground"],
  },
  {
    method: "PATCH",
    path: "/api/video-playground/topics/:id",
    request: { params: playgroundIdParamsSchema, body: playgroundTopicUpdateBodySchema },
    response: {
      kind: "json",
      status: 200,
      schema: genericSuccessSchema.extend({ topic: genericRecordSchema.optional() }),
      description: "Updated video topic",
    },
    summary: "Update video topic",
    tags: ["Video Playground"],
  },
  {
    method: "DELETE",
    path: "/api/video-playground/topics/:id",
    request: { params: playgroundIdParamsSchema },
    response: {
      kind: "json",
      status: 200,
      schema: genericSuccessSchema,
      description: "Deleted video topic",
    },
    summary: "Delete video topic",
    tags: ["Video Playground"],
  },
  {
    method: "GET",
    path: "/api/video-playground/sessions",
    request: { query: videoPlaygroundSessionsQuerySchema },
    response: {
      kind: "json",
      status: 200,
      schema: sessionsOutputSchema,
      description: "Video sessions",
    },
    summary: "List video sessions",
    tags: ["Video Playground"],
  },
  {
    method: "POST",
    path: "/api/video-playground/generate",
    request: { body: videoPlaygroundGenerateBodySchema },
    response: {
      kind: "json",
      status: 200,
      schema: genericSuccessSchema.extend({ data: genericRecordSchema.optional() }),
      description: "Created video session",
    },
    summary: "Create video session",
    tags: ["Video Playground"],
  },
  {
    method: "DELETE",
    path: "/api/video-playground/sessions/:id",
    request: { params: playgroundIdParamsSchema },
    response: {
      kind: "json",
      status: 200,
      schema: genericSuccessSchema,
      description: "Deleted video session",
    },
    summary: "Delete video session",
    tags: ["Video Playground"],
  },
  {
    method: "DELETE",
    path: "/api/video-playground/generations/:id",
    request: { params: playgroundIdParamsSchema },
    response: {
      kind: "json",
      status: 200,
      schema: genericSuccessSchema,
      description: "Deleted video generation",
    },
    summary: "Delete video generation",
    tags: ["Video Playground"],
  },
  {
    method: "PATCH",
    path: "/api/video-playground/generations/:id",
    request: { params: playgroundIdParamsSchema, body: videoPlaygroundGenerationUpdateBodySchema },
    response: {
      kind: "json",
      status: 200,
      schema: genericSuccessSchema.extend({ generation: genericRecordSchema.optional() }),
      description: "Updated video generation",
    },
    summary: "Update video generation",
    tags: ["Video Playground"],
  },
  {
    method: "POST",
    path: "/api/video-playground/generate-title",
    request: { body: playgroundGenerateTitleBodySchema },
    response: {
      kind: "json",
      status: 200,
      schema: titleOutputSchema,
      description: "Generated video topic title",
    },
    summary: "Generate video topic title",
    tags: ["Video Playground"],
  },
];

const contractMap = new Map(
  routeContracts.map((contract) => [
    `${contract.method} ${contract.path}`,
    contract,
  ]),
);

export function normalizeOpenApiPath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

export function getRouteContract(
  method: string,
  path: string,
): ApiRouteContract | undefined {
  return contractMap.get(`${method.toUpperCase()} ${path}`);
}

export function validateRouteOutput(
  method: string,
  path: string,
  payload: unknown,
): unknown {
  const contract = getRouteContract(method, path);
  if (!contract || contract.response.kind !== "json") {
    return payload;
  }

  const result = contract.response.schema.safeParse(payload);
  if (!result.success) {
    // Log mismatch but never block response — we trust our own DB data
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        `[ResponseValidation] Schema mismatch on ${method} ${path}:`,
        result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).slice(0, 3).join("; "),
      );
    }
    return payload;
  }

  return result.data;
}

function registerContractPath(
  registry: OpenAPIRegistry,
  contract: ApiRouteContract,
): void {
  const normalizedPath = normalizeOpenApiPath(contract.path);
  const request: unknown = contract.request
    ? {
        ...(contract.request.params ? { params: contract.request.params } : {}),
        ...(contract.request.query ? { query: contract.request.query } : {}),
        ...(contract.request.body
          ? {
              body: {
                content: {
                  "application/json": {
                    schema: contract.request.body,
                  },
                },
              },
            }
          : {}),
      }
    : undefined;

  if (contract.response.kind === "json") {
    registry.registerPath({
      method: contract.method.toLowerCase() as Lowercase<ApiRouteMethod>,
      path: normalizedPath,
      summary: contract.summary,
      tags: contract.tags,
      request: request as never,
      responses: {
        [contract.response.status]: {
          description: contract.response.description,
          content: {
            "application/json": {
              schema: contract.response.schema,
            },
          },
        },
      },
    });
    return;
  }

  if (contract.response.kind === "empty") {
    registry.registerPath({
      method: contract.method.toLowerCase() as Lowercase<ApiRouteMethod>,
      path: normalizedPath,
      summary: contract.summary,
      tags: contract.tags,
      request: request as never,
      responses: {
        [contract.response.status]: {
          description: contract.response.description,
        },
      },
    });
    return;
  }

  registry.registerPath({
    method: contract.method.toLowerCase() as Lowercase<ApiRouteMethod>,
    path: normalizedPath,
    summary: contract.summary,
    tags: contract.tags,
    request: request as never,
    responses: {
      [contract.response.status]: {
        description: contract.response.description,
        content: {
          [contract.response.contentType]: {
            schema: {
              type: "string",
              format:
                contract.response.kind === "binary" ? "binary" : undefined,
            },
          },
        },
      },
    },
  });
}

let openApiDocumentCache: ReturnType<OpenApiGeneratorV3["generateDocument"]> | null =
  null;

function buildFallbackOpenApiDocument() {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const contract of routeContracts) {
    const normalizedPath = normalizeOpenApiPath(contract.path);
    const method = contract.method.toLowerCase();
    const existingPath = paths[normalizedPath] ?? {};
    const requestBody = contract.request?.body
      ? {
          content: {
            "application/json": {
              schema: {},
            },
          },
        }
      : undefined;

    const responseContent =
      contract.response.kind === "json"
        ? { "application/json": { schema: {} } }
        : contract.response.kind === "empty"
          ? undefined
          : {
              [contract.response.contentType]: {
                schema: { type: "string" },
              },
            };

    existingPath[method] = {
      summary: contract.summary,
      tags: contract.tags,
      ...(requestBody ? { requestBody } : {}),
      responses: {
        [contract.response.status]: {
          description: contract.response.description,
          ...(responseContent ? { content: responseContent } : {}),
        },
      },
    };
    paths[normalizedPath] = existingPath;
  }

  return {
    openapi: "3.0.0",
    info: {
      title: "Poker Marketing Agency API",
      version: "1.0.0",
      description: "OpenAPI contracts generated from the server route schemas.",
    },
    servers: [{ url: "/" }],
    paths,
  };
}

export function getOpenApiDocument(): ReturnType<OpenApiGeneratorV3["generateDocument"]> {
  if (openApiDocumentCache) {
    return openApiDocumentCache;
  }

  const registry = new OpenAPIRegistry();
  for (const contract of routeContracts) {
    registerContractPath(registry, contract);
  }

  try {
    const generator = new OpenApiGeneratorV3(registry.definitions);
    openApiDocumentCache = generator.generateDocument({
      openapi: "3.0.0",
      info: {
        title: "Poker Marketing Agency API",
        version: "1.0.0",
        description: "OpenAPI contracts generated from the server route schemas.",
      },
      servers: [{ url: "/" }],
    });
  } catch (error) {
    if (error instanceof RangeError) {
      openApiDocumentCache =
        buildFallbackOpenApiDocument() as ReturnType<OpenApiGeneratorV3["generateDocument"]>;
    } else {
      throw error;
    }
  }

  return openApiDocumentCache;
}
