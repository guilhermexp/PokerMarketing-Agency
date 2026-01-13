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

describe('Feature Flags', () => {
  it('should have feature flags defined', async () => {
    const { FEATURE_FLAGS, isFeatureEnabled } = await import('../../config/featureFlags');

    expect(FEATURE_FLAGS).toBeDefined();
    expect(typeof isFeatureEnabled).toBe('function');
  });

  it('should return false for disabled flags', async () => {
    const { isFeatureEnabled } = await import('../../config/featureFlags');

    // Todas as flags devem estar desabilitadas por padrão
    expect(isFeatureEnabled('USE_ZUSTAND_STORES')).toBe(false);
    expect(isFeatureEnabled('USE_NEW_API_CLIENT')).toBe(false);
    expect(isFeatureEnabled('USE_NEW_CLIPS_TAB')).toBe(false);
  });
});
