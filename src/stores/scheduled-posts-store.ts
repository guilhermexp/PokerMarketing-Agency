import { create } from "zustand";
import type { InstagramPublishState } from "@/types";

interface ScheduledPostsStore {
  publishingStates: Record<string, InstagramPublishState>;
  setPublishingStates: (
    updater:
      | Record<string, InstagramPublishState>
      | ((
          current: Record<string, InstagramPublishState>,
        ) => Record<string, InstagramPublishState>),
  ) => void;
}

export const useScheduledPostsStore = create<ScheduledPostsStore>((set) => ({
  publishingStates: {},
  setPublishingStates: (updater) =>
    set((state) => ({
      publishingStates:
        typeof updater === "function"
          ? updater(state.publishingStates)
          : updater,
    })),
}));
