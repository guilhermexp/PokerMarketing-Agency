/**
 * Image Generation — Gemini native image generation only.
 *
 * ┌────────────────────────────────────────────────────────────────┐
 * │  This file handles IMAGE generation only.                      │
 * │  For text generation, use text-generation.ts.                  │
 * │  For model IDs, use models.ts.                                 │
 * └────────────────────────────────────────────────────────────────┘
 *
 * Exports: generateGeminiImage, generateImageWithFallback, mapAspectRatio,
 *          DEFAULT_IMAGE_MODEL, STANDARD_IMAGE_MODEL, FAL_IMAGE_MODEL
 */

import { getGeminiAi } from "./clients.js";
import { withRetry } from "./retry.js";
import {
  IMAGE_MODEL_PRO,
  IMAGE_MODEL_STANDARD,
} from "./models.js";
import { FAL_IMAGE_MODEL } from "./fal-image-generation.js";
import { runWithProviderFallback, type FallbackResult, type GenerateParams } from "./image-providers.js";
import logger from "../logger.js";

// ============================================================================
// CONSTANTS
// ============================================================================

// Re-export model constants for backward compatibility
export const DEFAULT_IMAGE_MODEL = IMAGE_MODEL_PRO;
export const STANDARD_IMAGE_MODEL = IMAGE_MODEL_STANDARD;
export { FAL_IMAGE_MODEL };

// ============================================================================
// TYPES
// ============================================================================

export interface ImageReference {
  base64: string;
  mimeType: string;
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
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
}

// ============================================================================
// HELPERS
// ============================================================================

export function mapAspectRatio(ratio: string): string {
  const supported = new Set([
    "1:1", "1:4", "1:8", "2:3", "3:2", "3:4",
    "4:1", "4:3", "4:5", "5:4", "8:1", "9:16", "16:9", "21:9",
  ]);
  // Map legacy/alternate names
  if (ratio === "1.91:1") return "16:9";
  return supported.has(ratio) ? ratio : "1:1";
}

// ============================================================================
// PUBLIC API
// ============================================================================

export async function generateGeminiImage(
  prompt: string,
  aspectRatio: string,
  model: string = DEFAULT_IMAGE_MODEL,
  imageSize: string = "1K",
  productImages?: ImageReference[],
  styleReferenceImage?: ImageReference,
  personReferenceImage?: ImageReference,
  maxRetries: number = 3,
): Promise<string> {
  logger.debug(
    { model, aspectRatio: mapAspectRatio(aspectRatio), imageSize },
    "[generateGeminiImage] Iniciando geração",
  );

  const ai = getGeminiAi();
  const parts: GeminiPart[] = [{ text: prompt }];

  if (personReferenceImage) {
    logger.debug(
      { mimeType: personReferenceImage.mimeType },
      "[generateGeminiImage] Adicionando personReferenceImage",
    );
    parts.push({
      inlineData: {
        data: personReferenceImage.base64,
        mimeType: personReferenceImage.mimeType,
      },
    });
  }

  if (styleReferenceImage) {
    logger.debug(
      { mimeType: styleReferenceImage.mimeType },
      "[generateGeminiImage] Adicionando styleReferenceImage",
    );
    parts.push({
      inlineData: {
        data: styleReferenceImage.base64,
        mimeType: styleReferenceImage.mimeType,
      },
    });
  }

  if (productImages) {
    logger.debug(
      { count: productImages.length },
      "[generateGeminiImage] Adicionando productImages",
    );
    productImages.forEach((img) => {
      parts.push({
        inlineData: { data: img.base64, mimeType: img.mimeType },
      });
    });
  }

  logger.debug(
    { partsCount: parts.length },
    "[generateGeminiImage] Chamando API do Gemini",
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
    maxRetries,
  ) as GeminiResponse;

  logger.debug({}, "[generateGeminiImage] Resposta recebida do Gemini");

  const responseParts = response?.candidates?.[0]?.content?.parts;
  logger.debug(
    {
      candidatesLength: response?.candidates?.length || 0,
      isArray: Array.isArray(responseParts),
      partsLength: responseParts?.length || 0,
    },
    "[generateGeminiImage] Processando resposta",
  );

  if (!Array.isArray(responseParts)) {
    logger.error(
      { response },
      "[generateGeminiImage] Estrutura de resposta inválida!",
    );
    throw new Error("Failed to generate image - invalid response structure");
  }

  for (const part of responseParts) {
    if (part.inlineData) {
      const mimeType = part.inlineData.mimeType;
      const dataLength = part.inlineData.data?.length || 0;
      logger.info(
        { mimeType, dataLength },
        "[generateGeminiImage] Imagem encontrada na resposta",
      );
      return `data:${mimeType};base64,${part.inlineData.data}`;
    }
  }

  logger.error(
    { responseParts },
    "[generateGeminiImage] Nenhuma imagem encontrada nos parts da resposta",
  );
  throw new Error("Failed to generate image - no image data in response");
}

export async function generateImageWithFallback(
  prompt: string,
  aspectRatio: string,
  model: string = DEFAULT_IMAGE_MODEL,
  imageSize: string = "1K",
  productImages?: ImageReference[],
  styleReferenceImage?: ImageReference,
  personReferenceImage?: ImageReference,
): Promise<FallbackResult> {
  logger.info({}, "[generateImageWithFallback] Using Gemini only");

  const normalizedModel = String(model || DEFAULT_IMAGE_MODEL).toLowerCase();
  const isStandardModel =
    normalizedModel === "gemini-3.1-flash-image-preview" ||
    normalizedModel === "gemini-2.5-flash-image" ||
    normalizedModel === "gemini-25-flash-image" ||
    normalizedModel === "nano-banana-2" ||
    normalizedModel === "google/nano-banana-2" ||
    normalizedModel === "nano-banana" ||
    normalizedModel === "google/nano-banana";
  const modelTier: "standard" | "pro" = isStandardModel ? "standard" : "pro";

  const params: GenerateParams = {
    prompt,
    aspectRatio,
    imageSize,
    productImages,
    styleRef: styleReferenceImage,
    personRef: personReferenceImage,
    modelTier,
  };

  return runWithProviderFallback("generate", params);
}
