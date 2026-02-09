/**
 * Image Playground API Helpers
 * Handles CRUD operations for topics, batches, and generations
 *
 * Uses Gemini 3 Pro Image Preview (gemini-3-pro-image-preview) for image generation
 * Supports: aspectRatio, imageSize (1K/2K/4K), reference images
 */

import { put } from "@vercel/blob";
import sharp from "sharp";
import Replicate from "replicate";
import { validateContentType } from "../lib/validation/contentType.mjs";
import { logAiUsage } from "./usage-tracking.mjs";

// Replicate fallback config
const REPLICATE_IMAGE_MODEL = "google/nano-banana-pro";

function getReplicate() {
  const apiToken = process.env.REPLICATE_API_TOKEN;
  if (!apiToken) {
    throw new Error("REPLICATE_API_TOKEN not configured");
  }
  return new Replicate({ auth: apiToken });
}

function isQuotaOrRateLimitError(error) {
  const errorString = String(error?.message || error || "").toLowerCase();
  return (
    errorString.includes("resource_exhausted") ||
    errorString.includes("quota") ||
    errorString.includes("429") ||
    errorString.includes("rate") ||
    errorString.includes("limit") ||
    errorString.includes("exceeded")
  );
}

function normalizeReplicateOutputUrl(output) {
  if (typeof output === "string") return output;
  if (Array.isArray(output)) {
    const first = output[0];
    if (typeof first === "string") return first;
    if (first && typeof first.url === "function") return first.url();
    if (first && typeof first.url === "string") return first.url;
  }
  if (output && typeof output.url === "function") return output.url();
  if (output && typeof output.url === "string") return output.url;
  return null;
}

// Thumbnail settings
const THUMBNAIL_WIDTH = 400;
const THUMBNAIL_QUALITY = 80;
const MAX_STORED_STRING_LENGTH = 4096;

// =============================================================================
// Helpers
// =============================================================================

function mapTopic(r) {
  if (!r) return null;
  return {
    id: r.id,
    userId: r.user_id,
    organizationId: r.organization_id,
    title: r.title,
    coverUrl: r.cover_url,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function compactForStorage(value) {
  if (typeof value === "string") {
    if (value.startsWith("data:")) {
      return "[inline-data-omitted]";
    }
    if (value.length > MAX_STORED_STRING_LENGTH) {
      return `${value.slice(0, MAX_STORED_STRING_LENGTH)}...[truncated:${value.length}]`;
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(compactForStorage);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, compactForStorage(entry)]),
    );
  }

  return value;
}

// =============================================================================
// Topics
// =============================================================================

export async function getTopics(sql, userId, organizationId) {
  // Handle null/undefined organizationId properly
  const orgId = organizationId || null;

  const rows = orgId
    ? await sql`
        SELECT * FROM image_generation_topics
        WHERE organization_id = ${orgId}
        ORDER BY updated_at DESC
      `
    : await sql`
        SELECT * FROM image_generation_topics
        WHERE user_id = ${userId}
        AND organization_id IS NULL
        ORDER BY updated_at DESC
      `;
  return rows.map(mapTopic);
}

export async function createTopic(sql, userId, organizationId, title = null) {
  const [r] = await sql`
    INSERT INTO image_generation_topics (user_id, organization_id, title)
    VALUES (${userId}, ${organizationId}, ${title})
    RETURNING *
  `;
  return mapTopic(r);
}

