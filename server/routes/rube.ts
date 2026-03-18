import type { Express, Request, Response } from "express";
import { getSql } from "../lib/db.js";
import { resolveUserId } from "../lib/user-resolver.js";
import logger from "../lib/logger.js";
import { RUBE_MCP_URL, RUBE_TIMEOUT_MS } from "../lib/constants.js";
import { validateRequest } from "../middleware/validate.js";
import { AppError } from "../lib/errors/index.js";
import {
  rubeProxyBodySchema,
  type RubeProxyBody,
  type McpRequest,
  type McpTool,
  type InstagramAccountRow,
} from "../schemas/rube-schemas.js";

// ============================================================================
// RUBE MCP PROXY - For Instagram Publishing (multi-tenant)
// ============================================================================

export function registerRubeRoutes(app: Express): void {
  app.post(
    "/api/rube",
    validateRequest({ body: rubeProxyBodySchema }),
    async (req: Request, res: Response) => {
      try {
        const sql = getSql();
        const { instagram_account_id, user_id, organization_id, ...mcpRequest } =
          req.body as RubeProxyBody & McpRequest;

        let token: string | undefined;
        let instagramUserId: string | undefined;

        // Multi-tenant mode: use user's token from database
        if (instagram_account_id && user_id) {
          logger.debug(
            { instagram_account_id, organization_id },
            "[Rube Proxy] Multi-tenant mode - fetching token for account",
          );

          // Resolve user_id: handles Better Auth IDs, Clerk IDs, and UUIDs
          const resolvedUserId = await resolveUserId(sql, user_id);
          if (!resolvedUserId) {
            logger.debug(
              { user_id },
              "[Rube Proxy] User not found",
            );
            throw new AppError("User not found", 400);
          }
          logger.debug(
            { resolvedUserId },
            "[Rube Proxy] Resolved user ID to DB UUID",
          );

          // Fetch account token and instagram_user_id
          // Instagram accounts belong to organizations - any org member can use them
          const accountResult = organization_id
            ? await sql`
                SELECT rube_token, instagram_user_id FROM instagram_accounts
                WHERE id = ${instagram_account_id}
                  AND organization_id = ${organization_id}
                  AND is_active = TRUE
                LIMIT 1
              `
            : await sql`
                SELECT rube_token, instagram_user_id FROM instagram_accounts
                WHERE id = ${instagram_account_id} AND user_id = ${resolvedUserId} AND is_active = TRUE
                LIMIT 1
              `;

          if (accountResult.length === 0) {
            logger.debug(
              {},
              "[Rube Proxy] Instagram account not found or not active for user/org",
            );
            throw new AppError("Instagram account not found or inactive", 403);
          }

          const account = accountResult[0] as InstagramAccountRow;
          token = account.rube_token;
          instagramUserId = account.instagram_user_id;
          logger.debug(
            { instagramUserId },
            "[Rube Proxy] Using token for Instagram user",
          );

          // Update last_used_at
          await sql`UPDATE instagram_accounts SET last_used_at = NOW() WHERE id = ${instagram_account_id}`;
        } else {
          // Fallback to global token (dev mode)
          token = process.env.RUBE_TOKEN;
          if (!token) {
            res.status(500).json({ error: "RUBE_TOKEN not configured" });
            return;
          }
          logger.debug({}, "[Rube Proxy] Using global RUBE_TOKEN (dev mode)");
        }

        // Build properly typed MCP request
        const typedMcpRequest: McpRequest = {
          jsonrpc: mcpRequest.jsonrpc,
          id: mcpRequest.id,
          method: mcpRequest.method,
          params: mcpRequest.params,
        };

        // Inject ig_user_id into tool arguments if we have it
        if (instagramUserId && typedMcpRequest.params?.arguments) {
          // For RUBE_MULTI_EXECUTE_TOOL, inject into each tool's arguments
          const tools = typedMcpRequest.params.arguments.tools;
          if (tools && Array.isArray(tools)) {
            tools.forEach((tool: McpTool) => {
              if (tool.arguments) {
                tool.arguments.ig_user_id = instagramUserId;
              }
            });
            logger.debug(
              { toolsCount: tools.length },
              "[Rube Proxy] Injected ig_user_id into tools",
            );
          } else {
            // For direct tool calls
            typedMcpRequest.params.arguments.ig_user_id = instagramUserId;
            logger.debug({}, "[Rube Proxy] Injected ig_user_id directly");
          }
        }

        logger.debug(
          { methodName: typedMcpRequest.params?.name },
          "[Rube Proxy] Calling Rube MCP",
        );

        const response = await fetch(RUBE_MCP_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(typedMcpRequest),
          signal: AbortSignal.timeout(RUBE_TIMEOUT_MS),
        });

        const text = await response.text();
        logger.debug({ status: response.status }, "[Rube Proxy] Response received");
        res.status(response.status).send(text);
      } catch (error: unknown) {
        const isTimeoutError = (err: unknown): boolean => {
          if (err instanceof Error) {
            return err.name === "TimeoutError" || err.name === "AbortError";
          }
          return false;
        };

        if (isTimeoutError(error)) {
          logger.warn({}, "[Rube Proxy] Request to Rube MCP timed out");
          res.status(504).json({ error: "Rube MCP timeout - servico nao respondeu" });
          return;
        }
        logger.error({ err: error }, "[Rube Proxy] Error");
        res.status(500).json({
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
  );
}
