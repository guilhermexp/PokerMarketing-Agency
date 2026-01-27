/**
 * Test utilities and mock type definitions for TypeScript strict mode
 *
 * This file provides properly-typed mock interfaces to replace 'as any' assertions
 * in test files, improving type safety and IDE autocomplete in tests.
 */

import { vi } from 'vitest';
import type { Mock } from 'vitest';

// ============================================================================
// Clerk Mock Types
// ============================================================================

/**
 * Mock type for Clerk session object
 */
export interface MockClerkSession {
  getToken: Mock<() => Promise<string | null>>;
}

/**
 * Mock type for window.Clerk
 * Used in authService.test.ts to mock Clerk authentication
 */
export interface MockClerk {
  session?: MockClerkSession;
}

/**
 * Extended Window interface with optional Clerk property
 */
export interface WindowWithClerk extends Window {
  Clerk?: MockClerk;
}

// ============================================================================
// Fetch Mock Types
// ============================================================================

/**
 * Mock Response object for fetch API
 * Used in blobService.test.ts for testing image upload
 */
export interface MockFetchResponse {
  ok: boolean;
  status?: number;
  json: Mock<() => Promise<unknown>>;
}

/**
 * Mock fetch function type
 */
export type MockFetch = Mock<
  (input: RequestInfo | URL, init?: RequestInit) => Promise<MockFetchResponse>
>;

// ============================================================================
// IndexedDB Mock Types
// ============================================================================

/**
 * Mock IDBRequest - base request type for IndexedDB operations
 * Used in storageService.test.ts and schedulerService.test.ts
 */
export interface MockIDBRequest<T = unknown> {
  result?: T;
  error?: Error | null;
  onsuccess?: ((event?: Event) => void) | null;
  onerror?: ((event?: Event) => void) | null;
}

/**
 * Mock IDBOpenDBRequest - extends IDBRequest with onupgradeneeded
 * Used when opening/upgrading database
 */
export interface MockIDBOpenDBRequest extends MockIDBRequest<MockIDBDatabase> {
  onupgradeneeded?: ((event: { target: { result: MockIDBDatabase } }) => void) | null;
}

/**
 * Mock IDBObjectStore - represents an object store in IndexedDB
 */
export interface MockIDBObjectStore {
  add: Mock<(value: unknown) => MockIDBRequest>;
  put: Mock<(value: unknown) => MockIDBRequest>;
  delete: Mock<(key: IDBValidKey) => MockIDBRequest>;
  get: Mock<(key: IDBValidKey) => MockIDBRequest>;
  getAll: Mock<() => MockIDBRequest>;
  clear: Mock<() => MockIDBRequest>;
  createIndex: Mock<(name: string, keyPath: string | string[], options?: IDBIndexParameters) => unknown>;
}

/**
 * Mock IDBTransaction - represents a transaction in IndexedDB
 */
export interface MockIDBTransaction {
  objectStore: Mock<(name: string) => MockIDBObjectStore>;
  oncomplete?: (() => void) | null;
  onerror?: ((event?: Event) => void) | null;
}

/**
 * Mock IDBDatabase - represents the database instance
 */
export interface MockIDBDatabase {
  transaction: Mock<(storeNames: string | string[], mode?: IDBTransactionMode) => MockIDBTransaction>;
  createObjectStore: Mock<(name: string, options?: IDBObjectStoreParameters) => MockIDBObjectStore>;
  objectStoreNames: {
    contains: Mock<(name: string) => boolean>;
  };
}

/**
 * Mock IndexedDB factory
 */
export interface MockIDBFactory {
  open: Mock<(name: string, version?: number) => MockIDBOpenDBRequest>;
}

// ============================================================================
// Helper Functions for Creating Mocks
// ============================================================================

/**
 * Creates a properly-typed mock Clerk instance
 *
 * @example
 * ```ts
 * const mockClerk = createMockClerk();
 * mockClerk.session!.getToken.mockResolvedValue('test-token');
 * (window as WindowWithClerk).Clerk = mockClerk;
 * ```
 */
export function createMockClerk(token?: string): MockClerk {
  const getToken = vi.fn().mockResolvedValue(token ?? null);
  return {
    session: {
      getToken,
    },
  };
}

/**
 * Creates a properly-typed mock fetch response
 *
 * @example
 * ```ts
 * const mockResponse = createMockFetchResponse({ url: 'https://example.com/image.png' });
 * global.fetch = vi.fn().mockResolvedValue(mockResponse);
 * ```
 */
export function createMockFetchResponse(data: unknown, ok = true, status = 200): MockFetchResponse {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(data),
  };
}

/**
 * Creates a properly-typed mock IDBRequest
 *
 * @example
 * ```ts
 * const request = createMockIDBRequest();
 * mockStore.add.mockReturnValue(request);
 * setTimeout(() => request.onsuccess?.(), 0);
 * ```
 */
export function createMockIDBRequest<T = unknown>(result?: T): MockIDBRequest<T> {
  return {
    result,
    error: null,
    onsuccess: null,
    onerror: null,
  };
}

/**
 * Creates a properly-typed mock IDBObjectStore
 */
export function createMockIDBObjectStore(): MockIDBObjectStore {
  return {
    add: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    get: vi.fn(),
    getAll: vi.fn(),
    clear: vi.fn(),
    createIndex: vi.fn(),
  };
}

/**
 * Creates a properly-typed mock IDBTransaction
 */
export function createMockIDBTransaction(objectStore?: MockIDBObjectStore): MockIDBTransaction {
  return {
    objectStore: vi.fn().mockReturnValue(objectStore ?? createMockIDBObjectStore()),
    oncomplete: null,
    onerror: null,
  };
}

/**
 * Creates a properly-typed mock IDBDatabase
 */
export function createMockIDBDatabase(): MockIDBDatabase {
  return {
    transaction: vi.fn(),
    createObjectStore: vi.fn().mockReturnValue(createMockIDBObjectStore()),
    objectStoreNames: {
      contains: vi.fn().mockReturnValue(false),
    },
  };
}

/**
 * Sets up global IndexedDB mock
 *
 * @example
 * ```ts
 * beforeEach(() => {
 *   const mockDB = setupMockIndexedDB();
 *   // Configure mockDB as needed
 * });
 * ```
 */
export function setupMockIndexedDB(): MockIDBDatabase {
  const mockDB = createMockIDBDatabase();
  const request: MockIDBOpenDBRequest = {
    result: mockDB,
    error: null,
    onsuccess: null,
    onerror: null,
    onupgradeneeded: null,
  };

  (global as unknown as { indexedDB: MockIDBFactory }).indexedDB = {
    open: vi.fn().mockReturnValue(request),
  };

  return mockDB;
}

// Re-export vitest for convenience
export { vi } from 'vitest';
