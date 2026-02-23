/**
 * AI Models Configuration
 * ========================
 *
 * Este arquivo centraliza toda a configuração de modelos de IA.
 * Para adicionar um novo modelo, siga os passos:
 *
 * 1. Adicione o modelo ao array CREATIVE_MODELS abaixo
 * 2. O tipo CreativeModelId será atualizado automaticamente
 * 3. Pronto! O modelo aparecerá nas configurações da marca
 *
 * ESTRUTURA DE UM MODELO:
 * -----------------------
 * {
 *   id: string           - ID único do modelo (usado na API)
 *   label: string        - Nome exibido na UI
 *   provider: string     - Provedor (Google, OpenAI, xAI, Anthropic, etc)
 *   type: 'native' | 'openrouter'  - Como chamar a API
 *   capabilities: {
 *     text: boolean      - Gera texto (campanhas, posts)
 *     image: boolean     - Gera imagens
 *     vision: boolean    - Analisa imagens
 *   }
 *   description?: string - Descrição opcional
 *   costTier?: 'free' | 'low' | 'medium' | 'high'
 * }
 *
 * TIPOS DE MODELOS:
 * -----------------
 * - 'native': Modelos do Google (Gemini) - chamados diretamente via @google/genai
 * - 'openrouter': Modelos de terceiros (OpenAI, xAI, Anthropic) - via OpenRouter SDK
 *
 * COMO IDENTIFICAR O TIPO:
 * ------------------------
 * - Se o ID contém "/" (ex: "openai/gpt-5.2") → OpenRouter
 * - Se o ID começa com "gemini" → Native (Google)
 */

// ============================================================================
// MODEL DEFINITIONS
// ============================================================================

export const CREATIVE_MODELS = [
  // -------------------------------------------------------------------------
  // GOOGLE GEMINI (via OpenRouter)
  // -------------------------------------------------------------------------
  {
    id: 'google/gemini-3-flash-preview',
    label: 'Gemini 3 Flash',
    provider: 'Google',
    type: 'openrouter' as const,
    capabilities: { text: true, image: false, vision: true },
    description: 'Modelo rápido e barato do Google via OpenRouter',
    costTier: 'medium' as const,
  },

  // -------------------------------------------------------------------------
  // OPENAI (via OpenRouter)
  // -------------------------------------------------------------------------
  {
    id: 'openai/gpt-5.2',
    label: 'GPT-5.2',
    provider: 'OpenAI',
    type: 'openrouter' as const,
    capabilities: { text: true, image: false, vision: true },
    description: 'Modelo mais avançado da OpenAI',
    costTier: 'high' as const,
  },

  // -------------------------------------------------------------------------
  // xAI (via OpenRouter)
  // -------------------------------------------------------------------------
  {
    id: 'x-ai/grok-4.1-fast',
    label: 'Grok 4.1 Fast',
    provider: 'xAI',
    type: 'openrouter' as const,
    capabilities: { text: true, image: false, vision: true },
    description: 'Modelo rápido da xAI, bom custo-benefício',
    costTier: 'medium' as const,
  },

  // -------------------------------------------------------------------------
  // PARA ADICIONAR NOVOS MODELOS, COPIE O TEMPLATE ABAIXO:
  // -------------------------------------------------------------------------
  // {
  //   id: 'provider/model-name',      // Ex: 'anthropic/claude-4-opus'
  //   label: 'Nome para UI',          // Ex: 'Claude 4 Opus'
  //   provider: 'Provider Name',      // Ex: 'Anthropic'
  //   type: 'openrouter' as const,    // 'native' para Gemini, 'openrouter' para outros
  //   capabilities: { text: true, image: false, vision: true },
  //   description: 'Descrição opcional',
  //   costTier: 'high' as const,
  // },
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
  return CREATIVE_MODELS.find(m => m.id === modelId);
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
  return model?.provider || 'Unknown';
}

/**
 * Check if model uses OpenRouter
 */
export function isOpenRouterModel(modelId: string): boolean {
  const model = getModelConfig(modelId);
  if (model) return model.type === 'openrouter';
  // Fallback: check if ID contains "/"
  return modelId.includes('/');
}

/**
 * Check if model is native (Gemini)
 */
export function isNativeModel(modelId: string): boolean {
  return !isOpenRouterModel(modelId);
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
  return 'google/gemini-3-flash-preview';
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
