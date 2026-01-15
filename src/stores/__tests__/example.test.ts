import { describe, it, expect } from 'vitest';

describe('Stores Infrastructure', () => {
  it('should have stores version defined', async () => {
    const { STORES_VERSION } = await import('../index');
    expect(STORES_VERSION).toBe('1.0.0');
  });

  it('should be able to import zustand', async () => {
    const { create } = await import('zustand');
    expect(create).toBeDefined();
    expect(typeof create).toBe('function');
  });
});
