import { z } from "zod";
import { idSchema, optionalNullableString, optionalString } from "./common.js";

export const usersQuerySchema = z
  .object({
    email: z.email().optional(),
    id: idSchema.optional(),
  })
  .refine((value) => Boolean(value.email || value.id), {
    message: "email or id is required",
    path: ["email"],
  });

export type UsersQuery = z.infer<typeof usersQuerySchema>;

export const usersUpsertBodySchema = z.object({
  email: z.email(),
  name: z.string().trim().min(1),
  avatar_url: optionalNullableString,
  auth_provider: optionalString,
  auth_provider_id: optionalNullableString,
});

export type UsersUpsertBody = z.infer<typeof usersUpsertBodySchema>;
