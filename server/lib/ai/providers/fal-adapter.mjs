/**
 * FAL.ai image provider adapter.
 *
 * Delegates to generateImageWithFal / editImageWithFal from fal-image-generation.mjs.
 * Returns HTTP URLs (from FAL.ai CDN).
 */

import {
  generateImageWithFal,
  editImageWithFal,
} from "../fal-image-generation.mjs";
import { mapAspectRatio } from "../image-generation.mjs";
import logger from "../../logger.mjs";

/**
 * Generate an image with FAL.ai.
 *
 * @param {object} params
 * @param {string} params.prompt
 * @param {string} [params.aspectRatio]
 * @param {string} [params.imageSize]
 * @param {Array<{base64: string, mimeType: string}>} [params.productImages]
 * @param {{base64: string, mimeType: string}} [params.styleRef]
 * @param {{base64: string, mimeType: string}} [params.personRef]
 * @param {string} [params.modelTier] - "standard" or "pro" (default: "pro")
 * @returns {Promise<{imageUrl: string, usedModel: string}>}
 */
export async function generate({
  prompt,
  aspectRatio = "1:1",
  imageSize = "1K",
  productImages,
  styleRef,
  personRef,
  modelTier,
}) {
  logger.debug(
    { aspectRatio, imageSize, modelTier },
    "[FalAdapter] generate",
  );

  const result = await generateImageWithFal(
    prompt,
    mapAspectRatio(aspectRatio),
    imageSize,
    productImages,
    styleRef,
    personRef,
    modelTier,
  );

  return { imageUrl: result.url, usedModel: result.usedModel };
}

/**
 * Edit an image with FAL.ai.
 *
 * @param {object} params
 * @param {string} params.prompt
 * @param {string} params.imageBase64 - Base64 (no data: prefix)
 * @param {string} params.mimeType
 * @param {{base64: string, mimeType: string}} [params.referenceImage]
 * @param {string} [params.modelTier] - "standard" or "pro" (default: "pro")
 * @returns {Promise<{imageUrl: string, usedModel: string}>}
 */
export async function edit({ prompt, imageBase64, mimeType, referenceImage, modelTier }) {
  logger.debug({ modelTier }, "[FalAdapter] edit");

  const result = await editImageWithFal(prompt, imageBase64, mimeType, referenceImage, modelTier);

  return { imageUrl: result.url, usedModel: result.usedModel };
}
