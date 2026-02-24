/**
 * Replicate image provider adapter.
 *
 * Uses google/nano-banana-pro (same Gemini 3 Pro Image model as Gemini and FAL).
 * generate() — text-to-image (with optional reference images)
 * edit()     — image editing via image_input + prompt
 *
 * Returns HTTP URLs (from Replicate CDN).
 * Reference images must be HTTP URLs — base64 is uploaded to Vercel Blob first.
 */

import Replicate from "replicate";
import { put } from "@vercel/blob";
import logger from "../../logger.mjs";

export const REPLICATE_MODEL_PRO = "google/nano-banana-pro";
export const REPLICATE_MODEL_STANDARD = "google/nano-banana";

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 10_000; // Replicate rate limit resets in ~10s

let replicateClient = null;

function getClient() {
  if (!replicateClient) {
    replicateClient = new Replicate({
      auth: process.env.REPLICATE_API_TOKEN,
      useFileOutput: false, // Return plain URL strings, not FileOutput objects
    });
  }
  return replicateClient;
}

/**
 * Check if a Replicate error is a rate limit (429) that we should retry locally.
 */
function isRateLimitError(error) {
  const msg = String(error?.message || "").toLowerCase();
  return (
    error?.status === 429 ||
    msg.includes("429") ||
    msg.includes("rate limit") ||
    msg.includes("throttled")
  );
}

/**
 * Run a Replicate call with local retry on 429 rate limits.
 * This avoids immediately falling back to another provider when the rate limit
 * resets in just 10 seconds.
 */
async function runWithRateRetry(fn) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (isRateLimitError(error) && attempt < MAX_RETRIES) {
        const delay = RETRY_BASE_DELAY_MS * attempt;
        logger.warn(
          { attempt, maxRetries: MAX_RETRIES, delayMs: delay },
          `[ReplicateAdapter] Rate limited, retrying in ${delay / 1000}s`,
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw error;
    }
  }
}

/**
 * Upload base64 to Vercel Blob (Replicate needs HTTP URLs for image_input).
 */
async function uploadBase64ToBlob(base64, mimeType, prefix = "replicate-ref") {
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
 * Generate an image with Replicate.
 * Supports both nano-banana (Standard) and nano-banana-pro (Pro).
 *
 * @param {object} params
 * @param {string} params.prompt
 * @param {string} [params.aspectRatio]
 * @param {string} [params.imageSize]
 * @param {string} [params.modelTier] - "standard" or "pro" (default: "pro")
 * @param {string} [params.replicateModel] - Legacy override (backward-compat)
 * @param {Array<{base64: string, mimeType: string}>} [params.productImages]
 * @param {{base64: string, mimeType: string}} [params.styleRef]
 * @param {{base64: string, mimeType: string}} [params.personRef]
 * @returns {Promise<{imageUrl: string, usedModel: string}>}
 */
export async function generate({
  prompt,
  aspectRatio = "1:1",
  imageSize = "1K",
  modelTier,
  replicateModel,
  productImages,
  styleRef,
  personRef,
}) {
  const replicate = getClient();
  // Legacy override takes priority, then modelTier, default Pro
  const model = replicateModel || (modelTier === "standard" ? REPLICATE_MODEL_STANDARD : REPLICATE_MODEL_PRO);
  const isStandard = model === REPLICATE_MODEL_STANDARD;

  const input = {
    prompt,
    aspect_ratio: aspectRatio,
    output_format: "png",
  };

  // Standard (nano-banana) doesn't support resolution or safety_filter_level
  if (!isStandard) {
    input.resolution = imageSize;
    input.safety_filter_level = "block_only_high";
  }

  // Upload reference images to Blob (Replicate needs HTTP URLs)
  const refImages = [];
  if (personRef) refImages.push(personRef);
  if (styleRef) refImages.push(styleRef);
  if (productImages) refImages.push(...productImages);

  // Standard supports max 3 reference images, Pro supports 14
  const maxRefs = isStandard ? 3 : 14;
  if (refImages.length > 0) {
    const imageUrls = await Promise.all(
      refImages.slice(0, maxRefs).map((img) =>
        uploadBase64ToBlob(img.base64, img.mimeType, "replicate-ref"),
      ),
    );
    input.image_input = imageUrls;
  }

  logger.debug(
    { model, aspectRatio, imageSize, imageCount: refImages.length },
    "[ReplicateAdapter] generate",
  );

  const output = await runWithRateRetry(() => replicate.run(model, { input }));

  const imageUrl = typeof output === "string" ? output : String(output);
  if (!imageUrl || !imageUrl.startsWith("http")) {
    throw new Error("[Replicate] No valid image URL in response");
  }

  return { imageUrl, usedModel: model };
}

/**
 * Edit an image with Replicate (always uses Pro for quality).
 *
 * @param {object} params
 * @param {string} params.prompt - Edit instruction
 * @param {string} params.imageBase64 - Base64 (no data: prefix)
 * @param {string} params.mimeType
 * @param {{base64: string, mimeType: string}} [params.referenceImage]
 * @param {string} [params.modelTier] - "standard" or "pro" (default: "pro")
 * @returns {Promise<{imageUrl: string, usedModel: string}>}
 */
export async function edit({ prompt, imageBase64, mimeType, referenceImage, modelTier }) {
  const replicate = getClient();
  // Edit always uses Pro (Standard doesn't support edit well on Replicate)
  const model = REPLICATE_MODEL_PRO;

  // Upload the main image to Blob
  const imageUrls = [await uploadBase64ToBlob(imageBase64, mimeType, "replicate-edit")];

  // Upload reference image if provided
  if (referenceImage) {
    imageUrls.push(
      await uploadBase64ToBlob(referenceImage.base64, referenceImage.mimeType, "replicate-edit-ref"),
    );
  }

  const input = {
    prompt,
    image_input: imageUrls,
    aspect_ratio: "match_input_image",
    resolution: "1K",
    output_format: "png",
    safety_filter_level: "block_only_high",
  };

  logger.debug(
    { imageCount: imageUrls.length, modelTier },
    "[ReplicateAdapter] edit",
  );

  const output = await runWithRateRetry(() => replicate.run(model, { input }));

  const imageUrl = typeof output === "string" ? output : String(output);
  if (!imageUrl || !imageUrl.startsWith("http")) {
    throw new Error("[Replicate] No valid image URL in edit response");
  }

  return { imageUrl, usedModel: model };
}
