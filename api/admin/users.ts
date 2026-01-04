/**
 * Admin Users Endpoint
 * GET /api/admin/users - List all users
 * PUT /api/admin/users/:id - Update user
 * DELETE /api/admin/users/:id - Soft delete user
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setupCors, getSql, logAdminAction, extractRequestContext } from '../db/_helpers/index.js';
import { requireSuperAdmin, handleAdminAuthError } from './_helpers/index.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (setupCors(req.method, res)) return;

  try {
    const admin = await requireSuperAdmin(req);
    const sql = getSql();
    const reqContext = extractRequestContext(req);

    // Extract user ID from query if present
    const { id, page = '1', limit = '20', search } = req.query;

    if (req.method === 'GET') {
      if (id) {
        // Get single user
        const users = await sql`
          SELECT
            u.id, u.email, u.name, u.avatar_url,
            u.auth_provider, u.created_at, u.last_login_at, u.deleted_at,
            (SELECT COUNT(*) FROM campaigns c WHERE c.user_id = u.id AND c.deleted_at IS NULL) as campaign_count,
            (SELECT COUNT(*) FROM gallery_images g WHERE g.user_id = u.id AND g.deleted_at IS NULL) as image_count
          FROM users u
          WHERE u.id = ${id as string}::uuid
          LIMIT 1
        `;

        if (!users[0]) {
          return res.status(404).json({ error: 'User not found' });
        }

        return res.json({ user: users[0] });
      }

      // List all users with pagination
      const pageNum = Math.max(1, parseInt(page as string));
      const limitNum = Math.min(100, Math.max(1, parseInt(limit as string)));
      const offset = (pageNum - 1) * limitNum;

      let users;
      let countResult;

      if (search) {
        const searchPattern = `%${search}%`;
        users = await sql`
          SELECT
            u.id, u.email, u.name, u.avatar_url,
            u.auth_provider, u.created_at, u.last_login_at, u.deleted_at
          FROM users u
          WHERE (u.email ILIKE ${searchPattern} OR u.name ILIKE ${searchPattern})
          ORDER BY u.created_at DESC
          LIMIT ${limitNum} OFFSET ${offset}
        `;

        countResult = await sql`
          SELECT COUNT(*) as total FROM users
          WHERE (email ILIKE ${searchPattern} OR name ILIKE ${searchPattern})
        `;
      } else {
        users = await sql`
          SELECT
            u.id, u.email, u.name, u.avatar_url,
            u.auth_provider, u.created_at, u.last_login_at, u.deleted_at
          FROM users u
          ORDER BY u.created_at DESC
          LIMIT ${limitNum} OFFSET ${offset}
        `;

        countResult = await sql`SELECT COUNT(*) as total FROM users`;
      }

      const total = parseInt(countResult[0].total as string);

      return res.json({
        users,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    }

    if (req.method === 'PUT' && id) {
      // Update user
      const { name, email } = req.body;

      // Get current state for logging
      const currentUser = await sql`
        SELECT id, name, email FROM users WHERE id = ${id as string}::uuid
      `;

      if (!currentUser[0]) {
        return res.status(404).json({ error: 'User not found' });
      }

      const updated = await sql`
        UPDATE users
        SET
          name = COALESCE(${name || null}, name),
          email = COALESCE(${email || null}, email),
          updated_at = NOW()
        WHERE id = ${id as string}::uuid
        RETURNING id, email, name, updated_at
      `;

      // Log admin action
      logAdminAction(
        {
          userId: admin.userId,
          ...reqContext,
        },
        'admin.user_update',
        'user',
        id as string,
        { targetUserEmail: email || currentUser[0].email },
        { name: currentUser[0].name, email: currentUser[0].email },
        { name: name || currentUser[0].name, email: email || currentUser[0].email }
      );

      return res.json({ user: updated[0] });
    }

    if (req.method === 'DELETE' && id) {
      // Soft delete user
      const currentUser = await sql`
        SELECT id, name, email FROM users WHERE id = ${id as string}::uuid
      `;

      if (!currentUser[0]) {
        return res.status(404).json({ error: 'User not found' });
      }

      await sql`
        UPDATE users
        SET deleted_at = NOW(), updated_at = NOW()
        WHERE id = ${id as string}::uuid
      `;

      // Log admin action
      logAdminAction(
        {
          userId: admin.userId,
          ...reqContext,
        },
        'admin.user_deactivate',
        'user',
        id as string,
        { targetUserEmail: currentUser[0].email }
      );

      return res.json({ success: true, message: 'User deactivated' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('[Admin Users] Error:', error);
    const { status, message } = handleAdminAuthError(error);
    res.status(status).json({ error: message });
  }
}
