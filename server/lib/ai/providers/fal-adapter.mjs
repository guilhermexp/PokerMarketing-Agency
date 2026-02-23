/**
 * FAL.ai image provider adapter.
 *
 * Delegates to generateImageWithFal / editImageWithFal from fal-image-generation.mjs.
 * Returns HTTP URLs (from FAL.ai CDN).
 */

import {
  generateImageWithFal,
  editImageWithFal,
  FAL_IMAGE_MODEL,
  FAL_EDIT_MODEL,
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
  logger.debug(
    { aspectRatio, imageSize },
    "[FalAdapter] generate",
  );

  const imageUrl = await generateImageWithFal(
    prompt,
    mapAspectRatio(aspectRatio),
    imageSize,
    productImages,
    styleRef,
    personRef,
  );

  // Determine which model was used (edit endpoint if images were provided)
  const hasImages =
    (personRef || styleRef || (productImages && productImages.length > 0));
  const usedModel = hasImages ? FAL_EDIT_MODEL : FAL_IMAGE_MODEL;

  return { imageUrl, usedModel };
}

/**
 * Edit an image with FAL.ai.
 *
 * @param {object} params
 * @param {string} params.prompt
 * @param {string} params.imageBase64 - Base64 (no data: prefix)
 * @param {string} params.mimeType
 * @param {{base64: string, mimeType: string}} [params.referenceImage]
 * @returns {Promise<{imageUrl: string, usedModel: string}>}
 */
export async function edit({ prompt, imageBase64, mimeType, referenceImage }) {
  logger.debug({}, "[FalAdapter] edit");

  const imageUrl = await editImageWithFal(prompt, imageBase64, mimeType, referenceImage);

  return { imageUrl, usedModel: FAL_EDIT_MODEL };
}
