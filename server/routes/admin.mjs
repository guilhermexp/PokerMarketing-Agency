import { getSql } from "../lib/db.mjs";
import { requireSuperAdmin } from "../lib/auth.mjs";
import { callGeminiTextApi } from "../lib/ai/clients.mjs";
import { withRetry } from "../lib/ai/retry.mjs";
import { DEFAULT_TEXT_MODEL } from "../lib/ai/prompt-builders.mjs";
import logger from "../lib/logger.mjs";

// Cache for AI suggestions (1 hour TTL)
const aiSuggestionsCache = new Map();
const CACHE_DURATION_MS = 3600000; // 1 hour

export function registerAdminRoutes(app) {
  // Admin: Get overview stats
  app.get("/api/admin/stats", requireSuperAdmin, async (req, res) => {
    try {
      const sql = getSql();

      // Get all stats in parallel
      // Note: organizations are managed by Clerk, not in our DB
      const [
        usersResult,
        activeUsersResult,
        campaignsResult,
        postsResult,
        galleryResult,
        aiUsageResult,
        errorsResult,
        orgCountResult,
      ] = await Promise.all([
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

      res.json({
        totalUsers: parseInt(usersResult[0]?.count || 0),
        activeUsersToday: parseInt(activeUsersResult[0]?.count || 0),
        totalOrganizations: parseInt(orgCountResult[0]?.count || 0),
        totalCampaigns: parseInt(campaignsResult[0]?.count || 0),
        totalScheduledPosts: parseInt(postsResult[0]?.count || 0),
        pendingPosts: parseInt(postsResult[0]?.pending || 0),
        totalGalleryImages: parseInt(galleryResult[0]?.count || 0),
        aiCostThisMonth: parseInt(aiUsageResult[0]?.total_cost || 0),
        aiRequestsThisMonth: parseInt(aiUsageResult[0]?.total_requests || 0),
        recentErrors: parseInt(errorsResult[0]?.count || 0),
      });
    } catch (error) {
      logger.error({ err: error }, "[Admin] Stats error");
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // Admin: Get AI usage analytics
  app.get("/api/admin/usage", requireSuperAdmin, async (req, res) => {
    try {
      const sql = getSql();
      const normalizedGroupBy = String(req.query?.groupBy || "day").toLowerCase();
      const groupBy = ["day", "provider", "model", "operation"].includes(normalizedGroupBy)
        ? normalizedGroupBy
        : "day";
      const parsedDays = Number.parseInt(String(req.query?.days || "30"), 10);
      const days = Number.isFinite(parsedDays)
        ? Math.min(Math.max(parsedDays, 1), 365)
        : 30;

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
      `;

      let timeline = [];
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
        `;
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
        `;
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
        `;
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
        `;
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
      `;

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
      `;

      const totals = totalsResult[0] || {};

      res.json({
        totals: {
          totalRequests: parseInt(totals.total_requests || 0),
          successCount: parseInt(totals.success_count || 0),
          failedCount: parseInt(totals.failed_count || 0),
          totalCostCents: parseInt(totals.total_cost_cents || 0),
          totalCostUsd: (parseInt(totals.total_cost_cents || 0) || 0) / 100,
          totalInputTokens: parseInt(totals.total_input_tokens || 0),
          totalOutputTokens: parseInt(totals.total_output_tokens || 0),
          totalImages: parseInt(totals.total_images || 0),
          totalVideoSeconds: parseInt(totals.total_video_seconds || 0),
        },
        timeline: timeline.map((row) => {
          const mapped = {
            total_requests: String(parseInt(row.total_requests || 0)),
            total_cost_cents: String(parseInt(row.total_cost_cents || 0)),
          };

          if (row.date) {
            const dateValue = row.date instanceof Date
              ? row.date.toISOString().split("T")[0]
              : String(row.date);
            return { ...mapped, date: dateValue };
          }

          if (row.provider) return { ...mapped, provider: row.provider };
          if (row.model_id) return { ...mapped, model_id: row.model_id };
          if (row.operation) return { ...mapped, operation: row.operation };
          return mapped;
        }),
        topUsers: topUsers.map((row) => ({
          user_id: row.user_id,
          email: row.email || "",
          name: row.name || "",
          total_requests: String(parseInt(row.total_requests || 0)),
          total_cost_cents: String(parseInt(row.total_cost_cents || 0)),
          totalCostUsd: (parseInt(row.total_cost_cents || 0) || 0) / 100,
        })),
        topOrganizations: topOrganizations.map((row) => ({
          organization_id: row.organization_id,
          total_requests: String(parseInt(row.total_requests || 0)),
          total_cost_cents: String(parseInt(row.total_cost_cents || 0)),
          totalCostUsd: (parseInt(row.total_cost_cents || 0) || 0) / 100,
        })),
      });
    } catch (error) {
      logger.error({ err: error }, "[Admin] Usage error");
      res.status(500).json({ error: "Failed to fetch usage data" });
    }
  });

  // Admin: Get users list
  app.get("/api/admin/users", requireSuperAdmin, async (req, res) => {
    try {
      const sql = getSql();
      const { limit = 20, page = 1, search = "" } = req.query;
      const offset = (parseInt(page) - 1) * parseInt(limit);

      const searchFilter = search ? `%${search}%` : null;

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
        LIMIT ${parseInt(limit)} OFFSET ${offset}
      `;

      const countResult = await sql`
        SELECT COUNT(*) as total FROM users
        WHERE (${searchFilter}::text IS NULL OR email ILIKE ${searchFilter} OR name ILIKE ${searchFilter})
      `;
      const total = parseInt(countResult[0]?.total || 0);
      const totalPages = Math.ceil(total / parseInt(limit));

      res.json({
        users,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages,
        },
      });
    } catch (error) {
      logger.error({ err: error }, "[Admin] Users error");
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  // Admin: Get organizations list (from Clerk org IDs in brand_profiles/campaigns/usage tables)
  app.get("/api/admin/organizations", requireSuperAdmin, async (req, res) => {
    try {
      const sql = getSql();
      const { limit = 20, page = 1 } = req.query;
      const offset = (parseInt(page) - 1) * parseInt(limit);

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
        LIMIT ${parseInt(limit)} OFFSET ${offset}
      `;

      // Transform data to match frontend interface
      const organizations = orgs.map((org) => ({
        organization_id: org.organization_id,
        primary_brand_name: org.primary_brand_name,
        brand_count: String(org.brand_count),
        campaign_count: String(org.campaign_count),
        gallery_image_count: String(org.gallery_image_count),
        scheduled_post_count: String(org.scheduled_post_count),
        first_brand_created: org.first_brand_created,
        last_activity: org.last_activity,
        aiUsageThisMonth: {
          requests: parseInt(org.ai_requests) || 0,
          costCents: parseInt(org.ai_cost_cents) || 0,
          costUsd: (parseInt(org.ai_cost_cents) || 0) / 100,
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
      `;
      const total = parseInt(countResult[0]?.total || 0);
      const totalPages = Math.ceil(total / parseInt(limit));

      res.json({
        organizations,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages,
        },
      });
    } catch (error) {
      logger.error({ err: error }, "[Admin] Organizations error");
      res.status(500).json({ error: "Failed to fetch organizations" });
    }
  });

  // Admin: Get activity logs
  app.get("/api/admin/logs", requireSuperAdmin, async (req, res) => {
    try {
      const sql = getSql();
      const { limit = 100, page = 1, action = "", category = "", severity = "" } =
        req.query;
      const safeLimit = Math.min(Math.max(parseInt(limit) || 100, 1), 200);
      const safePage = Math.max(parseInt(page) || 1, 1);
      const offset = (safePage - 1) * safeLimit;
      const actionFilter = action ? `%${action}%` : null;
      const categoryFilter = category ? String(category) : null;
      const severityFilter = severity ? String(severity).toLowerCase() : null;

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
      `;

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
      `;

      // Get unique categories
      const categoriesResult =
        await sql`SELECT DISTINCT operation as category FROM api_usage_logs WHERE operation IS NOT NULL`;

      // Get recent error count
      const errorCountResult =
        await sql`SELECT COUNT(*) as count FROM api_usage_logs WHERE status = 'failed' AND created_at >= NOW() - INTERVAL '24 hours'`;

      const total = parseInt(totalResult[0]?.count || 0);
      const totalPages = Math.ceil(total / safeLimit);

      res.json({
        logs,
        pagination: {
          page: safePage,
          limit: safeLimit,
          total,
          totalPages,
        },
        filters: {
          categories: categoriesResult.map((r) => r.category),
          recentErrorCount: parseInt(errorCountResult[0]?.count || 0),
        },
      });
    } catch (error) {
      logger.error({ err: error }, "[Admin] Logs error");
      res.status(500).json({ error: "Failed to fetch logs" });
    }
  });

  // Admin: Get single log details
  app.get("/api/admin/logs/:id", requireSuperAdmin, async (req, res) => {
    try {
      const sql = getSql();
      const { id } = req.params;

      const logs = await sql`
        SELECT id, request_id, user_id, organization_id,
               endpoint, operation, provider, model_id,
               input_tokens, output_tokens, total_tokens,
               image_count, image_size, video_duration_seconds,
               estimated_cost_cents, latency_ms, status,
               error_message, metadata, created_at
        FROM api_usage_logs
        WHERE id = ${id}
      `;

      if (!logs || logs.length === 0) {
        return res.status(404).json({ error: "Log not found" });
      }

      res.json(logs[0]);
    } catch (error) {
      logger.error({ err: error }, "[Admin] Log detail error");
      res.status(500).json({ error: "Failed to fetch log details" });
    }
  });

  // Admin: Get AI suggestions for a log
  app.post(
    "/api/admin/logs/:id/ai-suggestions",
    requireSuperAdmin,
    async (req, res) => {
      try {
        const sql = getSql();
        const { id } = req.params;

        // Check cache first
        const cacheKey = `suggestions_${id}`;
        const cached = aiSuggestionsCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < CACHE_DURATION_MS) {
          return res.json({ suggestions: cached.suggestions, cached: true });
        }

        // Fetch log from database
        const logs = await sql`
        SELECT id, endpoint, operation, model_id, error_message,
               metadata, latency_ms, status
        FROM api_usage_logs
        WHERE id = ${id}
      `;

        if (!logs || logs.length === 0) {
          return res.status(404).json({ error: "Log not found" });
        }

        const log = logs[0];

        // Only generate suggestions for failed logs
        if (log.status !== "failed") {
          return res.json({
            suggestions:
              'Este log não contém erros. Sugestões de IA estão disponíveis apenas para logs com status "failed".',
            cached: false,
          });
        }

        // Construct prompt for AI
        const prompt = `Você é um expert em análise de erros de API. Forneça sugestões para corrigir este erro:

**Detalhes do Erro:**
- Endpoint: ${log.endpoint || "N/A"}
- Operação: ${log.operation || "N/A"}
- Modelo: ${log.model_id || "N/A"}
- Mensagem: ${log.error_message || "N/A"}
- Metadata: ${log.metadata ? JSON.stringify(log.metadata) : "N/A"}
- Latência: ${log.latency_ms || "N/A"}ms

**Sua Tarefa:**
1. Análise da causa raiz (2-3 frases)
2. Correções específicas (3-5 bullet points)
3. Estratégias de prevenção (2-3 bullet points)
4. Exemplos de código se relevante

Formate em markdown claro com seções.`;

        // Call Gemini API with retry logic
        const result = await withRetry(() =>
          callGeminiTextApi({
            model: DEFAULT_TEXT_MODEL,
            messages: [
              { role: "user", content: prompt },
            ],
          }),
        );

        const suggestions =
          result.choices?.[0]?.message?.content?.trim() ||
          "Não foi possível gerar sugestões.";

        // Cache the result
        aiSuggestionsCache.set(cacheKey, {
          suggestions,
          timestamp: Date.now(),
        });

        res.json({ suggestions, cached: false });
      } catch (error) {
        logger.error({ err: error }, "[Admin] AI suggestions error");
        res.status(500).json({ error: "Failed to generate AI suggestions" });
      }
    },
  );
}
