/**
 * Providers Wrapper - Vercel AI SDK
 *
 * All LLM calls use Google Gemini native API.
 * OpenRouter has been removed.
 */

import { google } from '@ai-sdk/google';

// ============================================================================
// CONFIGURAÇÃO DO PROVIDER
// ============================================================================

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
 * @param {string} modelId - ID do modelo (e.g. "gemini-3-flash-preview" or "google/gemini-3-flash-preview")
 * @returns {LanguageModel} - Instância do modelo configurada
 */
export function getLanguageModel(modelId) {
  // Normalize: strip "google/" prefix if present (legacy IDs)
  const normalizedId = modelId.replace(/^google\//, "");

  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY não configurada');
  }

  console.log(`[Providers] Usando Gemini Native: ${normalizedId}`);
  return googleNative(normalizedId);
}

/**
 * Retorna o modelo padrão para artifacts (mais capaz)
 */
export function getArtifactModel() {
  return getLanguageModel('gemini-3-flash-preview');
}

/**
 * Retorna o modelo configurado na brand profile ou default
 */
export function getBrandModel(brandProfile) {
  if (brandProfile?.preferredAIModel) {
    return getLanguageModel(brandProfile.preferredAIModel);
  }
  return getLanguageModel('gemini-3-flash-preview');
}

// ============================================================================
// MODELOS SUPORTADOS
// ============================================================================

export const SUPPORTED_MODELS = [
  { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash', provider: 'Google', fast: true },
  { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro', provider: 'Google', fast: false },
];

export function isModelSupported(modelId) {
  const normalized = modelId.replace(/^google\//, "");
  return SUPPORTED_MODELS.some(m => m.id === normalized);
}

export function getModelInfo(modelId) {
  const normalized = modelId.replace(/^google\//, "");
  return SUPPORTED_MODELS.find(m => m.id === normalized) || null;
}
