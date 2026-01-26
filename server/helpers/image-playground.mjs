/**
 * Image Playground API Helpers
 * Handles CRUD operations for topics, batches, and generations
 *
 * Uses Gemini 3 Pro Image Preview (gemini-3-pro-image-preview) for image generation
 * Supports: aspectRatio, imageSize (1K/2K/4K), reference images
 */

import { put } from "@vercel/blob";

// =============================================================================
// Topics
// =============================================================================

export async function getTopics(sql, userId, organizationId) {
  // Handle null/undefined organizationId properly
  const orgId = organizationId || null;

  const topics = orgId
    ? await sql`
        SELECT * FROM image_generation_topics
        WHERE user_id = ${userId}
        AND organization_id = ${orgId}
        ORDER BY updated_at DESC
      `
    : await sql`
        SELECT * FROM image_generation_topics
        WHERE user_id = ${userId}
        AND organization_id IS NULL
        ORDER BY updated_at DESC
      `;
  return topics;
}

export async function createTopic(sql, userId, organizationId, title = null) {
  const [topic] = await sql`
    INSERT INTO image_generation_topics (user_id, organization_id, title)
    VALUES (${userId}, ${organizationId}, ${title})
    RETURNING *
  `;
  return topic;
}

export async function updateTopic(sql, topicId, userId, updates) {
  const { title, coverUrl } = updates;

  // Build SET clause dynamically
  let setClause = [];
  let values = { topicId, userId };

  if (title !== undefined) {
    setClause.push('title');
    values.title = title;
  }
  if (coverUrl !== undefined) {
    setClause.push('cover_url');
    values.coverUrl = coverUrl;
  }

  if (setClause.length === 0) {
    // No updates, just return existing
    const [existing] = await sql`
      SELECT * FROM image_generation_topics
      WHERE id = ${topicId} AND user_id = ${userId}
    `;
    return existing;
  }

  // Always update updated_at
  const [topic] = await sql`
    UPDATE image_generation_topics
    SET
      title = COALESCE(${values.title}, title),
      cover_url = COALESCE(${values.coverUrl}, cover_url),
      updated_at = NOW()
    WHERE id = ${topicId} AND user_id = ${userId}
    RETURNING *
  `;
  return topic;
}

export async function deleteTopic(sql, topicId, userId) {
  // Cascade deletes will handle batches, generations, and tasks
  await sql`
    DELETE FROM image_generation_topics
    WHERE id = ${topicId} AND user_id = ${userId}
  `;
}

// =============================================================================
// Batches
// =============================================================================

