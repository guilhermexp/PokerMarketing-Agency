import { z } from "zod";

export const proxyVideoQuerySchema = z.object({
  url: z.string().trim().min(1),
}).passthrough();

export type ProxyVideoQuery = z.infer<typeof proxyVideoQuerySchema>;

export const uploadBodySchema = z.object({
  filename: z.string().trim().min(1),
  contentType: z.string().trim().min(1),
  data: z.string().trim().min(1),
}).passthrough();

export type UploadBody = z.infer<typeof uploadBodySchema>;

export const uploadMultipartBodySchema = z.object({
  filename: z.string().trim().min(1),
  contentType: z.string().trim().min(1),
  file: z.instanceof(Buffer).refine((value) => value.length > 0, {
    message: "File is required",
  }),
}).passthrough();

export type UploadMultipartBody = z.infer<typeof uploadMultipartBodySchema>;
