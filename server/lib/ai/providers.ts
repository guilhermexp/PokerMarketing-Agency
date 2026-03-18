/**
 * Providers Wrapper — Vercel AI SDK language model factory.
 *
 * ┌────────────────────────────────────────────────────────────────┐
 * │  For model IDs, see models.ts.                                 │
 * │  For text generation, see text-generation.ts.                  │
 * │  This file only wraps the Vercel AI SDK provider.              │
 * └────────────────────────────────────────────────────────────────┘
 *
 * Exports: getLanguageModel, getArtifactModel, getBrandModel,
 *          SUPPORTED_MODELS, isModelSupported, getModelInfo
 */

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";
import logger from "../logger.js";
import {
  normalizeModelId,
  TEXT_MODEL,
  SUPPORTED_CHAT_MODELS,
} from "./models.js";

// ============================================================================
// TYPES
// ============================================================================

export interface SupportedModel {
  id: string;
  name: string;
  fast: boolean;
  provider: string;
}

export interface BrandProfile {
  preferredAIModel?: string;
  [key: string]: unknown;
}

// ============================================================================
// PROVIDER INSTANCE
// ============================================================================

const googleProvider = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get a Vercel AI SDK language model instance by ID.
 */
export function getLanguageModel(modelId: string): LanguageModel {
  const normalizedId = normalizeModelId(modelId);

  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY não configurada");
  }

  logger.info(`[Providers] Usando Gemini Native: ${normalizedId}`);
  return googleProvider(normalizedId);
}

/**
 * Get default model for artifacts (most capable).
 */
export function getArtifactModel(): LanguageModel {
  return getLanguageModel(TEXT_MODEL);
}

/**
 * Get model configured in brand profile or default.
 */
export function getBrandModel(brandProfile?: BrandProfile | null): LanguageModel {
  if (brandProfile?.preferredAIModel) {
    return getLanguageModel(brandProfile.preferredAIModel);
  }
  return getLanguageModel(TEXT_MODEL);
}

// ============================================================================
// SUPPORTED MODELS (re-exported from models.ts with provider info)
// ============================================================================

export const SUPPORTED_MODELS: SupportedModel[] = SUPPORTED_CHAT_MODELS.map((m) => ({
  ...m,
  provider: "Google",
}));

export function isModelSupported(modelId: string): boolean {
  const normalized = normalizeModelId(modelId);
  return SUPPORTED_MODELS.some((m) => m.id === normalized);
}

export function getModelInfo(modelId: string): SupportedModel | null {
  const normalized = normalizeModelId(modelId);
  return SUPPORTED_MODELS.find((m) => m.id === normalized) || null;
}
