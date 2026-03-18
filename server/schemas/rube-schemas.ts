import { z } from "zod";
import { idSchema, organizationIdSchema, userIdSchema } from "./common.js";

/**
 * MCP tool call argument schema.
 * Each tool has a slug and arguments object.
 */
const mcpToolArgumentsSchema = z.record(z.string(), z.unknown());

const mcpToolSchema = z.object({
  tool_slug: z.string().optional(),
  arguments: mcpToolArgumentsSchema.optional(),
});

/**
 * MCP request params schema.
 * Represents the params object in a JSON-RPC 2.0 request to Rube MCP.
 */
const mcpParamsArgumentsSchema = z.object({
  tools: z.array(mcpToolSchema).optional(),
  ig_user_id: z.string().optional(),
}).passthrough();

const mcpParamsSchema = z.object({
  name: z.string().optional(),
  arguments: mcpParamsArgumentsSchema.optional(),
}).passthrough();

/**
 * MCP request schema (JSON-RPC 2.0 format).
 */
const mcpRequestSchema = z.object({
  jsonrpc: z.literal("2.0").optional(),
  id: z.union([z.string(), z.number()]).optional(),
  method: z.string().optional(),
  params: mcpParamsSchema.optional(),
}).passthrough();

/**
 * Rube proxy request body schema.
 * Combines tenant info with MCP request.
 */
export const rubeProxyBodySchema = z.object({
  instagram_account_id: idSchema.optional(),
  user_id: userIdSchema.optional(),
  organization_id: organizationIdSchema,
}).passthrough();

export type RubeProxyBody = z.infer<typeof rubeProxyBodySchema>;

/**
 * MCP tool with mutable arguments for injecting ig_user_id.
 */
export interface McpTool {
  tool_slug?: string;
  arguments?: Record<string, unknown>;
}

/**
 * MCP request params with tools array.
 */
export interface McpParams {
  name?: string;
  arguments?: {
    tools?: McpTool[];
    ig_user_id?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * MCP request structure (JSON-RPC 2.0).
 */
export interface McpRequest {
  jsonrpc?: "2.0";
  id?: string | number;
  method?: string;
  params?: McpParams;
  [key: string]: unknown;
}

/**
 * Instagram account row from database.
 */
export interface InstagramAccountRow {
  rube_token: string;
  instagram_user_id: string;
}