export async function getBatches(sql, topicId, userId) {
  // Get batches with their generations
  const batches = await sql`
    SELECT
      b.*,
      COALESCE(
        json_agg(
          json_build_object(
            'id', g.id,
            'batchId', g.batch_id,
            'userId', g.user_id,
            'asyncTaskId', g.async_task_id,
            'seed', g.seed,
            'asset', g.asset,
            'createdAt', g.created_at
          ) ORDER BY g.created_at ASC
        ) FILTER (WHERE g.id IS NOT NULL),
        '[]'
      ) as generations
    FROM image_generation_batches b
    LEFT JOIN image_generations g ON g.batch_id = b.id
    WHERE b.topic_id = ${topicId} AND b.user_id = ${userId}
    GROUP BY b.id
    ORDER BY b.created_at DESC
  `;

  return batches.map(b => ({
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

export async function deleteBatch(sql, batchId, userId) {
  // Cascade deletes will handle generations
  await sql`
    DELETE FROM image_generation_batches
    WHERE id = ${batchId} AND user_id = ${userId}
  `;
}

// =============================================================================
// Generations
// =============================================================================

export async function deleteGeneration(sql, generationId, userId) {
  // Check if this is the last generation in the batch
  const [generation] = await sql`
    SELECT batch_id FROM image_generations
    WHERE id = ${generationId} AND user_id = ${userId}
  `;

  if (!generation) return;

  // Delete the generation
  await sql`
    DELETE FROM image_generations
    WHERE id = ${generationId} AND user_id = ${userId}
  `;

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
    return { status: 'error', error: { code: 'NOT_FOUND', message: 'Generation not found' } };
  }

  const status = result.task_status || (result.asset ? 'success' : 'pending');

  return {
    status,
    generation: result.asset ? {
      id: result.id,
      batchId: result.batch_id,
      userId: result.user_id,
      asyncTaskId: result.async_task_id,
      seed: result.seed,
      asset: result.asset,
      createdAt: result.created_at,
    } : null,
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
    '1:1': 1,
    '2:3': 2/3,
    '3:2': 3/2,
    '3:4': 3/4,
    '4:3': 4/3,
    '4:5': 4/5,
    '5:4': 5/4,
    '9:16': 9/16,
    '16:9': 16/9,
    '21:9': 21/9,
  };

  // Find closest match
  let closest = '1:1';
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
  if (width >= 4096) return '4K';
  if (width >= 2048) return '2K';
  return '1K';
}

export async function createImageBatch(sql, input, userId, organizationId, genai) {
  const { topicId, provider, model, imageNum, params } = input;

  // Use provided values first, fallback to calculated values
  const width = params.width || 1024;
  const height = params.height || 1024;
  const aspectRatio = params.aspectRatio || getAspectRatioFromDimensions(width, height);
  const imageSize = params.imageSize || getImageSizeFromWidth(width);

  // Create batch
  const [batch] = await sql`
    INSERT INTO image_generation_batches (
      topic_id, user_id, organization_id, provider, model, prompt, config, width, height
    )
    VALUES (
      ${topicId}, ${userId}, ${organizationId}, ${provider}, ${model},
      ${params.prompt}, ${JSON.stringify({ ...params, aspectRatio, imageSize })}, ${width}, ${height}
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
          params: { ...params, aspectRatio, imageSize },
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
    processImageGeneration(sql, task.id, generation.id, {
      ...params,
      aspectRatio,
      imageSize,
    }, genai).catch(err => {
      console.error('[ImagePlayground] Background generation failed:', err);
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
 * Background image generation processor using Gemini SDK
 * Uses the SAME approach as generateGeminiImage in dev-api.mjs
 */
async function processImageGeneration(sql, taskId, generationId, params, genai) {
  try {
    // Update task to processing
    await sql`
      UPDATE image_async_tasks
      SET status = 'processing', updated_at = NOW()
      WHERE id = ${taskId}
    `;

    console.log(`[ImagePlayground] Starting generation ${generationId}`, {
      prompt: params.prompt?.substring(0, 50) + '...',
      aspectRatio: params.aspectRatio,
      imageSize: params.imageSize,
      hasReferenceImage: !!params.imageUrl,
      hasProductImages: !!params.productImages?.length,
      hasBrandProfile: !!params.brandProfile,
    });

    // Build content parts (same structure as generateGeminiImage in dev-api.mjs)
    const parts = [{ text: params.prompt }];

    // Add reference image if provided (for image-to-image editing)
    if (params.imageUrl) {
      try {
        let base64Data = params.imageUrl;
        let mimeType = 'image/png';

        // If it's a data URL, extract base64 and mime type
        if (params.imageUrl.startsWith('data:')) {
          const matches = params.imageUrl.match(/^data:([^;]+);base64,(.+)$/);
          if (matches) {
            mimeType = matches[1];
            base64Data = matches[2];
          }
        } else if (params.imageUrl.startsWith('http')) {
          // Fetch external image and convert to base64
          const response = await fetch(params.imageUrl);
          const arrayBuffer = await response.arrayBuffer();
          base64Data = Buffer.from(arrayBuffer).toString('base64');
          mimeType = response.headers.get('content-type') || 'image/png';
        }

        parts.push({
          inlineData: {
            data: base64Data,
            mimeType,
          }
        });

        console.log(`[ImagePlayground] Added reference image (${mimeType})`);
      } catch (imgError) {
        console.warn(`[ImagePlayground] Failed to process reference image:`, imgError.message);
        // Continue without reference image
      }
    }

    // Add product images (logo, etc.) - same as generateGeminiImage
    if (params.productImages && Array.isArray(params.productImages)) {
      for (const img of params.productImages) {
        if (img.base64 && img.mimeType) {
          parts.push({
            inlineData: {
              data: img.base64,
              mimeType: img.mimeType,
            }
          });
          console.log(`[ImagePlayground] Added product image (${img.mimeType})`);
        }
      }
    }

    // Use Gemini SDK (same approach as generateGeminiImage in dev-api.mjs)
    const model = 'gemini-3-pro-image-preview';
    const mappedAspectRatio = mapAspectRatio(params.aspectRatio || '1:1');

    console.log(`[ImagePlayground] Calling Gemini SDK with model=${model}, aspectRatio=${mappedAspectRatio}, imageSize=${params.imageSize || '1K'}`);

    const response = await genai.models.generateContent({
      model,
      contents: { parts },
      config: {
        imageConfig: {
          aspectRatio: mappedAspectRatio,
          imageSize: params.imageSize || '1K',
        },
      },
    });

    // Extract image from response (same as generateGeminiImage)
    const responseParts = response?.candidates?.[0]?.content?.parts;

    if (!Array.isArray(responseParts)) {
      console.error(`[ImagePlayground] Unexpected response:`, JSON.stringify(response, null, 2).substring(0, 500));

      // Check for specific finish reasons
      const finishReason = response?.candidates?.[0]?.finishReason;
      if (finishReason === 'NO_IMAGE') {
        throw new Error('O modelo não conseguiu gerar a imagem. Tente um prompt mais descritivo e específico (ex: "um pôr do sol na praia com cores vibrantes")');
      } else if (finishReason === 'SAFETY') {
        throw new Error('O prompt foi bloqueado por políticas de segurança. Tente reformular.');
      } else if (finishReason === 'RECITATION') {
        throw new Error('O modelo detectou possível violação de direitos autorais.');
      }

      throw new Error('Falha ao gerar imagem - resposta inválida do modelo');
    }

    let imageBase64 = null;
    let mimeType = 'image/png';

    for (const part of responseParts) {
      if (part.inlineData) {
        imageBase64 = part.inlineData.data;
        mimeType = part.inlineData.mimeType || 'image/png';
        break;
      }
    }

    if (!imageBase64) {
      console.error(`[ImagePlayground] No image in response parts:`, JSON.stringify(responseParts).substring(0, 500));
      throw new Error('Falha ao gerar imagem. Tente um prompt diferente.');
    }

    // Upload to Vercel Blob
    const buffer = Buffer.from(imageBase64, 'base64');
    const extension = mimeType.split('/')[1] || 'png';
    const filename = `playground/${generationId}.${extension}`;

    const blob = await put(filename, buffer, {
      access: 'public',
      contentType: mimeType,
    });

    // Get actual dimensions from aspect ratio and size
    const dimensions = getActualDimensions(params.aspectRatio || '1:1', params.imageSize || '1K');

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
          ${generationInfo.prompt},
          'playground',
          ${generationInfo.model},
          ${params.aspectRatio || '1:1'},
          ${params.imageSize || '1K'},
          'image'
        )
      `;
    }

    console.log(`[ImagePlayground] Generation ${generationId} completed successfully`);

  } catch (error) {
    console.error(`[ImagePlayground] Generation ${generationId} failed:`, error);

    // Update task to error
    await sql`
      UPDATE image_async_tasks
      SET
        status = 'error',
        error = ${JSON.stringify({
          code: error.code || 'GENERATION_FAILED',
          message: error.message,
        })},
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
    '1:1': { '1K': [1024, 1024], '2K': [2048, 2048], '4K': [4096, 4096] },
    '2:3': { '1K': [848, 1264], '2K': [1696, 2528], '4K': [3392, 5056] },
    '3:2': { '1K': [1264, 848], '2K': [2528, 1696], '4K': [5056, 3392] },
    '3:4': { '1K': [896, 1200], '2K': [1792, 2400], '4K': [3584, 4800] },
    '4:3': { '1K': [1200, 896], '2K': [2400, 1792], '4K': [4800, 3584] },
    '4:5': { '1K': [928, 1152], '2K': [1856, 2304], '4K': [3712, 4608] },
    '5:4': { '1K': [1152, 928], '2K': [2304, 1856], '4K': [4608, 3712] },
    '9:16': { '1K': [768, 1376], '2K': [1536, 2752], '4K': [3072, 5504] },
    '16:9': { '1K': [1376, 768], '2K': [2752, 1536], '4K': [5504, 3072] },
    '21:9': { '1K': [1584, 672], '2K': [3168, 1344], '4K': [6336, 2688] },
  };

  const dims = dimensionMap[aspectRatio]?.[imageSize] || dimensionMap['1:1']['1K'];
  return { width: dims[0], height: dims[1] };
}

// =============================================================================
// Title Generation
// =============================================================================

export async function generateTopicTitle(prompts, genai) {
  try {
    const promptText = prompts.slice(0, 3).join('\n');

    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('API key not configured');
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Generate a short, creative title (3-5 words) for an image generation project based on these prompts:\n\n${promptText}\n\nRespond with ONLY the title, no quotes or extra text.`
            }]
          }],
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const title = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
      || prompts[0].split(' ').slice(0, 4).join(' ');

    return title;
  } catch (error) {
    console.error('[ImagePlayground] Title generation failed:', error);
    // Fallback to first few words of first prompt
    return prompts[0].split(' ').slice(0, 4).join(' ');
  }
}