export async function updateTopic(
  sql,
  topicId,
  userId,
  updates,
  organizationId,
) {
  const { title, coverUrl } = updates;
  const orgId = organizationId || null;

  // Build SET clause dynamically
  let setClause = [];
  let values = { topicId, userId };

  if (title !== undefined) {
    setClause.push("title");
    values.title = title;
  }
  if (coverUrl !== undefined) {
    setClause.push("cover_url");
    values.coverUrl = coverUrl;
  }

  if (setClause.length === 0) {
    // No updates, just return existing
    const [existing] = orgId
      ? await sql`SELECT * FROM image_generation_topics WHERE id = ${topicId} AND organization_id = ${orgId}`
      : await sql`SELECT * FROM image_generation_topics WHERE id = ${topicId} AND user_id = ${userId}`;
    return mapTopic(existing);
  }

  // Always update updated_at
  const [topic] = orgId
    ? await sql`
        UPDATE image_generation_topics
        SET title = COALESCE(${values.title}, title), cover_url = COALESCE(${values.coverUrl}, cover_url), updated_at = NOW()
        WHERE id = ${topicId} AND organization_id = ${orgId}
        RETURNING *
      `
    : await sql`
        UPDATE image_generation_topics
        SET title = COALESCE(${values.title}, title), cover_url = COALESCE(${values.coverUrl}, cover_url), updated_at = NOW()
        WHERE id = ${topicId} AND user_id = ${userId}
        RETURNING *
      `;
  return mapTopic(topic);
}

export async function deleteTopic(sql, topicId, userId, organizationId) {
  const orgId = organizationId || null;
  // Cascade deletes will handle batches, generations, and tasks
  if (orgId) {
    await sql`DELETE FROM image_generation_topics WHERE id = ${topicId} AND organization_id = ${orgId}`;
  } else {
    await sql`DELETE FROM image_generation_topics WHERE id = ${topicId} AND user_id = ${userId}`;
  }
}

// =============================================================================
// Batches
// =============================================================================

export async function getBatches(sql, topicId, userId, organizationId, limit = 100) {
  const orgId = organizationId || null;
  const safeLimit = Number.isFinite(limit)
    ? Math.max(1, Math.min(200, Number(limit)))
    : 100;
  // Get batches with their generations
  const batches = orgId
    ? await sql`
        WITH selected_batches AS (
          SELECT
            b.id,
            b.topic_id,
            b.user_id,
            b.organization_id,
            b.provider,
            b.model,
            b.prompt,
            (COALESCE(b.config, '{}'::jsonb) - 'referenceImages' - 'productImages' - 'imageUrl') AS config,
            b.width,
            b.height,
            b.created_at
          FROM image_generation_batches b
          WHERE b.topic_id = ${topicId} AND b.organization_id = ${orgId}
          ORDER BY b.created_at DESC
          LIMIT ${safeLimit}
        )
        SELECT
          sb.id,
          sb.topic_id,
          sb.user_id,
          sb.organization_id,
          sb.provider,
          sb.model,
          sb.prompt,
          sb.config,
          sb.width,
          sb.height,
          sb.created_at,
          COALESCE(
            json_agg(
              json_build_object(
                'id', g.id, 'batchId', g.batch_id, 'userId', g.user_id,
                'asyncTaskId', g.async_task_id, 'seed', g.seed,
                'asset', g.asset, 'createdAt', g.created_at
              ) ORDER BY g.created_at ASC
            ) FILTER (WHERE g.id IS NOT NULL), '[]'
          ) as generations
        FROM selected_batches sb
        LEFT JOIN image_generations g ON g.batch_id = sb.id
        GROUP BY sb.id, sb.topic_id, sb.user_id, sb.organization_id, sb.provider, sb.model, sb.prompt, sb.config, sb.width, sb.height, sb.created_at
        ORDER BY sb.created_at DESC
      `
    : await sql`
        WITH selected_batches AS (
          SELECT
            b.id,
            b.topic_id,
            b.user_id,
            b.organization_id,
            b.provider,
            b.model,
            b.prompt,
            (COALESCE(b.config, '{}'::jsonb) - 'referenceImages' - 'productImages' - 'imageUrl') AS config,
            b.width,
            b.height,
            b.created_at
          FROM image_generation_batches b
          WHERE b.topic_id = ${topicId} AND b.user_id = ${userId}
          ORDER BY b.created_at DESC
          LIMIT ${safeLimit}
        )
        SELECT
          sb.id,
          sb.topic_id,
          sb.user_id,
          sb.organization_id,
          sb.provider,
          sb.model,
          sb.prompt,
          sb.config,
          sb.width,
          sb.height,
          sb.created_at,
          COALESCE(
            json_agg(
              json_build_object(
                'id', g.id, 'batchId', g.batch_id, 'userId', g.user_id,
                'asyncTaskId', g.async_task_id, 'seed', g.seed,
                'asset', g.asset, 'createdAt', g.created_at
              ) ORDER BY g.created_at ASC
            ) FILTER (WHERE g.id IS NOT NULL), '[]'
          ) as generations
        FROM selected_batches sb
        LEFT JOIN image_generations g ON g.batch_id = sb.id
        GROUP BY sb.id, sb.topic_id, sb.user_id, sb.organization_id, sb.provider, sb.model, sb.prompt, sb.config, sb.width, sb.height, sb.created_at
        ORDER BY sb.created_at DESC
      `;

  return batches.map((b) => ({
    id: b.id,
    topicId: b.topic_id,
    userId: b.user_id,
    organizationId: b.organization_id,
    provider: b.provider,
    model: b.model,
    prompt: b.prompt,
    config: b.config,
    width: b.width,
    height: b.height,
    createdAt: b.created_at,
    generations: b.generations,
  }));
}

