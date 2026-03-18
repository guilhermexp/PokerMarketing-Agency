import { beforeEach, describe, expect, it, vi } from "vitest";

describe("gallery service", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("keeps the listGallery output shape while filtering by organization and source", async () => {
    const queryLog: string[] = [];
    const rows = [
      {
        id: "img-1",
        user_id: "db-user-1",
        organization_id: "org-1",
        source: "generated",
        src_url: "https://cdn.example.com/image.webp",
        thumbnail_url: "https://cdn.example.com/thumb.webp",
        created_at: new Date("2026-01-01T00:00:00.000Z"),
        updated_at: new Date("2026-01-01T00:00:00.000Z"),
        deleted_at: null,
        is_style_reference: false,
        style_reference_name: null,
        week_schedule_id: null,
        daily_flyer_period: null,
      },
    ];
    const sqlTagMock = vi.fn((strings: TemplateStringsArray) => {
      const query = strings.join(" ").replace(/\s+/g, " ").trim();
      queryLog.push(query);

      return Promise.resolve(rows);
    });
    const sqlMock = Object.assign(sqlTagMock, {
      query: vi.fn((query: string) => {
        queryLog.push(query.replace(/\s+/g, " ").trim());
        return Promise.resolve(rows);
      }),
    });

    vi.doMock("../../server/lib/db.js", () => ({
      getSql: () => sqlMock,
    }));
    vi.doMock("../../server/lib/user-resolver.js", () => ({
      resolveUserId: vi.fn().mockResolvedValue("db-user-1"),
    }));
    vi.doMock("../../server/lib/auth.js", () => ({
      resolveOrganizationContext: vi.fn().mockResolvedValue({
        organizationId: "org-1",
        isPersonal: false,
        orgRole: "org:admin",
        hasPermission: () => true,
      }),
    }));

    const { listGallery } = await import("../../server/services/gallery-service.js");

    const result = await listGallery({
      user_id: "auth-user-1",
      organization_id: "org-1",
      source: "generated",
      include_src: false,
      limit: 25,
      offset: 0,
    });

    expect(result).toEqual([
      expect.objectContaining({
        id: "img-1",
        organization_id: "org-1",
        source: "generated",
        src_url: "https://cdn.example.com/image.webp",
      }),
    ]);
    expect(queryLog.at(-1)).toContain("deleted_at IS NULL");
    expect(queryLog.at(-1)).toContain("organization_id =");
    expect(queryLog.at(-1)).toContain("LIMIT");
    expect(queryLog.at(-1)).toContain("OFFSET");
  });
});
