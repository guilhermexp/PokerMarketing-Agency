import { describe, expect, it } from "vitest";
import { useScheduledPostsStore } from "../scheduled-posts-store";

describe("useScheduledPostsStore", () => {
  it("atualiza publishingStates com valor direto e updater funcional", () => {
    useScheduledPostsStore.setState({ publishingStates: {} });

    useScheduledPostsStore.getState().setPublishingStates({
      post1: { isPublishing: true },
    } as never);
    useScheduledPostsStore.getState().setPublishingStates((current) => ({
      ...current,
      post2: { isPublishing: false },
    } as never));

    expect(useScheduledPostsStore.getState().publishingStates).toMatchObject({
      post1: { isPublishing: true },
      post2: { isPublishing: false },
    });
  });
});
