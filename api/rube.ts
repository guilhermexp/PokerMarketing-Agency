/**
 * Vercel Serverless Function - Rube MCP Proxy
 * Bypasses CORS by proxying requests to rube.app/mcp
 * Supports multi-tenant tokens via instagram_account_id
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setupCors, getSql, resolveUserId } from './db/_helpers/index';

const MCP_URL = 'https://rube.app/mcp';

/**
 * Get Rube token for a specific Instagram account
 */
async function getRubeTokenForAccount(
  accountId: string,
  userId: string
): Promise<{ token: string; instagramUserId: string } | null> {
  const sql = getSql();
  const resolvedUserId = await resolveUserId(sql, userId);
  if (!resolvedUserId) return null;

  const result = await sql`
    SELECT rube_token, instagram_user_id FROM instagram_accounts
    WHERE id = ${accountId}
      AND user_id = ${resolvedUserId}
      AND is_active = TRUE
  `;

  if (result.length > 0) {
    // Update last_used_at
    await sql`
      UPDATE instagram_accounts
      SET last_used_at = NOW()
      WHERE id = ${accountId}
    `;
    return {
      token: result[0].rube_token as string,
      instagramUserId: result[0].instagram_user_id as string
    };
  }

  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS
  if (setupCors(req.method, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let token: string | undefined;
    let instagramUserId: string | undefined;
    let mcpRequestBody = req.body;

    // Check if request includes instagram_account_id for multi-tenant
    const { instagram_account_id, user_id, ...mcpRequest } = req.body;

    // Multi-tenant ONLY - no fallback to global token
    if (!instagram_account_id || !user_id) {
      return res.status(400).json({
        error: 'Conecte sua conta Instagram em Configurações → Integrações para publicar.'
      });
    }

    // Fetch token from database for this user's account
    const accountData = await getRubeTokenForAccount(instagram_account_id, user_id);
    if (!accountData) {
      return res.status(403).json({
        error: 'Conta Instagram não encontrada ou sem permissão de acesso. Reconecte em Configurações → Integrações.'
      });
    }

    token = accountData.token;
    instagramUserId = accountData.instagramUserId;
    mcpRequestBody = mcpRequest;

    // Inject the correct instagram_user_id into the request if it's an Instagram tool
    if (mcpRequestBody.params?.arguments) {
      // Check if this is a RUBE_MULTI_EXECUTE_TOOL call
      if (mcpRequestBody.params.name === 'RUBE_MULTI_EXECUTE_TOOL') {
        const tools = mcpRequestBody.params.arguments.tools;
        if (Array.isArray(tools)) {
          for (const tool of tools) {
            // Inject ig_user_id for Instagram tools
            if (tool.tool_slug?.startsWith('INSTAGRAM_') && tool.arguments) {
              tool.arguments.ig_user_id = instagramUserId;
            }
          }
        }
      }
      // Direct tool call
      else if (mcpRequestBody.params.name?.startsWith('INSTAGRAM_')) {
        mcpRequestBody.params.arguments.ig_user_id = instagramUserId;
      }
    }

    const response = await fetch(MCP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(mcpRequestBody),
    });

    const text = await response.text();
    res.status(response.status).send(text);
  } catch (error) {
    console.error('[Rube Proxy] Error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
