import { describe, it, expect, beforeEach, vi } from 'vitest';
import { initDB, saveImagesToDB, loadImagesFromDB } from '../storageService';
import type { GalleryImage } from '../../types';
import type {
  MockIDBDatabase,
  MockIDBFactory,
  MockIDBOpenDBRequest,
  MockIDBObjectStore,
  MockIDBTransaction,
  MockIDBRequest,
} from '../../__tests__/test-utils';
import {
  createMockIDBDatabase,
  createMockIDBObjectStore,
  createMockIDBRequest,
} from '../../__tests__/test-utils';

describe('storageService', () => {
  let mockDB: MockIDBDatabase;

  const createMockOpenRequest = (): MockIDBOpenDBRequest => ({
    result: mockDB,
    error: null,
    onsuccess: null,
    onerror: null,
    onupgradeneeded: null,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockDB = createMockIDBDatabase();

    // Default mock setup
    const request = createMockOpenRequest();
    (global as { indexedDB: MockIDBFactory }).indexedDB = {
      open: vi.fn().mockReturnValue(request),
    };
  });

  describe('initDB', () => {
    it('should initialize database successfully', async () => {
      const request = createMockOpenRequest();
      vi.mocked(indexedDB.open).mockReturnValue(request);

      const promise = initDB();
      setTimeout(() => request.onsuccess?.(), 0);

      const db = await promise;
      expect(db).toBe(mockDB);
      expect(indexedDB.open).toHaveBeenCalledWith('DirectorAi_DB', 2);
    });

    it('should reject on database open error', async () => {
      const request = createMockOpenRequest();
      vi.mocked(indexedDB.open).mockReturnValue(request);

      const promise = initDB();
      setTimeout(() => request.onerror?.(), 0);

      await expect(promise).rejects.toBe('Erro ao abrir o banco de dados');
    });

    it('should create stores on upgrade', async () => {
      const request = createMockOpenRequest();
      vi.mocked(indexedDB.open).mockReturnValue(request);

      const promise = initDB();

      setTimeout(() => {
        request.onupgradeneeded?.({ target: { result: mockDB } });
        request.onsuccess?.();
      }, 0);

      await promise;
      expect(mockDB.createObjectStore).toHaveBeenCalledWith('gallery_images', { keyPath: 'id' });
    });
  });

  describe('saveImagesToDB', () => {
    it('should save images to database', async () => {
      const mockImages: GalleryImage[] = [
        {
          id: '1',
          src: 'https://example.com/image1.png',
          prompt: 'test image 1',
          source: 'test',
          model: 'gemini-3-pro-image-preview',
          aspectRatio: '1:1',
          imageSize: '1K',
        },
      ];

      const request = createMockOpenRequest();
      vi.mocked(indexedDB.open).mockReturnValue(request);

      const mockStore = createMockIDBObjectStore();
      const mockTransaction: MockIDBTransaction = {
        objectStore: vi.fn().mockReturnValue(mockStore),
        oncomplete: null,
        onerror: null,
      };

      mockDB.transaction.mockReturnValue(mockTransaction);

      const savePromise = saveImagesToDB(mockImages);

      // Trigger sequence
      setTimeout(() => {
        request.onsuccess?.();
        setTimeout(() => {
          mockTransaction.oncomplete?.();
        }, 10);
      }, 10);

      await savePromise;
      expect(mockStore.clear).toHaveBeenCalled();
      expect(mockStore.add).toHaveBeenCalledWith(mockImages[0]);
    });
  });

  describe('loadImagesFromDB', () => {
    it('should load images from database', async () => {
      const mockImages: GalleryImage[] = [{
        id: '1',
        src: 'test.png',
        prompt: 'test',
        source: 'test',
        model: 'gemini-3-pro-image-preview',
        aspectRatio: '1:1',
        imageSize: '1K',
      }];

      const request = createMockOpenRequest();
      vi.mocked(indexedDB.open).mockReturnValue(request);

      const mockGetAllRequest: MockIDBRequest<GalleryImage[]> = {
        result: mockImages,
        onsuccess: null,
        onerror: null,
      };

      const mockStore: Partial<MockIDBObjectStore> = {
        getAll: vi.fn().mockReturnValue(mockGetAllRequest),
      };
      const mockTransaction: Partial<MockIDBTransaction> = {
        objectStore: vi.fn().mockReturnValue(mockStore),
      };
      mockDB.transaction.mockReturnValue(mockTransaction as MockIDBTransaction);

      const loadPromise = loadImagesFromDB();

      setTimeout(() => {
        request.onsuccess?.();
        setTimeout(() => mockGetAllRequest.onsuccess?.(), 10);
      }, 10);

      const result = await loadPromise;
      expect(result).toEqual(mockImages);
    });
  });
});
