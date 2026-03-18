import type { Express, Request, Response } from "express";
import { getSql } from "../lib/db.js";
import { createRateLimitMiddleware, requireSuperAdmin } from "../lib/auth.js";
import { generateTextFromMessages } from "../lib/ai/text-generation.js";
import { withRetry } from "../lib/ai/retry.js";
import { DEFAULT_TEXT_MODEL } from "../lib/ai/models.js";
import { AppError } from "../lib/errors/index.js";
import logger from "../lib/logger.js";
import { validateRequest } from "../middleware/validate.js";
import {
  type AdminLogParams,
  type AdminLogsQuery,
  type AdminOrganizationsQuery,
  type AdminUsageQuery,
  type AdminUsersQuery,
  adminLogParamsSchema,
  adminLogsQuerySchema,
  adminOrganizationsQuerySchema,
  adminUsageQuerySchema,
  adminUsersQuerySchema,
} from "../schemas/admin-schemas.js";

// ----------------------------------------------------------------------------
// SQL Query Result Interfaces
// ----------------------------------------------------------------------------

interface CountRow {
  count: string;
}

interface PostsCountRow {
  count: string;
  pending: string;
}

interface AiUsageTotalsRow {
  total_cost: string;
  total_requests: string;
}

interface UsageTotalsRow {
  total_requests: string;
  success_count: string;
  failed_count: string;
  total_cost_cents: string;
  total_input_tokens: string;
  total_output_tokens: string;
  total_images: string;
  total_video_seconds: string;
}

interface TimelineRowBase {
  total_requests: string;
  total_cost_cents: string;
}

interface TimelineRowByDate extends TimelineRowBase {
  date: Date | string;
}

interface TimelineRowByProvider extends TimelineRowBase {
  provider: string;
}

interface TimelineRowByModel extends TimelineRowBase {
  model_id: string;
}

interface TimelineRowByOperation extends TimelineRowBase {
  operation: string;
}

type TimelineRow =
  | TimelineRowByDate
  | TimelineRowByProvider
  | TimelineRowByModel
  | TimelineRowByOperation;

interface TopUserRow {
  user_id: string;
  email: string;
  name: string;
  total_requests: string;
  total_cost_cents: string;
}

interface TopOrganizationRow {
  organization_id: string;
  total_requests: string;
  total_cost_cents: string;
}

interface UserRow {
  id: string;
  clerk_user_id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  last_login: Date | null;
  created_at: Date;
  campaign_count: string;
  brand_count: string;
  scheduled_post_count: string;
}

interface TotalRow {
  total: string;
}

interface OrganizationRow {
  organization_id: string;
  primary_brand_name: string;
  brand_count: string;
  campaign_count: string;
  gallery_image_count: string;
  scheduled_post_count: string;
  first_brand_created: Date | null;
  last_activity: Date | null;
  ai_requests: string;
  ai_cost_cents: string;
}

interface LogRow {
  id: string;
  user_id: string | null;
  organization_id: string | null;
  endpoint: string | null;
  category: string | null;
  model: string | null;
  cost_cents: number | null;
  error: string | null;
  severity: string;
  status: string;
  duration_ms: number | null;
  timestamp: Date;
}

interface CategoryRow {
  category: string;
}

interface LogDetailRow {
  id: string;
  request_id: string | null;
  user_id: string | null;
  organization_id: string | null;
  endpoint: string | null;
  operation: string | null;
  provider: string | null;
  model_id: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  image_count: number | null;
  image_size: string | null;
  video_duration_seconds: number | null;
  estimated_cost_cents: number | null;
  latency_ms: number | null;
  status: string;
  error_message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
}

interface AiSuggestionsLogRow {
  id: string;
  endpoint: string | null;
  operation: string | null;
  model_id: string | null;
  error_message: string | null;
  metadata: Record<string, unknown> | null;
  latency_ms: number | null;
  status: string;
}

interface AiSuggestionsCacheEntry {
  suggestions: string;
  timestamp: number;
}

// Cache for AI suggestions (1 hour TTL)
const aiSuggestionsCache = new Map<string, AiSuggestionsCacheEntry>();
const CACHE_DURATION_MS = 3600000; // 1 hour
const adminRateLimit = createRateLimitMiddleware(30, 60_000, "admin");

type AdminActionResult = "success" | "fail";