export async function deleteBatch(sql, batchId, userId, organizationId) {
  const orgId = organizationId || null;
  // Cascade deletes will handle generations
  if (orgId) {
    await sql`DELETE FROM image_generation_batches WHERE id = ${batchId} AND organization_id = ${orgId}`;
  } else {
    await sql`DELETE FROM image_generation_batches WHERE id = ${batchId} AND user_id = ${userId}`;
  }
}

// =============================================================================
// Generations
// =============================================================================

export async function deleteGeneration(
  sql,
  generationId,
  userId,
  organizationId,
) {
  const orgId = organizationId || null;
  // Check if this is the last generation in the batch
  const [generation] = orgId
    ? await sql`
        SELECT g.batch_id FROM image_generations g
        JOIN image_generation_batches b ON b.id = g.batch_id
        WHERE g.id = ${generationId} AND b.organization_id = ${orgId}
      `
    : await sql`SELECT batch_id FROM image_generations WHERE id = ${generationId} AND user_id = ${userId}`;

  if (!generation) return;

  // Delete the generation
  await sql`DELETE FROM image_generations WHERE id = ${generationId}`;

  // Check if batch is now empty
  const [countResult] = await sql`
    SELECT COUNT(*) as count FROM image_generations
    WHERE batch_id = ${generation.batch_id}
  `;

  // If batch is empty, delete it too
  if (parseInt(countResult.count) === 0) {
    await sql`
      DELETE FROM image_generation_batches
      WHERE id = ${generation.batch_id}
    `;
  }
}

export async function getGenerationStatus(sql, generationId, asyncTaskId) {
  // Get both generation and async task status
  const [result] = await sql`
    SELECT
      g.*,
      t.status as task_status,
      t.error as task_error
    FROM image_generations g
    LEFT JOIN image_async_tasks t ON t.id = g.async_task_id
    WHERE g.id = ${generationId}
  `;

  if (!result) {
    return {
      status: "error",
      error: { code: "NOT_FOUND", message: "Generation not found" },
    };
  }

  const status = result.task_status || (result.asset ? "success" : "pending");

  return {
    status,
    generation: result.asset
      ? {
          id: result.id,
          batchId: result.batch_id,
          userId: result.user_id,
          asyncTaskId: result.async_task_id,
          seed: result.seed,
          asset: result.asset,
          createdAt: result.created_at,
        }
      : null,
    error: result.task_error || null,
  };
}

// =============================================================================
// Image Generation
// =============================================================================

/**
 * Convert width/height to aspect ratio string
 */
