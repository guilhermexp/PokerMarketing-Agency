import { z } from "zod";
import {
  idSchema,
  optionalNullableString,
  organizationIdSchema,
  userIdSchema,
} from "./common.mjs";

export const brandProfileQuerySchema = z.object({
  user_id: userIdSchema.optional(),
  id: idSchema.optional(),
  organization_id: organizationIdSchema,
}).refine(
  (value) => Boolean(value.user_id || value.id),
  {
    message: "user_id or id is required",
    path: ["user_id"],
  },
);

export const brandProfileCreateBodySchema = z.object({
  user_id: userIdSchema,
  organization_id: organizationIdSchema,
  name: z.string().trim().min(1),
  description: optionalNullableString,
  logo_url: optionalNullableString,
  primary_color: optionalNullableString,
  secondary_color: optionalNullableString,
  tone_of_voice: optionalNullableString,
}).passthrough();

export const brandProfileUpdateQuerySchema = z.object({
  id: idSchema,
}).passthrough();

export const brandProfileUpdateBodySchema = z.object({
  user_id: userIdSchema.optional(),
  name: optionalNullableString,
  description: optionalNullableString,
  logo_url: optionalNullableString,
  primary_color: optionalNullableString,
  secondary_color: optionalNullableString,
  tone_of_voice: optionalNullableString,
}).passthrough();
