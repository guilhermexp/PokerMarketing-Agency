/**
 * Gemini image provider adapter.
 *
 * generate() — text-to-image (with optional reference images)
 * edit()     — instruction-based image editing
 *
 * Returns data URLs (data:mime;base64,...).
 * Uses withRetry(..., 1) — single internal attempt; the external fallback
 * loop in image-providers.ts handles cross-provider retries.
 */

import { getGeminiAi } from "../clients.js";
import { withRetry } from "../retry.js";
import { mapAspectRatio, DEFAULT_IMAGE_MODEL, STANDARD_IMAGE_MODEL } from "../image-generation.js";
import logger from "../../logger.js";

// ============================================================================
// TYPES
// ============================================================================

export interface ImageReference {
  base64: string;
  mimeType: string;
}

export interface GenerateParams {
  prompt: string;
  aspectRatio?: string;
  imageSize?: string;
  productImages?: ImageReference[];
  styleRef?: ImageReference;
  personRef?: ImageReference;
  modelTier?: "standard" | "pro";
}

export interface EditParams {
  prompt: string;
  imageBase64: string;
  mimeType: string;
  referenceImage?: ImageReference;
  modelTier?: "standard" | "pro";
}

export interface ProviderResult {
  imageUrl: string;
  usedModel: string;
}

interface GeminiPart {
  text?: string;
  inlineData?: {
    data: string;
    mimeType: string;
  };
}

interface GeminiCandidate {
  content?: {
    parts?: GeminiPart[];
  };
  finishReason?: string;
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Extract the first image from a Gemini response.
 */
function extractImageFromResponse(response: GeminiResponse): string {
  const parts = response?.candidates?.[0]?.content?.parts;

  if (!Array.isArray(parts)) {
    const finishReason = response?.candidates?.[0]?.finishReason;
    if (finishReason === "SAFETY") {
      throw new Error("O prompt foi bloqueado por políticas de segurança. Tente reformular.");
    }
    throw new Error("Failed to generate image - invalid response structure");
  }

  for (const part of parts) {
    if (part.inlineData) {
      return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
    }
  }

  throw new Error("Failed to generate image - no image data in response");
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Generate an image with Gemini.
 */
export async function generate({
  prompt,
  aspectRatio = "1:1",
  imageSize = "1K",
  productImages,
  styleRef,
  personRef,
  modelTier,
}: GenerateParams): Promise<ProviderResult> {
  const ai = getGeminiAi();
  const model = modelTier === "standard" ? STANDARD_IMAGE_MODEL : DEFAULT_IMAGE_MODEL;
  const parts: GeminiPart[] = [{ text: prompt }];

  if (personRef) {
    parts.push({ inlineData: { data: personRef.base64, mimeType: personRef.mimeType } });
  }
  if (styleRef) {
    parts.push({ inlineData: { data: styleRef.base64, mimeType: styleRef.mimeType } });
  }
  if (productImages) {
    for (const img of productImages) {
      parts.push({ inlineData: { data: img.base64, mimeType: img.mimeType } });
    }
  }

  logger.debug(
    { model, aspectRatio: mapAspectRatio(aspectRatio), imageSize, partsCount: parts.length },
    "[GeminiAdapter] generate",
  );

  const response = await withRetry(
    () =>
      ai.models.generateContent({
        model,
        contents: { parts },
        config: {
          responseModalities: ["TEXT", "IMAGE"],
          temperature: 0.7,
          imageConfig: {
            aspectRatio: mapAspectRatio(aspectRatio),
            imageSize,
          },
        },
      }),
    3, // retry up to 3x on timeout/transient errors before falling back
  ) as GeminiResponse;

  const imageUrl = extractImageFromResponse(response);
  return { imageUrl, usedModel: model };
}

/**
 * Edit an image with Gemini.
 */
export async function edit({
  prompt,
  imageBase64,
  mimeType,
  referenceImage,
  modelTier,
}: EditParams): Promise<ProviderResult> {
  const ai = getGeminiAi();
  const model = modelTier === "standard" ? STANDARD_IMAGE_MODEL : DEFAULT_IMAGE_MODEL;

  const parts: GeminiPart[] = [
    { text: prompt },
    { inlineData: { data: imageBase64, mimeType } },
  ];

  if (referenceImage) {
    parts.push({
      inlineData: { data: referenceImage.base64, mimeType: referenceImage.mimeType },
    });
  }

  logger.debug(
    { model, partsCount: parts.length },
    "[GeminiAdapter] edit",
  );

  const response = await withRetry(
    () =>
      ai.models.generateContent({
        model,
        contents: { parts },
        config: {
          responseModalities: ["TEXT", "IMAGE"],
          temperature: 0.7,
          imageConfig: { aspectRatio: "1:1", imageSize: "1K" },
        },
      }),
    1,
  ) as GeminiResponse;

  const imageUrl = extractImageFromResponse(response);
  return { imageUrl, usedModel: model };
}
