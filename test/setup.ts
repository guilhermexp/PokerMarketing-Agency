import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Cleanup após cada teste
afterEach(() => {
  cleanup();
});

// Mock do import.meta.env
vi.stubGlobal('import.meta.env', {
  DEV: true,
  PROD: false,
  MODE: 'test',
  VITE_USE_ZUSTAND_STORES: 'false',
  VITE_USE_NEW_API_CLIENT: 'false',
  VITE_USE_NEW_IMAGE_PREVIEW: 'false',
  VITE_USE_NEW_CLIPS_TAB: 'false',
  VITE_USE_NEW_FLYER_GENERATOR: 'false',
  VITE_USE_NEW_CAROUSEL_TAB: 'false',
});

// Mock do fetch para testes
global.fetch = vi.fn();

// Mock do localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
vi.stubGlobal('localStorage', localStorageMock);

// Mock do window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock do ResizeObserver
vi.stubGlobal('ResizeObserver', vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
})));

// Mock do IntersectionObserver
vi.stubGlobal('IntersectionObserver', vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
})));

// Suprimir console.error em testes (opcional)
// vi.spyOn(console, 'error').mockImplementation(() => {});
