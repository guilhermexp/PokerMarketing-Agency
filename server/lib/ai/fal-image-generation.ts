/**
 * Image generation via FAL.ai (Standard fallback: Gemini 2.5 Flash, Pro: Gemini 3 Pro).
 *
 * Used as fallback when Google Gemini direct API returns 429/RESOURCE_EXHAUSTED.
 * Supports both Standard (gemini-25-flash-image) and Pro (gemini-3-pro-image-preview) tiers.
 * Note: Standard fallback remains on the legacy FAL endpoint until a Gemini 3.1 Flash Image endpoint is confirmed on FAL.
 *
 * Exports: generateImageWithFal, editImageWithFal, FAL_IMAGE_MODEL, FAL_EDIT_MODEL,
 *          FAL_IMAGE_MODEL_STANDARD, FAL_EDIT_MODEL_STANDARD
 */

import { fal } from "@fal-ai/client";
import { put } from "@vercel/blob";
import { configureFal } from "./clients.js";
import logger from "../logger.js";

// ============================================================================
// CONSTANTS
// ============================================================================

export const FAL_IMAGE_MODEL = "fal-ai/gemini-3-pro-image-preview";
export const FAL_EDIT_MODEL = "fal-ai/gemini-3-pro-image-preview/edit";
export const FAL_IMAGE_MODEL_STANDARD = "fal-ai/gemini-25-flash-image";
export const FAL_EDIT_MODEL_STANDARD = "fal-ai/gemini-25-flash-image/edit";

// ============================================================================
// TYPES
// ============================================================================

export interface ImageReference {
  base64: string;
  mimeType: string;
}

export interface FalImageResult {
  url: string;
  usedModel: string;
}

interface FalResponse {
  data?: {
    images?: Array<{ url: string }>;
  };
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Upload a base64 image to Vercel Blob so FAL.ai can access it via HTTP URL.
 */
async function uploadBase64ToBlob(
  base64: string,
  mimeType: string,
  prefix: string = "fal-ref",
): Promise<string> {
  const buffer = Buffer.from(base64, "base64");
  const ext = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";
  const filename = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const blob = await put(filename, buffer, {
    access: "public",
    contentType: mimeType,
  });

  return blob.url;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Generate an image via FAL.ai using the Gemini 3 Pro Image Preview model.
 */
export async function generateImageWithFal(
  prompt: string,
  aspectRatio: string | undefined,
  imageSize: string = "1K",
  productImages?: ImageReference[],
  styleReferenceImage?: ImageReference,
  personReferenceImage?: ImageReference,
  modelTier?: "standard" | "pro",
): Promise<FalImageResult> {
  configureFal();

  const isStandard = modelTier === "standard";
  const genModel = isStandard ? FAL_IMAGE_MODEL_STANDARD : FAL_IMAGE_MODEL;
  const editModel = isStandard ? FAL_EDIT_MODEL_STANDARD : FAL_EDIT_MODEL;

  // Collect all reference images
  const refImages: ImageReference[] = [];
  if (personReferenceImage) refImages.push(personReferenceImage);
  if (styleReferenceImage) refImages.push(styleReferenceImage);
  if (productImages && productImages.length > 0) refImages.push(...productImages);

  const hasImages = refImages.length > 0;

  if (hasImages) {
    // Upload all images to Blob for FAL.ai (needs HTTP URLs)
    logger.info(
      { imageCount: refImages.length },
      "[FAL] Uploading reference images to Blob for FAL.ai",
    );
    const imageUrls = await Promise.all(
      refImages.slice(0, 14).map((img) => uploadBase64ToBlob(img.base64, img.mimeType, "fal-ref")),
    );

    const input: Record<string, unknown> = {
      prompt,
      image_urls: imageUrls,
      output_format: "png",
    };
    if (aspectRatio) input.aspect_ratio = aspectRatio;
    if (["1K", "2K", "4K"].includes(imageSize)) input.resolution = imageSize;

    logger.info(
      { endpoint: editModel, imageUrlsCount: imageUrls.length, modelTier: isStandard ? "standard" : "pro" },
      "[FAL] Calling FAL.ai edit endpoint with reference images",
    );

    const result = await fal.subscribe(editModel, {
      input: input as Parameters<typeof fal.subscribe>[1]["input"],
      logs: true,
    }) as FalResponse;

    const url = result?.data?.images?.[0]?.url;
    if (!url) {
      throw new Error("[FAL] No image URL in response");
    }
    return { url, usedModel: editModel };
  }

  // Text-to-image (no reference images)
  const input: Record<string, unknown> = {
    prompt,
    output_format: "png",
  };
  if (aspectRatio) input.aspect_ratio = aspectRatio;
  if (["1K", "2K", "4K"].includes(imageSize)) input.resolution = imageSize;

  logger.info(
    { endpoint: genModel, aspectRatio, imageSize, modelTier: isStandard ? "standard" : "pro" },
    "[FAL] Calling FAL.ai text-to-image",
  );

  const result = await fal.subscribe(genModel, {
    input: input as Parameters<typeof fal.subscribe>[1]["input"],
    logs: true,
  }) as FalResponse;

  const url = result?.data?.images?.[0]?.url;
  if (!url) {
    throw new Error("[FAL] No image URL in response");
  }
  return { url, usedModel: genModel };
}

/**
 * Edit an image via FAL.ai using the Gemini 3 Pro Image Preview /edit endpoint.
 */
export async function editImageWithFal(
  prompt: string,
  imageBase64: string,
  mimeType: string,
  referenceImage?: ImageReference,
  modelTier?: "standard" | "pro",
): Promise<FalImageResult> {
  configureFal();

  const isStandard = modelTier === "standard";
  const editModel = isStandard ? FAL_EDIT_MODEL_STANDARD : FAL_EDIT_MODEL;

  // Upload the main image to Blob
  const imageUrls = [await uploadBase64ToBlob(imageBase64, mimeType, "fal-edit")];

  // Upload reference image if provided
  if (referenceImage) {
    imageUrls.push(
      await uploadBase64ToBlob(referenceImage.base64, referenceImage.mimeType, "fal-edit-ref"),
    );
  }

  const input: Record<string, unknown> = {
    prompt,
    image_urls: imageUrls,
    resolution: "1K",
    output_format: "png",
  };

  logger.info(
    { endpoint: editModel, imageUrlsCount: imageUrls.length, modelTier: isStandard ? "standard" : "pro" },
    "[FAL] Calling FAL.ai edit endpoint",
  );

  const result = await fal.subscribe(editModel, {
    input: input as Parameters<typeof fal.subscribe>[1]["input"],
    logs: true,
  }) as FalResponse;

  const url = result?.data?.images?.[0]?.url;
  if (!url) {
    throw new Error("[FAL] No image URL in edit response");
  }
  return { url, usedModel: editModel };
}
