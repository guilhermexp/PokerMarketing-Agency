import { z } from "zod";
import { idSchema, organizationIdSchema, userIdSchema } from "./common.js";

export const instagramAccountsQuerySchema = z
  .object({
    id: idSchema.optional(),
    organization_id: organizationIdSchema,
    user_id: userIdSchema.optional(),
  })
  .refine((value) => Boolean(value.id || value.user_id), {
    message: "user_id or id is required",
    path: ["user_id"],
  });

export type InstagramAccountsQuery = z.infer<typeof instagramAccountsQuerySchema>;

export const instagramConnectBodySchema = z.object({
  user_id: userIdSchema,
  organization_id: organizationIdSchema,
  rube_token: z.string().trim().min(1),
});

export type InstagramConnectBody = z.infer<typeof instagramConnectBodySchema>;

export const instagramUpdateQuerySchema = z.object({
  id: idSchema,
});

export type InstagramUpdateQuery = z.infer<typeof instagramUpdateQuerySchema>;

export const instagramUpdateBodySchema = z.object({
  rube_token: z.string().trim().min(1),
});

export type InstagramUpdateBody = z.infer<typeof instagramUpdateBodySchema>;
