/**
 * Gemini image provider adapter.
 *
 * generate() — text-to-image (with optional reference images)
 * edit()     — instruction-based image editing
 *
 * Returns data URLs (data:mime;base64,...).
 * Uses withRetry(..., 1) — single internal attempt; the external fallback
 * loop in image-providers.mjs handles cross-provider retries.
 */

import { getGeminiAi } from "../clients.mjs";
import { withRetry } from "../retry.mjs";
import { mapAspectRatio, DEFAULT_IMAGE_MODEL } from "../image-generation.mjs";
import logger from "../../logger.mjs";

/**
 * Extract the first image from a Gemini response.
 * @returns {string} data URL
 */
function extractImageFromResponse(response) {
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

/**
 * Generate an image with Gemini.
 *
 * @param {object} params
 * @param {string} params.prompt
 * @param {string} [params.aspectRatio]
 * @param {string} [params.imageSize]
 * @param {Array<{base64: string, mimeType: string}>} [params.productImages]
 * @param {{base64: string, mimeType: string}} [params.styleRef]
 * @param {{base64: string, mimeType: string}} [params.personRef]
 * @returns {Promise<{imageUrl: string, usedModel: string}>}
 */
export async function generate({
  prompt,
  aspectRatio = "1:1",
  imageSize = "1K",
  productImages,
  styleRef,
  personRef,
}) {
  const ai = getGeminiAi();
  const model = DEFAULT_IMAGE_MODEL;
  const parts = [{ text: prompt }];

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
          temperature: 0.7,
          imageConfig: {
            aspectRatio: mapAspectRatio(aspectRatio),
            imageSize,
          },
        },
      }),
    1, // single attempt — fallback loop handles retries across providers
  );

  const imageUrl = extractImageFromResponse(response);
  return { imageUrl, usedModel: model };
}

/**
 * Edit an image with Gemini.
 *
 * @param {object} params
 * @param {string} params.prompt - Edit instruction
 * @param {string} params.imageBase64 - Base64 of image to edit (no data: prefix)
 * @param {string} params.mimeType
 * @param {{base64: string, mimeType: string}} [params.referenceImage]
 * @returns {Promise<{imageUrl: string, usedModel: string}>}
 */
export async function edit({ prompt, imageBase64, mimeType, referenceImage }) {
  const ai = getGeminiAi();
  const model = DEFAULT_IMAGE_MODEL;

  const parts = [
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
          temperature: 0.7,
          imageConfig: { aspectRatio: "1:1", imageSize: "1K" },
        },
      }),
    1,
  );

  const imageUrl = extractImageFromResponse(response);
  return { imageUrl, usedModel: model };
}
