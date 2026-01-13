/**
 * Jobs Store - Background jobs state management
 *
 * Replaces the Context-based useBackgroundJobs hook with Zustand.
 * Manages:
 * - Active generation jobs (flyer, video, image, etc.)
 * - Job status polling
 * - Scheduled post notifications
 * - Event subscriptions for job completion/failure
 *
 * Compatible with existing useBackgroundJobs interface for gradual migration.
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type {
  GenerationJob,
  GenerationJobConfig,
  ImageJobConfig,
  VideoJobConfig,
  DbScheduledPost,
} from '../services/apiClient';

// =============================================================================
// Types (matching existing useBackgroundJobs types)
// =============================================================================

export type JobType = 'flyer' | 'flyer_daily' | 'post' | 'ad' | 'clip' | 'image' | 'video';
export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface ActiveJob extends GenerationJob {
  localId?: string;
  context?: string;
}

export interface ScheduledPostNotification {
  post: DbScheduledPost;
  status: 'published' | 'failed';
  notifiedAt: Date;
}

type JobEventCallback = (job: ActiveJob) => void;
type ScheduledPostCallback = (post: DbScheduledPost) => void;

// =============================================================================
// Store State Interface
// =============================================================================

interface JobsState {
  // Jobs data
  jobs: ActiveJob[];
  scheduledPostNotifications: ScheduledPostNotification[];
  pendingScheduledPosts: DbScheduledPost[];

  // Loading state
  isLoading: boolean;

  // User context
  userId: string | null;
  organizationId: string | null;

  // Notified job IDs (persisted to avoid duplicate notifications)
  notifiedCompleteIds: string[];
  notifiedFailedIds: string[];
  notifiedPublishedIds: string[];
  notifiedScheduledFailedIds: string[];

  // Event listeners (not persisted)
  _completeListeners: Set<JobEventCallback>;
  _failedListeners: Set<JobEventCallback>;
  _publishedListeners: Set<ScheduledPostCallback>;
  _scheduledFailedListeners: Set<ScheduledPostCallback>;

  // Derived getters
  pendingJobs: () => ActiveJob[];
  completedJobs: () => ActiveJob[];
  failedJobs: () => ActiveJob[];

  // Actions
  setUserContext: (userId: string | null, organizationId?: string | null) => void;
  setJobs: (jobs: ActiveJob[]) => void;
  addJob: (job: ActiveJob) => void;
  updateJob: (jobId: string, updates: Partial<ActiveJob>) => void;
  removeJob: (jobId: string) => void;
  getJobByContext: (context: string) => ActiveJob | undefined;
  getJobById: (jobId: string) => ActiveJob | undefined;

  // Notification actions
  addScheduledPostNotification: (notification: ScheduledPostNotification) => void;
  clearScheduledPostNotification: (postId: string) => void;
  setPendingScheduledPosts: (posts: DbScheduledPost[]) => void;

  // Event subscription actions
  onJobComplete: (callback: JobEventCallback) => () => void;
  onJobFailed: (callback: JobEventCallback) => () => void;
  onScheduledPostPublished: (callback: ScheduledPostCallback) => () => void;
  onScheduledPostFailed: (callback: ScheduledPostCallback) => () => void;

  // Notification tracking
  markJobNotified: (jobId: string, type: 'completed' | 'failed') => void;
  markScheduledPostNotified: (postId: string, type: 'published' | 'failed') => void;
  isJobNotified: (jobId: string, type: 'completed' | 'failed') => boolean;
  isScheduledPostNotified: (postId: string, type: 'published' | 'failed') => boolean;

  // Emit events (internal)
  _emitJobComplete: (job: ActiveJob) => void;
  _emitJobFailed: (job: ActiveJob) => void;
  _emitScheduledPostPublished: (post: DbScheduledPost) => void;
  _emitScheduledPostFailed: (post: DbScheduledPost) => void;

  // Loading
  setIsLoading: (loading: boolean) => void;

  // Reset
  reset: () => void;
}

// =============================================================================
// Initial State
// =============================================================================

const initialState = {
  jobs: [],
  scheduledPostNotifications: [],
  pendingScheduledPosts: [],
  isLoading: false,
  userId: null,
  organizationId: null,
  notifiedCompleteIds: [],
  notifiedFailedIds: [],
  notifiedPublishedIds: [],
  notifiedScheduledFailedIds: [],
  _completeListeners: new Set<JobEventCallback>(),
  _failedListeners: new Set<JobEventCallback>(),
  _publishedListeners: new Set<ScheduledPostCallback>(),
  _scheduledFailedListeners: new Set<ScheduledPostCallback>(),
};

// =============================================================================
// Store
// =============================================================================

export const useJobsStore = create<JobsState>()(
  devtools(
    persist(
      (set, get) => ({
        ...initialState,

        // Derived state (computed on access)
        pendingJobs: () =>
          get().jobs.filter((j) => j.status === 'queued' || j.status === 'processing'),

        completedJobs: () =>
          get().jobs.filter((j) => j.status === 'completed'),

        failedJobs: () =>
          get().jobs.filter((j) => j.status === 'failed'),

        // User context
        setUserContext: (userId, organizationId = null) => {
          set({ userId, organizationId });
        },

        // Jobs management
        setJobs: (jobs) => {
          set({ jobs });
        },

        addJob: (job) => {
          set((state) => ({
            jobs: [job, ...state.jobs],
          }));
        },

        updateJob: (jobId, updates) => {
          set((state) => ({
            jobs: state.jobs.map((j) =>
              j.id === jobId || j.localId === jobId ? { ...j, ...updates } : j
            ),
          }));
        },

        removeJob: (jobId) => {
          set((state) => ({
            jobs: state.jobs.filter((j) => j.id !== jobId && j.localId !== jobId),
          }));
        },

        getJobByContext: (context) => {
          return get().jobs.find((j) => j.context === context);
        },

        getJobById: (jobId) => {
          return get().jobs.find((j) => j.id === jobId || j.localId === jobId);
        },

        // Scheduled post notifications
        addScheduledPostNotification: (notification) => {
          set((state) => ({
            scheduledPostNotifications: [notification, ...state.scheduledPostNotifications].slice(0, 10),
          }));
        },

        clearScheduledPostNotification: (postId) => {
          set((state) => ({
            scheduledPostNotifications: state.scheduledPostNotifications.filter(
              (n) => n.post.id !== postId
            ),
          }));
        },

        setPendingScheduledPosts: (posts) => {
          set({ pendingScheduledPosts: posts });
        },

        // Event subscriptions
        onJobComplete: (callback) => {
          get()._completeListeners.add(callback);
          return () => get()._completeListeners.delete(callback);
        },

        onJobFailed: (callback) => {
          get()._failedListeners.add(callback);
          return () => get()._failedListeners.delete(callback);
        },

        onScheduledPostPublished: (callback) => {
          get()._publishedListeners.add(callback);
          return () => get()._publishedListeners.delete(callback);
        },

        onScheduledPostFailed: (callback) => {
          get()._scheduledFailedListeners.add(callback);
          return () => get()._scheduledFailedListeners.delete(callback);
        },

        // Notification tracking
        markJobNotified: (jobId, type) => {
          set((state) => {
            if (type === 'completed') {
              const ids = [...state.notifiedCompleteIds, jobId].slice(-200);
              return { notifiedCompleteIds: ids };
            } else {
              const ids = [...state.notifiedFailedIds, jobId].slice(-100);
              return { notifiedFailedIds: ids };
            }
          });
        },

        markScheduledPostNotified: (postId, type) => {
          set((state) => {
            if (type === 'published') {
              const ids = [...state.notifiedPublishedIds, postId].slice(-100);
              return { notifiedPublishedIds: ids };
            } else {
              const ids = [...state.notifiedScheduledFailedIds, postId].slice(-50);
              return { notifiedScheduledFailedIds: ids };
            }
          });
        },

        isJobNotified: (jobId, type) => {
          const state = get();
          if (type === 'completed') {
            return state.notifiedCompleteIds.includes(jobId);
          }
          return state.notifiedFailedIds.includes(jobId);
        },

        isScheduledPostNotified: (postId, type) => {
          const state = get();
          if (type === 'published') {
            return state.notifiedPublishedIds.includes(postId);
          }
          return state.notifiedScheduledFailedIds.includes(postId);
        },

        // Emit events
        _emitJobComplete: (job) => {
          get()._completeListeners.forEach((listener) => listener(job));
        },

        _emitJobFailed: (job) => {
          get()._failedListeners.forEach((listener) => listener(job));
        },

        _emitScheduledPostPublished: (post) => {
          get()._publishedListeners.forEach((listener) => listener(post));
        },

        _emitScheduledPostFailed: (post) => {
          get()._scheduledFailedListeners.forEach((listener) => listener(post));
        },

        // Loading
        setIsLoading: (isLoading) => {
          set({ isLoading });
        },

        // Reset
        reset: () => {
          set({
            ...initialState,
            // Keep listeners as they may have active subscriptions
            _completeListeners: get()._completeListeners,
            _failedListeners: get()._failedListeners,
            _publishedListeners: get()._publishedListeners,
            _scheduledFailedListeners: get()._scheduledFailedListeners,
          });
        },
      }),
      {
        name: 'jobs-store',
        // Only persist notification tracking, not the actual jobs
        partialize: (state) => ({
          notifiedCompleteIds: state.notifiedCompleteIds,
          notifiedFailedIds: state.notifiedFailedIds,
          notifiedPublishedIds: state.notifiedPublishedIds,
          notifiedScheduledFailedIds: state.notifiedScheduledFailedIds,
        }),
      }
    ),
    { name: 'JobsStore' }
  )
);

// =============================================================================
// Selectors
// =============================================================================

export const selectJobs = (state: JobsState) => state.jobs;
export const selectPendingJobs = (state: JobsState) => state.pendingJobs();
export const selectCompletedJobs = (state: JobsState) => state.completedJobs();
export const selectFailedJobs = (state: JobsState) => state.failedJobs();
export const selectIsLoading = (state: JobsState) => state.isLoading;
export const selectScheduledPostNotifications = (state: JobsState) =>
  state.scheduledPostNotifications;

// =============================================================================
// Helper Hooks
// =============================================================================

/**
 * Hook for a specific generation context
 * Use this in components that manage a specific generation (e.g., a single flyer)
 */
export const useGenerationJobStore = (context: string) => {
  const job = useJobsStore((state) => state.getJobByContext(context));
  const onJobComplete = useJobsStore((state) => state.onJobComplete);

  return {
    job,
    isLoading: job?.status === 'queued' || job?.status === 'processing',
    isCompleted: job?.status === 'completed',
    isFailed: job?.status === 'failed',
    resultUrl: job?.result_url,
    galleryId: job?.result_gallery_id,
    error: job?.error_message,
    onJobComplete,
  };
};

/**
 * Hook to get job counts for UI indicators
 */
export const useJobCounts = () => {
  const jobs = useJobsStore((state) => state.jobs);

  return {
    total: jobs.length,
    pending: jobs.filter((j) => j.status === 'queued' || j.status === 'processing').length,
    completed: jobs.filter((j) => j.status === 'completed').length,
    failed: jobs.filter((j) => j.status === 'failed').length,
  };
};
