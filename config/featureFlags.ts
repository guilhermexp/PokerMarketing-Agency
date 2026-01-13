/**
 * Feature Flags para migração gradual de refatoração
 *
 * Uso:
 * - Todas as flags começam desabilitadas (false)
 * - Habilitar via variáveis de ambiente VITE_*
 * - Permite rollback instantâneo desabilitando a flag
 */

export const FEATURE_FLAGS = {
  // Fase 1: State Management
  USE_ZUSTAND_STORES: import.meta.env.VITE_USE_ZUSTAND_STORES === 'true',

  // Fase 2: API Client
  USE_NEW_API_CLIENT: import.meta.env.VITE_USE_NEW_API_CLIENT === 'true',

  // Fase 3: ImagePreviewModal
  USE_NEW_IMAGE_PREVIEW: import.meta.env.VITE_USE_NEW_IMAGE_PREVIEW === 'true',

  // Fase 4: ClipsTab
  USE_NEW_CLIPS_TAB: import.meta.env.VITE_USE_NEW_CLIPS_TAB === 'true',

  // Fase 5: FlyerGenerator
  USE_NEW_FLYER_GENERATOR: import.meta.env.VITE_USE_NEW_FLYER_GENERATOR === 'true',

  // Fase 5: CarouselTab
  USE_NEW_CAROUSEL_TAB: import.meta.env.VITE_USE_NEW_CAROUSEL_TAB === 'true',
} as const;

/**
 * Helper para verificar se uma feature está habilitada
 */
export const isFeatureEnabled = (flag: keyof typeof FEATURE_FLAGS): boolean => {
  return FEATURE_FLAGS[flag] ?? false;
};

/**
 * Helper para debug - lista todas as flags e seus valores
 */
export const logFeatureFlags = (): void => {
  if (import.meta.env.DEV) {
    console.group('🚩 Feature Flags');
    Object.entries(FEATURE_FLAGS).forEach(([key, value]) => {
      console.log(`${value ? '✅' : '❌'} ${key}: ${value}`);
    });
    console.groupEnd();
  }
};

// Type exports para uso em componentes
export type FeatureFlagKey = keyof typeof FEATURE_FLAGS;
