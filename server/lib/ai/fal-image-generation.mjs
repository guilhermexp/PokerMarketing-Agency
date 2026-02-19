/**
 * Image generation via FAL.ai (Gemini 3 Pro Image Preview).
 *
 * Used as fallback when Google Gemini direct API returns 429/RESOURCE_EXHAUSTED.
 * Same model (gemini-3-pro-image-preview) running on FAL.ai infrastructure.
 *
 * Exports: generateImageWithFal, editImageWithFal, FAL_IMAGE_MODEL, FAL_EDIT_MODEL
 */

import { fal } from "@fal-ai/client";
import { put } from "@vercel/blob";
import { configureFal } from "./clients.mjs";
import logger from "../logger.mjs";

export const FAL_IMAGE_MODEL = "fal-ai/gemini-3-pro-image-preview";
export const FAL_EDIT_MODEL = "fal-ai/gemini-3-pro-image-preview/edit";

/**
 * Upload a base64 image to Vercel Blob so FAL.ai can access it via HTTP URL.
 * @param {string} base64 - Raw base64 string (no data: prefix)
 * @param {string} mimeType - e.g. "image/png"
 * @param {string} prefix - Filename prefix
 * @returns {Promise<string>} Public HTTP URL
 */
async function uploadBase64ToBlob(base64, mimeType, prefix = "fal-ref") {
  const buffer = Buffer.from(base64, "base64");
  const ext = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";
  const filename = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const blob = await put(filename, buffer, {
    access: "public",
    contentType: mimeType,
  });

  return blob.url;
}

/**
 * Generate an image via FAL.ai using the Gemini 3 Pro Image Preview model.
 *
 * @param {string} prompt - Text prompt
 * @param {string} aspectRatio - e.g. "1:1", "16:9"
 * @param {string} imageSize - "1K", "2K", or "4K"
 * @param {Array<{base64: string, mimeType: string}>} [productImages] - Product/logo images
 * @param {{base64: string, mimeType: string}} [styleReferenceImage] - Style reference
 * @param {{base64: string, mimeType: string}} [personReferenceImage] - Person reference
 * @returns {Promise<string>} Image URL from FAL.ai
 */
export async function generateImageWithFal(
  prompt,
  aspectRatio,
  imageSize = "1K",
  productImages,
  styleReferenceImage,
  personReferenceImage,
) {
  configureFal();

  // Collect all reference images
  const refImages = [];
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

    const input = {
      prompt,
      image_urls: imageUrls,
      output_format: "png",
    };
    if (aspectRatio) input.aspect_ratio = aspectRatio;
    if (["1K", "2K", "4K"].includes(imageSize)) input.resolution = imageSize;

    logger.info(
      { endpoint: FAL_EDIT_MODEL, imageUrlsCount: imageUrls.length },
      "[FAL] Calling FAL.ai edit endpoint with reference images",
    );

    const result = await fal.subscribe(FAL_EDIT_MODEL, {
      input,
      logs: true,
    });

    const url = result?.data?.images?.[0]?.url;
    if (!url) {
      throw new Error("[FAL] No image URL in response");
    }
    return url;
  }

  // Text-to-image (no reference images)
  const input = {
    prompt,
    output_format: "png",
  };
  if (aspectRatio) input.aspect_ratio = aspectRatio;
  if (["1K", "2K", "4K"].includes(imageSize)) input.resolution = imageSize;

  logger.info(
    { endpoint: FAL_IMAGE_MODEL, aspectRatio, imageSize },
    "[FAL] Calling FAL.ai text-to-image",
  );

  const result = await fal.subscribe(FAL_IMAGE_MODEL, {
    input,
    logs: true,
  });

  const url = result?.data?.images?.[0]?.url;
  if (!url) {
    throw new Error("[FAL] No image URL in response");
  }
  return url;
}

/**
 * Edit an image via FAL.ai using the Gemini 3 Pro Image Preview /edit endpoint.
 *
 * @param {string} prompt - Edit instruction
 * @param {string} imageBase64 - Base64 of image to edit (no data: prefix)
 * @param {string} mimeType - MIME type of the image
 * @param {{base64: string, mimeType: string}} [referenceImage] - Optional reference image
 * @returns {Promise<string>} Edited image URL from FAL.ai
 */
export async function editImageWithFal(prompt, imageBase64, mimeType, referenceImage) {
  configureFal();

  // Upload the main image to Blob
  const imageUrls = [await uploadBase64ToBlob(imageBase64, mimeType, "fal-edit")];

  // Upload reference image if provided
  if (referenceImage) {
    imageUrls.push(
      await uploadBase64ToBlob(referenceImage.base64, referenceImage.mimeType, "fal-edit-ref"),
    );
  }

  const input = {
    prompt,
    image_urls: imageUrls,
    resolution: "1K",
    output_format: "png",
  };

  logger.info(
    { endpoint: FAL_EDIT_MODEL, imageUrlsCount: imageUrls.length },
    "[FAL] Calling FAL.ai edit endpoint",
  );

  const result = await fal.subscribe(FAL_EDIT_MODEL, {
    input,
    logs: true,
  });

  const url = result?.data?.images?.[0]?.url;
  if (!url) {
    throw new Error("[FAL] No image URL in edit response");
  }
  return url;
}
