/**
 * Providers Wrapper - Vercel AI SDK
 *
 * Gerencia modelos de IA usando:
 * - Google Gemini: Acesso direto via @google/genai (native)
 * - OpenAI/xAI: Via OpenRouter SDK
 */

import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { google } from '@ai-sdk/google';

// ============================================================================
// CONFIGURAÇÃO DOS PROVIDERS
// ============================================================================

/**
 * OpenRouter - Para modelos OpenAI e xAI
 */
const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY
});

/**
 * Google AI SDK - Para modelos Gemini (native)
 */
const googleNative = google({
  apiKey: process.env.GEMINI_API_KEY
});

// ============================================================================
// FUNÇÃO PRINCIPAL: getLanguageModel
// ============================================================================

/**
 * Retorna o modelo de linguagem configurado baseado no ID
 *
 * @param {string} modelId - ID do modelo
 * @returns {LanguageModel} - Instância do modelo configurada
 *
 * @example
 * // Gemini (via OpenRouter)
 * const model = getLanguageModel('google/gemini-3.1-pro-preview');
 *
 * // OpenRouter
 * const model = getLanguageModel('openai/gpt-5.2');
 * const model = getLanguageModel('x-ai/grok-4.1-fast');
 */
export function getLanguageModel(modelId) {
  // -------------------------
  // Gemini Native (Google Direct)
  // -------------------------
  if (modelId.startsWith('gemini-') && !modelId.includes('/')) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY não configurada');
    }
    console.log(`[Providers] Usando Gemini Native: ${modelId}`);
    return googleNative(modelId);
  }

  // -------------------------
  // OpenRouter (OpenAI, xAI, etc)
  // -------------------------
  if (modelId.includes('/')) {
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY não configurada');
    }
    console.log(`[Providers] Usando OpenRouter: ${modelId}`);
    return openrouter.languageModel(modelId);
  }

  // -------------------------
  // Fallback: Default para Gemini 3.1 Pro via OpenRouter
  // -------------------------
  console.warn(`[Providers] Modelo desconhecido "${modelId}", usando Gemini 3.1 Pro via OpenRouter como fallback`);
  return openrouter.languageModel('google/gemini-3.1-pro-preview');
}

/**
 * Retorna o modelo padrão para artifacts (mais capaz)
 */
export function getArtifactModel() {
  return getLanguageModel('google/gemini-3.1-pro-preview');
}

/**
 * Retorna o modelo configurado na brand profile ou default
 */
export function getBrandModel(brandProfile) {
  if (brandProfile?.preferredAIModel) {
    return getLanguageModel(brandProfile.preferredAIModel);
  }
  return getLanguageModel('google/gemini-3.1-pro-preview');
}

// ============================================================================
// MODELOS SUPORTADOS (do ai-models.ts)
// ============================================================================

export const SUPPORTED_MODELS = [
  // Gemini (via OpenRouter)
  { id: 'google/gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro', provider: 'Google', fast: false },

  // OpenRouter
  { id: 'openai/gpt-5.2', name: 'GPT-5.2', provider: 'OpenAI', fast: false },
  { id: 'x-ai/grok-4.1-fast', name: 'Grok 4.1 Fast', provider: 'xAI', fast: true }
];

export function isModelSupported(modelId) {
  return SUPPORTED_MODELS.some(m => m.id === modelId);
}

export function getModelInfo(modelId) {
  return SUPPORTED_MODELS.find(m => m.id === modelId) || null;
}
