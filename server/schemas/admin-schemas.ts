import { z } from "zod";
import { idSchema } from "./common.js";

const pageSchema = z.coerce.number().int().min(1).default(1);
const limitSchema = (max: number, defaultValue: number) =>
  z.coerce.number().int().min(1).max(max).default(defaultValue);

export const adminUsageQuerySchema = z.object({
  groupBy: z.enum(["day", "provider", "model", "operation"]).default("day"),
  days: z.coerce.number().int().min(1).max(365).default(30),
});

export const adminUsersQuerySchema = z.object({
  limit: limitSchema(100, 20),
  page: pageSchema,
  search: z.string().default(""),
});

export const adminOrganizationsQuerySchema = z.object({
  limit: limitSchema(100, 20),
  page: pageSchema,
});

export const adminLogsQuerySchema = z.object({
  limit: limitSchema(200, 100),
  page: pageSchema,
  action: z.string().default(""),
  category: z.string().default(""),
  severity: z.string().default(""),
});

export const adminLogParamsSchema = z.object({
  id: idSchema,
});

export type AdminUsageQuery = z.infer<typeof adminUsageQuerySchema>;
export type AdminUsersQuery = z.infer<typeof adminUsersQuerySchema>;
export type AdminOrganizationsQuery = z.infer<typeof adminOrganizationsQuerySchema>;
export type AdminLogsQuery = z.infer<typeof adminLogsQuerySchema>;
export type AdminLogParams = z.infer<typeof adminLogParamsSchema>;
