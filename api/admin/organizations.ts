/**
 * Admin Organizations Endpoint
 * GET /api/admin/organizations - List organizations with stats
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

    const { page = '1', limit = '20' } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string)));
    const offset = (pageNum - 1) * limitNum;

    // Get organizations with usage stats
    // Organizations are identified by brand_profiles.organization_id (Clerk org IDs)
    const organizations = await sql`
      SELECT
        bp.organization_id,
        MIN(bp.brand_name) as primary_brand_name,
        COUNT(DISTINCT bp.id) as brand_count,
        COUNT(DISTINCT c.id) as campaign_count,
        COUNT(DISTINCT g.id) as gallery_image_count,
        COUNT(DISTINCT sp.id) as scheduled_post_count,
        MIN(bp.created_at) as first_brand_created,
        MAX(bp.updated_at) as last_activity
      FROM brand_profiles bp
      LEFT JOIN campaigns c ON c.organization_id = bp.organization_id AND c.deleted_at IS NULL
      LEFT JOIN gallery_images g ON g.organization_id = bp.organization_id AND g.deleted_at IS NULL
      LEFT JOIN scheduled_posts sp ON sp.organization_id = bp.organization_id AND sp.deleted_at IS NULL
      WHERE bp.organization_id IS NOT NULL
        AND bp.deleted_at IS NULL
      GROUP BY bp.organization_id
      ORDER BY last_activity DESC NULLS LAST
      LIMIT ${limitNum} OFFSET ${offset}
    `;

    // Get total count
    const countResult = await sql`
      SELECT COUNT(DISTINCT organization_id) as total
      FROM brand_profiles
      WHERE organization_id IS NOT NULL AND deleted_at IS NULL
    `;

    const total = parseInt(countResult[0].total as string);

    // Get AI usage per organization if available
    let orgUsage: Record<string, { requests: number; costCents: number }> = {};
    try {
      const usageResult = await sql`
        SELECT
          organization_id,
          SUM(request_count) as total_requests,
          SUM(total_cost_cents) as total_cost
        FROM aggregated_usage
        WHERE organization_id IS NOT NULL
          AND date >= DATE_TRUNC('month', CURRENT_DATE)
        GROUP BY organization_id
      `;

      for (const row of usageResult) {
        orgUsage[row.organization_id as string] = {
          requests: parseInt(row.total_requests as string) || 0,
          costCents: parseInt(row.total_cost as string) || 0,
        };
      }
    } catch (err) {
      // Tables might not exist yet
    }

    // Enrich organizations with usage data
    const enrichedOrgs = organizations.map((org) => ({
      ...org,
      aiUsageThisMonth: orgUsage[org.organization_id as string] || { requests: 0, costCents: 0, costUsd: 0 },
    }));

    res.json({
      organizations: enrichedOrgs.map((o) => ({
        ...o,
        aiUsageThisMonth: {
          ...o.aiUsageThisMonth,
          costUsd: o.aiUsageThisMonth.costCents / 100,
        },
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('[Admin Organizations] Error:', error);
    const { status, message } = handleAdminAuthError(error);
    res.status(status).json({ error: message });
  }
}
