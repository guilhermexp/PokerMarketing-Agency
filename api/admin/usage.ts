/**
 * Admin AI Usage Endpoint
 * GET /api/admin/usage - Get AI usage statistics
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
      startDate,
      endDate,
      organizationId,
      groupBy = 'day', // day, week, month, provider, model, operation
    } = req.query;

    // Default to last 30 days
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const end = endDate || new Date().toISOString().split('T')[0];

    // Get usage timeline
    let timeline;
    if (groupBy === 'provider') {
      timeline = await sql`
        SELECT
          provider,
          SUM(request_count) as total_requests,
          SUM(success_count) as success_count,
          SUM(failed_count) as failed_count,
          SUM(total_cost_cents) as total_cost_cents,
          SUM(total_input_tokens) as total_input_tokens,
          SUM(total_output_tokens) as total_output_tokens,
          SUM(total_images) as total_images,
          SUM(total_video_seconds) as total_video_seconds
        FROM aggregated_usage
        WHERE date >= ${start as string}::date
          AND date <= ${end as string}::date
          AND (${organizationId || null}::text IS NULL OR organization_id = ${organizationId as string})
        GROUP BY provider
        ORDER BY total_cost_cents DESC
      `;
    } else if (groupBy === 'model') {
      timeline = await sql`
        SELECT
          model_id,
          provider,
          SUM(request_count) as total_requests,
          SUM(total_cost_cents) as total_cost_cents
        FROM aggregated_usage
        WHERE date >= ${start as string}::date
          AND date <= ${end as string}::date
          AND (${organizationId || null}::text IS NULL OR organization_id = ${organizationId as string})
        GROUP BY model_id, provider
        ORDER BY total_cost_cents DESC
      `;
    } else if (groupBy === 'operation') {
      timeline = await sql`
        SELECT
          operation,
          SUM(request_count) as total_requests,
          SUM(total_cost_cents) as total_cost_cents
        FROM aggregated_usage
        WHERE date >= ${start as string}::date
          AND date <= ${end as string}::date
          AND (${organizationId || null}::text IS NULL OR organization_id = ${organizationId as string})
        GROUP BY operation
        ORDER BY total_requests DESC
      `;
    } else {
      // Default: group by day
      timeline = await sql`
        SELECT
          date,
          SUM(request_count) as total_requests,
          SUM(success_count) as success_count,
          SUM(failed_count) as failed_count,
          SUM(total_cost_cents) as total_cost_cents
        FROM aggregated_usage
        WHERE date >= ${start as string}::date
          AND date <= ${end as string}::date
          AND (${organizationId || null}::text IS NULL OR organization_id = ${organizationId as string})
        GROUP BY date
        ORDER BY date ASC
      `;
    }

    // Get totals
    const totals = await sql`
      SELECT
        SUM(request_count) as total_requests,
        SUM(success_count) as success_count,
        SUM(failed_count) as failed_count,
        SUM(total_cost_cents) as total_cost_cents,
        SUM(total_input_tokens) as total_input_tokens,
        SUM(total_output_tokens) as total_output_tokens,
        SUM(total_images) as total_images,
        SUM(total_video_seconds) as total_video_seconds
      FROM aggregated_usage
      WHERE date >= ${start as string}::date
        AND date <= ${end as string}::date
        AND (${organizationId || null}::text IS NULL OR organization_id = ${organizationId as string})
    `;

    // Get top users by cost
    const topUsers = await sql`
      SELECT
        au.user_id,
        u.email,
        u.name,
        SUM(au.request_count) as total_requests,
        SUM(au.total_cost_cents) as total_cost_cents
      FROM aggregated_usage au
      LEFT JOIN users u ON au.user_id = u.id
      WHERE au.date >= ${start as string}::date
        AND au.date <= ${end as string}::date
        AND au.user_id IS NOT NULL
      GROUP BY au.user_id, u.email, u.name
      ORDER BY total_cost_cents DESC
      LIMIT 10
    `;

    // Get top organizations by cost
    const topOrganizations = await sql`
      SELECT
        organization_id,
        SUM(request_count) as total_requests,
        SUM(total_cost_cents) as total_cost_cents
      FROM aggregated_usage
      WHERE date >= ${start as string}::date
        AND date <= ${end as string}::date
        AND organization_id IS NOT NULL
      GROUP BY organization_id
      ORDER BY total_cost_cents DESC
      LIMIT 10
    `;

    const totalsData = totals[0] || {};

    res.json({
      dateRange: { start, end },
      timeline,
      totals: {
        totalRequests: parseInt(totalsData.total_requests as string) || 0,
        successCount: parseInt(totalsData.success_count as string) || 0,
        failedCount: parseInt(totalsData.failed_count as string) || 0,
        totalCostCents: parseInt(totalsData.total_cost_cents as string) || 0,
        totalCostUsd: (parseInt(totalsData.total_cost_cents as string) || 0) / 100,
        totalInputTokens: parseInt(totalsData.total_input_tokens as string) || 0,
        totalOutputTokens: parseInt(totalsData.total_output_tokens as string) || 0,
        totalImages: parseInt(totalsData.total_images as string) || 0,
        totalVideoSeconds: parseInt(totalsData.total_video_seconds as string) || 0,
      },
      topUsers: topUsers.map((u) => ({
        ...u,
        totalCostUsd: (parseInt(u.total_cost_cents as string) || 0) / 100,
      })),
      topOrganizations: topOrganizations.map((o) => ({
        ...o,
        totalCostUsd: (parseInt(o.total_cost_cents as string) || 0) / 100,
      })),
    });
  } catch (error) {
    console.error('[Admin Usage] Error:', error);
    const { status, message } = handleAdminAuthError(error);
    res.status(status).json({ error: message });
  }
}
