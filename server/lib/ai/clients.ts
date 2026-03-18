/**
 * AI Client Factories — low-level SDK instances.
 *
 * ┌────────────────────────────────────────────────────────────────┐
 * │  This file only creates SDK clients.                           │
 * │  For text generation, use text-generation.ts.                  │
 * │  For model IDs, use models.ts.                                 │
 * └────────────────────────────────────────────────────────────────┘
 *
 * Exports: getGeminiAi, configureFal
 */

import { GoogleGenAI } from "@google/genai";
import { fal } from "@fal-ai/client";

let cachedGeminiAi: GoogleGenAI | null = null;

export function getGeminiAi(): GoogleGenAI {
  if (cachedGeminiAi) return cachedGeminiAi;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not configured");
  }
  cachedGeminiAi = new GoogleGenAI({
    apiKey,
    httpOptions: { timeout: 120_000 }, // 120s — image generation needs more time
  });
  return cachedGeminiAi;
}

export function configureFal(): void {
  const apiKey = process.env.FAL_KEY;
  if (!apiKey) {
    throw new Error("FAL_KEY environment variable is not configured");
  }
  fal.config({ credentials: apiKey });
}
