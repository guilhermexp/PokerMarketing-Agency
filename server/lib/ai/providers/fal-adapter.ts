/**
 * FAL.ai image provider adapter.
 *
 * Delegates to generateImageWithFal / editImageWithFal from fal-image-generation.ts.
 * Returns HTTP URLs (from FAL.ai CDN).
 */

import {
  generateImageWithFal,
  editImageWithFal,
} from "../fal-image-generation.js";
import { mapAspectRatio } from "../image-generation.js";
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
  aspectRatio?: string;
  imageSize?: string;
  modelTier?: "standard" | "pro";
}

export interface ProviderResult {
  imageUrl: string;
  usedModel: string;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Generate an image with FAL.ai.
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
 */
export async function edit({
  prompt,
  imageBase64,
  mimeType,
  referenceImage,
  modelTier,
}: EditParams): Promise<ProviderResult> {
  logger.debug({ modelTier }, "[FalAdapter] edit");

  const result = await editImageWithFal(prompt, imageBase64, mimeType, referenceImage, modelTier);

  return { imageUrl: result.url, usedModel: result.usedModel };
}
