import { beforeEach, describe, expect, it, vi } from "vitest";

describe("campaigns service", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("creates a campaign and related content in a single transaction with batch inserts", async () => {
    const loggerMock = {
      info: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
    };
    const transactionMock = vi.fn();
    const sqlQueryMock = vi.fn((query: string, params?: unknown[]) => ({
      kind: "query",
      query,
      params: params ?? [],
    }));
    const sqlTagMock = vi.fn((strings: TemplateStringsArray, ...params: unknown[]) => ({
      kind: "tag",
      query: strings.join(" "),
      params,
    }));
    const sqlMock = Object.assign(sqlTagMock, {
      query: sqlQueryMock,
      transaction: transactionMock,
    });

    const campaignRow = {
      id: "campaign-uuid",
      user_id: "db-user-1",
      organization_id: null,
      name: "Spring Launch",
      description: null,
      brand_profile_id: null,
      input_transcript: "transcript",
      generation_options: { tone: "bold" },
      status: "draft",
      created_at: new Date("2026-01-01T00:00:00.000Z"),
      updated_at: new Date("2026-01-01T00:00:00.000Z"),
      deleted_at: null,
    };
    const videoRows = [
      { id: "clip-1", campaign_id: "campaign-uuid", title: "Clip 1" },
      { id: "clip-2", campaign_id: "campaign-uuid", title: "Clip 2" },
    ];
    const postRows = [
      { id: "post-1", campaign_id: "campaign-uuid", platform: "instagram" },
      { id: "post-2", campaign_id: "campaign-uuid", platform: "facebook" },
    ];
    const adRows = [
      { id: "ad-1", campaign_id: "campaign-uuid", headline: "Headline 1" },
      { id: "ad-2", campaign_id: "campaign-uuid", headline: "Headline 2" },
    ];
    const carouselRows = [
      { id: "carousel-1", campaign_id: "campaign-uuid", title: "Carousel 1" },
      { id: "carousel-2", campaign_id: "campaign-uuid", title: "Carousel 2" },
    ];

    transactionMock.mockImplementation(async (queries: Array<{ query: string; params: unknown[] }>) => {
      expect(Array.isArray(queries)).toBe(true);
      expect(queries).toHaveLength(5);

      const campaignInsert = queries.find((query) => query.query.includes("INSERT INTO campaigns"));
      const videoInsert = queries.find((query) => query.query.includes("INSERT INTO video_clip_scripts"));
      const postsInsert = queries.find((query) => query.query.includes("INSERT INTO posts"));
      const adsInsert = queries.find((query) => query.query.includes("INSERT INTO ad_creatives"));
      const carouselInsert = queries.find((query) => query.query.includes("INSERT INTO carousel_scripts"));

      expect(campaignInsert?.params[0]).toEqual(expect.any(String));
      expect(videoInsert).toBeDefined();
      expect(postsInsert).toBeDefined();
      expect(adsInsert).toBeDefined();
      expect(carouselInsert).toBeDefined();

      return [
        [campaignRow],
        videoRows,
        postRows,
        adRows,
        carouselRows,
      ];
    });

    vi.doMock("../../server/lib/db.js", () => ({
      getSql: () => sqlMock,
    }));
    vi.doMock("../../server/lib/user-resolver.js", () => ({
      resolveUserId: vi.fn().mockResolvedValue("db-user-1"),
    }));
    vi.doMock("../../server/lib/auth.js", () => ({
      resolveOrganizationContext: vi.fn(),
    }));
    vi.doMock("../../server/helpers/organization-context.js", () => ({
      hasPermission: vi.fn().mockReturnValue(true),
      PERMISSIONS: {
        CREATE_CAMPAIGN: "create_campaign",
        DELETE_CAMPAIGN: "delete_campaign",
      },
      PermissionDeniedError: class PermissionDeniedError extends Error {},
    }));
    vi.doMock("../../server/lib/logger.js", () => ({
      default: loggerMock,
    }));
    vi.doMock("@vercel/blob", () => ({
      del: vi.fn(),
    }));

    const { createCampaign } = await import("../../server/services/campaigns-service.js");

    const result = await createCampaign({
      user_id: "auth-user-1",
      name: "Spring Launch",
      input_transcript: "transcript",
      generation_options: { tone: "bold" },
      video_clip_scripts: [
        { title: "Clip 1", hook: "Hook 1", scenes: [] },
        { title: "Clip 2", hook: "Hook 2", scenes: [] },
      ],
      posts: [
        { platform: "instagram", content: "Post 1", hashtags: ["#one"] },
        { platform: "facebook", content: "Post 2", hashtags: ["#two"] },
      ],
      ad_creatives: [
        { platform: "meta", headline: "Headline 1", body: "Body 1", cta: "CTA 1" },
        { platform: "google", headline: "Headline 2", body: "Body 2", cta: "CTA 2" },
      ],
      carousel_scripts: [
        { title: "Carousel 1", hook: "Hook 1", slides: [] },
        { title: "Carousel 2", hook: "Hook 2", slides: [] },
      ],
    });

    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(sqlQueryMock).toHaveBeenCalledTimes(5);
    expect(result).toEqual({
      ...campaignRow,
      video_clip_scripts: videoRows,
      posts: postRows,
      ad_creatives: adRows,
      carousel_scripts: carouselRows,
    });
  });

  it("starts blob deletions in parallel, logs per-file failures, and deletes database rows in one transaction", async () => {
    const loggerMock = {
      info: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
    };
    let resolveFirstDelete!: () => void;
    let rejectSecondDelete!: (error: Error) => void;
    const firstDelete = new Promise<void>((resolve) => {
      resolveFirstDelete = resolve;
    });
    const secondDelete = new Promise<void>((_resolve, reject) => {
      rejectSecondDelete = reject;
    });
    const delMock = vi.fn((url: string) => {
      if (url.includes("gallery")) {
        return firstDelete;
      }
      return secondDelete;
    });
    const transactionMock = vi.fn(async (queries: Array<Promise<Array<{ query: string }>>>) => {
      expect(Array.isArray(queries)).toBe(true);
      expect(queries).toHaveLength(5);

      const resolvedQueries = (await Promise.all(queries)).flat();
      expect(resolvedQueries.some((query) => query.query.includes("DELETE FROM campaigns"))).toBe(true);

      return [[], [], [], [], []];
    });

    const sqlTagMock = vi.fn((strings: TemplateStringsArray, ...params: unknown[]) => {
      const query = strings.join(" ").replace(/\s+/g, " ").trim();

      if (query.includes("SELECT organization_id FROM campaigns")) {
        return Promise.resolve([{ organization_id: null }]);
      }
      if (query.includes("SELECT id, src_url FROM gallery_images")) {
        return Promise.resolve([
          {
            id: "gallery-1",
            src_url: "https://team.public.blob.vercel-storage.com/gallery-image.png",
          },
        ]);
      }
      if (query.includes("SELECT id, image_url FROM posts")) {
        return Promise.resolve([
          {
            id: "post-1",
            image_url: "https://team.public.blob.vercel-storage.com/post-image.png",
          },
        ]);
      }
      if (query.includes("SELECT id, image_url FROM ad_creatives")) {
        return Promise.resolve([]);
      }
      if (query.includes("SELECT id, thumbnail_url, video_url FROM video_clip_scripts")) {
        return Promise.resolve([]);
      }

      return Promise.resolve([{ query, params }]);
    });
    const sqlMock = Object.assign(sqlTagMock, {
      transaction: transactionMock,
      query: vi.fn(),
    });

    vi.doMock("@vercel/blob", () => ({
      del: delMock,
    }));
    vi.doMock("../../server/lib/db.js", () => ({
      getSql: () => sqlMock,
    }));
    vi.doMock("../../server/lib/user-resolver.js", () => ({
      resolveUserId: vi.fn(),
    }));
    vi.doMock("../../server/lib/auth.js", () => ({
      resolveOrganizationContext: vi.fn(),
    }));
    vi.doMock("../../server/helpers/organization-context.js", () => ({
      hasPermission: vi.fn().mockReturnValue(true),
      PERMISSIONS: {
        CREATE_CAMPAIGN: "create_campaign",
        DELETE_CAMPAIGN: "delete_campaign",
      },
      PermissionDeniedError: class PermissionDeniedError extends Error {},
    }));
    vi.doMock("../../server/lib/logger.js", () => ({
      default: loggerMock,
    }));

    const { deleteCampaign } = await import("../../server/services/campaigns-service.js");

    const deletePromise = deleteCampaign("campaign-1");

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(delMock).toHaveBeenCalledTimes(2);

    resolveFirstDelete();
    rejectSecondDelete(new Error("blob delete failed"));

    await expect(deletePromise).resolves.toEqual({
      success: true,
      deleted: {
        campaign: 1,
        posts: 1,
        ads: 0,
        clips: 0,
        galleryImages: 1,
        files: 2,
      },
    });

    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(loggerMock.debug).toHaveBeenCalledWith(
      { url: "https://team.public.blob.vercel-storage.com/gallery-image.png" },
      "[Campaign Delete] Deleted file",
    );
    expect(loggerMock.error).toHaveBeenCalledWith(
      {
        err: expect.any(Error),
        url: "https://team.public.blob.vercel-storage.com/post-image.png",
      },
      "[Campaign Delete] Failed to delete file: https://team.public.blob.vercel-storage.com/post-image.png",
    );
  });

  it("lists campaigns with pre-aggregated joins while preserving the current output shape", async () => {
    const queryLog: string[] = [];
    const rows = [
      {
        id: "campaign-1",
        user_id: "db-user-1",
        organization_id: null,
        name: "Spring Launch",
        description: "Launch",
        input_transcript: "Transcript",
        status: "draft",
        created_at: new Date("2026-01-01T00:00:00.000Z"),
        updated_at: new Date("2026-01-01T00:00:00.000Z"),
        clips_count: 2,
        posts_count: 3,
        ads_count: 1,
        carousels_count: 1,
        clip_preview_url: "https://cdn.example.com/clip.png",
        post_preview_url: "https://cdn.example.com/post.png",
        ad_preview_url: "https://cdn.example.com/ad.png",
        carousel_preview_url: "https://cdn.example.com/carousel.png",
      },
    ];
    const sqlTagMock = vi.fn((strings: TemplateStringsArray) => {
      const query = strings.join(" ").replace(/\s+/g, " ").trim();
      queryLog.push(query);
      return Promise.resolve(rows);
    });
    const sqlQueryMock = vi.fn((query: string) => {
      queryLog.push(query.replace(/\s+/g, " ").trim());
      return Promise.resolve(rows);
    });
    const sqlMock = Object.assign(sqlTagMock, {
      query: sqlQueryMock,
      transaction: vi.fn(),
    });

    vi.doMock("../../server/lib/db.js", () => ({
      getSql: () => sqlMock,
    }));
    vi.doMock("../../server/lib/user-resolver.js", () => ({
      resolveUserId: vi.fn().mockResolvedValue("db-user-1"),
    }));
    vi.doMock("../../server/lib/auth.js", () => ({
      resolveOrganizationContext: vi.fn(),
    }));
    vi.doMock("../../server/helpers/organization-context.js", () => ({
      hasPermission: vi.fn().mockReturnValue(true),
      PERMISSIONS: {
        CREATE_CAMPAIGN: "create_campaign",
        DELETE_CAMPAIGN: "delete_campaign",
      },
      PermissionDeniedError: class PermissionDeniedError extends Error {},
    }));
    vi.doMock("../../server/lib/logger.js", () => ({
      default: {
        info: vi.fn(),
        debug: vi.fn(),
        error: vi.fn(),
      },
    }));
    vi.doMock("@vercel/blob", () => ({
      del: vi.fn(),
    }));

    const { getCampaigns } = await import("../../server/services/campaigns-service.js");

    const result = await getCampaigns({
      user_id: "auth-user-1",
      limit: 25,
      offset: 0,
    });

    expect(result).toEqual(rows);

    const executedQuery = queryLog.at(-1) ?? "";
    expect(executedQuery).not.toContain("SELECT COUNT(*) FROM video_clip_scripts WHERE campaign_id = c.id");
    expect(executedQuery).not.toContain("SELECT COUNT(*) FROM posts WHERE campaign_id = c.id");
    expect(executedQuery).toMatch(/LEFT JOIN|WITH/i);
    expect(executedQuery).toContain("GROUP BY campaign_id");
  });
});
