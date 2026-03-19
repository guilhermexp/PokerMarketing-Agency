/**
 * Image Playground API Helpers
 * Handles CRUD operations for topics, batches, and generations
 *
 * Uses Gemini 3 Pro Image Preview (gemini-3-pro-image-preview) for image generation
 * Supports: aspectRatio, imageSize (1K/2K/4K), reference images
 */

import { put } from "@vercel/blob";
import sharp from "sharp";
import type { GoogleGenAI } from "@google/genai";
import type { SqlClient } from "../lib/db.js";
import { validateContentType } from "../lib/validation/contentType.js";
import { isQuotaOrRateLimitError } from "../lib/ai/retry.js";
import { runWithProviderFallback } from "../lib/ai/image-providers.js";
import { logAiUsage } from "./usage-tracking.js";
import logger from "../lib/logger.js";

// =============================================================================
// Types
// =============================================================================

// Database row types (raw from SQL)
interface TopicRow {
  id: string;
  user_id: string;
  organization_id: string | null;
  title: string | null;
  cover_url: string | null;
  created_at: string;
  updated_at: string;
}

interface BatchRow {
  id: string;
  topic_id: string;
  user_id: string;
  organization_id: string | null;
  provider: string;
  model: string;
  prompt: string;
  config: Record<string, unknown>;
  width: number | null;
  height: number | null;
  created_at: string;
  user_email: string | null;
  generations: GenerationJson[];
}

interface GenerationRow {
  id: string;
  batch_id: string;
  user_id: string;
  async_task_id: string | null;
  seed: number | null;
  asset: GenerationAsset | null;
  created_at: string;
}

interface GenerationWithTaskRow extends GenerationRow {
  task_status: string | null;
  task_error: GenerationError | null;
  task_updated_at: string | null;
}

interface AsyncTaskRow {
  id: string;
  user_id: string;
  type: string;
  status: string;
  metadata: Record<string, unknown>;
  error: GenerationError | null;
  created_at: string;
  updated_at: string;
}

interface GenerationInfoRow {
  batch_id: string;
  topic_id: string;
  user_id: string;
  organization_id: string | null;
  prompt: string;
  model: string;
  provider: string;
}

interface TopicCoverRow {
  cover_url: string | null;
}

interface CountRow {
  count: string;
}

// Mapped/API types
interface Topic {
  id: string;
  userId: string;
  organizationId: string | null;
  title: string | null;
  coverUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

interface GenerationJson {
  id: string;
  batchId: string;
  userId: string;
  asyncTaskId: string | null;
  seed: number | null;
  asset: GenerationAsset | null;
  createdAt: string;
}

interface Batch {
  id: string;
  topicId: string;
  userId: string;
  organizationId: string | null;
  provider: string;
  model: string;
  prompt: string;
  config: Record<string, unknown>;
  width: number | null;
  height: number | null;
  createdAt: string;
  userEmail: string | null;
  generations: GenerationJson[];
}

interface GenerationAsset {
  url: string;
  width: number;
  height: number;
  provider?: string;
  model?: string;
}

interface GenerationAssetUpdates {
  url: string;
}

interface GenerationError {
  code: string;
  message: string;
}

interface GenerationStatus {
  status: string;
  generation: GenerationJson | null;
  error: GenerationError | null;
}

// Input types
interface TopicUpdates {
  title?: string;
  coverUrl?: string;
}

interface ReferenceImage {
  id?: string;
  dataUrl: string;
  mimeType?: string;
}

interface ProductImage {
  base64: string;
  mimeType: string;
}

interface GenerationParams {
  prompt: string;
  userPrompt?: string;
  width?: number;
  height?: number;
  aspectRatio?: string;
  imageSize?: string;
  seed?: number;
  model?: string;
  referenceImages?: ReferenceImage[];
  productImages?: ProductImage[];
  imageUrl?: string;
  brandProfile?: Record<string, unknown>;
}

interface CreateImageBatchInput {
  topicId: string;
  provider: string;
  model: string;
  imageNum: number;
  params: GenerationParams;
}

interface CreateImageBatchResult {
  batch: Batch & { generations: GenerationJson[] };
  generations: GenerationJson[];
}

// Content parts for Gemini API
interface TextPart {
  text: string;
}

interface InlineDataPart {
  inlineData: {
    data: string;
    mimeType: string;
  };
}

type ContentPart = TextPart | InlineDataPart;

// Image input for provider chain
interface ImageInput {
  base64: string;
  mimeType: string;
}

// Dimension lookup
interface Dimensions {
  width: number;
  height: number;
}

// Aspect ratio map type
type AspectRatioMap = Record<string, Record<string, [number, number]>>;

// =============================================================================
// Helper Functions
// =============================================================================

// Normalize model names to match the image_model enum in the database.
// The DB enum currently only has 'gemini-3-pro-image-preview', so we map
// all provider models to that value until the enum is extended.
function normalizeModelForDb(model: string): string {
  // FAL: "fal-ai/gemini-3-pro-image-preview/edit" → "gemini-3-pro-image-preview"
  const normalized = model.replace(/^fal-ai\//, "").replace(/\/edit$/, "");
  // Map all model variants to valid DB enum values
  // DB enum currently only has 'gemini-3-pro-image-preview'
  if (normalized.includes("/")) return "gemini-3-pro-image-preview";
  // Standard models (Gemini Flash Image variants / Nano Banana aliases) → map to only valid enum value
  if (normalized !== "gemini-3-pro-image-preview") return "gemini-3-pro-image-preview";
  return normalized;
}

// Timeout for fetching remote reference images (30 seconds)
const FETCH_TIMEOUT_MS = 30_000;

function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal }).finally(() =>
    clearTimeout(timeoutId),
  );
}