interface AdminActionDetails {
  adminEmail?: string | null;
  result: AdminActionResult;
  requestId?: string;
  method?: string;
  path?: string;
  happenedAt?: string;
  [key: string]: unknown;
}

function getAdminActor(req: Request) {
  const session = req.authSession;
  return {
    adminEmail:
      session && typeof session === "object" && "user" in session
        ? (session.user as { email?: string } | undefined)?.email?.toLowerCase() ?? null
        : null,
    adminUserId:
      session && typeof session === "object" && "user" in session
        ? (session.user as { id?: string } | undefined)?.id ?? null
        : null,
  };
}

function logAdminAction(
  userId: string | null,
  adminAction: string,
  details: AdminActionDetails,
): void {
  logger.info(
    {
      adminAction,
      adminUserId: userId,
      ...details,
      happenedAt: details.happenedAt ?? new Date().toISOString(),
    },
    details.result === "success" ? "[Admin] Action completed" : "[Admin] Action failed",
  );
}

function logAdminRequest(
  req: Request,
  adminAction: string,
  result: AdminActionResult,
  details: Record<string, unknown> = {},
): void {
  const actor = getAdminActor(req);
  logAdminAction(actor.adminUserId, adminAction, {
    adminEmail: actor.adminEmail,
    result,
    requestId: req.id,
    method: req.method,
    path: req.path,
    ...details,
  });
}

