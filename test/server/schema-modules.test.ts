import { describe, expect, it } from "vitest";
import {
  feedbackBodySchema,
} from "../../server/schemas/feedback-schemas.js";
import {
  generationCancelAllBodySchema,
  generationStatusQuerySchema,
} from "../../server/schemas/generation-jobs-schemas.js";
import {
  instagramAccountsQuerySchema,
  instagramConnectBodySchema,
  instagramUpdateBodySchema,
  instagramUpdateQuerySchema,
} from "../../server/schemas/instagram-schemas.js";
import {
  postsPatchBodySchema,
  postsPatchQuerySchema,
} from "../../server/schemas/posts-schemas.js";
import { rubeProxyBodySchema } from "../../server/schemas/rube-schemas.js";
import {
  scheduledPostCreateBodySchema,
  scheduledPostDeleteQuerySchema,
  scheduledPostsListQuerySchema,
  scheduledPostRetryBodySchema,
  scheduledPostUpdateBodySchema,
  scheduledPostUpdateQuerySchema,
} from "../../server/schemas/scheduled-posts-schemas.js";
import {
  tournamentDailyFlyerBodySchema,
  tournamentDailyFlyerQuerySchema,
  tournamentEventFlyerBodySchema,
  tournamentEventFlyerQuerySchema,
  tournamentsCreateBodySchema,
  tournamentsDeleteQuerySchema,
  tournamentsListQuerySchema,
  tournamentsQuerySchema,
} from "../../server/schemas/tournaments-schemas.js";
import {
  usersQuerySchema,
  usersUpsertBodySchema,
} from "../../server/schemas/users-schemas.js";

describe("schema modules coverage", () => {
  it("validates feedback payloads", () => {
    expect(
      feedbackBodySchema.parse({
        markdown: "feedback",
        pageUrl: "https://example.com",
        annotations: [{ id: "1", meta: { x: 1 } }],
      }),
    ).toMatchObject({ markdown: "feedback" });
  });

  it("validates generation jobs schemas", () => {
    expect(
      generationStatusQuerySchema.parse({
        userId: "user-1",
        limit: "5",
      }),
    ).toMatchObject({ userId: "user-1", limit: 5 });

    expect(() => generationStatusQuerySchema.parse({})).toThrow();
    expect(generationCancelAllBodySchema.parse({ userId: "user-1" })).toEqual({
      userId: "user-1",
    });
  });

  it("validates instagram schemas", () => {
    expect(
      instagramAccountsQuerySchema.parse({ user_id: "user-1" }),
    ).toMatchObject({ user_id: "user-1" });
    expect(() => instagramAccountsQuerySchema.parse({})).toThrow();
    expect(
      instagramConnectBodySchema.parse({
        user_id: "user-1",
        rube_token: "token",
      }),
    ).toMatchObject({ user_id: "user-1", rube_token: "token" });
    expect(instagramUpdateQuerySchema.parse({ id: "ig-1" })).toEqual({ id: "ig-1" });
    expect(instagramUpdateBodySchema.parse({ rube_token: "token" })).toEqual({
      rube_token: "token",
    });
  });

  it("validates post patch schemas", () => {
    expect(postsPatchQuerySchema.parse({ id: "post-1" })).toEqual({ id: "post-1" });
    expect(postsPatchBodySchema.parse({ image_url: "https://cdn.example.com/img.png" })).toEqual({
      image_url: "https://cdn.example.com/img.png",
    });
  });

  it("validates rube proxy schema", () => {
    expect(
      rubeProxyBodySchema.parse({
        instagram_account_id: "ig-1",
        user_id: "user-1",
        organization_id: "org-1",
      }),
    ).toMatchObject({ instagram_account_id: "ig-1" });
  });

  it("validates scheduled posts schemas", () => {
    expect(
      scheduledPostsListQuerySchema.parse({
        user_id: "user-1",
      }),
    ).toMatchObject({ user_id: "user-1" });

    expect(
      scheduledPostCreateBodySchema.parse({
        user_id: "user-1",
        image_url: "https://cdn.example.com/image.png",
        scheduled_date: "2026-03-18",
        scheduled_time: "10:00",
        scheduled_timestamp: "1710000000",
        platforms: "instagram",
      }).scheduled_timestamp,
    ).toBe(1710000000);

    expect(scheduledPostUpdateQuerySchema.parse({ id: "sp-1" })).toEqual({ id: "sp-1" });
    expect(
      scheduledPostUpdateBodySchema.parse({
        status: "scheduled",
        publish_attempts: "2",
      }),
    ).toMatchObject({ status: "scheduled", publish_attempts: 2 });
    expect(
      scheduledPostDeleteQuerySchema.parse({ id: "sp-1", user_id: "user-1" }),
    ).toEqual({ id: "sp-1", user_id: "user-1" });
    expect(
      scheduledPostRetryBodySchema.parse({ id: "sp-1", user_id: "user-1" }),
    ).toEqual({ id: "sp-1", user_id: "user-1" });
  });

  it("validates tournament schemas", () => {
    expect(
      tournamentsListQuerySchema.parse({ user_id: "user-1" }),
    ).toMatchObject({ user_id: "user-1" });
    expect(
      tournamentsQuerySchema.parse({ user_id: "user-1", week_schedule_id: "week-1" }),
    ).toMatchObject({ week_schedule_id: "week-1" });
    expect(
      tournamentsCreateBodySchema.parse({
        user_id: "user-1",
        start_date: "2026-03-18",
        end_date: "2026-03-25",
        events: [{ day: "monday", name: "Main Event", times: { "-3": "19:00" } }],
      }).events,
    ).toHaveLength(1);
    expect(
      tournamentsDeleteQuerySchema.parse({ id: "schedule-1", user_id: "user-1" }),
    ).toEqual({ id: "schedule-1", user_id: "user-1" });
    expect(tournamentEventFlyerQuerySchema.parse({ event_id: "event-1" })).toEqual({
      event_id: "event-1",
    });
    expect(
      tournamentEventFlyerBodySchema.parse({ action: "set", flyer_urls: ["https://cdn.example.com/flyer.png"] }),
    ).toMatchObject({ action: "set" });
    expect(
      tournamentDailyFlyerQuerySchema.parse({ schedule_id: "schedule-1", period: "night" }),
    ).toMatchObject({ schedule_id: "schedule-1" });
    expect(
      tournamentDailyFlyerBodySchema.parse({ action: "add", flyer_url: "https://cdn.example.com/flyer.png" }),
    ).toMatchObject({ action: "add" });
  });

  it("validates user schemas", () => {
    expect(usersQuerySchema.parse({ email: "user@example.com" })).toEqual({
      email: "user@example.com",
    });
    expect(() => usersQuerySchema.parse({})).toThrow();
    expect(
      usersUpsertBodySchema.parse({
        email: "user@example.com",
        name: "User",
      }),
    ).toMatchObject({ name: "User" });
  });
});