function getAspectRatioFromDimensions(width, height) {
  const ratio = width / height;

  // Map to supported aspect ratios
  const aspectRatios = {
    "1:1": 1,
    "2:3": 2 / 3,
    "3:2": 3 / 2,
    "3:4": 3 / 4,
    "4:3": 4 / 3,
    "4:5": 4 / 5,
    "5:4": 5 / 4,
    "9:16": 9 / 16,
    "16:9": 16 / 9,
    "21:9": 21 / 9,
  };

  // Find closest match
  let closest = "1:1";
  let minDiff = Infinity;

  for (const [ar, arRatio] of Object.entries(aspectRatios)) {
    const diff = Math.abs(ratio - arRatio);
    if (diff < minDiff) {
      minDiff = diff;
      closest = ar;
    }
  }

  return closest;
}

/**
 * Convert width to image size (1K, 2K, 4K)
 */
function getImageSizeFromWidth(width) {
  if (width >= 4096) return "4K";
  if (width >= 2048) return "2K";
  return "1K";
}

export async function createImageBatch(
  sql,
  input,
  userId,
  organizationId,
  genai,
) {
  const { topicId, provider, model, imageNum, params } = input;

  // Use provided values first, fallback to calculated values
  const width = params.width || 1024;
  const height = params.height || 1024;
  const aspectRatio =
    params.aspectRatio || getAspectRatioFromDimensions(width, height);
  const imageSize = params.imageSize || getImageSizeFromWidth(width);
  const generationParams = { ...params, aspectRatio, imageSize };
  const storedParams = compactForStorage(generationParams);
  const displayPrompt =
    typeof params.userPrompt === "string" && params.userPrompt.trim()
      ? params.userPrompt
      : params.prompt;

  // Create batch
  const [batch] = await sql`
    INSERT INTO image_generation_batches (
      topic_id, user_id, organization_id, provider, model, prompt, config, width, height
    )
    VALUES (
      ${topicId}, ${userId}, ${organizationId}, ${provider}, ${model},
      ${displayPrompt}, ${JSON.stringify(storedParams)}, ${width}, ${height}
    )
    RETURNING *
  `;

  // Create generations and async tasks
  const generations = [];
  for (let i = 0; i < imageNum; i++) {
    // Create async task
    const [task] = await sql`
      INSERT INTO image_async_tasks (
        user_id, type, status, metadata
      )
      VALUES (
        ${userId}, 'image_generation', 'pending',
        ${JSON.stringify({
          batchId: batch.id,
          provider,
          model,
          params: storedParams,
          index: i,
        })}
      )
      RETURNING *
    `;

    // Create generation with seed (for tracking/reproducibility reference)
    const seed = params.seed || Math.floor(Math.random() * 1000000);
    const [generation] = await sql`
      INSERT INTO image_generations (
        batch_id, user_id, async_task_id, seed
      )
      VALUES (
        ${batch.id}, ${userId}, ${task.id}, ${seed}
      )
      RETURNING *
    `;

    generations.push({
      id: generation.id,
      batchId: generation.batch_id,
      userId: generation.user_id,
      asyncTaskId: generation.async_task_id,
      seed: generation.seed,
      asset: null,
      createdAt: generation.created_at,
    });

    // Start generation in background (fire and forget)
    processImageGeneration(
      sql,
      task.id,
      generation.id,
      generationParams,
      genai,
    ).catch((err) => {
      console.error("[ImagePlayground] Background generation failed:", err);
    });
  }

  // Update topic's updated_at
  await sql`
    UPDATE image_generation_topics
    SET updated_at = NOW()
    WHERE id = ${topicId}
  `;

  return {
    batch: {
      id: batch.id,
      topicId: batch.topic_id,
      userId: batch.user_id,
      organizationId: batch.organization_id,
      provider: batch.provider,
      model: batch.model,
      prompt: batch.prompt,
      config: batch.config,
      width: batch.width,
      height: batch.height,
      createdAt: batch.created_at,
      generations,
    },
    generations,
  };
}

/**
 * Map aspect ratios (same as dev-api.mjs)
 */
function mapAspectRatio(ratio) {
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
    "5:4": "5:4",
    "21:9": "16:9", // Map ultrawide to closest supported
  };
  return map[ratio] || "1:1";
}

