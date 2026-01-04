/**
 * Admin Stats Endpoint
 * GET /api/admin/stats
 *
 * Returns overview statistics for the admin dashboard
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

    // Get total users
    const usersResult = await sql`
      SELECT COUNT(*) as total FROM users WHERE deleted_at IS NULL
    `;
    const totalUsers = parseInt(usersResult[0].total as string);

    // Get total organizations (using Clerk org_ids from users)
    const orgsResult = await sql`
      SELECT COUNT(DISTINCT organization_id) as total
      FROM brand_profiles
      WHERE organization_id IS NOT NULL AND deleted_at IS NULL
    `;
    const totalOrganizations = parseInt(orgsResult[0].total as string);

    // Get active users today (last login)
    const activeUsersResult = await sql`
      SELECT COUNT(*) as total FROM users
      WHERE last_login_at >= CURRENT_DATE AND deleted_at IS NULL
    `;
    const activeUsersToday = parseInt(activeUsersResult[0].total as string);

    // Get total campaigns
    const campaignsResult = await sql`
      SELECT COUNT(*) as total FROM campaigns WHERE deleted_at IS NULL
    `;
    const totalCampaigns = parseInt(campaignsResult[0].total as string);

    // Get total gallery images
    const imagesResult = await sql`
      SELECT COUNT(*) as total FROM gallery_images WHERE deleted_at IS NULL
    `;
    const totalGalleryImages = parseInt(imagesResult[0].total as string);

    // Get total scheduled posts
    const scheduledResult = await sql`
      SELECT COUNT(*) as total FROM scheduled_posts WHERE deleted_at IS NULL
    `;
    const totalScheduledPosts = parseInt(scheduledResult[0].total as string);

    // Get AI usage this month (if tables exist)
    let aiUsageThisMonth = {
      totalRequests: 0,
      totalCostCents: 0,
      byProvider: {} as Record<string, { requests: number; costCents: number }>,
    };

    try {
      const usageResult = await sql`
        SELECT
          provider,
          SUM(request_count) as total_requests,
          SUM(total_cost_cents) as total_cost
        FROM aggregated_usage
        WHERE date >= DATE_TRUNC('month', CURRENT_DATE)
        GROUP BY provider
      `;

      for (const row of usageResult) {
        const provider = row.provider as string;
        const requests = parseInt(row.total_requests as string) || 0;
        const costCents = parseInt(row.total_cost as string) || 0;

        aiUsageThisMonth.totalRequests += requests;
        aiUsageThisMonth.totalCostCents += costCents;
        aiUsageThisMonth.byProvider[provider] = { requests, costCents };
      }
    } catch (err) {
      // Tables might not exist yet
      console.log('[Admin Stats] AI usage tables not available yet');
    }

    res.json({
      totalUsers,
      totalOrganizations,
      activeUsersToday,
      totalCampaigns,
      totalGalleryImages,
      totalScheduledPosts,
      aiUsageThisMonth: {
        ...aiUsageThisMonth,
        totalCostUsd: aiUsageThisMonth.totalCostCents / 100,
      },
    });
  } catch (error) {
    const { status, message } = handleAdminAuthError(error);
    res.status(status).json({ error: message });
  }
}