// Thumbnail settings
const THUMBNAIL_WIDTH = 400;
const THUMBNAIL_QUALITY = 80;
const MAX_STORED_STRING_LENGTH = 4096;

function mapTopic(r: TopicRow | null | undefined): Topic | null {
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

type CompactValue = string | number | boolean | null | undefined | CompactValue[] | { [key: string]: CompactValue };

function compactForStorage(value: CompactValue): CompactValue {
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
      Object.entries(value).map(([key, entry]) => [key, compactForStorage(entry as CompactValue)]),
    );
  }

  return value;
}

// =============================================================================
// Topics
// =============================================================================

export async function getTopics(
  sql: SqlClient,
  userId: string | null,
  organizationId: string | null,
): Promise<Topic[]> {
  // Handle null/undefined organizationId properly
  const orgId = organizationId || null;

  const rows = (orgId
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
      `) as TopicRow[];
  return rows.map(mapTopic).filter((t): t is Topic => t !== null);
}

export async function createTopic(
  sql: SqlClient,
  userId: string | null,
  organizationId: string | null,
  title: string | null = null,
): Promise<Topic | null> {
  const [r] = (await sql`
    INSERT INTO image_generation_topics (user_id, organization_id, title)
    VALUES (${userId}, ${organizationId}, ${title})
    RETURNING *
  `) as TopicRow[];
  return mapTopic(r);
}

export async function updateTopic(
  sql: SqlClient,
  topicId: string,
  userId: string | null,
  updates: TopicUpdates,
  organizationId: string | null,
): Promise<Topic | null> {
  const { title, coverUrl } = updates;
  const orgId = organizationId || null;

  // Build SET clause dynamically
  const setClause: string[] = [];
  const values: { topicId: string; userId: string | null; title?: string; coverUrl?: string } = { topicId, userId };

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
    const [existing] = (orgId
      ? await sql`SELECT * FROM image_generation_topics WHERE id = ${topicId} AND organization_id = ${orgId}`
      : await sql`SELECT * FROM image_generation_topics WHERE id = ${topicId} AND user_id = ${userId}`) as TopicRow[];
    return mapTopic(existing);
  }

  // Always update updated_at
  const [topic] = (orgId
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
      `) as TopicRow[];
  return mapTopic(topic);
}

