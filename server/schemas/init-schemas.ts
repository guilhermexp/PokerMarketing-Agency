import { z } from "zod";
import { organizationIdSchema, optionalString, userIdSchema } from "./common.js";

export const initQuerySchema = z.object({
  user_id: userIdSchema.optional(),
  clerk_user_id: optionalString,
  organization_id: organizationIdSchema,
}).refine(
  (value) => Boolean(value.user_id || value.clerk_user_id),
  {
    message: "user_id or clerk_user_id is required",
    path: ["user_id"],
  },
);

export type InitQuery = z.infer<typeof initQuerySchema>;
