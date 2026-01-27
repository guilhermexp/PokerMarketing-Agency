import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import {
  saveScheduledPost,
  updateScheduledPost,
  deleteScheduledPost,
  loadScheduledPosts,
  getUpcomingPosts,
  getOverduePosts,
} from '../schedulerService';
import type { ScheduledPost } from '../../types';
import type {
  MockIDBDatabase,
  MockIDBRequest,
  MockIDBObjectStore,
  MockIDBTransaction,
} from '../../__tests__/test-utils';
import {
  createMockIDBRequest,
} from '../../__tests__/test-utils';

vi.mock('../storageService', () => ({
  initDB: vi.fn(),
}));

import { initDB } from '../storageService';

describe('schedulerService', () => {
  let mockDB: MockIDBDatabase;

  beforeEach(() => {
    mockDB = { transaction: vi.fn() } as MockIDBDatabase;
    (initDB as Mock).mockResolvedValue(mockDB);
    vi.clearAllMocks();
  });

  describe('saveScheduledPost', () => {
    it('should save post with generated ID', async () => {
      const mockRequest: MockIDBRequest = createMockIDBRequest();
      const mockStore: MockIDBObjectStore = {
        add: vi.fn().mockReturnValue(mockRequest),
        put: vi.fn(),
        delete: vi.fn(),
        get: vi.fn(),
        getAll: vi.fn(),
        clear: vi.fn(),
        createIndex: vi.fn(),
      };
      const mockTransaction: MockIDBTransaction = {
        objectStore: vi.fn().mockReturnValue(mockStore),
        oncomplete: null,
        onerror: null,
      };

      mockDB.transaction.mockReturnValue(mockTransaction);

      const postData = {
        type: 'flyer' as const,
        contentId: 'flyer-123',
        imageUrl: 'https://example.com/img.png',
        caption: 'Test',
        hashtags: ['#test'],
        scheduledDate: '2026-01-15',
        scheduledTime: '12:00',
        scheduledTimestamp: Date.now() + 86400000,
        timezone: 'UTC',
        platforms: 'instagram' as const,
        status: 'scheduled' as const,
        createdFrom: 'campaign' as const,
      };

      const savePromise = saveScheduledPost(postData);
      setTimeout(() => mockRequest.onsuccess?.(), 0);

      const result = await savePromise;
      expect(result.id).toMatch(/^sched_/);
      expect(result.createdAt).toBeDefined();
    });
  });

  describe('updateScheduledPost', () => {
    it('should update existing post', async () => {
      const existingPost: ScheduledPost = {
        id: 'sched_123',
        type: 'flyer',
        contentId: 'flyer-123',
        imageUrl: 'https://example.com/img.png',
        caption: 'Original',
        hashtags: [],
        scheduledDate: '2026-01-15',
        scheduledTime: '12:00',
        scheduledTimestamp: Date.now(),
        timezone: 'UTC',
        platforms: 'instagram',
        status: 'scheduled',
        createdFrom: 'campaign',
        createdAt: Date.now() - 1000,
        updatedAt: Date.now() - 1000,
      };

      const mockGetRequest: MockIDBRequest<ScheduledPost> = createMockIDBRequest(existingPost);
      const mockPutRequest: MockIDBRequest = createMockIDBRequest();
      const mockStore: MockIDBObjectStore = {
        add: vi.fn(),
        put: vi.fn().mockReturnValue(mockPutRequest),
        delete: vi.fn(),
        get: vi.fn().mockReturnValue(mockGetRequest),
        getAll: vi.fn(),
        clear: vi.fn(),
        createIndex: vi.fn(),
      };
      const mockTransaction: MockIDBTransaction = {
        objectStore: vi.fn().mockReturnValue(mockStore),
        oncomplete: null,
        onerror: null,
      };

      mockDB.transaction.mockReturnValue(mockTransaction);

      const updatePromise = updateScheduledPost('sched_123', { caption: 'Updated' });

      setTimeout(() => {
        mockGetRequest.onsuccess?.();
        setTimeout(() => mockPutRequest.onsuccess?.(), 0);
      }, 0);

      const result = await updatePromise;
      expect(result?.caption).toBe('Updated');
    });
  });

  describe('deleteScheduledPost', () => {
    it('should delete post', async () => {
      const mockRequest: MockIDBRequest = createMockIDBRequest();
      const mockStore: MockIDBObjectStore = {
        add: vi.fn(),
        put: vi.fn(),
        delete: vi.fn().mockReturnValue(mockRequest),
        get: vi.fn(),
        getAll: vi.fn(),
        clear: vi.fn(),
        createIndex: vi.fn(),
      };
      const mockTransaction: MockIDBTransaction = {
        objectStore: vi.fn().mockReturnValue(mockStore),
        oncomplete: null,
        onerror: null,
      };

      mockDB.transaction.mockReturnValue(mockTransaction);

      const deletePromise = deleteScheduledPost('sched_123');
      setTimeout(() => mockRequest.onsuccess?.(), 0);

      const result = await deletePromise;
      expect(result).toBe(true);
    });
  });

  describe('loadScheduledPosts', () => {
    it('should load and sort posts', async () => {
      const mockPosts = [
        { id: '1', scheduledTimestamp: 3000 } as ScheduledPost,
        { id: '2', scheduledTimestamp: 1000 } as ScheduledPost,
      ];

      const mockRequest: MockIDBRequest<ScheduledPost[]> = createMockIDBRequest(mockPosts);
      const mockStore: MockIDBObjectStore = {
        add: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        get: vi.fn(),
        getAll: vi.fn().mockReturnValue(mockRequest),
        clear: vi.fn(),
        createIndex: vi.fn(),
      };
      const mockTransaction: MockIDBTransaction = {
        objectStore: vi.fn().mockReturnValue(mockStore),
        oncomplete: null,
        onerror: null,
      };

      mockDB.transaction.mockReturnValue(mockTransaction);

      const loadPromise = loadScheduledPosts();
      setTimeout(() => mockRequest.onsuccess?.(), 0);

      const result = await loadPromise;
      expect(result[0].id).toBe('2');
      expect(result[1].id).toBe('1');
    });
  });

  describe('getUpcomingPosts', () => {
    it('should return upcoming posts', async () => {
      vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));
      const now = Date.now();

      const mockPosts = [
        { id: '1', status: 'scheduled', scheduledTimestamp: now + 30 * 60 * 1000 } as ScheduledPost,
        { id: '2', status: 'scheduled', scheduledTimestamp: now + 90 * 60 * 1000 } as ScheduledPost,
      ];

      const mockRequest: MockIDBRequest<ScheduledPost[]> = createMockIDBRequest(mockPosts);
      const mockStore: MockIDBObjectStore = {
        add: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        get: vi.fn(),
        getAll: vi.fn().mockReturnValue(mockRequest),
        clear: vi.fn(),
        createIndex: vi.fn(),
      };
      const mockTransaction: MockIDBTransaction = {
        objectStore: vi.fn().mockReturnValue(mockStore),
        oncomplete: null,
        onerror: null,
      };

      mockDB.transaction.mockReturnValue(mockTransaction);

      const upcomingPromise = getUpcomingPosts(1);
      setTimeout(() => mockRequest.onsuccess?.(), 0);

      const result = await upcomingPromise;
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');

      vi.useRealTimers();
    });
  });

  describe('getOverduePosts', () => {
    it('should return overdue posts', async () => {
      vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));
      const now = Date.now();

      const mockPosts = [
        { id: '1', status: 'scheduled', scheduledTimestamp: now - 3600000 } as ScheduledPost,
        { id: '2', status: 'scheduled', scheduledTimestamp: now + 3600000 } as ScheduledPost,
      ];

      const mockRequest: MockIDBRequest<ScheduledPost[]> = createMockIDBRequest(mockPosts);
      const mockStore: MockIDBObjectStore = {
        add: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        get: vi.fn(),
        getAll: vi.fn().mockReturnValue(mockRequest),
        clear: vi.fn(),
        createIndex: vi.fn(),
      };
      const mockTransaction: MockIDBTransaction = {
        objectStore: vi.fn().mockReturnValue(mockStore),
        oncomplete: null,
        onerror: null,
      };

      mockDB.transaction.mockReturnValue(mockTransaction);

      const overduePromise = getOverduePosts();
      setTimeout(() => mockRequest.onsuccess?.(), 0);

      const result = await overduePromise;
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');

      vi.useRealTimers();
    });
  });
});