/**
 * Build content parts array from params (reference images, product images, etc.)
 * Shared between Gemini and used to extract image inputs for Replicate fallback.
 */
async function buildContentParts(params) {
  const parts = [{ text: params.prompt }];

  // Add multiple reference images if provided (array of up to 14 images)
  if (
    params.referenceImages &&
    Array.isArray(params.referenceImages) &&
    params.referenceImages.length > 0
  ) {
    for (const refImage of params.referenceImages) {
      try {
        let base64Data = refImage.dataUrl;
        let mimeType = refImage.mimeType || "image/png";

        if (refImage.dataUrl.startsWith("data:")) {
          const matches = refImage.dataUrl.match(
            /^data:([^;]+);base64,(.+)$/,
          );
          if (matches) {
            mimeType = matches[1];
            base64Data = matches[2];
          }
        } else if (refImage.dataUrl.startsWith("http")) {
          const response = await fetch(refImage.dataUrl);
          const arrayBuffer = await response.arrayBuffer();
          base64Data = Buffer.from(arrayBuffer).toString("base64");
          mimeType = response.headers.get("content-type") || "image/png";
        }

        parts.push({ inlineData: { data: base64Data, mimeType } });
      } catch (imgError) {
        console.warn(
          `[ImagePlayground] Failed to process reference image ${refImage.id}:`,
          imgError.message,
        );
      }
    }
    console.log(
      `[ImagePlayground] Added ${params.referenceImages.length} reference images`,
    );
  }
  // Legacy single reference image (DEPRECATED)
  else if (params.imageUrl) {
    try {
      let base64Data = params.imageUrl;
      let mimeType = "image/png";

      if (params.imageUrl.startsWith("data:")) {
        const matches = params.imageUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
          mimeType = matches[1];
          base64Data = matches[2];
        }
      } else if (params.imageUrl.startsWith("http")) {
        const response = await fetch(params.imageUrl);
        const arrayBuffer = await response.arrayBuffer();
        base64Data = Buffer.from(arrayBuffer).toString("base64");
        mimeType = response.headers.get("content-type") || "image/png";
      }

      parts.push({ inlineData: { data: base64Data, mimeType } });
      console.log(
        `[ImagePlayground] Added legacy reference image (${mimeType})`,
      );
    } catch (imgError) {
      console.warn(
        `[ImagePlayground] Failed to process reference image:`,
        imgError.message,
      );
    }
  }

  // Add product images (logo, etc.)
  if (params.productImages && Array.isArray(params.productImages)) {
    for (const img of params.productImages) {
      if (img.base64 && img.mimeType) {
        parts.push({ inlineData: { data: img.base64, mimeType: img.mimeType } });
        console.log(`[ImagePlayground] Added product image (${img.mimeType})`);
      }
    }
  }

  return parts;
}

/**
 * Generate image via Gemini SDK. Returns { imageBase64, mimeType }.
 * Throws on failure (caller handles fallback).
 */
async function generateWithGemini(genai, parts, params) {
  const model = "gemini-3-pro-image-preview";
  const mappedAspectRatio = mapAspectRatio(params.aspectRatio || "1:1");

  console.log(
    `[ImagePlayground] Calling Gemini SDK with model=${model}, aspectRatio=${mappedAspectRatio}, imageSize=${params.imageSize || "1K"}`,
  );

  const response = await genai.models.generateContent({
    model,
    contents: { parts },
    config: {
      temperature: 0.7,
      imageConfig: {
        aspectRatio: mappedAspectRatio,
        imageSize: params.imageSize || "1K",
      },
    },
  });

  const responseParts = response?.candidates?.[0]?.content?.parts;

  if (!Array.isArray(responseParts)) {
    const finishReason = response?.candidates?.[0]?.finishReason;
    if (finishReason === "NO_IMAGE") {
      throw new Error(
        'O modelo não conseguiu gerar a imagem. Tente um prompt mais descritivo e específico (ex: "um pôr do sol na praia com cores vibrantes")',
      );
    } else if (finishReason === "SAFETY") {
      throw new Error(
        "O prompt foi bloqueado por políticas de segurança. Tente reformular.",
      );
    } else if (finishReason === "RECITATION") {
      throw new Error(
        "O modelo detectou possível violação de direitos autorais.",
      );
    }
    throw new Error("Falha ao gerar imagem - resposta inválida do modelo");
  }

  for (const part of responseParts) {
    if (part.inlineData) {
      return {
        imageBase64: part.inlineData.data,
        mimeType: part.inlineData.mimeType || "image/png",
        usedProvider: "google",
        usedModel: model,
      };
    }
  }

  throw new Error("Falha ao gerar imagem. Tente um prompt diferente.");
}

