import { create } from "zustand";
import type { InstagramPublishState, ScheduledPost } from "@/types";

interface ScheduledPostsStore {
  scheduledPosts: ScheduledPost[];
  publishingStates: Record<string, InstagramPublishState>;
  setScheduledPosts: (scheduledPosts: ScheduledPost[]) => void;
  addScheduledPost: (scheduledPost: ScheduledPost) => void;
  updateScheduledPost: (postId: string, updates: Partial<ScheduledPost>) => void;
  removeScheduledPost: (postId: string) => void;
  setPublishingStates: (
    updater:
      | Record<string, InstagramPublishState>
      | ((
          current: Record<string, InstagramPublishState>,
        ) => Record<string, InstagramPublishState>),
  ) => void;
}

const sortPosts = (posts: ScheduledPost[]) =>
  [...posts].sort((a, b) => a.scheduledTimestamp - b.scheduledTimestamp);

export const useScheduledPostsStore = create<ScheduledPostsStore>((set) => ({
  scheduledPosts: [],
  publishingStates: {},
  setScheduledPosts: (scheduledPosts) =>
    set({ scheduledPosts: sortPosts(scheduledPosts) }),
  addScheduledPost: (scheduledPost) =>
    set((state) => ({
      scheduledPosts: sortPosts([scheduledPost, ...state.scheduledPosts]),
    })),
  updateScheduledPost: (postId, updates) =>
    set((state) => ({
      scheduledPosts: sortPosts(
        state.scheduledPosts.map((post) =>
          post.id === postId ? { ...post, ...updates } : post,
        ),
      ),
    })),
  removeScheduledPost: (postId) =>
    set((state) => ({
      scheduledPosts: state.scheduledPosts.filter((post) => post.id !== postId),
    })),
  setPublishingStates: (updater) =>
    set((state) => ({
      publishingStates:
        typeof updater === "function"
          ? updater(state.publishingStates)
          : updater,
    })),
}));
