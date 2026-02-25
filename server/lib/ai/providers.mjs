/**
 * Providers Wrapper — Vercel AI SDK language model factory.
 *
 * ┌────────────────────────────────────────────────────────────────┐
 * │  For model IDs, see models.mjs.                                │
 * │  For text generation, see text-generation.mjs.                 │
 * │  This file only wraps the Vercel AI SDK provider.              │
 * └────────────────────────────────────────────────────────────────┘
 *
 * Exports: getLanguageModel, getArtifactModel, getBrandModel,
 *          SUPPORTED_MODELS, isModelSupported, getModelInfo
 */

import { google } from '@ai-sdk/google';
import {
  normalizeModelId,
  TEXT_MODEL,
  SUPPORTED_CHAT_MODELS,
} from './models.mjs';

// ============================================================================
// PROVIDER INSTANCE
// ============================================================================

const googleNative = google({
  apiKey: process.env.GEMINI_API_KEY,
});

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get a Vercel AI SDK language model instance by ID.
 *
 * @param {string} modelId - e.g. "gemini-3-flash-preview" or "google/gemini-3-flash-preview"
 * @returns {LanguageModel}
 */
export function getLanguageModel(modelId) {
  const normalizedId = normalizeModelId(modelId);

  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY não configurada');
  }

  console.log(`[Providers] Usando Gemini Native: ${normalizedId}`);
  return googleNative(normalizedId);
}

/**
 * Get default model for artifacts (most capable).
 */
export function getArtifactModel() {
  return getLanguageModel(TEXT_MODEL);
}

/**
 * Get model configured in brand profile or default.
 */
export function getBrandModel(brandProfile) {
  if (brandProfile?.preferredAIModel) {
    return getLanguageModel(brandProfile.preferredAIModel);
  }
  return getLanguageModel(TEXT_MODEL);
}

// ============================================================================
// SUPPORTED MODELS (re-exported from models.mjs with provider info)
// ============================================================================

export const SUPPORTED_MODELS = SUPPORTED_CHAT_MODELS.map((m) => ({
  ...m,
  provider: 'Google',
}));

export function isModelSupported(modelId) {
  const normalized = normalizeModelId(modelId);
  return SUPPORTED_MODELS.some((m) => m.id === normalized);
}

export function getModelInfo(modelId) {
  const normalized = normalizeModelId(modelId);
  return SUPPORTED_MODELS.find((m) => m.id === normalized) || null;
}