/**
 * Generate image via Replicate (fallback when Gemini quota is exhausted).
 * Returns { imageBase64, mimeType }.
 */
async function generateWithReplicate(parts, params) {
  console.log(
    `[ImagePlayground] Gemini quota exceeded, trying Replicate fallback (${REPLICATE_IMAGE_MODEL})`,
  );

  const replicate = getReplicate();

  const toDataUrl = (img) => `data:${img.mimeType};base64,${img.base64}`;

  // Collect image inputs from parts (same images that were prepared for Gemini)
  const imageInputs = parts
    .filter((p) => p.inlineData)
    .map((p) => ({ base64: p.inlineData.data, mimeType: p.inlineData.mimeType }));

  const input = {
    prompt: params.prompt,
    output_format: "png",
  };

  const aspectRatio = mapAspectRatio(params.aspectRatio || "1:1");
  if (aspectRatio) {
    input.aspect_ratio = aspectRatio;
  }

  if (["1K", "2K", "4K"].includes(params.imageSize)) {
    input.resolution = params.imageSize;
  }

  if (imageInputs.length > 0) {
    input.image_input = imageInputs.slice(0, 14).map(toDataUrl);
  }

  const output = await replicate.run(REPLICATE_IMAGE_MODEL, { input });
  const outputUrl = normalizeReplicateOutputUrl(output);
  if (!outputUrl) {
    throw new Error("[Replicate] No image URL in output");
  }

  // Fetch the image from Replicate's temporary URL and convert to base64
  const imageResponse = await fetch(outputUrl);
  if (!imageResponse.ok) {
    throw new Error(`[Replicate] Failed to fetch image: ${imageResponse.status}`);
  }
  const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
  const contentType = imageResponse.headers.get("content-type") || "image/png";

  validateContentType(contentType);

  console.log(`[ImagePlayground] Replicate fallback successful`);

  return {
    imageBase64: imageBuffer.toString("base64"),
    mimeType: contentType,
    usedProvider: "replicate",
    usedModel: REPLICATE_IMAGE_MODEL,
  };
}

/**
 * Background image generation processor.
 * Tries Gemini first, falls back to Replicate on quota/rate-limit errors.
 */
