import { describe, it, expect } from 'vitest';

describe('Stores Infrastructure', () => {
  it('should be able to import store modules', async () => {
    const { useUiStore } = await import('../uiStore');
    expect(useUiStore).toBeDefined();
    expect(typeof useUiStore).toBe('function');
  });

  it('should be able to import zustand', async () => {
    const { create } = await import('zustand');
    expect(create).toBeDefined();
    expect(typeof create).toBe('function');
  });
});
