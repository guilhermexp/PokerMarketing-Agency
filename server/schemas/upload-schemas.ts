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