async function processImageGeneration(
  sql,
  taskId,
  generationId,
  params,
  genai,
) {
  try {
    // Update task to processing
    await sql`
      UPDATE image_async_tasks
      SET status = 'processing', updated_at = NOW()
      WHERE id = ${taskId}
    `;

    console.log(`[ImagePlayground] Starting generation ${generationId}`, {
      prompt: params.prompt?.substring(0, 50) + "...",
      aspectRatio: params.aspectRatio,
      imageSize: params.imageSize,
      hasReferenceImages: !!params.referenceImages?.length,
      referenceImagesCount: params.referenceImages?.length || 0,
      hasLegacyImageUrl: !!params.imageUrl,
      hasProductImages: !!params.productImages?.length,
      hasBrandProfile: !!params.brandProfile,
    });

    // Build content parts (shared between Gemini and Replicate)
    const parts = await buildContentParts(params);

    // Try Gemini first, fallback to Replicate on quota errors
    let imageBase64;
    let mimeType;
    let usedProvider = "google";
    let usedModel = "gemini-3-pro-image-preview";

    try {
      const geminiResult = await generateWithGemini(genai, parts, params);
      imageBase64 = geminiResult.imageBase64;
      mimeType = geminiResult.mimeType;
      usedProvider = geminiResult.usedProvider;
      usedModel = geminiResult.usedModel;
    } catch (geminiError) {
      if (isQuotaOrRateLimitError(geminiError)) {
        // Fallback to Replicate
        const replicateResult = await generateWithReplicate(parts, params);
        imageBase64 = replicateResult.imageBase64;
        mimeType = replicateResult.mimeType;
        usedProvider = replicateResult.usedProvider;
        usedModel = replicateResult.usedModel;
      } else {
        // Non-quota error (safety, recitation, etc.) - re-throw as-is
        throw geminiError;
      }
    }

    // Validate content type before upload
    validateContentType(mimeType);

    // Upload to Vercel Blob
    const buffer = Buffer.from(imageBase64, "base64");
    const extension = mimeType.split("/")[1] || "png";
    const filename = `playground/${generationId}.${extension}`;

    const blob = await put(filename, buffer, {
      access: "public",
      contentType: mimeType,
    });

    // Generate and upload thumbnail for faster gallery loading
    let thumbnailUrl = null;
    try {
      const thumbnailBuffer = await sharp(buffer)
        .resize(THUMBNAIL_WIDTH, null, { withoutEnlargement: true })
        .jpeg({ quality: THUMBNAIL_QUALITY })
        .toBuffer();

      const thumbnailFilename = `playground/thumb-${generationId}.jpg`;
      const thumbnailBlob = await put(thumbnailFilename, thumbnailBuffer, {
        access: "public",
        contentType: "image/jpeg",
      });
      thumbnailUrl = thumbnailBlob.url;
      console.log(`[ImagePlayground] Thumbnail generated: ${thumbnailUrl}`);
    } catch (thumbError) {
      console.warn(
        `[ImagePlayground] Failed to generate thumbnail:`,
        thumbError.message,
      );
    }

    // Get actual dimensions from aspect ratio and size
    const dimensions = getActualDimensions(
      params.aspectRatio || "1:1",
      params.imageSize || "1K",
    );

    // Update generation with asset
    const asset = {
      url: blob.url,
      width: dimensions.width,
      height: dimensions.height,
    };

    await sql`
      UPDATE image_generations
      SET asset = ${JSON.stringify(asset)}
      WHERE id = ${generationId}
    `;

    // Update task to success
    await sql`
      UPDATE image_async_tasks
      SET status = 'success', updated_at = NOW()
      WHERE id = ${taskId}
    `;

    // Get batch info for gallery and topic cover
    const [generationInfo] = await sql`
      SELECT
        g.batch_id,
        b.topic_id,
        b.user_id,
        b.organization_id,
        b.prompt,
        b.model,
        b.provider
      FROM image_generations g
      JOIN image_generation_batches b ON b.id = g.batch_id
      WHERE g.id = ${generationId}
    `;

    if (generationInfo) {
      // Update topic cover if this is first successful generation
      const [topic] = await sql`
        SELECT cover_url FROM image_generation_topics
        WHERE id = ${generationInfo.topic_id}
      `;

      if (!topic.cover_url) {
        await sql`
          UPDATE image_generation_topics
          SET cover_url = ${blob.url}
          WHERE id = ${generationInfo.topic_id}
        `;
      }

      // Also save to gallery_images so it appears in the gallery
      await sql`
        INSERT INTO gallery_images (
          user_id,
          organization_id,
          src_url,
          thumbnail_url,
          prompt,
          source,
          model,
          aspect_ratio,
          image_size,
          media_type
        )
        VALUES (
          ${generationInfo.user_id},
          ${generationInfo.organization_id},
          ${blob.url},
          ${thumbnailUrl},
          ${generationInfo.prompt},
          'playground',
          ${usedModel},
          ${params.aspectRatio || "1:1"},
          ${params.imageSize || "1K"},
          'image'
        )
      `;
    }

    // Log AI usage to admin dashboard
    if (generationInfo) {
      await logAiUsage(sql, {
        userId: generationInfo.user_id,
        organizationId: generationInfo.organization_id,
        endpoint: "/api/image-playground/generate",
        operation: "image",
        model: usedModel,
        provider: usedProvider,
        imageCount: 1,
        imageSize: params.imageSize || "1K",
        status: "success",
        metadata: {
          source: "playground",
          aspectRatio: params.aspectRatio || "1:1",
          fallbackUsed: usedProvider === "replicate",
          generationId,
        },
      }).catch((err) => {
        console.warn("[ImagePlayground] Failed to log usage:", err.message);
      });
    }

    console.log(
      `[ImagePlayground] Generation ${generationId} completed successfully (provider: ${usedProvider})`,
    );
  } catch (error) {
    console.error(
      `[ImagePlayground] Generation ${generationId} failed:`,
      error,
    );

    // Log failed usage to admin dashboard
    await logAiUsage(sql, {
      endpoint: "/api/image-playground/generate",
      operation: "image",
      model: "gemini-3-pro-image-preview",
      status: "failed",
      error: error.message,
      metadata: { source: "playground", generationId },
    }).catch(() => {});

    // Build user-friendly error for the frontend
    const isQuota = isQuotaOrRateLimitError(error);
    const errorPayload = {
      code: isQuota ? "QUOTA_EXCEEDED" : (error.code || "GENERATION_FAILED"),
      message: isQuota
        ? "Limite de uso da IA atingido. Tente novamente mais tarde ou entre em contato com o suporte."
        : error.message,
    };

    // Update task to error
    await sql`
      UPDATE image_async_tasks
      SET
        status = 'error',
        error = ${JSON.stringify(errorPayload)},
        updated_at = NOW()
      WHERE id = ${taskId}
    `;
  }
}

