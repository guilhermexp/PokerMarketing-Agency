/**
 * AI Models Configuration
 * ========================
 *
 * All LLM text models use Google Gemini native API (direct).
 * OpenRouter has been removed.
 *
 * ESTRUTURA DE UM MODELO:
 * -----------------------
 * {
 *   id: string           - ID único do modelo (usado na API)
 *   label: string        - Nome exibido na UI
 *   provider: string     - Provedor (Google)
 *   type: 'native'       - Sempre native (Gemini direto)
 *   capabilities: {
 *     text: boolean      - Gera texto (campanhas, posts)
 *     image: boolean     - Gera imagens
 *     vision: boolean    - Analisa imagens
 *   }
 *   description?: string - Descrição opcional
 *   costTier?: 'free' | 'low' | 'medium' | 'high'
 * }
 */

// ============================================================================
// MODEL DEFINITIONS
// ============================================================================

export const CREATIVE_MODELS = [
  // -------------------------------------------------------------------------
  // GOOGLE GEMINI (native / direct API)
  // -------------------------------------------------------------------------
  {
    id: 'gemini-3-flash-preview',
    label: 'Gemini 3 Flash',
    provider: 'Google',
    type: 'native' as const,
    capabilities: { text: true, image: false, vision: true },
    description: 'Modelo rápido e eficiente do Google',
    costTier: 'low' as const,
  },
  {
    id: 'gemini-3-pro-preview',
    label: 'Gemini 3 Pro',
    provider: 'Google',
    type: 'native' as const,
    capabilities: { text: true, image: false, vision: true },
    description: 'Modelo mais capaz do Google para tarefas complexas',
    costTier: 'medium' as const,
  },
] as const;

// ============================================================================
// DERIVED TYPES (Auto-generated from CREATIVE_MODELS)
// ============================================================================

/** Union type of all model IDs */
export type CreativeModelId = typeof CREATIVE_MODELS[number]['id'];

/** Full model configuration type */
export type CreativeModelConfig = typeof CREATIVE_MODELS[number];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get model configuration by ID
 */
export function getModelConfig(modelId: string): CreativeModelConfig | undefined {
  // Normalize: strip "google/" prefix if present (legacy)
  const normalized = modelId.replace(/^google\//, "");
  return CREATIVE_MODELS.find(m => m.id === normalized);
}

/**
 * Get model display name
 */
export function getModelLabel(modelId: string): string {
  const model = getModelConfig(modelId);
  return model?.label || modelId.split('/').pop() || modelId;
}

/**
 * Get model provider
 */
export function getModelProvider(modelId: string): string {
  const model = getModelConfig(modelId);
  return model?.provider || 'Google';
}

/**
 * Check if model is native (all models are native now)
 */
export function isNativeModel(_modelId: string): boolean {
  return true;
}

/**
 * Get all models for a specific provider
 */
export function getModelsByProvider(provider: string): CreativeModelConfig[] {
  return CREATIVE_MODELS.filter(m => m.provider === provider);
}

/**
 * Get default model ID
 */
export function getDefaultModelId(): CreativeModelId {
  return 'gemini-3-flash-preview';
}

// ============================================================================
// CONSTANTS FOR IMAGE GENERATION
// ============================================================================

/** Models specifically for image generation (not configurable by user) */
export const IMAGE_GENERATION_MODELS = {
  /** Primary image generation model */
  PRIMARY: 'gemini-3-pro-image-preview',
} as const;

/** Models for video generation */
export const VIDEO_GENERATION_MODELS = {
  /** Veo 3 for video generation */
  VEO: 'veo-3.0-generate-preview',
} as const;

// ============================================================================
// EXPORT FOR SETTINGS UI
// ============================================================================

/**
 * Models formatted for the settings dropdown
 * Use this in SettingsModal.tsx
 */
export const CREATIVE_MODELS_FOR_UI = CREATIVE_MODELS.map(m => ({
  id: m.id,
  label: m.label,
  provider: m.provider,
}));
