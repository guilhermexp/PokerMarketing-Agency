import { getSql } from "../lib/db.mjs";
import logger from "../lib/logger.mjs";
import { RUBE_MCP_URL, RUBE_TIMEOUT_MS } from "../lib/constants.mjs";

// ============================================================================
// RUBE MCP PROXY - For Instagram Publishing (multi-tenant)
// ============================================================================

export function registerRubeRoutes(app) {
  app.post("/api/rube", async (req, res) => {
    try {
      const sql = getSql();
      const { instagram_account_id, user_id, organization_id, ...mcpRequest } =
        req.body;

      let token;
      let instagramUserId;

      // Multi-tenant mode: use user's token from database
      if (instagram_account_id && user_id) {
        logger.debug(
          { instagram_account_id, organization_id },
          "[Rube Proxy] Multi-tenant mode - fetching token for account",
        );

        // Resolve user_id: can be DB UUID or Clerk ID
        let resolvedUserId = user_id;
        if (user_id.startsWith("user_")) {
          const userResult =
            await sql`SELECT id FROM users WHERE auth_provider_id = ${user_id} AND auth_provider = 'clerk' LIMIT 1`;
          resolvedUserId = userResult[0]?.id;
          if (!resolvedUserId) {
            logger.debug(
              { clerkUserId: user_id },
              "[Rube Proxy] User not found for Clerk ID",
            );
            return res.status(400).json({ error: "User not found" });
          }
          logger.debug(
            { resolvedUserId },
            "[Rube Proxy] Resolved Clerk ID to DB UUID",
          );
        }

        // Fetch account token and instagram_user_id
        // Check both personal accounts (user_id match) and organization accounts (org_id match)
        const accountResult = organization_id
          ? await sql`
              SELECT rube_token, instagram_user_id FROM instagram_accounts
              WHERE id = ${instagram_account_id}
                AND (
                  (organization_id = ${organization_id} AND is_active = TRUE)
                  OR (user_id = ${resolvedUserId} AND is_active = TRUE)
                )
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
          return res
            .status(403)
            .json({ error: "Instagram account not found or inactive" });
        }

        token = accountResult[0].rube_token;
        instagramUserId = accountResult[0].instagram_user_id;
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
          return res.status(500).json({ error: "RUBE_TOKEN not configured" });
        }
        logger.debug({}, "[Rube Proxy] Using global RUBE_TOKEN (dev mode)");
      }

      // Inject ig_user_id into tool arguments if we have it
      if (instagramUserId && mcpRequest.params?.arguments) {
        // For RUBE_MULTI_EXECUTE_TOOL, inject into each tool's arguments
        if (
          mcpRequest.params.arguments.tools &&
          Array.isArray(mcpRequest.params.arguments.tools)
        ) {
          mcpRequest.params.arguments.tools.forEach((tool) => {
            if (tool.arguments) {
              tool.arguments.ig_user_id = instagramUserId;
            }
          });
          logger.debug(
            { toolsCount: mcpRequest.params.arguments.tools.length },
            "[Rube Proxy] Injected ig_user_id into tools",
          );
        } else {
          // For direct tool calls
          mcpRequest.params.arguments.ig_user_id = instagramUserId;
          logger.debug({}, "[Rube Proxy] Injected ig_user_id directly");
        }
      }

      logger.debug(
        { methodName: mcpRequest.params?.name },
        "[Rube Proxy] Calling Rube MCP",
      );

      const response = await fetch(RUBE_MCP_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(mcpRequest),
        signal: AbortSignal.timeout(RUBE_TIMEOUT_MS),
      });

      const text = await response.text();
      logger.debug({ status: response.status }, "[Rube Proxy] Response received");
      res.status(response.status).send(text);
    } catch (error) {
      const isTimeout = error?.name === "TimeoutError" || error?.name === "AbortError";
      if (isTimeout) {
        logger.warn({}, "[Rube Proxy] Request to Rube MCP timed out");
        return res.status(504).json({ error: "Rube MCP timeout - serviço não respondeu" });
      }
      logger.error({ err: error }, "[Rube Proxy] Error");
      res.status(500).json({
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });
}
