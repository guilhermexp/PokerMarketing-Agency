import { z } from "zod";
import { optionalString, organizationIdSchema, userIdSchema } from "./common.js";

export const generationStatusQuerySchema = z
  .object({
    jobId: optionalString,
    userId: userIdSchema.optional(),
    organizationId: organizationIdSchema,
    status: optionalString,
    limit: z.coerce.number().int().positive().max(50).optional(),
  })
  .refine((value) => Boolean(value.jobId || value.userId), {
    message: "jobId or userId is required",
    path: ["jobId"],
  });

export type GenerationStatusQuery = z.infer<typeof generationStatusQuerySchema>;

export const generationCancelAllBodySchema = z.object({
  userId: userIdSchema,
});

export type GenerationCancelAllBody = z.infer<typeof generationCancelAllBodySchema>;
