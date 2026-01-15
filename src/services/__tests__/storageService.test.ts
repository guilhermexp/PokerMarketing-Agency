import { describe, it, expect, beforeEach, vi } from 'vitest';
import { initDB, saveImagesToDB, loadImagesFromDB } from '../storageService';
import type { GalleryImage } from '../../types';

describe('storageService', () => {
  const mockDB = {
    objectStoreNames: { contains: vi.fn() },
    transaction: vi.fn(),
    createObjectStore: vi.fn().mockReturnValue({ createIndex: vi.fn() }),
  };

  const createMockRequest = () => ({
    result: mockDB as any,
    error: null as any,
    onsuccess: null as any,
    onerror: null as any,
    onupgradeneeded: null as any,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockDB.objectStoreNames.contains.mockReturnValue(false);

    // Default mock setup
    const request = createMockRequest();
    (global as any).indexedDB = {
      open: vi.fn().mockReturnValue(request),
    };
  });

  describe('initDB', () => {
    it('should initialize database successfully', async () => {
      const request = createMockRequest();
      vi.mocked(indexedDB.open).mockReturnValue(request as any);

      const promise = initDB();
      setTimeout(() => request.onsuccess?.({} as any), 0);

      const db = await promise;
      expect(db).toBe(mockDB);
      expect(indexedDB.open).toHaveBeenCalledWith('DirectorAi_DB', 2);
    });

    it('should reject on database open error', async () => {
      const request = createMockRequest();
      vi.mocked(indexedDB.open).mockReturnValue(request as any);

      const promise = initDB();
      setTimeout(() => request.onerror?.({} as any), 0);

      await expect(promise).rejects.toBe('Erro ao abrir o banco de dados');
    });

    it('should create stores on upgrade', async () => {
      const request = createMockRequest();
      vi.mocked(indexedDB.open).mockReturnValue(request as any);

      const promise = initDB();

      setTimeout(() => {
        request.onupgradeneeded?.({ target: { result: mockDB } } as any);
        request.onsuccess?.({} as any);
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

      const request = createMockRequest();
      vi.mocked(indexedDB.open).mockReturnValue(request as any);

      const mockStore = { clear: vi.fn(), add: vi.fn() };
      const mockTransaction = {
        objectStore: vi.fn().mockReturnValue(mockStore),
        oncomplete: null as any,
        onerror: null as any,
      };

      mockDB.transaction.mockReturnValue(mockTransaction);

      const savePromise = saveImagesToDB(mockImages);

      // Trigger sequence
      setTimeout(() => {
        request.onsuccess?.({} as any);
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

      const request = createMockRequest();
      vi.mocked(indexedDB.open).mockReturnValue(request as any);

      const mockGetAllRequest = {
        result: mockImages,
        onsuccess: null as any,
        onerror: null as any,
      };

      const mockStore = { getAll: vi.fn().mockReturnValue(mockGetAllRequest) };
      const mockTransaction = { objectStore: vi.fn().mockReturnValue(mockStore) };
      mockDB.transaction.mockReturnValue(mockTransaction);

      const loadPromise = loadImagesFromDB();

      setTimeout(() => {
        request.onsuccess?.({} as any);
        setTimeout(() => mockGetAllRequest.onsuccess?.(), 10);
      }, 10);

      const result = await loadPromise;
      expect(result).toEqual(mockImages);
    });
  });
});
