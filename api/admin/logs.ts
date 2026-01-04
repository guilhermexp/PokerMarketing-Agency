/**
 * Admin Activity Logs Endpoint
 * GET /api/admin/logs - Get activity logs
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setupCors, getSql } from '../db/_helpers/index.js';
import { requireSuperAdmin, handleAdminAuthError } from './_helpers/index.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (setupCors(req.method, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await requireSuperAdmin(req);
    const sql = getSql();

    const {
      page = '1',
      limit = '50',
      userId,
      organizationId,
      category,
      action,
      severity,
      startDate,
      endDate,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(500, Math.max(1, parseInt(limit as string)));
    const offset = (pageNum - 1) * limitNum;

    // Build query with filters
    const logs = await sql`
      SELECT
        al.id,
        al.user_id,
        al.organization_id,
        al.actor_email,
        al.actor_name,
        al.category,
        al.action,
        al.entity_type,
        al.entity_id,
        al.entity_name,
        al.details,
        al.severity,
        al.success,
        al.error_message,
        al.duration_ms,
        al.ip_address,
        al.created_at,
        u.email as user_email,
        u.name as user_name
      FROM activity_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE 1=1
        AND (${userId || null}::text IS NULL OR al.user_id = ${userId}::uuid)
        AND (${organizationId || null}::text IS NULL OR al.organization_id = ${organizationId as string})
        AND (${category || null}::text IS NULL OR al.category = ${category}::activity_category)
        AND (${action || null}::text IS NULL OR al.action ILIKE ${action ? `%${action}%` : '%'})
        AND (${severity || null}::text IS NULL OR al.severity = ${severity}::activity_severity)
        AND (${startDate || null}::text IS NULL OR al.created_at >= ${startDate as string}::timestamptz)
        AND (${endDate || null}::text IS NULL OR al.created_at <= ${endDate as string}::timestamptz)
      ORDER BY al.created_at DESC
      LIMIT ${limitNum} OFFSET ${offset}
    `;

    // Get total count
    const countResult = await sql`
      SELECT COUNT(*) as total
      FROM activity_logs al
      WHERE 1=1
        AND (${userId || null}::text IS NULL OR al.user_id = ${userId}::uuid)
        AND (${organizationId || null}::text IS NULL OR al.organization_id = ${organizationId as string})
        AND (${category || null}::text IS NULL OR al.category = ${category}::activity_category)
        AND (${action || null}::text IS NULL OR al.action ILIKE ${action ? `%${action}%` : '%'})
        AND (${severity || null}::text IS NULL OR al.severity = ${severity}::activity_severity)
        AND (${startDate || null}::text IS NULL OR al.created_at >= ${startDate as string}::timestamptz)
        AND (${endDate || null}::text IS NULL OR al.created_at <= ${endDate as string}::timestamptz)
    `;

    const total = parseInt(countResult[0].total as string);

    // Get available categories for filtering
    const categories = await sql`
      SELECT DISTINCT category, COUNT(*) as count
      FROM activity_logs
      GROUP BY category
      ORDER BY count DESC
    `;

    // Get recent error count
    const errorCount = await sql`
      SELECT COUNT(*) as count
      FROM activity_logs
      WHERE severity IN ('error', 'critical')
        AND created_at >= NOW() - INTERVAL '24 hours'
    `;

    res.json({
      logs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
      filters: {
        categories,
        recentErrorCount: parseInt(errorCount[0].count as string),
      },
    });
  } catch (error) {
    console.error('[Admin Logs] Error:', error);
    const { status, message } = handleAdminAuthError(error);
    res.status(status).json({ error: message });
  }
}
