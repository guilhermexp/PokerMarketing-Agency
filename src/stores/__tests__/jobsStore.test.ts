import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useJobsStore, useJobCounts, type ActiveJob } from '../jobsStore';
import { renderHook, act } from '@testing-library/react';

// Mock job factory
const createMockJob = (overrides: Partial<ActiveJob> = {}): ActiveJob => ({
  id: `job-${Math.random().toString(36).substr(2, 9)}`,
  user_id: 'user-123',
  job_type: 'flyer',
  status: 'queued',
  progress: 0,
  result_url: null,
  result_gallery_id: null,
  error_message: null,
  created_at: new Date().toISOString(),
  started_at: null,
  completed_at: null,
  attempts: 0,
  ...overrides,
});

describe('jobsStore', () => {
  // Reset store before each test
  beforeEach(() => {
    useJobsStore.setState({
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
    });
  });

  describe('Jobs Management', () => {
    it('should add a job', () => {
      const job = createMockJob({ id: 'job-1' });

      useJobsStore.getState().addJob(job);

      const state = useJobsStore.getState();
      expect(state.jobs).toHaveLength(1);
      expect(state.jobs[0].id).toBe('job-1');
    });

    it('should set multiple jobs', () => {
      const jobs = [
        createMockJob({ id: 'job-1' }),
        createMockJob({ id: 'job-2' }),
        createMockJob({ id: 'job-3' }),
      ];

      useJobsStore.getState().setJobs(jobs);

      expect(useJobsStore.getState().jobs).toHaveLength(3);
    });

    it('should update a job by id', () => {
      useJobsStore.setState({
        jobs: [
          createMockJob({ id: 'job-1', status: 'queued', progress: 0 }),
        ],
      });

      useJobsStore.getState().updateJob('job-1', {
        status: 'processing',
        progress: 50,
      });

      const job = useJobsStore.getState().jobs[0];
      expect(job.status).toBe('processing');
      expect(job.progress).toBe(50);
    });

    it('should update a job by localId', () => {
      useJobsStore.setState({
        jobs: [
          createMockJob({ id: 'job-1', localId: 'local-123', status: 'queued' }),
        ],
      });

      useJobsStore.getState().updateJob('local-123', {
        id: 'server-job-id',
        localId: undefined,
      });

      const job = useJobsStore.getState().jobs[0];
      expect(job.id).toBe('server-job-id');
      expect(job.localId).toBeUndefined();
    });

    it('should remove a job', () => {
      useJobsStore.setState({
        jobs: [
          createMockJob({ id: 'job-1' }),
          createMockJob({ id: 'job-2' }),
        ],
      });

      useJobsStore.getState().removeJob('job-1');

      const jobs = useJobsStore.getState().jobs;
      expect(jobs).toHaveLength(1);
      expect(jobs[0].id).toBe('job-2');
    });

    it('should get job by context', () => {
      useJobsStore.setState({
        jobs: [
          createMockJob({ id: 'job-1', context: 'flyer-tournament-123' }),
          createMockJob({ id: 'job-2', context: 'campaign-456' }),
        ],
      });

      const job = useJobsStore.getState().getJobByContext('flyer-tournament-123');
      expect(job?.id).toBe('job-1');
    });

    it('should get job by id', () => {
      useJobsStore.setState({
        jobs: [
          createMockJob({ id: 'job-1' }),
          createMockJob({ id: 'job-2' }),
        ],
      });

      const job = useJobsStore.getState().getJobById('job-2');
      expect(job?.id).toBe('job-2');
    });
  });

  describe('Derived State', () => {
    it('should return pending jobs', () => {
      useJobsStore.setState({
        jobs: [
          createMockJob({ id: 'job-1', status: 'queued' }),
          createMockJob({ id: 'job-2', status: 'processing' }),
          createMockJob({ id: 'job-3', status: 'completed' }),
          createMockJob({ id: 'job-4', status: 'failed' }),
        ],
      });

      const pending = useJobsStore.getState().pendingJobs();
      expect(pending).toHaveLength(2);
      expect(pending.map((j) => j.id)).toEqual(['job-1', 'job-2']);
    });

    it('should return completed jobs', () => {
      useJobsStore.setState({
        jobs: [
          createMockJob({ id: 'job-1', status: 'completed' }),
          createMockJob({ id: 'job-2', status: 'queued' }),
          createMockJob({ id: 'job-3', status: 'completed' }),
        ],
      });

      const completed = useJobsStore.getState().completedJobs();
      expect(completed).toHaveLength(2);
    });

    it('should return failed jobs', () => {
      useJobsStore.setState({
        jobs: [
          createMockJob({ id: 'job-1', status: 'failed' }),
          createMockJob({ id: 'job-2', status: 'queued' }),
        ],
      });

      const failed = useJobsStore.getState().failedJobs();
      expect(failed).toHaveLength(1);
      expect(failed[0].id).toBe('job-1');
    });
  });

  describe('Event Subscriptions', () => {
    it('should subscribe to job complete events', () => {
      const callback = vi.fn();
      const unsubscribe = useJobsStore.getState().onJobComplete(callback);

      const job = createMockJob({ id: 'job-1', status: 'completed' });
      useJobsStore.getState()._emitJobComplete(job);

      expect(callback).toHaveBeenCalledWith(job);

      // Unsubscribe
      unsubscribe();
      useJobsStore.getState()._emitJobComplete(job);

      // Should not be called again
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should subscribe to job failed events', () => {
      const callback = vi.fn();
      useJobsStore.getState().onJobFailed(callback);

      const job = createMockJob({ id: 'job-1', status: 'failed', error_message: 'Error' });
      useJobsStore.getState()._emitJobFailed(job);

      expect(callback).toHaveBeenCalledWith(job);
    });
  });

  describe('Notification Tracking', () => {
    it('should mark job as notified', () => {
      useJobsStore.getState().markJobNotified('job-1', 'completed');

      expect(useJobsStore.getState().isJobNotified('job-1', 'completed')).toBe(true);
      expect(useJobsStore.getState().isJobNotified('job-1', 'failed')).toBe(false);
    });

    it('should limit notified IDs to prevent memory issues', () => {
      // Add 250 completed notifications (limit is 200)
      for (let i = 0; i < 250; i++) {
        useJobsStore.getState().markJobNotified(`job-${i}`, 'completed');
      }

      const state = useJobsStore.getState();
      expect(state.notifiedCompleteIds.length).toBe(200);
      // First 50 should be removed
      expect(state.notifiedCompleteIds).not.toContain('job-0');
      expect(state.notifiedCompleteIds).toContain('job-249');
    });
  });

  describe('User Context', () => {
    it('should set user context', () => {
      useJobsStore.getState().setUserContext('user-123', 'org-456');

      const state = useJobsStore.getState();
      expect(state.userId).toBe('user-123');
      expect(state.organizationId).toBe('org-456');
    });

    it('should set user context without organization', () => {
      useJobsStore.getState().setUserContext('user-123');

      const state = useJobsStore.getState();
      expect(state.userId).toBe('user-123');
      expect(state.organizationId).toBeNull();
    });
  });

  describe('Reset', () => {
    it('should reset store to initial state', () => {
      useJobsStore.setState({
        jobs: [createMockJob()],
        isLoading: true,
        userId: 'user-123',
        notifiedCompleteIds: ['job-1', 'job-2'],
      });

      useJobsStore.getState().reset();

      const state = useJobsStore.getState();
      expect(state.jobs).toHaveLength(0);
      expect(state.isLoading).toBe(false);
      expect(state.userId).toBeNull();
      expect(state.notifiedCompleteIds).toHaveLength(0);
    });
  });
});

describe('useJobCounts hook', () => {
  beforeEach(() => {
    useJobsStore.setState({ jobs: [] });
  });

  it('should return correct job counts', () => {
    useJobsStore.setState({
      jobs: [
        createMockJob({ status: 'queued' }),
        createMockJob({ status: 'processing' }),
        createMockJob({ status: 'processing' }),
        createMockJob({ status: 'completed' }),
        createMockJob({ status: 'completed' }),
        createMockJob({ status: 'completed' }),
        createMockJob({ status: 'failed' }),
      ],
    });

    const { result } = renderHook(() => useJobCounts());

    expect(result.current.total).toBe(7);
    expect(result.current.pending).toBe(3); // 1 queued + 2 processing
    expect(result.current.completed).toBe(3);
    expect(result.current.failed).toBe(1);
  });

  it('should return zero counts when no jobs', () => {
    const { result } = renderHook(() => useJobCounts());

    expect(result.current.total).toBe(0);
    expect(result.current.pending).toBe(0);
    expect(result.current.completed).toBe(0);
    expect(result.current.failed).toBe(0);
  });
});
