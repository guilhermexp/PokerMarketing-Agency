/**
 * Image Generation — Gemini native image generation with provider fallback.
 *
 * ┌────────────────────────────────────────────────────────────────┐
 * │  This file handles IMAGE generation only.                      │
 * │  For text generation, use text-generation.mjs.                 │
 * │  For model IDs, use models.mjs.                                │
 * └────────────────────────────────────────────────────────────────┘
 *
 * Exports: generateGeminiImage, generateImageWithFallback, mapAspectRatio,
 *          DEFAULT_IMAGE_MODEL, STANDARD_IMAGE_MODEL, FAL_IMAGE_MODEL
 */

import { getGeminiAi } from "./clients.mjs";
import { withRetry } from "./retry.mjs";
import {
  IMAGE_MODEL_PRO,
  IMAGE_MODEL_STANDARD,
} from "./models.mjs";
import { FAL_IMAGE_MODEL } from "./fal-image-generation.mjs";
import { runWithProviderFallback } from "./image-providers.mjs";
import logger from "../logger.mjs";

// Re-export model constants for backward compatibility
export const DEFAULT_IMAGE_MODEL = IMAGE_MODEL_PRO;
export const STANDARD_IMAGE_MODEL = IMAGE_MODEL_STANDARD;
export { FAL_IMAGE_MODEL };

export const mapAspectRatio = (ratio) => {
  const map = {
    "1:1": "1:1",
    "9:16": "9:16",
    "16:9": "16:9",
    "1.91:1": "16:9",
    "4:5": "4:5",
    "3:4": "3:4",
    "4:3": "4:3",
    "2:3": "2:3",
    "3:2": "3:2",
  };
  return map[ratio] || "1:1";
};

export const generateGeminiImage = async (
  prompt,
  aspectRatio,
  model = DEFAULT_IMAGE_MODEL,
  imageSize = "1K",
  productImages,
  styleReferenceImage,
  personReferenceImage,
  maxRetries = 3,
) => {
  logger.debug(
    { model, aspectRatio: mapAspectRatio(aspectRatio), imageSize },
    "[generateGeminiImage] Iniciando geração",
  );

  const ai = getGeminiAi();
  const parts = [{ text: prompt }];

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
          temperature: 0.7,
          imageConfig: {
            aspectRatio: mapAspectRatio(aspectRatio),
            imageSize,
          },
        },
      }),
    maxRetries,
  );

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
};

export const generateImageWithFallback = async (
  prompt,
  aspectRatio,
  model = DEFAULT_IMAGE_MODEL,
  imageSize = "1K",
  productImages,
  styleReferenceImage,
  personReferenceImage,
) => {
  logger.info({}, "[generateImageWithFallback] Using provider chain");

  const normalizedModel = String(model || DEFAULT_IMAGE_MODEL).toLowerCase();
  const isStandardModel =
    normalizedModel === "gemini-3.1-flash-image-preview" ||
    normalizedModel === "gemini-2.5-flash-image" ||
    normalizedModel === "gemini-25-flash-image" ||
    normalizedModel === "nano-banana-2" ||
    normalizedModel === "google/nano-banana-2" ||
    normalizedModel === "nano-banana" ||
    normalizedModel === "google/nano-banana";
  const modelTier = isStandardModel ? "standard" : "pro";
  const replicateModel =
    normalizedModel === "nano-banana-2" || normalizedModel === "google/nano-banana-2"
      ? undefined
      : normalizedModel === "nano-banana"
        ? "google/nano-banana"
      : normalizedModel === "nano-banana-pro"
        ? "google/nano-banana-pro"
        : normalizedModel === "google/nano-banana" ||
            normalizedModel === "google/nano-banana-pro"
          ? normalizedModel
          : undefined;

  return runWithProviderFallback("generate", {
    prompt,
    aspectRatio,
    imageSize,
    productImages,
    styleRef: styleReferenceImage,
    personRef: personReferenceImage,
    modelTier,
    replicateModel,
  });
};
