/**
 * Studio Agent Tool Registry
 *
 * Provides tool definitions for the Claude Agent SDK MCP server.
 * Tools are prefixed with `studio_` and handle Image/Video Studio operations.
 */

import { z } from 'zod';
import { tool, type SdkMcpToolDefinition } from '@anthropic-ai/claude-agent-sdk';
import { put } from '@vercel/blob';
import type { GoogleGenAI } from '@google/genai';
import type { Logger } from 'pino';
import { getGeminiAi } from '../../ai/clients.js';
import { generateStructuredContent } from '../../ai/text-generation.js';
import {
  buildVideoPrompt,
  buildImagePrompt,
  buildFlyerPrompt,
  buildQuickPostPrompt,
  campaignSchema,
  quickPostSchema,
  DEFAULT_TEXT_MODEL,
  type BrandProfile,
} from '../../ai/prompt-builders.js';
import {
  generateImageWithFallback,
} from '../../ai/image-generation.js';
import {
  generateVideoWithFal,
  generateVideoWithGoogleVeo,
  uploadDataUrlImageToBlob,
} from '../../ai/video-generation.js';
import { urlToBase64 } from '../../../helpers/image-helpers.js';
import { withRetry } from '../../ai/retry.js';
import {
  getTopics as getImageTopics,
  createTopic as createImageTopic,
  updateTopic as updateImageTopic,
  deleteTopic as deleteImageTopic,
  getBatches as getImageBatches,
  deleteBatch as deleteImageBatch,
  createImageBatch,
  getGenerationStatus,
  deleteGeneration as deleteImageGeneration,
} from '../../../helpers/image-playground.js';
import {
  getTopics as getVideoTopics,
  createTopic as createVideoTopic,
  updateTopic as updateVideoTopic,
  deleteTopic as deleteVideoTopic,
  getSessions as getVideoSessions,
  deleteSession as deleteVideoSession,
  createSession as createVideoSession,
  updateGeneration as updateVideoGeneration,
  deleteGeneration as deleteVideoGeneration,
  type CreateSessionResult,
} from '../../../helpers/video-playground.js';
import type { SqlClient } from '../../db.js';

// =============================================================================
// Types
// =============================================================================

/** Tool result wrapper for success */
interface ToolSuccessResult<T> {
  success: true;
  data: T;
}

/** Tool result wrapper for failure */
interface ToolFailureResult {
  success: false;
  error: string;
}

type ToolResult<T> = ToolSuccessResult<T> | ToolFailureResult;

/** Brand profile row from database */
interface BrandProfileRow {
  id: string;
  name: string | null;
  description: string | null;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  tertiary_color: string | null;
  tone_of_voice: string | null;
  settings: { toneTargets?: string[] } | null;
}

/** Mapped brand profile for prompts */
interface MappedBrandProfile {
  name: string | null;
  description: string | null;
  logo: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  tertiaryColor: string | null;
  toneOfVoice: string | null;
  toneTargets: string[];
}

/** Configuration for building studio tools */
export interface StudioToolConfig {
  sql: SqlClient;
  userId: string;
  organizationId: string | null;
  logger: Logger;
}

/** Reference image structure for image generation */
interface ReferenceImage {
  id: string;
  dataUrl: string;
  mimeType: string;
}

/** Gemini content part with inline data */
interface GeminiInlinePart {
  inlineData: {
    data: string;
    mimeType: string;
  };
}

/** Gemini content part with text */
interface GeminiTextPart {
  text: string;
}

type GeminiContentPart = GeminiInlinePart | GeminiTextPart;

/** Gemini response candidate */
interface GeminiCandidate {
  content?: {
    parts?: GeminiContentPart[];
  };
}

/** Gemini API response */
interface GeminiResponse {
  candidates?: GeminiCandidate[];
}

/** MCP tool content item - matches CallToolResult from @modelcontextprotocol/sdk */
interface TextContent {
  type: 'text';
  text: string;
}

interface ImageContent {
  type: 'image';
  data: string;
  mimeType: string;
}

interface EmbeddedResource {
  type: 'resource';
  resource: {
    uri: string;
    mimeType?: string;
    text?: string;
    blob?: string;
  };
}

/** MCP CallToolResult type - matches @modelcontextprotocol/sdk/types.js */
interface CallToolResult {
  content: (TextContent | ImageContent | EmbeddedResource)[];
  isError?: boolean;
}

