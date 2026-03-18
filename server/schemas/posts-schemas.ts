import { z } from "zod";
import { idSchema, optionalNullableString } from "./common.js";

export const postsPatchQuerySchema = z.object({
  id: idSchema,
});

export type PostsPatchQuery = z.infer<typeof postsPatchQuerySchema>;

export const postsPatchBodySchema = z.object({
  image_url: optionalNullableString,
});

export type PostsPatchBody = z.infer<typeof postsPatchBodySchema>;
