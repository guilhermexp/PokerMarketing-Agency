/**
 * AI Model Configuration — Single source of truth for all model IDs.
 *
 * ┌────────────────────────────────────────────────────────────────┐
 * │  TO ADD/CHANGE MODELS: Only modify THIS file.                 │
 * │  All other files import model constants from here.            │
 * └────────────────────────────────────────────────────────────────┘
 *
 * Exports:
 *   Text:    TEXT_MODEL, TEXT_MODEL_FAST, TEXT_MODEL_PRO, ASSISTANT_MODEL
 *   Image:   IMAGE_MODEL_PRO, IMAGE_MODEL_STANDARD
 *   Video:   VIDEO_MODEL
 *   TTS:     TTS_MODEL, TTS_MODEL_PRO
 *   Schema:  Type
 *   Helpers: normalizeModelId, SUPPORTED_CHAT_MODELS
 *
 * Legacy aliases (backward compat with brandProfile.creativeModel):
 *   DEFAULT_TEXT_MODEL, DEFAULT_FAST_TEXT_MODEL, DEFAULT_ASSISTANT_MODEL,
 *   AI_INFLUENCER_FLASH_MODEL, DEFAULT_IMAGE_MODEL, STANDARD_IMAGE_MODEL
 */

// ============================================================================
// TEXT GENERATION MODELS
// ============================================================================
export const TEXT_MODEL = "gemini-3-flash-preview";
export const TEXT_MODEL_FAST = "gemini-3-flash-preview";
export const TEXT_MODEL_PRO = "gemini-3-pro-preview";
export const ASSISTANT_MODEL = "gemini-3-flash-preview";

// ============================================================================
// IMAGE GENERATION MODELS (native Gemini)
// ============================================================================
export const IMAGE_MODEL_PRO = "gemini-3-pro-image-preview";
export const IMAGE_MODEL_STANDARD = "gemini-2.5-flash-image";

// ============================================================================
// VIDEO GENERATION MODELS
// ============================================================================
export const VIDEO_MODEL = "veo-3.0-generate-preview";

// ============================================================================
// TTS MODELS
// ============================================================================
export const TTS_MODEL = "gemini-2.5-flash-preview-tts";
export const TTS_MODEL_PRO = "gemini-2.5-pro-preview-tts";

// ============================================================================
// SCHEMA TYPE CONSTANTS (for Gemini structured output)
// ============================================================================
export const Type = {
  OBJECT: "OBJECT",
  ARRAY: "ARRAY",
  STRING: "STRING",
  INTEGER: "INTEGER",
  BOOLEAN: "BOOLEAN",
  NUMBER: "NUMBER",
};

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Normalize model ID — strips "google/" prefix from legacy OpenRouter IDs.
 * e.g. "google/gemini-3-flash-preview" → "gemini-3-flash-preview"
 */
export function normalizeModelId(modelId) {
  return modelId.replace(/^google\//, "");
}

/**
 * Supported chat models for the Vercel AI SDK chat endpoint.
 */
export const SUPPORTED_CHAT_MODELS = [
  { id: "gemini-3-flash-preview", name: "Gemini 3 Flash", fast: true },
  { id: "gemini-3-pro-preview", name: "Gemini 3 Pro", fast: false },
];

// ============================================================================
// LEGACY ALIASES — used by existing code, brand profiles, prompt-builders
// ============================================================================
export const DEFAULT_TEXT_MODEL = TEXT_MODEL;
export const DEFAULT_FAST_TEXT_MODEL = TEXT_MODEL_FAST;
export const DEFAULT_ASSISTANT_MODEL = ASSISTANT_MODEL;
export const AI_INFLUENCER_FLASH_MODEL = TEXT_MODEL;
export const DEFAULT_IMAGE_MODEL = IMAGE_MODEL_PRO;
export const STANDARD_IMAGE_MODEL = IMAGE_MODEL_STANDARD;