/**
 * Type alias for studio tool definitions.
 * Uses SdkMcpToolDefinition<any> to match createSdkMcpServer's expected type
 * and avoid generic schema parameter compatibility issues between Zod versions.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StudioTool = SdkMcpToolDefinition<any>;

// =============================================================================
// Helpers
// =============================================================================

function ok<T>(data: T): ToolSuccessResult<T> {
  return { success: true, data };
}

function fail(error: unknown): ToolFailureResult {
  return {
    success: false,
    error: error instanceof Error ? error.message : String(error),
  };
}

function jsonResult<T>(result: ToolResult<T>): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
    isError: !result.success,
  };
}

async function getBrandProfile(
  sql: SqlClient,
  userId: string,
  organizationId: string | null
): Promise<BrandProfileRow | null> {
  if (organizationId) {
    const rows = await sql`
      SELECT * FROM brand_profiles
      WHERE organization_id = ${organizationId}
        AND deleted_at IS NULL
      LIMIT 1
    `;
    return (rows[0] as BrandProfileRow | undefined) ?? null;
  }

  const rows = await sql`
    SELECT * FROM brand_profiles
    WHERE user_id = ${userId}
      AND organization_id IS NULL
      AND deleted_at IS NULL
    LIMIT 1
  `;
  return (rows[0] as BrandProfileRow | undefined) ?? null;
}

function mapBrandProfileForPrompt(raw: BrandProfileRow | null): MappedBrandProfile | null {
  if (!raw) return null;
  return {
    name: raw.name,
    description: raw.description,
    logo: raw.logo_url,
    primaryColor: raw.primary_color,
    secondaryColor: raw.secondary_color,
    tertiaryColor: raw.tertiary_color,
    toneOfVoice: raw.tone_of_voice,
    toneTargets: raw.settings?.toneTargets ?? ['campaigns', 'posts', 'images', 'flyers', 'videos'],
  };
}

function isGeminiInlinePart(part: GeminiContentPart): part is GeminiInlinePart {
  return 'inlineData' in part;
}

// =============================================================================
// Tool Builder
// =============================================================================

export function buildStudioToolDefinitions(config: StudioToolConfig): StudioTool[] {
  const { sql, userId, organizationId, logger: log } = config;
  const genai: GoogleGenAI = getGeminiAi();

  // Note: Tools are explicitly typed in-place. The array uses 'as StudioTool[]'
  // at the end to satisfy the return type while preserving each tool's specific schema.
  const tools = [
    // =========================================================================
    // Image Studio Tools
    // =========================================================================

    tool(
      'studio_image_list_topics',
      'Lista topicos do Image Studio.',
      {},
      async (): Promise<CallToolResult> => {
        try {
          const topics = await getImageTopics(sql, userId, organizationId);
          return jsonResult(ok(topics));
        } catch (error) {
          return jsonResult(fail(error));
        }
      },
    ),

    tool(
      'studio_image_create_topic',
      'Cria topico no Image Studio.',
      { title: z.string().optional() },
      async ({ title }: { title?: string }): Promise<CallToolResult> => {
        try {
          const topic = await createImageTopic(sql, userId, organizationId, title ?? null);
          return jsonResult(ok(topic));
        } catch (error) {
          return jsonResult(fail(error));
        }
      },
    ),

    tool(
      'studio_image_update_topic',
      'Renomeia ou atualiza capa de topico no Image Studio.',
      {
        topicId: z.string(),
        title: z.string().optional(),
        coverUrl: z.string().optional(),
      },
      async ({ topicId, title, coverUrl }: { topicId: string; title?: string; coverUrl?: string }): Promise<CallToolResult> => {
        try {
          const topic = await updateImageTopic(sql, topicId, userId, { title, coverUrl }, organizationId);
          return jsonResult(ok(topic));
        } catch (error) {
          return jsonResult(fail(error));
        }
      },
    ),

    tool(
      'studio_image_delete_topic',
      'Exclui topico do Image Studio.',
      { topicId: z.string() },
      async ({ topicId }: { topicId: string }): Promise<CallToolResult> => {
        try {
          await deleteImageTopic(sql, topicId, userId, organizationId);
          return jsonResult(ok({ topicId }));
        } catch (error) {
          return jsonResult(fail(error));
        }
      },
    ),

    tool(
      'studio_image_list_batches',
      'Lista batches de um topico do Image Studio.',
      { topicId: z.string(), limit: z.number().optional() },
      async ({ topicId, limit }: { topicId: string; limit?: number }): Promise<CallToolResult> => {
        try {
          const batches = await getImageBatches(sql, topicId, userId, organizationId, limit ?? 100);
          return jsonResult(ok(batches));
        } catch (error) {
          return jsonResult(fail(error));
        }
      },
    ),

    tool(
      'studio_image_delete_batch',
      'Exclui batch no Image Studio.',
      { batchId: z.string() },
      async ({ batchId }: { batchId: string }): Promise<CallToolResult> => {
        try {
          await deleteImageBatch(sql, batchId, userId, organizationId);
          return jsonResult(ok({ batchId }));
        } catch (error) {
          return jsonResult(fail(error));
        }
      },
    ),

    tool(
      'studio_image_generate',
      'Gera imagens no Image Studio usando pipeline existente.',
      {
        topicId: z.string(),
        prompt: z.string(),
        imageNum: z.number().int().min(1).max(8).optional(),
        aspectRatio: z.string().optional(),
        imageSize: z.enum(['1K', '2K', '4K']).optional(),
        referenceImages: z.array(z.object({
          id: z.string(),
          dataUrl: z.string(),
          mimeType: z.string(),
        })).optional(),
      },
      async ({
        topicId,
        prompt,
        imageNum,
        aspectRatio,
        imageSize,
        referenceImages,
      }: {
        topicId: string;
        prompt: string;
        imageNum?: number;
        aspectRatio?: string;
        imageSize?: '1K' | '2K' | '4K';
        referenceImages?: ReferenceImage[];
      }): Promise<CallToolResult> => {
        try {
          const result = await createImageBatch(
            sql,
            {
              topicId,
              provider: 'google',
              model: 'gemini-3-pro-image-preview',
              imageNum: imageNum ?? 1,
              params: {
                prompt,
                userPrompt: prompt,
                aspectRatio,
                imageSize,
                referenceImages,
              },
            },
            userId,
            organizationId,
            genai,
          );

          return jsonResult(ok(result));
        } catch (error) {
          log.error({ err: error }, '[AgentTools] studio_image_generate failed');
          return jsonResult(fail(error));
        }
      },
    ),

    tool(
      'studio_image_get_generation_status',
      'Consulta status de geracao de imagem. IMPORTANTE: chame no maximo 2 vezes por geracao. Se o status for "pending" ou "processing", NAO fique chamando em loop — informe ao usuario que a imagem esta sendo processada e ele vera o resultado automaticamente na interface.',
      {
        generationId: z.string(),
        asyncTaskId: z.string().optional(),
      },
      async ({ generationId, asyncTaskId }: { generationId: string; asyncTaskId?: string }): Promise<CallToolResult> => {
        try {
          const status = await getGenerationStatus(sql, generationId, asyncTaskId ?? '');
          return jsonResult(ok(status));
        } catch (error) {
          return jsonResult(fail(error));
        }
      },
    ),

    tool(
      'studio_image_delete_generation',
      'Exclui uma geracao de imagem.',
      { generationId: z.string() },
      async ({ generationId }: { generationId: string }): Promise<CallToolResult> => {
        try {
          await deleteImageGeneration(sql, generationId, userId, organizationId);
          return jsonResult(ok({ generationId }));
        } catch (error) {
          return jsonResult(fail(error));
        }
      },
    ),

    // =========================================================================
    // Video Studio Tools
    // =========================================================================

    tool(
      'studio_video_list_topics',
      'Lista topicos do Studio Video.',
      {},
      async (): Promise<CallToolResult> => {
        try {
          const topics = await getVideoTopics(sql, userId, organizationId);
          return jsonResult(ok(topics));
        } catch (error) {
          return jsonResult(fail(error));
        }
      },
    ),

    tool(
      'studio_video_create_topic',
      'Cria topico no Studio Video.',
      { title: z.string().optional() },
      async ({ title }: { title?: string }): Promise<CallToolResult> => {
        try {
          const topic = await createVideoTopic(sql, userId, organizationId, title ?? null);
          return jsonResult(ok(topic));
        } catch (error) {
          return jsonResult(fail(error));
        }
      },
    ),

    tool(
      'studio_video_update_topic',
      'Atualiza topico do Studio Video.',
      {
        topicId: z.string(),
        title: z.string().optional(),
        coverUrl: z.string().optional(),
      },
      async ({ topicId, title, coverUrl }: { topicId: string; title?: string; coverUrl?: string }): Promise<CallToolResult> => {
        try {
          const topic = await updateVideoTopic(sql, topicId, userId, { title, coverUrl }, organizationId);
          return jsonResult(ok(topic));
        } catch (error) {
          return jsonResult(fail(error));
        }
      },
    ),

    tool(
      'studio_video_delete_topic',
      'Exclui topico do Studio Video.',
      { topicId: z.string() },
      async ({ topicId }: { topicId: string }): Promise<CallToolResult> => {
        try {
          await deleteVideoTopic(sql, topicId, userId, organizationId);
          return jsonResult(ok({ topicId }));
        } catch (error) {
          return jsonResult(fail(error));
        }
      },
    ),

    tool(
      'studio_video_list_sessions',
      'Lista sessoes de video de um topico.',
      { topicId: z.string(), limit: z.number().optional() },
      async ({ topicId, limit }: { topicId: string; limit?: number }): Promise<CallToolResult> => {
        try {
          const sessions = await getVideoSessions(sql, topicId, userId, organizationId, limit ?? 100);
          return jsonResult(ok(sessions));
        } catch (error) {
          return jsonResult(fail(error));
        }
      },
    ),

    tool(
      'studio_video_delete_session',
      'Exclui sessao de video.',
      { sessionId: z.string() },
      async ({ sessionId }: { sessionId: string }): Promise<CallToolResult> => {
        try {
          await deleteVideoSession(sql, sessionId, userId, organizationId);
          return jsonResult(ok({ sessionId }));
        } catch (error) {
          return jsonResult(fail(error));
        }
      },
    ),

    tool(
      'studio_video_generate',
      'Gera video no Studio Video e atualiza sessao/geracao.',
      {
        topicId: z.string(),
        prompt: z.string(),
        model: z.enum(['veo-3.1', 'sora-2']).optional(),
        aspectRatio: z.enum(['16:9', '9:16']).optional(),
        resolution: z.enum(['720p', '1080p']).optional(),
        referenceImageUrl: z.string().optional(),
        useBrandProfile: z.boolean().optional(),
        generateAudio: z.boolean().optional(),
      },
      async ({
        topicId,
        prompt,
        model,
        aspectRatio,
        resolution,
        referenceImageUrl,
        useBrandProfile,
        generateAudio,
      }: {
        topicId: string;
        prompt: string;
        model?: 'veo-3.1' | 'sora-2';
        aspectRatio?: '16:9' | '9:16';
        resolution?: '720p' | '1080p';
        referenceImageUrl?: string;
        useBrandProfile?: boolean;
        generateAudio?: boolean;
      }): Promise<CallToolResult> => {
        try {
          const sessionResult: CreateSessionResult = await createVideoSession(
            sql,
            {
              topicId,
              model: model ?? 'veo-3.1',
              prompt,
              aspectRatio: aspectRatio ?? '9:16',
              resolution: resolution ?? '720p',
              referenceImageUrl: referenceImageUrl ?? null,
            },
            userId,
            organizationId,
          );

          const generationId = sessionResult.generation.id;
          await updateVideoGeneration(
            sql,
            generationId,
            { status: 'generating' },
            userId,
            organizationId,
          );

          const rawBrandProfile = useBrandProfile
            ? await getBrandProfile(sql, userId, organizationId)
            : null;
          const mappedBrandProfile = mapBrandProfileForPrompt(rawBrandProfile);

          let effectiveImageUrl: string | null = referenceImageUrl ?? null;
          if (!effectiveImageUrl && mappedBrandProfile?.logo) {
            effectiveImageUrl = mappedBrandProfile.logo;
          }

          const finalPrompt = mappedBrandProfile
            ? buildVideoPrompt(prompt, mappedBrandProfile as BrandProfile, {
                resolution: resolution ?? '720p',
                aspectRatio: aspectRatio ?? '9:16',
                hasReferenceImage: !!effectiveImageUrl,
                useCampaignGradePrompt: true,
                hasBrandLogoReference: Boolean(
                  effectiveImageUrl && mappedBrandProfile.logo && effectiveImageUrl === mappedBrandProfile.logo,
                ),
              })
            : prompt;

          const selectedModel = model ?? 'veo-3.1';
          const selectedAspectRatio = aspectRatio ?? '9:16';
          const selectedResolution = resolution ?? '720p';

          // Check if using Google Veo provider (veo-3.1) or FAL provider (sora-2, etc.)
          const isGoogleVeoModel = selectedModel === 'veo-3.1';

          if (effectiveImageUrl?.startsWith('data:') && !isGoogleVeoModel) {
            effectiveImageUrl = await uploadDataUrlImageToBlob(effectiveImageUrl, 'agent-video-reference');
          }

          let finalVideoUrl = '';

          if (isGoogleVeoModel) {
            const result = await generateVideoWithGoogleVeo(
              finalPrompt,
              selectedAspectRatio,
              effectiveImageUrl ?? undefined,
            );

            const blob = await put(`agent-video-${Date.now()}.mp4`, result.videoBuffer, {
              access: 'public',
              contentType: 'video/mp4',
            });
            finalVideoUrl = blob.url;
          } else {
            const generatedUrl = await generateVideoWithFal(
              finalPrompt,
              selectedAspectRatio,
              selectedModel,
              effectiveImageUrl ?? undefined,
              5,
              generateAudio !== false,
            );

            if (!generatedUrl) {
              throw new Error('Falha ao gerar video no provider externo.');
            }

            const response = await fetch(generatedUrl);
            if (!response.ok) {
              throw new Error(`Falha ao baixar video gerado (${response.status}).`);
            }

            const videoBuffer = Buffer.from(await response.arrayBuffer());
            const blob = await put(`agent-video-${Date.now()}.mp4`, videoBuffer, {
              access: 'public',
              contentType: 'video/mp4',
            });
            finalVideoUrl = blob.url;
          }

          const generation = await updateVideoGeneration(
            sql,
            generationId,
            {
              status: 'success',
              videoUrl: finalVideoUrl,
            },
            userId,
            organizationId,
          );

          return jsonResult(ok({
            session: sessionResult.session,
            generation,
            videoUrl: finalVideoUrl,
            model: selectedModel,
            aspectRatio: selectedAspectRatio,
            resolution: selectedResolution,
          }));
        } catch (error) {
          log.error({ err: error }, '[AgentTools] studio_video_generate failed');
          return jsonResult(fail(error));
        }
      },
    ),

    tool(
      'studio_video_update_generation',
      'Atualiza status de geracao de video.',
      {
        generationId: z.string(),
        status: z.enum(['pending', 'generating', 'success', 'error']).optional(),
        videoUrl: z.string().optional(),
        duration: z.number().optional(),
        errorMessage: z.string().optional(),
      },
      async ({
        generationId,
        status,
        videoUrl,
        duration,
        errorMessage,
      }: {
        generationId: string;
        status?: 'pending' | 'generating' | 'success' | 'error';
        videoUrl?: string;
        duration?: number;
        errorMessage?: string;
      }): Promise<CallToolResult> => {
        try {
          const generation = await updateVideoGeneration(
            sql,
            generationId,
            { status, videoUrl, duration, errorMessage },
            userId,
            organizationId,
          );
          return jsonResult(ok(generation));
        } catch (error) {
          return jsonResult(fail(error));
        }
      },
    ),

    tool(
      'studio_video_delete_generation',
      'Exclui uma geracao de video.',
      { generationId: z.string() },
      async ({ generationId }: { generationId: string }): Promise<CallToolResult> => {
        try {
          await deleteVideoGeneration(sql, generationId, userId, organizationId);
          return jsonResult(ok({ generationId }));
        } catch (error) {
          return jsonResult(fail(error));
        }
      },
    ),

    // =========================================================================
    // Reading tools - gallery, brand, campaigns, posts, clips, carousels, scheduled
    // =========================================================================

    tool(
      'studio_gallery_search',
      'Busca imagens na galeria do usuario. Pode filtrar por texto (prompt/source) e source.',
      {
        query: z.string().optional(),
        source: z.string().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      },
      async ({ query, source, limit }: { query?: string; source?: string; limit?: number }): Promise<CallToolResult> => {
        try {
          const max = limit ?? 20;
          const conditions = [
            organizationId
              ? sql`organization_id = ${organizationId}`
              : sql`user_id = ${userId} AND organization_id IS NULL`,
            sql`deleted_at IS NULL`,
          ];
          if (source) conditions.push(sql`source = ${source}`);
          if (query) {
            const escaped = query.replace(/[%_\\]/g, '\\$&');
            const pattern = `%${escaped}%`;
            conditions.push(sql`(prompt ILIKE ${pattern} OR source ILIKE ${pattern})`);
          }
          const where = conditions.reduce((a, b) => sql`${a} AND ${b}`);
          const rows = await sql`
            SELECT id, src_url, thumbnail_url, prompt, model, aspect_ratio, source, created_at
            FROM gallery_images
            WHERE ${where}
            ORDER BY created_at DESC
            LIMIT ${max}
          `;
          return jsonResult(ok(rows));
        } catch (error) {
          return jsonResult(fail(error));
        }
      },
    ),

    tool(
      'studio_gallery_get',
      'Obtem detalhes completos de uma imagem especifica da galeria.',
      { imageId: z.string() },
      async ({ imageId }: { imageId: string }): Promise<CallToolResult> => {
        try {
          const userCondition = organizationId
            ? sql`organization_id = ${organizationId}`
            : sql`user_id = ${userId} AND organization_id IS NULL`;
          const rows = await sql`
            SELECT id, src_url, thumbnail_url, prompt, model, aspect_ratio, image_size,
                   source, is_style_reference, style_reference_name, created_at
            FROM gallery_images
            WHERE id = ${imageId} AND ${userCondition} AND deleted_at IS NULL
          `;
          if (rows.length === 0) return jsonResult(fail('Imagem nao encontrada.'));
          return jsonResult(ok(rows[0]));
        } catch (error) {
          return jsonResult(fail(error));
        }
      },
    ),

    tool(
      'studio_brand_profile_get',
      'Obtem o brand profile do usuario (nome, descricao, logo, cores, tom de voz).',
      {},
      async (): Promise<CallToolResult> => {
        try {
          const raw = await getBrandProfile(sql, userId, organizationId);
          if (!raw) return jsonResult(ok(null));
          return jsonResult(ok({
            id: raw.id,
            name: raw.name,
            description: raw.description,
            logoUrl: raw.logo_url,
            primaryColor: raw.primary_color,
            secondaryColor: raw.secondary_color,
            tertiaryColor: raw.tertiary_color,
            toneOfVoice: raw.tone_of_voice,
            settings: raw.settings,
          }));
        } catch (error) {
          return jsonResult(fail(error));
        }
      },
    ),

    tool(
      'studio_campaigns_list',
      'Lista campanhas do usuario com contagem de clips, posts, ads e carrosseis.',
      { limit: z.number().int().min(1).max(50).optional() },
      async ({ limit }: { limit?: number }): Promise<CallToolResult> => {
        try {
          const max = limit ?? 20;
          const userCondition = organizationId
            ? sql`c.organization_id = ${organizationId}`
            : sql`c.user_id = ${userId} AND c.organization_id IS NULL`;
          const rows = await sql`
            SELECT
              c.id, c.name, c.description, c.status, c.created_at,
              COALESCE(vc.cnt, 0)::int AS clip_count,
              COALESCE(p.cnt, 0)::int  AS post_count,
              COALESCE(a.cnt, 0)::int  AS ad_count,
              COALESCE(cr.cnt, 0)::int AS carousel_count
            FROM campaigns c
            LEFT JOIN (SELECT campaign_id, count(*) cnt FROM video_clip_scripts GROUP BY campaign_id) vc ON vc.campaign_id = c.id
            LEFT JOIN (SELECT campaign_id, count(*) cnt FROM posts WHERE campaign_id IS NOT NULL GROUP BY campaign_id) p ON p.campaign_id = c.id
            LEFT JOIN (SELECT campaign_id, count(*) cnt FROM ad_creatives WHERE campaign_id IS NOT NULL GROUP BY campaign_id) a ON a.campaign_id = c.id
            LEFT JOIN (SELECT campaign_id, count(*) cnt FROM carousel_scripts GROUP BY campaign_id) cr ON cr.campaign_id = c.id
            WHERE ${userCondition} AND c.deleted_at IS NULL
            ORDER BY c.created_at DESC
            LIMIT ${max}
          `;
          return jsonResult(ok(rows));
        } catch (error) {
          return jsonResult(fail(error));
        }
      },
    ),

    tool(
      'studio_campaign_get',
      'Obtem campanha completa com clips, posts, ads e carrosseis.',
      { campaignId: z.string() },
      async ({ campaignId }: { campaignId: string }): Promise<CallToolResult> => {
        try {
          const userCondition = organizationId
            ? sql`organization_id = ${organizationId}`
            : sql`user_id = ${userId} AND organization_id IS NULL`;
          const [campaigns, clips, posts, ads, carousels] = await Promise.all([
            sql`SELECT id, name, description, status, input_transcript, generation_options, created_at FROM campaigns WHERE id = ${campaignId} AND ${userCondition} AND deleted_at IS NULL`,
            sql`SELECT id, title, hook, image_prompt, audio_script, scenes, thumbnail_url, sort_order FROM video_clip_scripts WHERE campaign_id = ${campaignId} ORDER BY sort_order`,
            sql`SELECT id, platform, content, hashtags, image_prompt, image_url, sort_order FROM posts WHERE campaign_id = ${campaignId} ORDER BY sort_order`,
            sql`SELECT id, platform, headline, body, cta, image_prompt, image_url, sort_order FROM ad_creatives WHERE campaign_id = ${campaignId} ORDER BY sort_order`,
            sql`SELECT id, title, hook, cover_prompt, caption, slides, cover_url, sort_order FROM carousel_scripts WHERE campaign_id = ${campaignId} ORDER BY sort_order`,
          ]);
          if (campaigns.length === 0) return jsonResult(fail('Campanha nao encontrada.'));
          return jsonResult(ok({ ...campaigns[0], clips, posts, ads, carousels }));
        } catch (error) {
          return jsonResult(fail(error));
        }
      },
    ),

    tool(
      'studio_posts_list',
      'Lista posts de uma campanha.',
      { campaignId: z.string() },
      async ({ campaignId }: { campaignId: string }): Promise<CallToolResult> => {
        try {
          const ownerCondition = organizationId
            ? sql`c.organization_id = ${organizationId}`
            : sql`c.user_id = ${userId} AND c.organization_id IS NULL`;
          const rows = await sql`
            SELECT p.id, p.campaign_id, p.platform, p.content, p.hashtags, p.image_prompt, p.image_url, p.sort_order
            FROM posts p
            JOIN campaigns c ON c.id = p.campaign_id
            WHERE p.campaign_id = ${campaignId} AND ${ownerCondition} AND c.deleted_at IS NULL
            ORDER BY p.sort_order
          `;
          return jsonResult(ok(rows));
        } catch (error) {
          return jsonResult(fail(error));
        }
      },
    ),

    tool(
      'studio_clips_list',
      'Lista video clips de uma campanha.',
      { campaignId: z.string() },
      async ({ campaignId }: { campaignId: string }): Promise<CallToolResult> => {
        try {
          const ownerCondition = organizationId
            ? sql`c.organization_id = ${organizationId}`
            : sql`c.user_id = ${userId} AND c.organization_id IS NULL`;
          const rows = await sql`
            SELECT v.id, v.campaign_id, v.title, v.hook, v.image_prompt, v.audio_script, v.scenes, v.thumbnail_url, v.sort_order
            FROM video_clip_scripts v
            JOIN campaigns c ON c.id = v.campaign_id
            WHERE v.campaign_id = ${campaignId} AND ${ownerCondition} AND c.deleted_at IS NULL
            ORDER BY v.sort_order
          `;
          return jsonResult(ok(rows));
        } catch (error) {
          return jsonResult(fail(error));
        }
      },
    ),

    tool(
      'studio_carousels_list',
      'Lista carrosseis de uma campanha.',
      { campaignId: z.string() },
      async ({ campaignId }: { campaignId: string }): Promise<CallToolResult> => {
        try {
          const ownerCondition = organizationId
            ? sql`c.organization_id = ${organizationId}`
            : sql`c.user_id = ${userId} AND c.organization_id IS NULL`;
          const rows = await sql`
            SELECT cs.id, cs.campaign_id, cs.title, cs.hook, cs.cover_prompt, cs.caption, cs.slides, cs.cover_url, cs.sort_order
            FROM carousel_scripts cs
            JOIN campaigns c ON c.id = cs.campaign_id
            WHERE cs.campaign_id = ${campaignId} AND ${ownerCondition} AND c.deleted_at IS NULL
            ORDER BY cs.sort_order
          `;
          return jsonResult(ok(rows));
        } catch (error) {
          return jsonResult(fail(error));
        }
      },
    ),

    tool(
      'studio_scheduled_posts_list',
      'Lista posts agendados do usuario.',
      { limit: z.number().int().min(1).max(50).optional() },
      async ({ limit }: { limit?: number }): Promise<CallToolResult> => {
        try {
          const max = limit ?? 20;
          const userCondition = organizationId
            ? sql`organization_id = ${organizationId}`
            : sql`user_id = ${userId} AND organization_id IS NULL`;
          const rows = await sql`
            SELECT id, platforms, caption, image_url, scheduled_timestamp, status, content_type
            FROM scheduled_posts
            WHERE ${userCondition}
            ORDER BY scheduled_timestamp DESC
            LIMIT ${max}
          `;
          return jsonResult(ok(rows));
        } catch (error) {
          return jsonResult(fail(error));
        }
      },
    ),

    // =========================================================================
    // Mutation tools - edit, flyer, save, text, campaign generation
    // =========================================================================

    tool(
      'studio_image_edit',
      'Edita uma imagem existente com prompt de instrucao (ex: alterar cores, adicionar texto, remover fundo). Recebe URL da imagem e prompt de edicao.',
      {
        imageUrl: z.string().describe('URL da imagem a editar'),
        prompt: z.string().describe('Instrucao de edicao'),
        referenceImageUrl: z.string().optional().describe('URL de imagem de referencia opcional'),
      },
      async ({ imageUrl, prompt: editPrompt, referenceImageUrl }: { imageUrl: string; prompt: string; referenceImageUrl?: string }): Promise<CallToolResult> => {
        try {
          const base64 = await urlToBase64(imageUrl);
          if (!base64) throw new Error('Falha ao converter imagem para base64.');

          const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [
            { text: editPrompt },
            { inlineData: { data: base64, mimeType: 'image/png' } },
          ];

          if (referenceImageUrl) {
            const refBase64 = await urlToBase64(referenceImageUrl);
            if (refBase64) {
              parts.push({ inlineData: { data: refBase64, mimeType: 'image/png' } });
            }
          }

          const response = await withRetry(() =>
            genai.models.generateContent({
              model: 'gemini-3-pro-image-preview',
              contents: { parts },
              config: { imageConfig: { imageSize: '1K' } },
            }),
          ) as GeminiResponse;

          let imageDataUrl: string | null = null;
          const contentParts = response.candidates?.[0]?.content?.parts;
          if (Array.isArray(contentParts)) {
            for (const part of contentParts) {
              if (isGeminiInlinePart(part)) {
                imageDataUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                break;
              }
            }
          }

          if (!imageDataUrl) throw new Error('Edicao retornou resposta vazia.');

          const blobUrl = await uploadDataUrlImageToBlob(imageDataUrl, 'agent-image-edit');
          return jsonResult(ok({ imageUrl: blobUrl }));
        } catch (error) {
          log.error({ err: error }, '[AgentTools] studio_image_edit failed');
          return jsonResult(fail(error));
        }
      },
    ),

    tool(
      'studio_flyer_generate',
      'Gera um flyer/arte usando o brand profile e prompt do usuario. Ideal para materiais promocionais.',
      {
        prompt: z.string().describe('Descricao do flyer a gerar'),
        aspectRatio: z.string().optional(),
        imageSize: z.enum(['1K', '2K', '4K']).optional(),
        useBrandProfile: z.boolean().optional().describe('Usar brand profile do usuario? Default true.'),
      },
      async ({
        prompt: userPrompt,
        aspectRatio,
        imageSize,
        useBrandProfile,
      }: {
        prompt: string;
        aspectRatio?: string;
        imageSize?: '1K' | '2K' | '4K';
        useBrandProfile?: boolean;
      }): Promise<CallToolResult> => {
        try {
          const shouldUseBrand = useBrandProfile !== false;
          const rawBrand = shouldUseBrand ? await getBrandProfile(sql, userId, organizationId) : null;
          const mappedBrand = mapBrandProfileForPrompt(rawBrand);

          const flyerSystemPrompt = mappedBrand ? buildFlyerPrompt(mappedBrand as BrandProfile) : '';
          const imagePrompt = mappedBrand
            ? buildImagePrompt(`${flyerSystemPrompt}\n\nSOLICITACAO DO USUARIO: ${userPrompt}`, mappedBrand as BrandProfile)
            : userPrompt;

          const result = await generateImageWithFallback(
            imagePrompt,
            aspectRatio ?? '1:1',
            undefined,
            imageSize ?? '2K',
          );
          return jsonResult(ok({ imageUrl: result.imageUrl, model: result.usedModel, provider: result.usedProvider }));
        } catch (error) {
          log.error({ err: error }, '[AgentTools] studio_flyer_generate failed');
          return jsonResult(fail(error));
        }
      },
    ),

    tool(
      'studio_gallery_save',
      'Salva uma imagem na galeria do usuario (para imagens geradas ou editadas).',
      {
        imageUrl: z.string().describe('URL da imagem a salvar'),
        source: z.string().describe('Origem (ex: agent-flyer, agent-edit, agent-image)'),
        prompt: z.string().optional(),
        model: z.string().optional(),
      },
      async ({
        imageUrl,
        source,
        prompt: imgPrompt,
        model: imgModel,
      }: {
        imageUrl: string;
        source: string;
        prompt?: string;
        model?: string;
      }): Promise<CallToolResult> => {
        try {
          if (!imageUrl.startsWith('https://')) {
            return jsonResult(fail('imageUrl deve ser uma URL HTTPS valida (data URLs nao sao permitidas).'));
          }
          const rows = await sql`
            INSERT INTO gallery_images (user_id, organization_id, src_url, source, prompt, model)
            VALUES (
              ${userId},
              ${organizationId},
              ${imageUrl},
              ${source},
              ${imgPrompt ?? null},
              ${imgModel ?? 'gemini-3-pro-image-preview'}
            )
            RETURNING id, src_url, source, prompt, created_at
          `;
          return jsonResult(ok(rows[0]));
        } catch (error) {
          log.error({ err: error }, '[AgentTools] studio_gallery_save failed');
          return jsonResult(fail(error));
        }
      },
    ),

    tool(
      'studio_text_generate',
      'Gera texto de marketing (caption, post, ad copy) usando IA. Pode usar brand profile.',
      {
        type: z.enum(['quick_post', 'caption', 'ad_copy', 'custom']).describe('Tipo de texto'),
        prompt: z.string().describe('Contexto ou instrucao do texto'),
        useBrandProfile: z.boolean().optional(),
      },
      async ({
        type,
        prompt: userPrompt,
        useBrandProfile,
      }: {
        type: 'quick_post' | 'caption' | 'ad_copy' | 'custom';
        prompt: string;
        useBrandProfile?: boolean;
      }): Promise<CallToolResult> => {
        try {
          const shouldUseBrand = useBrandProfile !== false;
          const rawBrand = shouldUseBrand ? await getBrandProfile(sql, userId, organizationId) : null;
          const mappedBrand = mapBrandProfileForPrompt(rawBrand);

          let systemPrompt: string;
          let schema: typeof quickPostSchema;

          if (type === 'quick_post') {
            systemPrompt = buildQuickPostPrompt(mappedBrand as BrandProfile | null, userPrompt);
            schema = quickPostSchema;
          } else {
            systemPrompt = mappedBrand
              ? `Marca: ${mappedBrand.name}. Tom: ${mappedBrand.toneOfVoice ?? 'Profissional'}. ${userPrompt}`
              : userPrompt;
            schema = quickPostSchema;
          }

          const result = await generateStructuredContent(
            DEFAULT_TEXT_MODEL,
            [{ text: systemPrompt }],
            schema as unknown as Record<string, unknown>,
            0.8,
          );
          return jsonResult(ok(JSON.parse(result) as unknown));
        } catch (error) {
          log.error({ err: error }, '[AgentTools] studio_text_generate failed');
          return jsonResult(fail(error));
        }
      },
    ),

    tool(
      'studio_campaign_generate',
      'Gera uma campanha de marketing completa (clips, posts, ads, carrosseis) a partir de um transcript ou briefing.',
      {
        transcript: z.string().describe('Transcript, briefing ou descricao do conteudo'),
        options: z.object({
          clips: z.number().int().min(0).max(10).optional(),
          posts: z.number().int().min(0).max(10).optional(),
          ads: z.number().int().min(0).max(10).optional(),
          carousels: z.number().int().min(0).max(10).optional(),
        }).optional(),
        useBrandProfile: z.boolean().optional(),
      },
      async ({
        transcript,
        options,
        useBrandProfile,
      }: {
        transcript: string;
        options?: { clips?: number; posts?: number; ads?: number; carousels?: number };
        useBrandProfile?: boolean;
      }): Promise<CallToolResult> => {
        try {
          const shouldUseBrand = useBrandProfile !== false;
          const rawBrand = shouldUseBrand ? await getBrandProfile(sql, userId, organizationId) : null;
          const mappedBrand = mapBrandProfileForPrompt(rawBrand);

          const clipCount = options?.clips ?? 3;
          const postCount = options?.posts ?? 4;
          const adCount = options?.ads ?? 2;
          const carouselCount = options?.carousels ?? 2;

          const brandSection = mappedBrand
            ? `\n\nMARCA: ${mappedBrand.name}${mappedBrand.description ? ` - ${mappedBrand.description}` : ''}${mappedBrand.toneOfVoice ? `\nTOM: ${mappedBrand.toneOfVoice}` : ''}\nCORES: ${mappedBrand.primaryColor ?? '#000'}, ${mappedBrand.secondaryColor ?? '#FFF'}`
            : '';

          const systemPrompt = `Voce e um estrategista de marketing digital de elite. Crie uma campanha completa de marketing baseada no conteudo abaixo.${brandSection}

GERE EXATAMENTE:
- ${clipCount} roteiros de video curto (Reels/Shorts/TikTok)
- ${postCount} posts de redes sociais
- ${adCount} criativos de anuncio (Facebook/Google)
- ${carouselCount} carrosseis para Instagram

CONTEUDO BASE:
${transcript}`;

          const result = await generateStructuredContent(
            DEFAULT_TEXT_MODEL,
            [{ text: systemPrompt }],
            campaignSchema as unknown as Record<string, unknown>,
            0.8,
          );
          return jsonResult(ok(JSON.parse(result) as unknown));
        } catch (error) {
          log.error({ err: error }, '[AgentTools] studio_campaign_generate failed');
          return jsonResult(fail(error));
        }
      },
    ),
  ] as StudioTool[];

  return tools;
}