export function registerAdminRoutes(app: Express): void {
  app.use("/api/admin", adminRateLimit);

  // Admin: Get overview stats
  app.get("/api/admin/stats", requireSuperAdmin, async (_req: Request, res: Response) => {
    try {
      const sql = getSql();

      // Get all stats in parallel
      // Note: organizations are managed by Clerk, not in our DB
      const results = await Promise.all([
        sql`SELECT COUNT(*) as count FROM users`,
        sql`SELECT COUNT(*) as count FROM users WHERE last_login_at >= DATE_TRUNC('day', NOW())`,
        sql`SELECT COUNT(*) as count FROM campaigns`,
        sql`SELECT COUNT(*) as count,
            COUNT(*) FILTER (WHERE status = 'scheduled') as pending
            FROM scheduled_posts`,
        sql`SELECT COUNT(*) as count FROM gallery_images`,
        sql`SELECT
            COALESCE(SUM(estimated_cost_cents), 0) as total_cost,
            COUNT(*) as total_requests
            FROM api_usage_logs
            WHERE created_at >= date_trunc('month', CURRENT_DATE)`,
        sql`SELECT COUNT(*) as count FROM api_usage_logs
            WHERE created_at >= NOW() - INTERVAL '24 hours'
            AND status = 'failed'`,
        sql`
          SELECT COUNT(DISTINCT organization_id) as count
          FROM (
            SELECT organization_id FROM brand_profiles WHERE organization_id IS NOT NULL AND deleted_at IS NULL
            UNION
            SELECT organization_id FROM campaigns WHERE organization_id IS NOT NULL AND deleted_at IS NULL
            UNION
            SELECT organization_id FROM gallery_images WHERE organization_id IS NOT NULL AND deleted_at IS NULL
            UNION
            SELECT organization_id FROM scheduled_posts WHERE organization_id IS NOT NULL
            UNION
            SELECT organization_id FROM api_usage_logs WHERE organization_id IS NOT NULL
          ) organizations
        `,
      ]);

      const usersResult = results[0] as CountRow[];
      const activeUsersResult = results[1] as CountRow[];
      const campaignsResult = results[2] as CountRow[];
      const postsResult = results[3] as PostsCountRow[];
      const galleryResult = results[4] as CountRow[];
      const aiUsageResult = results[5] as AiUsageTotalsRow[];
      const errorsResult = results[6] as CountRow[];
      const orgCountResult = results[7] as CountRow[];

      logAdminRequest(_req, "admin.stats.view", "success");
      res.json({
        totalUsers: parseInt(usersResult[0]?.count || "0", 10),
        activeUsersToday: parseInt(activeUsersResult[0]?.count || "0", 10),
        totalOrganizations: parseInt(orgCountResult[0]?.count || "0", 10),
        totalCampaigns: parseInt(campaignsResult[0]?.count || "0", 10),
        totalScheduledPosts: parseInt(postsResult[0]?.count || "0", 10),
        pendingPosts: parseInt(postsResult[0]?.pending || "0", 10),
        totalGalleryImages: parseInt(galleryResult[0]?.count || "0", 10),
        aiCostThisMonth: parseInt(aiUsageResult[0]?.total_cost || "0", 10),
        aiRequestsThisMonth: parseInt(aiUsageResult[0]?.total_requests || "0", 10),
        recentErrors: parseInt(errorsResult[0]?.count || "0", 10),
      });
    } catch (error) {
      if (error instanceof AppError) {
        logAdminRequest(_req, "admin.stats.view", "fail", {
          statusCode: error.statusCode,
          errorMessage: error.message,
        });
        throw error;
      }
      logAdminRequest(_req, "admin.stats.view", "fail", {
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      logger.error({ err: error }, "[Admin] Stats error");
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // Admin: Get AI usage analytics
  app.get("/api/admin/usage", requireSuperAdmin, validateRequest({ query: adminUsageQuerySchema }), async (req: Request, res: Response) => {
    try {
      const sql = getSql();
      const { groupBy, days } = req.query as unknown as AdminUsageQuery;

      const totalsResult = await sql`
        SELECT
          COUNT(*) as total_requests,
          COUNT(*) FILTER (WHERE status = 'success') as success_count,
          COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
          COALESCE(SUM(estimated_cost_cents), 0) as total_cost_cents,
          COALESCE(SUM(input_tokens), 0) as total_input_tokens,
          COALESCE(SUM(output_tokens), 0) as total_output_tokens,
          COALESCE(SUM(image_count), 0) as total_images,
          COALESCE(SUM(video_duration_seconds), 0) as total_video_seconds
        FROM api_usage_logs
        WHERE created_at >= NOW() - INTERVAL '1 day' * ${days}
      ` as UsageTotalsRow[];

      let timeline: TimelineRow[] = [];
      if (groupBy === "provider") {
        timeline = await sql`
          SELECT
            provider,
            COUNT(*) as total_requests,
            COALESCE(SUM(estimated_cost_cents), 0) as total_cost_cents
          FROM api_usage_logs
          WHERE created_at >= NOW() - INTERVAL '1 day' * ${days}
          GROUP BY provider
          ORDER BY total_requests DESC
          LIMIT 20
        ` as TimelineRowByProvider[];
      } else if (groupBy === "model") {
        timeline = await sql`
          SELECT
            model_id,
            COUNT(*) as total_requests,
            COALESCE(SUM(estimated_cost_cents), 0) as total_cost_cents
          FROM api_usage_logs
          WHERE created_at >= NOW() - INTERVAL '1 day' * ${days}
          GROUP BY model_id
          ORDER BY total_requests DESC
          LIMIT 20
        ` as TimelineRowByModel[];
      } else if (groupBy === "operation") {
        timeline = await sql`
          SELECT
            operation,
            COUNT(*) as total_requests,
            COALESCE(SUM(estimated_cost_cents), 0) as total_cost_cents
          FROM api_usage_logs
          WHERE created_at >= NOW() - INTERVAL '1 day' * ${days}
          GROUP BY operation
          ORDER BY total_requests DESC
        ` as TimelineRowByOperation[];
      } else {
        timeline = await sql`
          SELECT
            DATE(created_at) as date,
            COUNT(*) as total_requests,
            COALESCE(SUM(estimated_cost_cents), 0) as total_cost_cents
          FROM api_usage_logs
          WHERE created_at >= NOW() - INTERVAL '1 day' * ${days}
          GROUP BY DATE(created_at)
          ORDER BY date ASC
        ` as TimelineRowByDate[];
      }

      const topUsers = await sql`
        SELECT
          l.user_id,
          COALESCE(u.email, '') as email,
          COALESCE(u.name, '') as name,
          COUNT(*) as total_requests,
          COALESCE(SUM(l.estimated_cost_cents), 0) as total_cost_cents
        FROM api_usage_logs l
        LEFT JOIN users u ON u.id = l.user_id
        WHERE l.created_at >= NOW() - INTERVAL '1 day' * ${days}
          AND l.user_id IS NOT NULL
        GROUP BY l.user_id, u.email, u.name
        ORDER BY total_cost_cents DESC
        LIMIT 10
      ` as TopUserRow[];

      const topOrganizations = await sql`
        SELECT
          organization_id,
          COUNT(*) as total_requests,
          COALESCE(SUM(estimated_cost_cents), 0) as total_cost_cents
        FROM api_usage_logs
        WHERE created_at >= NOW() - INTERVAL '1 day' * ${days}
          AND organization_id IS NOT NULL
        GROUP BY organization_id
        ORDER BY total_cost_cents DESC
        LIMIT 10
      ` as TopOrganizationRow[];

      const totals = totalsResult[0] || {
        total_requests: "0",
        success_count: "0",
        failed_count: "0",
        total_cost_cents: "0",
        total_input_tokens: "0",
        total_output_tokens: "0",
        total_images: "0",
        total_video_seconds: "0",
      };

      logAdminRequest(req, "admin.usage.view", "success", { groupBy, days });
      res.json({
        totals: {
          totalRequests: parseInt(totals.total_requests || "0", 10),
          successCount: parseInt(totals.success_count || "0", 10),
          failedCount: parseInt(totals.failed_count || "0", 10),
          totalCostCents: parseInt(totals.total_cost_cents || "0", 10),
          totalCostUsd: (parseInt(totals.total_cost_cents || "0", 10) || 0) / 100,
          totalInputTokens: parseInt(totals.total_input_tokens || "0", 10),
          totalOutputTokens: parseInt(totals.total_output_tokens || "0", 10),
          totalImages: parseInt(totals.total_images || "0", 10),
          totalVideoSeconds: parseInt(totals.total_video_seconds || "0", 10),
        },
        timeline: timeline.map((row: TimelineRow) => {
          const mapped = {
            total_requests: String(parseInt(row.total_requests || "0", 10)),
            total_cost_cents: String(parseInt(row.total_cost_cents || "0", 10)),
          };

          if ("date" in row && row.date) {
            const dateValue = row.date instanceof Date
              ? row.date.toISOString().split("T")[0]
              : String(row.date);
            return { ...mapped, date: dateValue };
          }

          if ("provider" in row && row.provider) return { ...mapped, provider: row.provider };
          if ("model_id" in row && row.model_id) return { ...mapped, model_id: row.model_id };
          if ("operation" in row && row.operation) return { ...mapped, operation: row.operation };
          return mapped;
        }),
        topUsers: topUsers.map((row: TopUserRow) => ({
          user_id: row.user_id,
          email: row.email || "",
          name: row.name || "",
          total_requests: String(parseInt(row.total_requests || "0", 10)),
          total_cost_cents: String(parseInt(row.total_cost_cents || "0", 10)),
          totalCostUsd: (parseInt(row.total_cost_cents || "0", 10) || 0) / 100,
        })),
        topOrganizations: topOrganizations.map((row: TopOrganizationRow) => ({
          organization_id: row.organization_id,
          total_requests: String(parseInt(row.total_requests || "0", 10)),
          total_cost_cents: String(parseInt(row.total_cost_cents || "0", 10)),
          totalCostUsd: (parseInt(row.total_cost_cents || "0", 10) || 0) / 100,
        })),
      });
    } catch (error) {
      if (error instanceof AppError) {
        logAdminRequest(req, "admin.usage.view", "fail", {
          statusCode: error.statusCode,
          errorMessage: error.message,
        });
        throw error;
      }
      logAdminRequest(req, "admin.usage.view", "fail", {
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      logger.error({ err: error }, "[Admin] Usage error");
      res.status(500).json({ error: "Failed to fetch usage data" });
    }
  });

  // Admin: Get users list
  app.get("/api/admin/users", requireSuperAdmin, validateRequest({ query: adminUsersQuerySchema }), async (req: Request, res: Response) => {
    try {
      const sql = getSql();
      const { limit: safeLimit, page: safePage, search: searchParam = "" } = req.query as unknown as AdminUsersQuery;
      const offset = (safePage - 1) * safeLimit;

      const searchFilter = searchParam ? `%${searchParam}%` : null;

      const users = await sql`
        SELECT
          u.id,
          u.auth_provider_id as clerk_user_id,
          u.email,
          u.name,
          u.avatar_url,
          u.last_login_at as last_login,
          u.created_at,
          COUNT(DISTINCT c.id) as campaign_count,
          COUNT(DISTINCT bp.id) as brand_count,
          COUNT(DISTINCT sp.id) as scheduled_post_count
        FROM users u
        LEFT JOIN campaigns c ON c.user_id = u.id AND c.deleted_at IS NULL
        LEFT JOIN brand_profiles bp ON bp.user_id = u.id AND bp.deleted_at IS NULL
        LEFT JOIN scheduled_posts sp ON sp.user_id = u.id
        WHERE (${searchFilter}::text IS NULL OR u.email ILIKE ${searchFilter} OR u.name ILIKE ${searchFilter})
        GROUP BY u.id, u.auth_provider_id, u.email, u.name, u.avatar_url, u.last_login_at, u.created_at
        ORDER BY u.created_at DESC
        LIMIT ${safeLimit} OFFSET ${offset}
      ` as UserRow[];

      const countResult = await sql`
        SELECT COUNT(*) as total FROM users
        WHERE (${searchFilter}::text IS NULL OR email ILIKE ${searchFilter} OR name ILIKE ${searchFilter})
      ` as TotalRow[];
      const total = parseInt(countResult[0]?.total || "0", 10);
      const totalPages = Math.ceil(total / safeLimit);

      logAdminRequest(req, "admin.users.list", "success", {
        page: safePage,
        limit: safeLimit,
        search: searchParam || null,
      });
      res.json({
        users,
        pagination: {
          page: safePage,
          limit: safeLimit,
          total,
          totalPages,
        },
      });
    } catch (error) {
      if (error instanceof AppError) {
        logAdminRequest(req, "admin.users.list", "fail", {
          statusCode: error.statusCode,
          errorMessage: error.message,
        });
        throw error;
      }
      logAdminRequest(req, "admin.users.list", "fail", {
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      logger.error({ err: error }, "[Admin] Users error");
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  // Admin: Get organizations list (from Clerk org IDs in brand_profiles/campaigns/usage tables)
  app.get("/api/admin/organizations", requireSuperAdmin, validateRequest({ query: adminOrganizationsQuerySchema }), async (req: Request, res: Response) => {
    try {
      const sql = getSql();
      const { limit: safeLimit, page: safePage } = req.query as unknown as AdminOrganizationsQuery;
      const offset = (safePage - 1) * safeLimit;

      // Get organization base data with counts from various tables
      const orgs = await sql`
        WITH org_base AS (
          SELECT DISTINCT organization_id
          FROM brand_profiles
          WHERE organization_id IS NOT NULL AND deleted_at IS NULL
          UNION
          SELECT DISTINCT organization_id
          FROM campaigns
          WHERE organization_id IS NOT NULL AND deleted_at IS NULL
          UNION
          SELECT DISTINCT organization_id
          FROM gallery_images
          WHERE organization_id IS NOT NULL AND deleted_at IS NULL
          UNION
          SELECT DISTINCT organization_id
          FROM scheduled_posts
          WHERE organization_id IS NOT NULL
          UNION
          SELECT DISTINCT organization_id
          FROM api_usage_logs
          WHERE organization_id IS NOT NULL
        ),
        brand_data AS (
          SELECT
            organization_id,
            COUNT(*) as brand_count,
            MIN(name) as primary_brand_name,
            MIN(created_at) as first_brand_created
          FROM brand_profiles
          WHERE organization_id IS NOT NULL AND deleted_at IS NULL
          GROUP BY organization_id
        ),
        campaign_data AS (
          SELECT
            organization_id,
            COUNT(*) as campaign_count
          FROM campaigns
          WHERE organization_id IS NOT NULL AND deleted_at IS NULL
          GROUP BY organization_id
        ),
        gallery_data AS (
          SELECT
            organization_id,
            COUNT(*) as gallery_image_count
          FROM gallery_images
          WHERE organization_id IS NOT NULL AND deleted_at IS NULL
          GROUP BY organization_id
        ),
        post_data AS (
          SELECT
            organization_id,
            COUNT(*) as scheduled_post_count
          FROM scheduled_posts
          WHERE organization_id IS NOT NULL
          GROUP BY organization_id
        ),
        activity_data AS (
          SELECT
            organization_id,
            MAX(created_at) as last_activity
          FROM (
            SELECT organization_id, created_at FROM brand_profiles WHERE organization_id IS NOT NULL
            UNION ALL
            SELECT organization_id, created_at FROM campaigns WHERE organization_id IS NOT NULL
            UNION ALL
            SELECT organization_id, created_at FROM gallery_images WHERE organization_id IS NOT NULL
            UNION ALL
            SELECT organization_id, created_at FROM scheduled_posts WHERE organization_id IS NOT NULL
            UNION ALL
            SELECT organization_id, created_at FROM api_usage_logs WHERE organization_id IS NOT NULL
          ) all_activity
          GROUP BY organization_id
        ),
        usage_this_month AS (
          SELECT
            organization_id,
            COUNT(*) as request_count,
            COALESCE(SUM(estimated_cost_cents), 0) as cost_cents
          FROM api_usage_logs
          WHERE organization_id IS NOT NULL
            AND created_at >= DATE_TRUNC('month', CURRENT_DATE)
          GROUP BY organization_id
        )
        SELECT
          o.organization_id,
          COALESCE(b.primary_brand_name, 'Unnamed') as primary_brand_name,
          COALESCE(b.brand_count, 0) as brand_count,
          COALESCE(c.campaign_count, 0) as campaign_count,
          COALESCE(g.gallery_image_count, 0) as gallery_image_count,
          COALESCE(p.scheduled_post_count, 0) as scheduled_post_count,
          b.first_brand_created,
          a.last_activity,
          COALESCE(u.request_count, 0) as ai_requests,
          COALESCE(u.cost_cents, 0) as ai_cost_cents
        FROM org_base o
        LEFT JOIN brand_data b ON b.organization_id = o.organization_id
        LEFT JOIN campaign_data c ON c.organization_id = o.organization_id
        LEFT JOIN gallery_data g ON g.organization_id = o.organization_id
        LEFT JOIN post_data p ON p.organization_id = o.organization_id
        LEFT JOIN activity_data a ON a.organization_id = o.organization_id
        LEFT JOIN usage_this_month u ON u.organization_id = o.organization_id
        ORDER BY a.last_activity DESC NULLS LAST
        LIMIT ${safeLimit} OFFSET ${offset}
      ` as OrganizationRow[];

      // Transform data to match frontend interface
      const organizations = orgs.map((org: OrganizationRow) => ({
        organization_id: org.organization_id,
        primary_brand_name: org.primary_brand_name,
        brand_count: String(org.brand_count),
        campaign_count: String(org.campaign_count),
        gallery_image_count: String(org.gallery_image_count),
        scheduled_post_count: String(org.scheduled_post_count),
        first_brand_created: org.first_brand_created,
        last_activity: org.last_activity,
        aiUsageThisMonth: {
          requests: parseInt(String(org.ai_requests), 10) || 0,
          costCents: parseInt(String(org.ai_cost_cents), 10) || 0,
          costUsd: (parseInt(String(org.ai_cost_cents), 10) || 0) / 100,
        },
      }));

      // Count total organizations
      const countResult = await sql`
        SELECT COUNT(DISTINCT organization_id) as total FROM (
          SELECT organization_id FROM brand_profiles WHERE organization_id IS NOT NULL AND deleted_at IS NULL
          UNION
          SELECT organization_id FROM campaigns WHERE organization_id IS NOT NULL AND deleted_at IS NULL
          UNION
          SELECT organization_id FROM gallery_images WHERE organization_id IS NOT NULL AND deleted_at IS NULL
          UNION
          SELECT organization_id FROM scheduled_posts WHERE organization_id IS NOT NULL
          UNION
          SELECT organization_id FROM api_usage_logs WHERE organization_id IS NOT NULL
        ) orgs
      ` as TotalRow[];
      const total = parseInt(countResult[0]?.total || "0", 10);
      const totalPages = Math.ceil(total / safeLimit);

      logAdminRequest(req, "admin.organizations.list", "success", {
        page: safePage,
        limit: safeLimit,
      });
      res.json({
        organizations,
        pagination: {
          page: safePage,
          limit: safeLimit,
          total,
          totalPages,
        },
      });
    } catch (error) {
      if (error instanceof AppError) {
        logAdminRequest(req, "admin.organizations.list", "fail", {
          statusCode: error.statusCode,
          errorMessage: error.message,
        });
        throw error;
      }
      logAdminRequest(req, "admin.organizations.list", "fail", {
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      logger.error({ err: error }, "[Admin] Organizations error");
      res.status(500).json({ error: "Failed to fetch organizations" });
    }
  });

  // Admin: Get activity logs
  app.get("/api/admin/logs", requireSuperAdmin, validateRequest({ query: adminLogsQuerySchema }), async (req: Request, res: Response) => {
    try {
      const sql = getSql();
      const {
        limit: safeLimit,
        page: safePage,
        action: actionParam = "",
        category: categoryParam = "",
        severity: severityParam,
      } = req.query as unknown as AdminLogsQuery;
      const offset = (safePage - 1) * safeLimit;
      const actionFilter = actionParam ? `%${actionParam}%` : null;
      const categoryFilter = categoryParam || null;
      const severityFilter = severityParam ? severityParam.toLowerCase() : null;

      const logs = await sql`
        SELECT id, user_id, organization_id, endpoint, operation as category, model_id as model,
               estimated_cost_cents as cost_cents, error_message as error,
               CASE WHEN status = 'failed' THEN 'error' ELSE 'info' END as severity,
               status, latency_ms as duration_ms, created_at as timestamp
        FROM api_usage_logs
        WHERE
          (${actionFilter}::text IS NULL OR endpoint ILIKE ${actionFilter} OR operation::text ILIKE ${actionFilter} OR model_id ILIKE ${actionFilter})
          AND (${categoryFilter}::text IS NULL OR operation::text = ${categoryFilter})
          AND (
            ${severityFilter}::text IS NULL
            OR (${severityFilter} = 'error' AND status = 'failed')
            OR (${severityFilter} IN ('info', 'warning', 'critical') AND status != 'failed')
          )
        ORDER BY created_at DESC
        LIMIT ${safeLimit} OFFSET ${offset}
      ` as LogRow[];

      const totalResult = await sql`
        SELECT COUNT(*) as count
        FROM api_usage_logs
        WHERE
          (${actionFilter}::text IS NULL OR endpoint ILIKE ${actionFilter} OR operation::text ILIKE ${actionFilter} OR model_id ILIKE ${actionFilter})
          AND (${categoryFilter}::text IS NULL OR operation::text = ${categoryFilter})
          AND (
            ${severityFilter}::text IS NULL
            OR (${severityFilter} = 'error' AND status = 'failed')
            OR (${severityFilter} IN ('info', 'warning', 'critical') AND status != 'failed')
          )
      ` as CountRow[];

      // Get unique categories
      const categoriesResult =
        await sql`SELECT DISTINCT operation as category FROM api_usage_logs WHERE operation IS NOT NULL` as CategoryRow[];

      // Get recent error count
      const errorCountResult =
        await sql`SELECT COUNT(*) as count FROM api_usage_logs WHERE status = 'failed' AND created_at >= NOW() - INTERVAL '24 hours'` as CountRow[];

      const total = parseInt(totalResult[0]?.count || "0", 10);
      const totalPages = Math.ceil(total / safeLimit);

      logAdminRequest(req, "admin.logs.list", "success", {
        page: safePage,
        limit: safeLimit,
        category: category || null,
        status: status || null,
      });
      res.json({
        logs,
        pagination: {
          page: safePage,
          limit: safeLimit,
          total,
          totalPages,
        },
        filters: {
          categories: categoriesResult.map((r: CategoryRow) => r.category),
          recentErrorCount: parseInt(errorCountResult[0]?.count || "0", 10),
        },
      });
    } catch (error) {
      if (error instanceof AppError) {
        logAdminRequest(req, "admin.logs.list", "fail", {
          statusCode: error.statusCode,
          errorMessage: error.message,
        });
        throw error;
      }
      logAdminRequest(req, "admin.logs.list", "fail", {
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      logger.error({ err: error }, "[Admin] Logs error");
      res.status(500).json({ error: "Failed to fetch logs" });
    }
  });

  // Admin: Get single log details
  app.get("/api/admin/logs/:id", requireSuperAdmin, validateRequest({ params: adminLogParamsSchema }), async (req: Request, res: Response) => {
    try {
      const sql = getSql();
      const { id } = req.params as AdminLogParams;

      const logs = await sql`
        SELECT id, request_id, user_id, organization_id,
               endpoint, operation, provider, model_id,
               input_tokens, output_tokens, total_tokens,
               image_count, image_size, video_duration_seconds,
               estimated_cost_cents, latency_ms, status,
               error_message, metadata, created_at
        FROM api_usage_logs
        WHERE id = ${id}
      ` as LogDetailRow[];

      if (!logs || logs.length === 0) {
        throw new AppError("Log not found", 404);
      }

      logAdminRequest(req, "admin.logs.detail", "success", { logId: id });
      res.json(logs[0]);
    } catch (error) {
      if (error instanceof AppError) {
        logAdminRequest(req, "admin.logs.detail", "fail", {
          logId: req.params.id,
          statusCode: error.statusCode,
          errorMessage: error.message,
        });
        throw error;
      }
      logAdminRequest(req, "admin.logs.detail", "fail", {
        logId: req.params.id,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      logger.error({ err: error }, "[Admin] Log detail error");
      res.status(500).json({ error: "Failed to fetch log details" });
    }
  });

  // Admin: Get AI suggestions for a log
  app.post(
    "/api/admin/logs/:id/ai-suggestions",
    requireSuperAdmin,
    validateRequest({ params: adminLogParamsSchema }),
    async (req: Request, res: Response) => {
      try {
        const sql = getSql();
        const { id } = req.params as AdminLogParams;

        // Check cache first
        const cacheKey = `suggestions_${id}`;
        const cached = aiSuggestionsCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < CACHE_DURATION_MS) {
          logAdminRequest(req, "admin.logs.ai-suggestions", "success", {
            logId: id,
            cached: true,
          });
          res.json({ suggestions: cached.suggestions, cached: true });
          return;
        }

        // Fetch log from database
        const logs = await sql`
        SELECT id, endpoint, operation, model_id, error_message,
               metadata, latency_ms, status
        FROM api_usage_logs
        WHERE id = ${id}
      ` as AiSuggestionsLogRow[];

        const log = logs[0];
        if (!log) {
          throw new AppError("Log not found", 404);
        }

        // Only generate suggestions for failed logs
        if (log.status !== "failed") {
          logAdminRequest(req, "admin.logs.ai-suggestions", "success", {
            logId: id,
            cached: false,
            skipped: true,
          });
          res.json({
            suggestions:
              'Este log não contém erros. Sugestões de IA estão disponíveis apenas para logs com status "failed".',
            cached: false,
          });
          return;
        }

        // Construct prompt for AI
        const prompt = `Você é um expert em análise de erros de API. Forneça sugestões para corrigir este erro:

**Detalhes do Erro:**
- Endpoint: ${log.endpoint || "N/A"}
- Operação: ${log.operation || "N/A"}
- Modelo: ${log.model_id || "N/A"}
- Mensagem: ${log.error_message || "N/A"}
- Metadata: ${log.metadata ? JSON.stringify(log.metadata) : "N/A"}
- Latência: ${log.latency_ms ?? "N/A"}ms

**Sua Tarefa:**
1. Análise da causa raiz (2-3 frases)
2. Correções específicas (3-5 bullet points)
3. Estratégias de prevenção (2-3 bullet points)
4. Exemplos de código se relevante

Formate em markdown claro com seções.`;

        // Call text generation with retry logic
        const { text } = await withRetry(() =>
          generateTextFromMessages({
            model: DEFAULT_TEXT_MODEL,
            messages: [
              { role: "user", content: prompt },
            ],
          }),
        );

        const suggestions =
          text?.trim() ||
          "Não foi possível gerar sugestões.";

        // Cache the result
        aiSuggestionsCache.set(cacheKey, {
          suggestions,
          timestamp: Date.now(),
        });

        logAdminRequest(req, "admin.logs.ai-suggestions", "success", {
          logId: id,
          cached: false,
        });
        res.json({ suggestions, cached: false });
      } catch (error) {
        if (error instanceof AppError) {
          logAdminRequest(req, "admin.logs.ai-suggestions", "fail", {
            logId: req.params.id,
            statusCode: error.statusCode,
            errorMessage: error.message,
          });
          throw error;
        }
        logAdminRequest(req, "admin.logs.ai-suggestions", "fail", {
          logId: req.params.id,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
        logger.error({ err: error }, "[Admin] AI suggestions error");
        res.status(500).json({ error: "Failed to generate AI suggestions" });
      }
    },
  );
}
