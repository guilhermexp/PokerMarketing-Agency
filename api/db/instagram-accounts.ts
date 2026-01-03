/**
 * Vercel Serverless Function - Instagram Accounts API
 * CRUD operations for Instagram accounts with Rube MCP tokens
 * Supports multi-tenant Instagram publishing
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSql, setupCors, resolveUserId } from './_helpers/index.js';

const RUBE_MCP_URL = 'https://rube.app/mcp';

interface RubeMCPRequest {
  jsonrpc: '2.0';
  id: string;
  method: 'tools/call';
  params: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

/**
 * Validate a Rube token by calling the Instagram User Info tool
 * Returns the Instagram user ID and username if valid
 */
interface ValidationResult {
  success: boolean;
  instagramUserId?: string;
  instagramUsername?: string;
  error?: string;
}

async function validateRubeToken(rubeToken: string): Promise<ValidationResult> {
  try {
    // First, we need to get the list of connected accounts to find the Instagram user ID
    const request: RubeMCPRequest = {
      jsonrpc: '2.0',
      id: `validate_${Date.now()}`,
      method: 'tools/call',
      params: {
        name: 'RUBE_MULTI_EXECUTE_TOOL',
        arguments: {
          tools: [{
            tool_slug: 'INSTAGRAM_GET_USER_INFO',
            arguments: {
              fields: 'id,username'
            }
          }],
          sync_response_to_workbench: false,
          memory: {},
          session_id: 'validate',
          thought: 'Validating Instagram connection'
        }
      }
    };

    console.log('[Instagram Accounts] Validating token...');

    const response = await fetch(RUBE_MCP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Authorization': `Bearer ${rubeToken}`
      },
      body: JSON.stringify(request)
    });

    const text = await response.text();

    // Check if response is HTML (error page)
    if (text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
      console.error('[Instagram Accounts] Received HTML instead of JSON');
      return {
        success: false,
        error: 'Token inválido ou expirado. Gere um novo token no Rube.'
      };
    }

    if (!response.ok) {
      console.error('[Instagram Accounts] Rube validation failed:', response.status, text.substring(0, 200));
      return {
        success: false,
        error: `Erro ao validar token (${response.status}). Verifique se o token está correto.`
      };
    }

    console.log('[Instagram Accounts] Response received, parsing...');

    // Parse SSE response
    const lines = text.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const json = JSON.parse(line.substring(6));

          // Check for error in response
          if (json?.error) {
            console.error('[Instagram Accounts] Rube error:', json.error);
            return {
              success: false,
              error: 'Instagram não conectado no Rube. Conecte seu Instagram primeiro em rube.app/marketplace/instagram'
            };
          }

          const nestedData = json?.result?.content?.[0]?.text;
          if (nestedData) {
            const parsed = JSON.parse(nestedData);

            // Check for error in nested data
            if (parsed?.error || parsed?.data?.error) {
              const errMsg = parsed?.error?.message || parsed?.data?.error?.message || 'Instagram não encontrado';
              console.error('[Instagram Accounts] Nested error:', errMsg);
              return {
                success: false,
                error: 'Instagram não conectado no Rube. Vá em rube.app/marketplace/instagram e conecte sua conta.'
              };
            }

            const results = parsed?.data?.data?.results || parsed?.data?.results;
            if (results && results.length > 0) {
              const userData = results[0]?.response?.data;
              if (userData?.id) {
                console.log('[Instagram Accounts] Found Instagram user:', userData.username);
                return {
                  success: true,
                  instagramUserId: String(userData.id),
                  instagramUsername: userData.username || 'unknown'
                };
              }
            }
          }
        } catch (e) {
          console.error('[Instagram Accounts] Parse error:', e, 'Line:', line.substring(0, 100));
        }
      }
    }

    console.error('[Instagram Accounts] No valid data found in response');
    return {
      success: false,
      error: 'Instagram não conectado no Rube. Conecte em rube.app/marketplace/instagram e depois copie o token em API Keys.'
    };
  } catch (error) {
    console.error('[Instagram Accounts] Validation error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro ao validar token'
    };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS
  if (setupCors(req.method, res)) return;

  try {
    const sql = getSql();

    // GET - List Instagram accounts for user
    if (req.method === 'GET') {
      const { user_id, organization_id, id } = req.query;

      // Get single account by ID
      if (id) {
        const result = await sql`
          SELECT id, user_id, organization_id, instagram_user_id, instagram_username,
                 is_active, connected_at, last_used_at, created_at, updated_at
          FROM instagram_accounts
          WHERE id = ${id as string}
        `;
        return res.status(200).json(result[0] || null);
      }

      if (!user_id) {
        return res.status(400).json({ error: 'user_id is required' });
      }

      // Resolve Clerk ID to DB UUID
      const resolvedUserId = await resolveUserId(sql, user_id as string);
      if (!resolvedUserId) {
        return res.status(200).json([]);
      }

      const isOrgContext = !!organization_id;

      // Note: We don't return the rube_token in list queries for security
      const result = isOrgContext
        ? await sql`
            SELECT id, user_id, organization_id, instagram_user_id, instagram_username,
                   is_active, connected_at, last_used_at, created_at, updated_at
            FROM instagram_accounts
            WHERE organization_id = ${organization_id as string} AND is_active = TRUE
            ORDER BY connected_at DESC
          `
        : await sql`
            SELECT id, user_id, organization_id, instagram_user_id, instagram_username,
                   is_active, connected_at, last_used_at, created_at, updated_at
            FROM instagram_accounts
            WHERE user_id = ${resolvedUserId} AND organization_id IS NULL AND is_active = TRUE
            ORDER BY connected_at DESC
          `;

      return res.status(200).json(result);
    }

    // POST - Connect a new Instagram account
    if (req.method === 'POST') {
      const { user_id, organization_id, rube_token } = req.body;

      if (!user_id || !rube_token) {
        return res.status(400).json({ error: 'user_id and rube_token are required' });
      }

      // Resolve Clerk ID to DB UUID
      const resolvedUserId = await resolveUserId(sql, user_id);
      if (!resolvedUserId) {
        return res.status(400).json({ error: 'User not found' });
      }

      // Validate the Rube token and get Instagram user info
      const validation = await validateRubeToken(rube_token);
      if (!validation.success) {
        return res.status(400).json({
          error: validation.error || 'Token inválido ou Instagram não conectado no Rube.'
        });
      }

      const { instagramUserId, instagramUsername } = validation;

      // Check if this Instagram account is already connected
      const existing = await sql`
        SELECT id FROM instagram_accounts
        WHERE user_id = ${resolvedUserId} AND instagram_user_id = ${instagramUserId}
      `;

      if (existing.length > 0) {
        // Update existing record
        const result = await sql`
          UPDATE instagram_accounts
          SET rube_token = ${rube_token},
              instagram_username = ${instagramUsername},
              is_active = TRUE,
              connected_at = NOW(),
              updated_at = NOW()
          WHERE id = ${existing[0].id}
          RETURNING id, user_id, organization_id, instagram_user_id, instagram_username,
                    is_active, connected_at, last_used_at, created_at, updated_at
        `;
        return res.status(200).json({
          success: true,
          account: result[0],
          message: 'Conta Instagram reconectada com sucesso!'
        });
      }

      // Create new record
      const result = await sql`
        INSERT INTO instagram_accounts (
          user_id, organization_id, instagram_user_id, instagram_username, rube_token
        )
        VALUES (
          ${resolvedUserId}, ${organization_id || null}, ${instagramUserId}, ${instagramUsername}, ${rube_token}
        )
        RETURNING id, user_id, organization_id, instagram_user_id, instagram_username,
                  is_active, connected_at, last_used_at, created_at, updated_at
      `;

      return res.status(201).json({
        success: true,
        account: result[0],
        message: `Conta @${instagramUsername} conectada com sucesso!`
      });
    }

    // PUT - Update Instagram account (e.g., refresh token)
    if (req.method === 'PUT') {
      const { id } = req.query;
      const { rube_token } = req.body;

      if (!id) {
        return res.status(400).json({ error: 'id is required' });
      }

      // If updating token, validate it first
      if (rube_token) {
        const validation = await validateRubeToken(rube_token);
        if (!validation.success) {
          return res.status(400).json({
            error: validation.error || 'Token inválido. Verifique se o Instagram ainda está conectado no Rube.'
          });
        }

        const result = await sql`
          UPDATE instagram_accounts
          SET rube_token = ${rube_token},
              instagram_username = ${validation.instagramUsername || 'unknown'},
              updated_at = NOW()
          WHERE id = ${id as string}
          RETURNING id, user_id, organization_id, instagram_user_id, instagram_username,
                    is_active, connected_at, last_used_at, created_at, updated_at
        `;

        return res.status(200).json({
          success: true,
          account: result[0],
          message: 'Token atualizado com sucesso!'
        });
      }

      return res.status(400).json({ error: 'rube_token is required for update' });
    }

    // DELETE - Disconnect Instagram account (soft delete)
    if (req.method === 'DELETE') {
      const { id } = req.query;

      if (!id) {
        return res.status(400).json({ error: 'id is required' });
      }

      await sql`
        UPDATE instagram_accounts
        SET is_active = FALSE, updated_at = NOW()
        WHERE id = ${id as string}
      `;

      return res.status(200).json({
        success: true,
        message: 'Conta Instagram desconectada.'
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('[Instagram Accounts API] Error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Get Rube token for a specific Instagram account
 * Used internally by the Rube proxy
 */
export async function getRubeTokenForAccount(
  sql: ReturnType<typeof getSql>,
  accountId: string,
  userId: string
): Promise<string | null> {
  const resolvedUserId = await resolveUserId(sql, userId);
  if (!resolvedUserId) return null;

  const result = await sql`
    SELECT rube_token FROM instagram_accounts
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
  }

  return result[0]?.rube_token || null;
}
