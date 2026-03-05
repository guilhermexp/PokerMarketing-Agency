/**
 * AI Client Factories — low-level SDK instances.
 *
 * ┌────────────────────────────────────────────────────────────────┐
 * │  This file only creates SDK clients.                           │
 * │  For text generation, use text-generation.mjs.                 │
 * │  For model IDs, use models.mjs.                                │
 * └────────────────────────────────────────────────────────────────┘
 *
 * Exports: getGeminiAi, configureFal
 */

import { GoogleGenAI } from "@google/genai";
import { fal } from "@fal-ai/client";

let cachedGeminiAi = null;
export const getGeminiAi = () => {
  if (cachedGeminiAi) return cachedGeminiAi;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not configured");
  }
  cachedGeminiAi = new GoogleGenAI({ apiKey });
  return cachedGeminiAi;
};

export const configureFal = () => {
  const apiKey = process.env.FAL_KEY;
  if (!apiKey) {
    throw new Error("FAL_KEY environment variable is not configured");
  }
  fal.config({ credentials: apiKey });
};
