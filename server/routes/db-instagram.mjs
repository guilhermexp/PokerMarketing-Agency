import { getSql } from "../lib/db.mjs";
import { resolveUserId } from "../lib/user-resolver.mjs";
import { RUBE_MCP_URL, RUBE_TIMEOUT_MS } from "../lib/constants.mjs";
import logger from "../lib/logger.mjs";
import { sanitizeErrorForClient } from "../lib/ai/retry.mjs";

// ============================================================================
// INSTAGRAM ACCOUNTS API (Multi-tenant Rube MCP)
// ============================================================================

// Validate Rube token by calling Instagram API
export async function validateRubeToken(rubeToken) {
  try {
    const request = {
      jsonrpc: "2.0",
      id: `validate_${Date.now()}`,
      method: "tools/call",
      params: {
        name: "RUBE_MULTI_EXECUTE_TOOL",
        arguments: {
          tools: [
            {
              tool_slug: "INSTAGRAM_GET_USER_INFO",
              arguments: { fields: "id,username" },
            },
          ],
          sync_response_to_workbench: false,
          memory: {},
          session_id: "validate",
          thought: "Validating Instagram connection",
        },
      },
    };

    logger.debug({}, "[Instagram] Validating token with Rube MCP");
    const response = await fetch(RUBE_MCP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${rubeToken}`,
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(RUBE_TIMEOUT_MS),
    });

    const text = await response.text();
    logger.debug(
      { status: response.status, responsePreview: text.substring(0, 500) },
      "[Instagram] Rube response received",
    );

    if (text.startsWith("<!DOCTYPE") || text.startsWith("<html")) {
      return {
        success: false,
        error: "Token inválido ou expirado. Gere um novo token no Rube.",
      };
    }

    if (!response.ok) {
      return {
        success: false,
        error: `Erro ao validar token (${response.status})`,
      };
    }

    // Parse SSE response
    const lines = text.split("\n");
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const json = JSON.parse(line.substring(6));
          logger.debug({ data: json }, "[Instagram] Parsed SSE data");
          if (json?.error) {
            return {
              success: false,
              error: "Instagram não conectado no Rube.",
            };
          }
          const nestedData = json?.result?.content?.[0]?.text;
          if (nestedData) {
            const parsed = JSON.parse(nestedData);
            logger.debug({ nestedData: parsed }, "[Instagram] Nested data");
            if (parsed?.error || parsed?.data?.error) {
              return {
                success: false,
                error: "Instagram não conectado no Rube.",
              };
            }
            const results =
              parsed?.data?.data?.results || parsed?.data?.results;
            if (results && results.length > 0) {
              const userData = results[0]?.response?.data;
              if (userData?.id) {
                logger.info(
                  { username: userData.username, instagramUserId: userData.id },
                  "[Instagram] Found user",
                );
                return {
                  success: true,
                  instagramUserId: String(userData.id),
                  instagramUsername: userData.username || "unknown",
                };
              }
            }
          }
        } catch (e) {
          logger.error({ err: e }, "[Instagram] Parse error");
        }
      }
    }
    return { success: false, error: "Instagram não conectado no Rube." };
  } catch (error) {
    logger.error({ err: error }, "[Instagram] Validation error");
    return { success: false, error: error.message || "Erro ao validar token" };
  }
}

export function registerInstagramRoutes(app) {
  // GET - List Instagram accounts
  app.get("/api/db/instagram-accounts", async (req, res) => {
    try {
      const sql = getSql();
      const { user_id, organization_id, id } = req.query;

      if (id) {
        const result = await sql`
          SELECT id, user_id, organization_id, instagram_user_id, instagram_username,
                 is_active, connected_at, last_used_at, created_at, updated_at
          FROM instagram_accounts WHERE id = ${id}
        `;
        return res.json(result[0] || null);
      }

      if (!user_id) {
        return res.status(400).json({ error: "user_id is required" });
      }

      const resolvedUserId = await resolveUserId(sql, String(user_id));
      if (!resolvedUserId) {
        logger.debug({ user_id }, "[Instagram] User not found");
        return res.json([]);
      }
      logger.trace({ resolvedUserId }, "[Instagram] Resolved user ID");

      const result = organization_id
        ? await sql`
            SELECT id, user_id, organization_id, instagram_user_id, instagram_username,
                   is_active, connected_at, last_used_at, created_at, updated_at
            FROM instagram_accounts
            WHERE organization_id = ${organization_id} AND is_active = TRUE
            ORDER BY connected_at DESC
          `
        : await sql`
            SELECT id, user_id, organization_id, instagram_user_id, instagram_username,
                   is_active, connected_at, last_used_at, created_at, updated_at
            FROM instagram_accounts
            WHERE user_id = ${resolvedUserId} AND organization_id IS NULL AND is_active = TRUE
            ORDER BY connected_at DESC
          `;

      res.json(result);
    } catch (error) {
      logger.error({ err: error }, "[Instagram Accounts API] Error");
      res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
  });

  // POST - Connect new Instagram account
  app.post("/api/db/instagram-accounts", async (req, res) => {
    try {
      const sql = getSql();
      const { user_id, organization_id, rube_token } = req.body;

      logger.info(
        { user_id, organization_id, hasToken: !!rube_token },
        "[Instagram] POST request to connect account",
      );

      if (!user_id || !rube_token) {
        return res
          .status(400)
          .json({ error: "user_id and rube_token are required" });
      }

      const resolvedUserId = await resolveUserId(sql, String(user_id));
      if (!resolvedUserId) {
        logger.debug({ user_id }, "[Instagram] User not found");
        return res.status(400).json({ error: "User not found" });
      }
      logger.trace({ resolvedUserId }, "[Instagram] Resolved user ID");

      // Validate the Rube token
      const validation = await validateRubeToken(rube_token);
      logger.debug({ validation }, "[Instagram] Validation result");
      if (!validation.success) {
        return res
          .status(400)
          .json({ error: validation.error || "Token inválido" });
      }

      const { instagramUserId, instagramUsername } = validation;

      // Check if already connected
      const existing = await sql`
        SELECT id FROM instagram_accounts
        WHERE user_id = ${resolvedUserId} AND instagram_user_id = ${instagramUserId}
      `;

      if (existing.length > 0) {
        // Update existing
        const result = await sql`
          UPDATE instagram_accounts
          SET rube_token = ${rube_token}, instagram_username = ${instagramUsername},
              is_active = TRUE, connected_at = NOW(), updated_at = NOW()
          WHERE id = ${existing[0].id}
          RETURNING id, user_id, organization_id, instagram_user_id, instagram_username,
                    is_active, connected_at, last_used_at, created_at, updated_at
        `;
        return res.json({
          success: true,
          account: result[0],
          message: "Conta reconectada!",
        });
      }

      // Create new
      const result = await sql`
        INSERT INTO instagram_accounts (user_id, organization_id, instagram_user_id, instagram_username, rube_token)
        VALUES (${resolvedUserId}, ${organization_id || null}, ${instagramUserId}, ${instagramUsername}, ${rube_token})
        RETURNING id, user_id, organization_id, instagram_user_id, instagram_username,
                  is_active, connected_at, last_used_at, created_at, updated_at
      `;

      res.status(201).json({
        success: true,
        account: result[0],
        message: `Conta @${instagramUsername} conectada!`,
      });
    } catch (error) {
      logger.error({ err: error }, "[Instagram Accounts API] Error");
      res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
  });

  // PUT - Update Instagram account token
  app.put("/api/db/instagram-accounts", async (req, res) => {
    try {
      const sql = getSql();
      const { id } = req.query;
      const { rube_token } = req.body;

      if (!id || !rube_token) {
        return res.status(400).json({ error: "id and rube_token are required" });
      }

      const validation = await validateRubeToken(rube_token);
      if (!validation.success) {
        return res.status(400).json({ error: validation.error });
      }

      const result = await sql`
        UPDATE instagram_accounts
        SET rube_token = ${rube_token}, instagram_username = ${validation.instagramUsername},
            updated_at = NOW()
        WHERE id = ${id}
        RETURNING id, user_id, organization_id, instagram_user_id, instagram_username,
                  is_active, connected_at, last_used_at, created_at, updated_at
      `;

      res.json({
        success: true,
        account: result[0],
        message: "Token atualizado!",
      });
    } catch (error) {
      logger.error({ err: error }, "[Instagram Accounts API] Error");
      res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
  });

  // DELETE - Disconnect Instagram account (soft delete)
  app.delete("/api/db/instagram-accounts", async (req, res) => {
    try {
      const sql = getSql();
      const { id } = req.query;

      if (!id) {
        return res.status(400).json({ error: "id is required" });
      }

      await sql`UPDATE instagram_accounts SET is_active = FALSE, updated_at = NOW() WHERE id = ${id}`;
      res.json({ success: true, message: "Conta desconectada." });
    } catch (error) {
      logger.error({ err: error }, "[Instagram Accounts API] Error");
      res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
  });
}
