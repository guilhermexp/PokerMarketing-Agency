import { z } from "zod";

export const feedbackBodySchema = z.object({
  markdown: z.string().trim().min(1),
  pageUrl: z.url().optional(),
  annotations: z.array(z.record(z.string(), z.json())).optional(),
});

export type FeedbackBody = z.infer<typeof feedbackBodySchema>;
