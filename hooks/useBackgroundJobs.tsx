/**
 * Background Jobs Hook & Provider
 * Manages background generation jobs across the entire app
 * Jobs persist in database and continue even when user navigates away
 * Also monitors scheduled posts for publication status
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import {
  queueGenerationJob,
  getGenerationJobs,
  getGenerationJobStatus,
  getScheduledPosts,
  type GenerationJob,
  type GenerationJobConfig,
  type ImageJobConfig,
  type VideoJobConfig,
  type DbScheduledPost,
} from "../services/apiClient";

// Job with additional local metadata
export interface ActiveJob extends GenerationJob {
  localId?: string; // For optimistic UI before server returns ID
  context?: string; // e.g., "flyer-tournament-123" or "campaign-456-post-0"
}

// Scheduled post with notification metadata
export interface ScheduledPostNotification {
  post: DbScheduledPost;
  status: "published" | "failed";
  notifiedAt: Date;
}

interface BackgroundJobsContextValue {
  // Active jobs state
  jobs: ActiveJob[];
  pendingJobs: ActiveJob[]; // queued or processing
  completedJobs: ActiveJob[];
  failedJobs: ActiveJob[];

  // Scheduled posts notifications
  scheduledPostNotifications: ScheduledPostNotification[];
  pendingScheduledPosts: DbScheduledPost[]; // Posts that should publish soon
  clearScheduledPostNotification: (postId: string) => void;

  // Actions
  queueJob: (
    userId: string,
    jobType: "flyer" | "flyer_daily" | "post" | "ad" | "clip" | "image" | "video",
    prompt: string,
    config: GenerationJobConfig | ImageJobConfig | VideoJobConfig,
    context?: string,
  ) => Promise<string>; // Returns jobId

  // Check job status
  getJobByContext: (context: string) => ActiveJob | undefined;
  getJobById: (jobId: string) => ActiveJob | undefined;

  // Events
  onJobComplete: (callback: (job: ActiveJob) => void) => () => void;
  onJobFailed: (callback: (job: ActiveJob) => void) => () => void;
  onScheduledPostPublished: (
    callback: (post: DbScheduledPost) => void,
  ) => () => void;
  onScheduledPostFailed: (
    callback: (post: DbScheduledPost) => void,
  ) => () => void;

  // Loading state
  isLoading: boolean;
  refreshJobs: () => Promise<void>;
}

const BackgroundJobsContext = createContext<BackgroundJobsContextValue | null>(
  null,
);

export const useBackgroundJobs = () => {
  const context = useContext(BackgroundJobsContext);
  if (!context) {
    throw new Error(
      "useBackgroundJobs must be used within BackgroundJobsProvider",
    );
  }
  return context;
};

interface BackgroundJobsProviderProps {
  userId: string | null;
  organizationId?: string | null;
  children: React.ReactNode;
}

export const BackgroundJobsProvider: React.FC<BackgroundJobsProviderProps> = ({
  userId,
  organizationId,
  children,
}) => {
  const [jobs, setJobs] = useState<ActiveJob[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Scheduled posts state
  const [scheduledPostNotifications, setScheduledPostNotifications] = useState<
    ScheduledPostNotification[]
  >([]);
  const [pendingScheduledPosts, setPendingScheduledPosts] = useState<
    DbScheduledPost[]
  >([]);

  // Event listeners
  const completeListeners = useRef<Set<(job: ActiveJob) => void>>(new Set());
  const failListeners = useRef<Set<(job: ActiveJob) => void>>(new Set());
  const scheduledPublishedListeners = useRef<
    Set<(post: DbScheduledPost) => void>
  >(new Set());
  const scheduledFailedListeners = useRef<Set<(post: DbScheduledPost) => void>>(
    new Set(),
  );

  // Track which jobs/posts we've already notified about (persisted to localStorage)
  const notifiedComplete = useRef<Set<string>>(new Set());
  const notifiedFailed = useRef<Set<string>>(new Set());
  const notifiedScheduledPublished = useRef<Set<string>>(new Set());
  const notifiedScheduledFailed = useRef<Set<string>>(new Set());
  const notifiedLoadedRef = useRef(false);
  const NOTIFIED_STORAGE_KEY = "backgroundJobsNotified";
  const SCHEDULED_NOTIFIED_STORAGE_KEY = "scheduledPostsNotified";

  // Load notified jobs from localStorage on mount (synchronously to avoid race)
  if (typeof window !== "undefined" && !notifiedLoadedRef.current) {
    notifiedLoadedRef.current = true;
    try {
      const stored = localStorage.getItem(NOTIFIED_STORAGE_KEY);
      if (stored) {
        const { completed, failed } = JSON.parse(stored);
        if (Array.isArray(completed))
          notifiedComplete.current = new Set(completed);
        if (Array.isArray(failed)) notifiedFailed.current = new Set(failed);
      }
      // Load scheduled posts notifications
      const scheduledStored = localStorage.getItem(
        SCHEDULED_NOTIFIED_STORAGE_KEY,
      );
      if (scheduledStored) {
        const { published, failed: scheduledFailed } =
          JSON.parse(scheduledStored);
        if (Array.isArray(published))
          notifiedScheduledPublished.current = new Set(published);
        if (Array.isArray(scheduledFailed))
          notifiedScheduledFailed.current = new Set(scheduledFailed);
      }
    } catch (e) {
      console.warn("[BackgroundJobs] Failed to load notified state:", e);
    }
  }

  // Derived state
  const pendingJobs = jobs.filter(
    (j) => j.status === "queued" || j.status === "processing",
  );
  const completedJobs = jobs.filter((j) => j.status === "completed");
  const failedJobs = jobs.filter((j) => j.status === "failed");

  // Load jobs from server
  const refreshJobs = useCallback(async () => {
    if (!userId) return;

    try {
      const result = await getGenerationJobs(userId, {
        limit: 100,
        organizationId: organizationId || undefined,
      });
      const serverJobs = result.jobs as ActiveJob[];

      setJobs((prev) => {
        // Merge with local optimistic jobs
        const localOnlyJobs = prev.filter(
          (j) => j.localId && !serverJobs.find((sj) => sj.id === j.id),
        );
        return [...serverJobs, ...localOnlyJobs];
      });

      // Check for newly completed/failed jobs and emit events
      let hasNewNotifications = false;
      serverJobs.forEach((job) => {
        if (
          job.status === "completed" &&
          !notifiedComplete.current.has(job.id)
        ) {
          notifiedComplete.current.add(job.id);
          hasNewNotifications = true;
          completeListeners.current.forEach((listener) => listener(job));
        }
        if (job.status === "failed" && !notifiedFailed.current.has(job.id)) {
          notifiedFailed.current.add(job.id);
          hasNewNotifications = true;
          failListeners.current.forEach((listener) => listener(job));
        }
      });

      // Persist notified state to localStorage
      if (hasNewNotifications && typeof window !== "undefined") {
        try {
          localStorage.setItem(
            NOTIFIED_STORAGE_KEY,
            JSON.stringify({
              completed: Array.from(notifiedComplete.current).slice(-200), // Keep last 200
              failed: Array.from(notifiedFailed.current).slice(-100),
            }),
          );
        } catch (e) {
          console.warn("[BackgroundJobs] Failed to persist notified state:", e);
        }
      }
    } catch (error) {
      console.error("[BackgroundJobs] Failed to refresh jobs:", error);
    }
  }, [userId, organizationId]);

  const getNextScheduledDelay = (posts: DbScheduledPost[]): number => {
    const now = Date.now();
    const upcoming = posts
      .filter(
        (post) =>
          (post.status === "scheduled" || post.status === "publishing") &&
          Number(post.scheduled_timestamp) > now,
      )
      .map((post) => Number(post.scheduled_timestamp));

    if (upcoming.length === 0) return 120000;

    const nextTimestamp = Math.min(...upcoming);
    const rawDelay = nextTimestamp - now + 5000;
    const minDelay = 15000;
    const maxDelay = 10 * 60 * 1000;
    return Math.min(Math.max(rawDelay, minDelay), maxDelay);
  };

  // Check scheduled posts for status changes
  const refreshScheduledPosts = useCallback(async (): Promise<number> => {
    if (!userId) return;

    try {
      const posts = await getScheduledPosts(
        userId,
        organizationId || undefined,
      );

      // Find posts that should have been published (scheduled_timestamp in the past)
      const now = Date.now();
      const duePosts = posts.filter(
        (p) =>
          Number(p.scheduled_timestamp) <= now &&
          (p.status === "scheduled" || p.status === "publishing"),
      );
      setPendingScheduledPosts(duePosts);

      // Check for newly published/failed posts
      let hasNewNotifications = false;
      const newNotifications: ScheduledPostNotification[] = [];

      posts.forEach((post) => {
        if (
          post.status === "published" &&
          !notifiedScheduledPublished.current.has(post.id)
        ) {
          // Only notify if it was recently published (within last 24 hours)
          const publishedAt = post.published_at
            ? new Date(post.published_at).getTime()
            : 0;
          const hoursSincePublished = (now - publishedAt) / (1000 * 60 * 60);
          if (hoursSincePublished < 24) {
            notifiedScheduledPublished.current.add(post.id);
            hasNewNotifications = true;
            newNotifications.push({
              post,
              status: "published",
              notifiedAt: new Date(),
            });
            scheduledPublishedListeners.current.forEach((listener) =>
              listener(post),
            );
          }
        }
        if (
          post.status === "failed" &&
          !notifiedScheduledFailed.current.has(post.id)
        ) {
          notifiedScheduledFailed.current.add(post.id);
          hasNewNotifications = true;
          newNotifications.push({
            post,
            status: "failed",
            notifiedAt: new Date(),
          });
          scheduledFailedListeners.current.forEach((listener) =>
            listener(post),
          );
        }
      });

      // Add new notifications to state
      if (newNotifications.length > 0) {
        setScheduledPostNotifications((prev) =>
          [...newNotifications, ...prev].slice(0, 10),
        );
      }

      // Persist notified state to localStorage
      if (hasNewNotifications && typeof window !== "undefined") {
        try {
          localStorage.setItem(
            SCHEDULED_NOTIFIED_STORAGE_KEY,
            JSON.stringify({
              published: Array.from(notifiedScheduledPublished.current).slice(
                -100,
              ),
              failed: Array.from(notifiedScheduledFailed.current).slice(-50),
            }),
          );
        } catch (e) {
          console.warn(
            "[BackgroundJobs] Failed to persist scheduled posts notified state:",
            e,
          );
        }
      }
      return getNextScheduledDelay(posts);
    } catch (error) {
      console.error(
        "[BackgroundJobs] Failed to refresh scheduled posts:",
        error,
      );
      return 120000;
    }
  }, [userId, organizationId]);

  // Clear a scheduled post notification
  const clearScheduledPostNotification = useCallback((postId: string) => {
    setScheduledPostNotifications((prev) =>
      prev.filter((n) => n.post.id !== postId),
    );
  }, []);

  // Ref to track if we've done initial load
  const hasLoadedRef = useRef(false);
  const refreshJobsRef = useRef(refreshJobs);
  refreshJobsRef.current = refreshJobs;
  const refreshScheduledPostsRef = useRef(refreshScheduledPosts);
  refreshScheduledPostsRef.current = refreshScheduledPosts;

  // Initial load - only once per userId
  useEffect(() => {
    if (userId && !hasLoadedRef.current) {
      hasLoadedRef.current = true;
      setIsLoading(true);
      Promise.all([
        refreshJobsRef.current(),
        refreshScheduledPostsRef.current(),
      ]).finally(() => setIsLoading(false));
    } else if (!userId) {
      hasLoadedRef.current = false;
      setJobs([]);
      setPendingScheduledPosts([]);
      setScheduledPostNotifications([]);
    }
  }, [userId]);

  // Auto-polling when there are pending jobs
  useEffect(() => {
    // Only poll if there are pending jobs
    if (pendingJobs.length === 0) return;

    console.log(
      `[BackgroundJobs] Starting auto-poll (${pendingJobs.length} pending jobs)`,
    );

    const pollInterval = setInterval(() => {
      refreshJobsRef.current();
    }, 3000); // Poll every 3 seconds

    return () => {
      console.log("[BackgroundJobs] Stopping auto-poll");
      clearInterval(pollInterval);
    };
  }, [pendingJobs.length > 0]); // Only re-run when pending state changes

  // Scheduled posts polling aligned to the next scheduled time
  useEffect(() => {
    if (!userId) return;

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const scheduleNext = async () => {
      if (cancelled) return;
      if (
        typeof document !== "undefined" &&
        document.visibilityState !== "visible"
      ) {
        timeoutId = setTimeout(scheduleNext, 120000);
        return;
      }

      const delay = await refreshScheduledPostsRef.current();
      if (cancelled) return;
      console.log(
        `[BackgroundJobs] Next scheduled posts check in ${Math.round(delay / 1000)}s`,
      );
      timeoutId = setTimeout(scheduleNext, delay);
    };

    console.log("[BackgroundJobs] Starting scheduled posts timer");
    scheduleNext();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      console.log("[BackgroundJobs] Stopping scheduled posts timer");
    };
  }, [userId, organizationId]);

  // Queue a new job
  const queueJob = useCallback(
    async (
      userId: string,
      jobType: "flyer" | "flyer_daily" | "post" | "ad" | "clip" | "image" | "video",
      prompt: string,
      config: GenerationJobConfig | ImageJobConfig | VideoJobConfig,
      context?: string,
    ): Promise<string> => {
      // Create optimistic local job
      const localId = `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const optimisticJob: ActiveJob = {
        id: localId,
        user_id: userId,
        job_type: jobType,
        status: "queued",
        progress: 0,
        result_url: null,
        result_gallery_id: null,
        error_message: null,
        created_at: new Date().toISOString(),
        started_at: null,
        completed_at: null,
        attempts: 0,
        localId,
        context,
      };

      // Add to state immediately for optimistic UI
      setJobs((prev) => [optimisticJob, ...prev]);

      try {
        // Queue on server (pass context and organizationId to persist in database)
        const result = await queueGenerationJob(
          userId,
          jobType,
          prompt,
          config,
          context,
          organizationId,
        );

        // Update with real job ID
        setJobs((prev) =>
          prev.map((j) =>
            j.localId === localId
              ? { ...j, id: result.jobId, localId: undefined }
              : j,
          ),
        );

        return result.jobId;
      } catch (error) {
        // Remove optimistic job on error
        setJobs((prev) => prev.filter((j) => j.localId !== localId));
        throw error;
      }
    },
    [organizationId],
  );

  // Get job by context
  const getJobByContext = useCallback(
    (context: string) => {
      return jobs.find((j) => j.context === context);
    },
    [jobs],
  );

  // Get job by ID
  const getJobById = useCallback(
    (jobId: string) => {
      return jobs.find((j) => j.id === jobId);
    },
    [jobs],
  );

  // Event subscription
  const onJobComplete = useCallback((callback: (job: ActiveJob) => void) => {
    completeListeners.current.add(callback);
    return () => completeListeners.current.delete(callback);
  }, []);

  const onJobFailed = useCallback((callback: (job: ActiveJob) => void) => {
    failListeners.current.add(callback);
    return () => failListeners.current.delete(callback);
  }, []);

  const onScheduledPostPublished = useCallback(
    (callback: (post: DbScheduledPost) => void) => {
      scheduledPublishedListeners.current.add(callback);
      return () => scheduledPublishedListeners.current.delete(callback);
    },
    [],
  );

  const onScheduledPostFailed = useCallback(
    (callback: (post: DbScheduledPost) => void) => {
      scheduledFailedListeners.current.add(callback);
      return () => scheduledFailedListeners.current.delete(callback);
    },
    [],
  );

  const value: BackgroundJobsContextValue = {
    jobs,
    pendingJobs,
    completedJobs,
    failedJobs,
    scheduledPostNotifications,
    pendingScheduledPosts,
    clearScheduledPostNotification,
    queueJob,
    getJobByContext,
    getJobById,
    onJobComplete,
    onJobFailed,
    onScheduledPostPublished,
    onScheduledPostFailed,
    isLoading,
    refreshJobs,
  };

  return (
    <BackgroundJobsContext.Provider value={value}>
      {children}
    </BackgroundJobsContext.Provider>
  );
};

/**
 * Hook for a specific generation context
 * Use this in components that manage a specific generation (e.g., a single flyer)
 */
export const useGenerationJob = (context: string) => {
  const { jobs, getJobByContext, onJobComplete, onJobFailed } =
    useBackgroundJobs();
  const [completedResult, setCompletedResult] = useState<ActiveJob | null>(
    null,
  );

  const job = getJobByContext(context);

  // Listen for completion
  useEffect(() => {
    const unsubComplete = onJobComplete((completedJob) => {
      if (completedJob.context === context) {
        setCompletedResult(completedJob);
      }
    });

    return unsubComplete;
  }, [context, onJobComplete]);

  return {
    job,
    isLoading: job?.status === "queued" || job?.status === "processing",
    isCompleted: job?.status === "completed",
    isFailed: job?.status === "failed",
    resultUrl: job?.result_url || completedResult?.result_url,
    galleryId: job?.result_gallery_id || completedResult?.result_gallery_id,
    error: job?.error_message,
  };
};
