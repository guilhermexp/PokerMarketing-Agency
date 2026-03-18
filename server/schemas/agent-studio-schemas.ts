import { z } from "zod";

const studioTypeSchema = z.enum(["image", "video"]);
const contentTypeSchema = z.enum(["gallery", "campaign", "post", "clip", "carousel"]);

const attachmentSchema = z.object({
  type: z.enum(["image", "video", "file"]).default("file"),
  url: z.string().trim().min(1),
  name: z.string().default(""),
  mimeType: z.string().default(""),
});

const mentionSchema = z.object({
  path: z.string().trim().min(1),
});

const directAnswersSchema = z.record(z.string(), z.string());

const answerPayloadSchema = z.union([
  z.string(),
  z.object({
    approved: z.boolean().optional(),
    optionId: z.string().optional(),
    text: z.string().optional(),
    answers: directAnswersSchema.optional(),
  }),
]);

export const agentStudioStreamBodySchema = z
  .object({
    studioType: studioTypeSchema,
    topicId: z.string().trim().min(1),
    message: z.string().optional(),
    threadId: z.string().optional(),
    attachments: z.array(attachmentSchema).default([]),
    mentions: z.array(mentionSchema).default([]),
  })
  .refine(
    (data) => (data.message?.trim().length ?? 0) > 0 || data.attachments.length > 0,
    {
      message: "message ou attachments é obrigatório.",
      path: ["message"],
    },
  );

export const agentStudioAnswerBodySchema = z.object({
  threadId: z.string().trim().min(1),
  interactionId: z.string().trim().min(1),
  answer: answerPayloadSchema.optional(),
});

export const agentStudioHistoryQuerySchema = z.object({
  studioType: studioTypeSchema,
  topicId: z.string().trim().min(1),
});

export const agentStudioContentSearchQuerySchema = z.object({
  type: contentTypeSchema,
  query: z.string().default(""),
  limit: z.coerce.number().int().min(1).max(30).default(10),
});

export const agentStudioFilesQuerySchema = z.object({
  query: z.string().default(""),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const agentStudioResetBodySchema = z
  .object({
    threadId: z.string().optional(),
    studioType: studioTypeSchema.optional(),
    topicId: z.string().optional(),
  })
  .refine(
    (data) =>
      (data.threadId?.trim().length ?? 0) > 0 ||
      (!!data.studioType && (data.topicId?.trim().length ?? 0) > 0),
    {
      message: "threadId ou studioType + topicId é obrigatório.",
      path: ["threadId"],
    },
  );

export const studioStreamBodySchema = agentStudioStreamBodySchema;
export const studioAnswerBodySchema = agentStudioAnswerBodySchema;
export const studioHistoryQuerySchema = agentStudioHistoryQuerySchema;
export const studioContentSearchQuerySchema = agentStudioContentSearchQuerySchema;
export const studioFilesQuerySchema = agentStudioFilesQuerySchema;
export const studioResetBodySchema = agentStudioResetBodySchema;

export type StudioStreamBody = z.infer<typeof agentStudioStreamBodySchema>;
export type StudioAnswerBody = z.infer<typeof agentStudioAnswerBodySchema>;
export type StudioHistoryQuery = z.infer<typeof agentStudioHistoryQuerySchema>;
export type StudioContentSearchQuery = z.infer<typeof agentStudioContentSearchQuerySchema>;
export type StudioFilesQuery = z.infer<typeof agentStudioFilesQuerySchema>;
export type StudioResetBody = z.infer<typeof agentStudioResetBodySchema>;
