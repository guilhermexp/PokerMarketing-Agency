/**
 * Background Jobs Hook & Provider
 * Manages background generation jobs across the entire app
 * Jobs persist in database and continue even when user navigates away
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  queueGenerationJob,
  getGenerationJobs,
  getGenerationJobStatus,
  type GenerationJob,
  type GenerationJobConfig
} from '../services/apiClient';

// Job with additional local metadata
export interface ActiveJob extends GenerationJob {
  localId?: string; // For optimistic UI before server returns ID
  context?: string; // e.g., "flyer-tournament-123" or "campaign-456-post-0"
}

interface BackgroundJobsContextValue {
  // Active jobs state
  jobs: ActiveJob[];
  pendingJobs: ActiveJob[]; // queued or processing
  completedJobs: ActiveJob[];
  failedJobs: ActiveJob[];

  // Actions
  queueJob: (
    userId: string,
    jobType: 'flyer' | 'flyer_daily' | 'post' | 'ad' | 'clip',
    prompt: string,
    config: GenerationJobConfig,
    context?: string
  ) => Promise<string>; // Returns jobId

  // Check job status
  getJobByContext: (context: string) => ActiveJob | undefined;
  getJobById: (jobId: string) => ActiveJob | undefined;

  // Events
  onJobComplete: (callback: (job: ActiveJob) => void) => () => void;
  onJobFailed: (callback: (job: ActiveJob) => void) => () => void;

  // Loading state
  isLoading: boolean;
  refreshJobs: () => Promise<void>;
}

const BackgroundJobsContext = createContext<BackgroundJobsContextValue | null>(null);

export const useBackgroundJobs = () => {
  const context = useContext(BackgroundJobsContext);
  if (!context) {
    throw new Error('useBackgroundJobs must be used within BackgroundJobsProvider');
  }
  return context;
};

interface BackgroundJobsProviderProps {
  userId: string | null;
  children: React.ReactNode;
}

export const BackgroundJobsProvider: React.FC<BackgroundJobsProviderProps> = ({
  userId,
  children,
}) => {
  const [jobs, setJobs] = useState<ActiveJob[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Event listeners
  const completeListeners = useRef<Set<(job: ActiveJob) => void>>(new Set());
  const failListeners = useRef<Set<(job: ActiveJob) => void>>(new Set());

  // Track which jobs we've already notified about
  const notifiedComplete = useRef<Set<string>>(new Set());
  const notifiedFailed = useRef<Set<string>>(new Set());

  // Derived state
  const pendingJobs = jobs.filter(j => j.status === 'queued' || j.status === 'processing');
  const completedJobs = jobs.filter(j => j.status === 'completed');
  const failedJobs = jobs.filter(j => j.status === 'failed');

  // Load jobs from server
  const refreshJobs = useCallback(async () => {
    if (!userId) return;

    try {
      const result = await getGenerationJobs(userId, { limit: 100 });
      const serverJobs = result.jobs as ActiveJob[];

      setJobs(prev => {
        // Merge with local optimistic jobs
        const localOnlyJobs = prev.filter(j => j.localId && !serverJobs.find(sj => sj.id === j.id));
        return [...serverJobs, ...localOnlyJobs];
      });

      // Check for newly completed/failed jobs and emit events
      serverJobs.forEach(job => {
        if (job.status === 'completed' && !notifiedComplete.current.has(job.id)) {
          notifiedComplete.current.add(job.id);
          completeListeners.current.forEach(listener => listener(job));
        }
        if (job.status === 'failed' && !notifiedFailed.current.has(job.id)) {
          notifiedFailed.current.add(job.id);
          failListeners.current.forEach(listener => listener(job));
        }
      });
    } catch (error) {
      console.error('[BackgroundJobs] Failed to refresh jobs:', error);
    }
  }, [userId]);

  // Ref to track if we've done initial load
  const hasLoadedRef = useRef(false);
  const refreshJobsRef = useRef(refreshJobs);
  refreshJobsRef.current = refreshJobs;

  // Initial load - only once per userId
  useEffect(() => {
    if (userId && !hasLoadedRef.current) {
      hasLoadedRef.current = true;
      setIsLoading(true);
      refreshJobsRef.current().finally(() => setIsLoading(false));
    } else if (!userId) {
      hasLoadedRef.current = false;
      setJobs([]);
    }
  }, [userId]);

  // Auto-polling when there are pending jobs
  useEffect(() => {
    // Only poll if there are pending jobs
    if (pendingJobs.length === 0) return;

    console.log(`[BackgroundJobs] Starting auto-poll (${pendingJobs.length} pending jobs)`);

    const pollInterval = setInterval(() => {
      refreshJobsRef.current();
    }, 3000); // Poll every 3 seconds

    return () => {
      console.log('[BackgroundJobs] Stopping auto-poll');
      clearInterval(pollInterval);
    };
  }, [pendingJobs.length > 0]); // Only re-run when pending state changes

  // Queue a new job
  const queueJob = useCallback(async (
    userId: string,
    jobType: 'flyer' | 'flyer_daily' | 'post' | 'ad' | 'clip',
    prompt: string,
    config: GenerationJobConfig,
    context?: string
  ): Promise<string> => {
    // Create optimistic local job
    const localId = `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const optimisticJob: ActiveJob = {
      id: localId,
      user_id: userId,
      job_type: jobType,
      status: 'queued',
      progress: 0,
      result_url: null,
      result_gallery_id: null,
      error_message: null,
      created_at: new Date().toISOString(),
      started_at: null,
      completed_at: null,
      attempts: 0,
      localId,
      context
    };

    // Add to state immediately for optimistic UI
    setJobs(prev => [optimisticJob, ...prev]);

    try {
      // Queue on server (pass context to persist in database)
      const result = await queueGenerationJob(userId, jobType, prompt, config, context);

      // Update with real job ID
      setJobs(prev => prev.map(j =>
        j.localId === localId
          ? { ...j, id: result.jobId, localId: undefined }
          : j
      ));

      return result.jobId;
    } catch (error) {
      // Remove optimistic job on error
      setJobs(prev => prev.filter(j => j.localId !== localId));
      throw error;
    }
  }, []);

  // Get job by context
  const getJobByContext = useCallback((context: string) => {
    return jobs.find(j => j.context === context);
  }, [jobs]);

  // Get job by ID
  const getJobById = useCallback((jobId: string) => {
    return jobs.find(j => j.id === jobId);
  }, [jobs]);

  // Event subscription
  const onJobComplete = useCallback((callback: (job: ActiveJob) => void) => {
    completeListeners.current.add(callback);
    return () => completeListeners.current.delete(callback);
  }, []);

  const onJobFailed = useCallback((callback: (job: ActiveJob) => void) => {
    failListeners.current.add(callback);
    return () => failListeners.current.delete(callback);
  }, []);

  const value: BackgroundJobsContextValue = {
    jobs,
    pendingJobs,
    completedJobs,
    failedJobs,
    queueJob,
    getJobByContext,
    getJobById,
    onJobComplete,
    onJobFailed,
    isLoading,
    refreshJobs
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
  const { jobs, getJobByContext, onJobComplete, onJobFailed } = useBackgroundJobs();
  const [completedResult, setCompletedResult] = useState<ActiveJob | null>(null);

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
    isLoading: job?.status === 'queued' || job?.status === 'processing',
    isCompleted: job?.status === 'completed',
    isFailed: job?.status === 'failed',
    resultUrl: job?.result_url || completedResult?.result_url,
    galleryId: job?.result_gallery_id || completedResult?.result_gallery_id,
    error: job?.error_message
  };
};