export async function deleteTopic(
  sql: SqlClient,
  topicId: string,
  userId: string | null,
  organizationId: string | null,
): Promise<void> {
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

export async function getBatches(
  sql: SqlClient,
  topicId: string,
  userId: string | null,
  organizationId: string | null,
  limit = 100,
): Promise<Batch[]> {
  const orgId = organizationId || null;
  const safeLimit = Number.isFinite(limit)
    ? Math.max(1, Math.min(200, Number(limit)))
    : 100;
  // Get batches with their generations (includes user email via JOIN)
  const batches = (orgId
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
          u.email AS user_email,
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
        LEFT JOIN users u ON u.id = sb.user_id
        GROUP BY sb.id, sb.topic_id, sb.user_id, sb.organization_id, sb.provider, sb.model, sb.prompt, sb.config, sb.width, sb.height, sb.created_at, u.email
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
          u.email AS user_email,
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
        LEFT JOIN users u ON u.id = sb.user_id
        GROUP BY sb.id, sb.topic_id, sb.user_id, sb.organization_id, sb.provider, sb.model, sb.prompt, sb.config, sb.width, sb.height, sb.created_at, u.email
        ORDER BY sb.created_at DESC
      `) as BatchRow[];

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
    userEmail: b.user_email || null,
    generations: b.generations,
  }));
}

export async function deleteBatch(
  sql: SqlClient,
  batchId: string,
  userId: string | null,
  organizationId: string | null,
): Promise<void> {
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
  sql: SqlClient,
  generationId: string,
  userId: string | null,
  organizationId: string | null,
): Promise<void> {
  const orgId = organizationId || null;
  // Check if this is the last generation in the batch
  const [generation] = (orgId
    ? await sql`
        SELECT g.batch_id FROM image_generations g
        JOIN image_generation_batches b ON b.id = g.batch_id
        WHERE g.id = ${generationId} AND b.organization_id = ${orgId}
      `
    : await sql`SELECT batch_id FROM image_generations WHERE id = ${generationId} AND user_id = ${userId}`) as { batch_id: string }[];

  if (!generation) return;

  // Delete the generation
  await sql`DELETE FROM image_generations WHERE id = ${generationId}`;

  // Check if batch is now empty
  const [countResult] = (await sql`
    SELECT COUNT(*) as count FROM image_generations
    WHERE batch_id = ${generation.batch_id}
  `) as CountRow[];

  // If batch is empty, delete it too
  if (countResult && parseInt(countResult.count) === 0) {
    await sql`
      DELETE FROM image_generation_batches
      WHERE id = ${generation.batch_id}
    `;
  }
}

export async function updateGenerationAsset(
  sql: SqlClient,
  generationId: string,
  updates: GenerationAssetUpdates,
  userId: string,
  organizationId: string | null,
): Promise<GenerationJson | null> {
  const orgId = organizationId || null;
  const rows = (orgId
    ? await sql`
        UPDATE image_generations g
        SET asset = COALESCE(g.asset::jsonb, '{}'::jsonb) || jsonb_build_object('url', ${updates.url})
        FROM image_generation_batches b
        WHERE g.id = ${generationId}
        AND g.batch_id = b.id
        AND b.organization_id = ${orgId}
        RETURNING g.*
      `
    : await sql`
        UPDATE image_generations
        SET asset = COALESCE(asset::jsonb, '{}'::jsonb) || jsonb_build_object('url', ${updates.url})
        WHERE id = ${generationId}
        AND user_id = ${userId}
        RETURNING *
      `) as GenerationRow[];

  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    batchId: row.batch_id,
    userId: row.user_id,
    asyncTaskId: row.async_task_id,
    seed: row.seed,
    asset: row.asset,
    createdAt: row.created_at,
  };
}

export async function getGenerationStatus(
  sql: SqlClient,
  generationId: string,
  _asyncTaskId: string | undefined,
): Promise<GenerationStatus> {
  // Get both generation and async task status
  const [result] = (await sql`
    SELECT
      g.*,
      t.status as task_status,
      t.error as task_error,
      t.updated_at as task_updated_at
    FROM image_generations g
    LEFT JOIN image_async_tasks t ON t.id = g.async_task_id
    WHERE g.id = ${generationId}
  `) as GenerationWithTaskRow[];

  if (!result) {
    return {
      status: "error",
      generation: null,
      error: { code: "NOT_FOUND", message: "Generation not found" },
    };
  }

  const STALE_TASK_TIMEOUT_MS = 20 * 60 * 1000; // 20 minutes
  const hasAsset = !!result.asset;
  const taskStatus = result.task_status || null;
  const lastActivityAt = result.task_updated_at || result.created_at;
  const elapsedMs = lastActivityAt
    ? Date.now() - new Date(lastActivityAt).getTime()
    : 0;
  const isStalePendingTask =
    !hasAsset &&
    (taskStatus === "pending" || taskStatus === "processing") &&
    elapsedMs > STALE_TASK_TIMEOUT_MS;

  if (isStalePendingTask && result.async_task_id) {
    const timeoutError: GenerationError = {
      code: "GENERATION_TIMEOUT",
      message:
        "A geração expirou por tempo limite. Remova e tente novamente.",
    };

    await sql`
      UPDATE image_async_tasks
      SET
        status = 'error',
        error = ${JSON.stringify(timeoutError)},
        updated_at = NOW()
      WHERE id = ${result.async_task_id}
    `;

    return {
      status: "error",
      generation: null,
      error: timeoutError,
    };
  }

  const status = taskStatus || (hasAsset ? "success" : "pending");

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
function getAspectRatioFromDimensions(width: number, height: number): string {
  const ratio = width / height;

  // Map to supported aspect ratios
  const aspectRatios: Record<string, number> = {
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
function getImageSizeFromWidth(width: number): string {
  if (width >= 4096) return "4K";
  if (width >= 2048) return "2K";
  return "1K";
}

export async function createImageBatch(
  sql: SqlClient,
  input: CreateImageBatchInput,
  userId: string | null,
  organizationId: string | null,
  genai: GoogleGenAI,
): Promise<CreateImageBatchResult> {
  const { topicId, provider, model, imageNum, params } = input;

  // Resolve aspect ratio and image size first, then derive dimensions
  const aspectRatio =
    params.aspectRatio || getAspectRatioFromDimensions(params.width || 1024, params.height || 1024);
  const imageSize = params.imageSize || getImageSizeFromWidth(params.width || 1024);
  const dims = getActualDimensions(aspectRatio, imageSize);
  const width = params.width || dims.width;
  const height = params.height || dims.height;
  const generationParams = { ...params, aspectRatio, imageSize, model };
  const storedParams = compactForStorage(generationParams as unknown as CompactValue);
  const displayPrompt =
    typeof params.userPrompt === "string" && params.userPrompt.trim()
      ? params.userPrompt
      : params.prompt;

  // Create batch
  const batchRows = (await sql`
    INSERT INTO image_generation_batches (
      topic_id, user_id, organization_id, provider, model, prompt, config, width, height
    )
    VALUES (
      ${topicId}, ${userId}, ${organizationId}, ${provider}, ${model},
      ${displayPrompt}, ${JSON.stringify(storedParams)}, ${width}, ${height}
    )
    RETURNING *
  `) as BatchRow[];
  const batch = batchRows[0];
  if (!batch) {
    throw new Error("Failed to create batch");
  }

  // Create generations and async tasks
  const generations: GenerationJson[] = [];
  for (let i = 0; i < imageNum; i++) {
    // Create async task
    const taskRows = (await sql`
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
    `) as AsyncTaskRow[];
    const task = taskRows[0];
    if (!task) {
      throw new Error("Failed to create async task");
    }

    // Create generation with seed (for tracking/reproducibility reference)
    const seed = params.seed || Math.floor(Math.random() * 1000000);
    const generationRows = (await sql`
      INSERT INTO image_generations (
        batch_id, user_id, async_task_id, seed
      )
      VALUES (
        ${batch.id}, ${userId}, ${task.id}, ${seed}
      )
      RETURNING *
    `) as GenerationRow[];
    const generation = generationRows[0];
    if (!generation) {
      throw new Error("Failed to create generation");
    }

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
      logger.error("[ImagePlayground] Background generation failed:", err);
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
      userEmail: null,
      generations,
    },
    generations,
  };
}

/**
 * Build content parts array from params (reference images, product images, etc.)
 * Shared between Gemini and FAL.ai fallback.
 */
async function buildContentParts(params: GenerationParams): Promise<ContentPart[]> {
  const parts: ContentPart[] = [{ text: params.prompt }];

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
          if (matches && matches[1] && matches[2]) {
            mimeType = matches[1];
            base64Data = matches[2];
          }
        } else if (refImage.dataUrl.startsWith("http")) {
          const response = await fetchWithTimeout(refImage.dataUrl);
          const arrayBuffer = await response.arrayBuffer();
          base64Data = Buffer.from(arrayBuffer).toString("base64");
          mimeType = response.headers.get("content-type") || "image/png";
        }

        parts.push({ inlineData: { data: base64Data, mimeType } });
      } catch (imgError) {
        const error = imgError as Error;
        logger.warn(
          `[ImagePlayground] Failed to process reference image ${refImage.id}:`,
          error.message,
        );
      }
    }
    logger.info(
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
        if (matches && matches[1] && matches[2]) {
          mimeType = matches[1];
          base64Data = matches[2];
        }
      } else if (params.imageUrl.startsWith("http")) {
        const response = await fetchWithTimeout(params.imageUrl);
        const arrayBuffer = await response.arrayBuffer();
        base64Data = Buffer.from(arrayBuffer).toString("base64");
        mimeType = response.headers.get("content-type") || "image/png";
      }

      parts.push({ inlineData: { data: base64Data, mimeType } });
      logger.info(
        `[ImagePlayground] Added legacy reference image (${mimeType})`,
      );
    } catch (imgError) {
      const error = imgError as Error;
      logger.warn(
        `[ImagePlayground] Failed to process reference image:`,
        error.message,
      );
    }
  }

  // Add product images (logo, etc.)
  if (params.productImages && Array.isArray(params.productImages)) {
    for (const img of params.productImages) {
      if (img.base64 && img.mimeType) {
        parts.push({ inlineData: { data: img.base64, mimeType: img.mimeType } });
        logger.info(`[ImagePlayground] Added product image (${img.mimeType})`);
      }
    }
  }

  return parts;
}

/**
 * Background image generation processor.
 * Tries Gemini first, falls back to FAL.ai on quota/rate-limit errors.
 */
async function processImageGeneration(
  sql: SqlClient,
  taskId: string,
  generationId: string,
  params: GenerationParams,
  _genai: GoogleGenAI,
): Promise<void> {
  let usedProvider = "google";
  let usedModel = "gemini-3-pro-image-preview";

  try {
    // Update task to processing
    await sql`
      UPDATE image_async_tasks
      SET status = 'processing', updated_at = NOW()
      WHERE id = ${taskId}
    `;

    logger.info(`[ImagePlayground] Starting generation ${generationId}`, {
      prompt: params.prompt?.substring(0, 50) + "...",
      aspectRatio: params.aspectRatio,
      imageSize: params.imageSize,
      hasReferenceImages: !!params.referenceImages?.length,
      referenceImagesCount: params.referenceImages?.length || 0,
      hasLegacyImageUrl: !!params.imageUrl,
      hasProductImages: !!params.productImages?.length,
      hasBrandProfile: !!params.brandProfile,
    });

    // Build content parts to extract reference images
    const parts = await buildContentParts(params);

    // Extract image inputs from parts for the provider chain
    const imageInputs: ImageInput[] = parts
      .filter((p): p is InlineDataPart => "inlineData" in p)
      .map((p) => ({ base64: p.inlineData.data, mimeType: p.inlineData.mimeType }));

    // Map user model choice to generic tier for all providers
    const normalizedRequestedModel = String(params.model || "").toLowerCase();
    const standardModels = new Set([
      "nano-banana",
      "nano-banana-2",
      "gemini-2.5-flash-image",
      "gemini-25-flash-image",
      "gemini-3.1-flash-image-preview",
    ]);
    const modelTier: "standard" | "pro" = standardModels.has(normalizedRequestedModel) ? "standard" : "pro";

    // Run through provider chain with automatic fallback
    logger.info("[ImagePlayground] Using provider chain", { modelTier });
    const result = await runWithProviderFallback("generate", {
      prompt: params.prompt,
      aspectRatio: params.aspectRatio || "1:1",
      imageSize: params.imageSize || "1K",
      productImages: imageInputs.length > 0 ? imageInputs : undefined,
      modelTier,
    });

    usedProvider = result.usedProvider;
    usedModel = result.usedModel;

    // Convert result to base64 for upload
    let imageBase64: string;
    let mimeType: string;

    if (result.imageUrl.startsWith("data:")) {
      const matches = result.imageUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches || !matches[1] || !matches[2]) throw new Error("Invalid data URL from provider");
      mimeType = matches[1];
      imageBase64 = matches[2];
    } else {
      // HTTP URL (from FAL.ai or Replicate) — fetch and convert
      const imgResponse = await fetch(result.imageUrl);
      if (!imgResponse.ok) {
        throw new Error(`Failed to fetch provider image: ${imgResponse.status}`);
      }
      const imgBuffer = Buffer.from(await imgResponse.arrayBuffer());
      mimeType = imgResponse.headers.get("content-type") || "image/png";
      imageBase64 = imgBuffer.toString("base64");
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
    let thumbnailUrl: string | null = null;
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
      logger.info(`[ImagePlayground] Thumbnail generated: ${thumbnailUrl}`);
    } catch (thumbError) {
      const error = thumbError as Error;
      logger.warn(
        `[ImagePlayground] Failed to generate thumbnail:`,
        error.message,
      );
    }

    // Get actual dimensions from aspect ratio and size
    const dimensions = getActualDimensions(
      params.aspectRatio || "1:1",
      params.imageSize || "1K",
    );

    // Update generation with asset (include provider info)
    const asset: GenerationAsset = {
      url: blob.url,
      width: dimensions.width,
      height: dimensions.height,
      provider: usedProvider,
      model: usedModel,
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
    const [generationInfo] = (await sql`
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
    `) as GenerationInfoRow[];

    if (generationInfo) {
      // Update topic cover if this is first successful generation
      const [topic] = (await sql`
        SELECT cover_url FROM image_generation_topics
        WHERE id = ${generationInfo.topic_id}
      `) as TopicCoverRow[];

      if (topic && !topic.cover_url) {
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
          ${normalizeModelForDb(usedModel)},
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
        imageSize: (params.imageSize || "1K") as "1K" | "2K" | "4K",
        status: "success",
        metadata: {
          source: "playground",
          aspectRatio: params.aspectRatio || "1:1",
          fallbackUsed: result.usedFallback,
          generationId,
        },
      }).catch((err) => {
        logger.warn("[ImagePlayground] Failed to log usage:", (err as Error).message);
      });
    }

    logger.info(
      `[ImagePlayground] Generation ${generationId} completed successfully (provider: ${usedProvider})`,
    );
  } catch (error) {
    const err = error as Error;
    logger.error(
      `[ImagePlayground] Generation ${generationId} failed:`,
      error,
    );

    // Look up user context for the failed generation
    const [genInfo] = (await sql`
      SELECT b.user_id, b.organization_id
      FROM image_generations g
      JOIN image_generation_batches b ON b.id = g.batch_id
      WHERE g.id = ${generationId}
    `.catch(() => [{ user_id: undefined, organization_id: undefined }])) as { user_id: string | undefined; organization_id: string | null | undefined }[];

    // Log failed usage to admin dashboard
    await logAiUsage(sql, {
      userId: genInfo?.user_id,
      organizationId: genInfo?.organization_id ?? null,
      endpoint: "/api/image-playground/generate",
      operation: "image",
      model: usedModel,
      status: "error",
      error: err.message,
      metadata: { source: "playground", generationId, provider: usedProvider },
    }).catch(logErr => logger.warn({ err: logErr }, "Non-critical usage logging failed"));

    // Build user-friendly error for the frontend
    const isQuota = isQuotaOrRateLimitError(error);
    const errorPayload: GenerationError = {
      code: isQuota ? "QUOTA_EXCEEDED" : ((err as Error & { code?: string }).code || "GENERATION_FAILED"),
      message: isQuota
        ? "Limite de uso da IA atingido. Tente novamente mais tarde ou entre em contato com o suporte."
        : err.message,
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
function getActualDimensions(aspectRatio: string, imageSize: string): Dimensions {
  const dimensionMap: AspectRatioMap = {
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

  const defaultDims: [number, number] = [1024, 1024];
  const dims =
    dimensionMap[aspectRatio]?.[imageSize] ?? dimensionMap["1:1"]?.["1K"] ?? defaultDims;
  return { width: dims[0], height: dims[1] };
}

// =============================================================================
// Title Generation
// =============================================================================

interface GeminiTitleResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}

/**
 * Retry a failed generation in-place.
 * Creates a new async task, updates the generation to point to it,
 * and re-triggers processImageGeneration() with the original params.
 */
export async function retryGeneration(
  sql: SqlClient,
  generationId: string,
  userId: string | null,
  organizationId: string | null,
  genai: GoogleGenAI,
): Promise<GenerationJson> {
  const orgId = organizationId || null;

  // 1. Find the generation + its batch (with ownership check)
  const rows = orgId
    ? await sql`
        SELECT g.id, g.batch_id, g.user_id, g.async_task_id, g.seed, g.created_at,
               b.provider, b.model, b.config
        FROM image_generations g
        JOIN image_generation_batches b ON b.id = g.batch_id
        WHERE g.id = ${generationId} AND b.organization_id = ${orgId}
      `
    : await sql`
        SELECT g.id, g.batch_id, g.user_id, g.async_task_id, g.seed, g.created_at,
               b.provider, b.model, b.config
        FROM image_generations g
        JOIN image_generation_batches b ON b.id = g.batch_id
        WHERE g.id = ${generationId} AND g.user_id = ${userId}
      `;

  const row = rows[0] as {
    id: string;
    batch_id: string;
    user_id: string;
    async_task_id: string | null;
    seed: number | null;
    created_at: string;
    provider: string;
    model: string;
    config: Record<string, unknown>;
  } | undefined;

  if (!row) {
    throw new Error("Generation not found");
  }

  // 2. Reconstruct params from batch config
  const params = row.config as unknown as GenerationParams;
  const generationParams: GenerationParams = {
    ...params,
    model: row.model,
    seed: row.seed || Math.floor(Math.random() * 1000000),
  };

  // 3. Create a NEW async task
  const taskRows = (await sql`
    INSERT INTO image_async_tasks (
      user_id, type, status, metadata
    )
    VALUES (
      ${row.user_id}, 'image_generation', 'pending',
      ${JSON.stringify({
        batchId: row.batch_id,
        provider: row.provider,
        model: row.model,
        params: generationParams,
        retry: true,
      })}
    )
    RETURNING *
  `) as AsyncTaskRow[];
  const task = taskRows[0];
  if (!task) {
    throw new Error("Failed to create retry task");
  }

  // 4. Update generation: clear asset, point to new task
  await sql`
    UPDATE image_generations
    SET async_task_id = ${task.id}, asset = NULL
    WHERE id = ${generationId}
  `;

  // 5. Fire processImageGeneration in background
  processImageGeneration(sql, task.id, generationId, generationParams, genai).catch((err) => {
    logger.error("[ImagePlayground] Background retry generation failed:", err);
  });

  return {
    id: row.id,
    batchId: row.batch_id,
    userId: row.user_id,
    asyncTaskId: task.id,
    seed: generationParams.seed || row.seed,
    asset: null,
    createdAt: row.created_at,
  };
}

export async function generateTopicTitle(
  prompts: string[],
  _genai: GoogleGenAI,
): Promise<string> {
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

    const data = await response.json() as GeminiTitleResponse;
    const firstPrompt = prompts[0] ?? "";
    const title =
      data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
      firstPrompt.split(" ").slice(0, 4).join(" ");

    return title;
  } catch (error) {
    logger.error("[ImagePlayground] Title generation failed:", error);
    // Fallback to first few words of first prompt
    const firstPrompt = prompts[0] ?? "";
    return firstPrompt.split(" ").slice(0, 4).join(" ");
  }
}
