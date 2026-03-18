import { describe, expect, it } from "vitest";

describe("apiClient barrel", () => {
  it("re-exports the split domain APIs with stable entrypoints", async () => {
    const [
      barrel,
      userApi,
      brandProfileApi,
      galleryApi,
      scheduledPostsApi,
      campaignApi,
      tournamentApi,
      uploadApi,
      assistantApi,
    ] = await Promise.all([
      import("../apiClient"),
      import("../api-client/userApi"),
      import("../api-client/brandProfileApi"),
      import("../api-client/galleryApi"),
      import("../api-client/scheduledPostsApi"),
      import("../api-client/campaignApi"),
      import("../api-client/tournamentApi"),
      import("../api-client/uploadApi"),
      import("../api-client/assistantApi"),
    ]);

    expect(barrel.getOrCreateUser).toBe(userApi.getOrCreateUser);
    expect(barrel.getBrandProfile).toBe(brandProfileApi.getBrandProfile);
    expect(barrel.getGalleryImages).toBe(galleryApi.getGalleryImages);
    expect(barrel.getScheduledPosts).toBe(scheduledPostsApi.getScheduledPosts);
    expect(barrel.getCampaigns).toBe(campaignApi.getCampaigns);
    expect(barrel.getTournamentData).toBe(tournamentApi.getTournamentData);
    expect(barrel.uploadToBlob).toBe(uploadApi.uploadToBlob);
    expect(barrel.generateAiImage).toBe(assistantApi.generateAiImage);
    expect(barrel.generateVideo).toBe(assistantApi.generateVideo);
  });
});