/**
 * Get actual pixel dimensions from aspect ratio and image size
 * Based on Gemini documentation
 */
function getActualDimensions(aspectRatio, imageSize) {
  const dimensionMap = {
    "1:1": { "1K": [1024, 1024], "2K": [2048, 2048], "4K": [4096, 4096] },
    "2:3": { "1K": [848, 1264], "2K": [1696, 2528], "4K": [3392, 5056] },
    "3:2": { "1K": [1264, 848], "2K": [2528, 1696], "4K": [5056, 3392] },
    "3:4": { "1K": [896, 1200], "2K": [1792, 2400], "4K": [3584, 4800] },
    "4:3": { "1K": [1200, 896], "2K": [2400, 1792], "4K": [4800, 3584] },
    "4:5": { "1K": [928, 1152], "2K": [1856, 2304], "4K": [3712, 4608] },
    "5:4": { "1K": [1152, 928], "2K": [2304, 1856], "4K": [4608, 3712] },
    "9:16": { "1K": [768, 1376], "2K": [1536, 2752], "4K": [3072, 5504] },
    "16:9": { "1K": [1376, 768], "2K": [2752, 1536], "4K": [5504, 3072] },
    "21:9": { "1K": [1584, 672], "2K": [3168, 1344], "4K": [6336, 2688] },
  };

  const dims =
    dimensionMap[aspectRatio]?.[imageSize] || dimensionMap["1:1"]["1K"];
  return { width: dims[0], height: dims[1] };
}

// =============================================================================
// Title Generation
// =============================================================================

export async function generateTopicTitle(prompts, genai) {
  try {
    const promptText = prompts.slice(0, 3).join("\n");

    const apiKey =
      process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("API key not configured");
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `Generate a short, creative title (3-5 words) for an image generation project based on these prompts:\n\n${promptText}\n\nRespond with ONLY the title, no quotes or extra text.`,
                },
              ],
            },
          ],
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const title =
      data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
      prompts[0].split(" ").slice(0, 4).join(" ");

    return title;
  } catch (error) {
    console.error("[ImagePlayground] Title generation failed:", error);
    // Fallback to first few words of first prompt
    return prompts[0].split(" ").slice(0, 4).join(" ");
  }
}
