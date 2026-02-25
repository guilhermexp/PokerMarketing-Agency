import { z } from 'zod';
import { tool } from '@anthropic-ai/claude-agent-sdk';
import { put } from '@vercel/blob';
import { getGeminiAi } from '../../ai/clients.mjs';
import { generateStructuredContent } from '../../ai/text-generation.mjs';
import {
  buildVideoPrompt,
  buildImagePrompt,
  buildFlyerPrompt,
  buildQuickPostPrompt,
  campaignSchema,
  quickPostSchema,
  DEFAULT_TEXT_MODEL,
} from '../../ai/prompt-builders.mjs';
import {
  generateImageWithFallback,
} from '../../ai/image-generation.mjs';
import {
  generateVideoWithFal,
  generateVideoWithGoogleVeo,
  uploadDataUrlImageToBlob,
} from '../../ai/video-generation.mjs';
import { urlToBase64 } from '../../../helpers/image-helpers.mjs';
import { withRetry } from '../../ai/retry.mjs';
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
} from '../../../helpers/image-playground.mjs';
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
} from '../../../helpers/video-playground.mjs';

function ok(data) {
  return { success: true, data };
}

function fail(error) {
  return {
    success: false,
    error: error instanceof Error ? error.message : String(error),
  };
}

async function getBrandProfile(sql, userId, organizationId) {
  if (organizationId) {
    const rows = await sql`
      SELECT * FROM brand_profiles
      WHERE organization_id = ${organizationId}
        AND deleted_at IS NULL
      LIMIT 1
    `;
    return rows[0] || null;
  }

  const rows = await sql`
    SELECT * FROM brand_profiles
    WHERE user_id = ${userId}
      AND organization_id IS NULL
      AND deleted_at IS NULL
    LIMIT 1
  `;
  return rows[0] || null;
}

function mapBrandProfileForPrompt(raw) {
  if (!raw) return null;
  return {
    name: raw.name,
    description: raw.description,
    logo: raw.logo_url,
    primaryColor: raw.primary_color,
    secondaryColor: raw.secondary_color,
    tertiaryColor: raw.tertiary_color,
    toneOfVoice: raw.tone_of_voice,
    toneTargets: raw.settings?.toneTargets || ['campaigns', 'posts', 'images', 'flyers', 'videos'],
  };
}

export function buildStudioToolDefinitions({ sql, userId, organizationId, logger }) {
  const genai = getGeminiAi();

  return [
    tool(
      'studio_image_list_topics',
      'Lista tópicos do Image Studio.',
      {},
      async () => {
        try {
          const topics = await getImageTopics(sql, userId, organizationId);
          return { content: [{ type: 'text', text: JSON.stringify(ok(topics)) }] };
        } catch (error) {
          return { content: [{ type: 'text', text: JSON.stringify(fail(error)) }], isError: true };
        }
      },
    ),
    tool(
      'studio_image_create_topic',
      'Cria tópico no Image Studio.',
      { title: z.string().optional() },
      async ({ title }) => {
        try {
          const topic = await createImageTopic(sql, userId, organizationId, title || null);
          return { content: [{ type: 'text', text: JSON.stringify(ok(topic)) }] };
        } catch (error) {
          return { content: [{ type: 'text', text: JSON.stringify(fail(error)) }], isError: true };
        }
      },
    ),
    tool(
      'studio_image_update_topic',
      'Renomeia ou atualiza capa de tópico no Image Studio.',
      {
        topicId: z.string(),
        title: z.string().optional(),
        coverUrl: z.string().optional(),
      },
      async ({ topicId, title, coverUrl }) => {
        try {
          const topic = await updateImageTopic(sql, topicId, userId, { title, coverUrl }, organizationId);
          return { content: [{ type: 'text', text: JSON.stringify(ok(topic)) }] };
        } catch (error) {
          return { content: [{ type: 'text', text: JSON.stringify(fail(error)) }], isError: true };
        }
      },
    ),
    tool(
      'studio_image_delete_topic',
      'Exclui tópico do Image Studio.',
      { topicId: z.string() },
      async ({ topicId }) => {
        try {
          await deleteImageTopic(sql, topicId, userId, organizationId);
          return { content: [{ type: 'text', text: JSON.stringify(ok({ topicId })) }] };
        } catch (error) {
          return { content: [{ type: 'text', text: JSON.stringify(fail(error)) }], isError: true };
        }
      },
    ),
    tool(
      'studio_image_list_batches',
      'Lista batches de um tópico do Image Studio.',
      { topicId: z.string(), limit: z.number().optional() },
      async ({ topicId, limit }) => {
        try {
          const batches = await getImageBatches(sql, topicId, userId, organizationId, limit || 100);
          return { content: [{ type: 'text', text: JSON.stringify(ok(batches)) }] };
        } catch (error) {
          return { content: [{ type: 'text', text: JSON.stringify(fail(error)) }], isError: true };
        }
      },
    ),
    tool(
      'studio_image_delete_batch',
      'Exclui batch no Image Studio.',
      { batchId: z.string() },
      async ({ batchId }) => {
        try {
          await deleteImageBatch(sql, batchId, userId, organizationId);
          return { content: [{ type: 'text', text: JSON.stringify(ok({ batchId })) }] };
        } catch (error) {
          return { content: [{ type: 'text', text: JSON.stringify(fail(error)) }], isError: true };
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
      async ({ topicId, prompt, imageNum, aspectRatio, imageSize, referenceImages }) => {
        try {
          const result = await createImageBatch(
            sql,
            {
              topicId,
              provider: 'google',
              model: 'gemini-3-pro-image-preview',
              imageNum: imageNum || 1,
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

          return { content: [{ type: 'text', text: JSON.stringify(ok(result)) }] };
        } catch (error) {
          logger.error({ err: error }, '[AgentTools] studio_image_generate failed');
          return { content: [{ type: 'text', text: JSON.stringify(fail(error)) }], isError: true };
        }
      },
    ),
    tool(
      'studio_image_get_generation_status',
      'Consulta status de geração de imagem.',
      {
        generationId: z.string(),
        asyncTaskId: z.string().optional(),
      },
      async ({ generationId, asyncTaskId }) => {
        try {
          const status = await getGenerationStatus(sql, generationId, asyncTaskId || '');
          return { content: [{ type: 'text', text: JSON.stringify(ok(status)) }] };
        } catch (error) {
          return { content: [{ type: 'text', text: JSON.stringify(fail(error)) }], isError: true };
        }
      },
    ),
    tool(
      'studio_image_delete_generation',
      'Exclui uma geração de imagem.',
      { generationId: z.string() },
      async ({ generationId }) => {
        try {
          await deleteImageGeneration(sql, generationId, userId, organizationId);
          return { content: [{ type: 'text', text: JSON.stringify(ok({ generationId })) }] };
        } catch (error) {
          return { content: [{ type: 'text', text: JSON.stringify(fail(error)) }], isError: true };
        }
      },
    ),

    tool(
      'studio_video_list_topics',
      'Lista tópicos do Studio Video.',
      {},
      async () => {
        try {
          const topics = await getVideoTopics(sql, userId, organizationId);
          return { content: [{ type: 'text', text: JSON.stringify(ok(topics)) }] };
        } catch (error) {
          return { content: [{ type: 'text', text: JSON.stringify(fail(error)) }], isError: true };
        }
      },
    ),
    tool(
      'studio_video_create_topic',
      'Cria tópico no Studio Video.',
      { title: z.string().optional() },
      async ({ title }) => {
        try {
          const topic = await createVideoTopic(sql, userId, organizationId, title || null);
          return { content: [{ type: 'text', text: JSON.stringify(ok(topic)) }] };
        } catch (error) {
          return { content: [{ type: 'text', text: JSON.stringify(fail(error)) }], isError: true };
        }
      },
    ),
    tool(
      'studio_video_update_topic',
      'Atualiza tópico do Studio Video.',
      {
        topicId: z.string(),
        title: z.string().optional(),
        coverUrl: z.string().optional(),
      },
      async ({ topicId, title, coverUrl }) => {
        try {
          const topic = await updateVideoTopic(sql, topicId, userId, { title, coverUrl }, organizationId);
          return { content: [{ type: 'text', text: JSON.stringify(ok(topic)) }] };
        } catch (error) {
          return { content: [{ type: 'text', text: JSON.stringify(fail(error)) }], isError: true };
        }
      },
    ),
    tool(
      'studio_video_delete_topic',
      'Exclui tópico do Studio Video.',
      { topicId: z.string() },
      async ({ topicId }) => {
        try {
          await deleteVideoTopic(sql, topicId, userId, organizationId);
          return { content: [{ type: 'text', text: JSON.stringify(ok({ topicId })) }] };
        } catch (error) {
          return { content: [{ type: 'text', text: JSON.stringify(fail(error)) }], isError: true };
        }
      },
    ),
    tool(
      'studio_video_list_sessions',
      'Lista sessões de vídeo de um tópico.',
      { topicId: z.string(), limit: z.number().optional() },
      async ({ topicId, limit }) => {
        try {
          const sessions = await getVideoSessions(sql, topicId, userId, organizationId, limit || 100);
          return { content: [{ type: 'text', text: JSON.stringify(ok(sessions)) }] };
        } catch (error) {
          return { content: [{ type: 'text', text: JSON.stringify(fail(error)) }], isError: true };
        }
      },
    ),
    tool(
      'studio_video_delete_session',
      'Exclui sessão de vídeo.',
      { sessionId: z.string() },
      async ({ sessionId }) => {
        try {
          await deleteVideoSession(sql, sessionId, userId, organizationId);
          return { content: [{ type: 'text', text: JSON.stringify(ok({ sessionId })) }] };
        } catch (error) {
          return { content: [{ type: 'text', text: JSON.stringify(fail(error)) }], isError: true };
        }
      },
    ),
    tool(
      'studio_video_generate',
      'Gera vídeo no Studio Video e atualiza sessão/geração.',
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
      }) => {
        try {
          const sessionResult = await createVideoSession(
            sql,
            {
              topicId,
              model: model || 'veo-3.1',
              prompt,
              aspectRatio: aspectRatio || '9:16',
              resolution: resolution || '720p',
              referenceImageUrl: referenceImageUrl || null,
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

          let effectiveImageUrl = referenceImageUrl || null;
          if (!effectiveImageUrl && mappedBrandProfile?.logo) {
            effectiveImageUrl = mappedBrandProfile.logo;
          }

          const finalPrompt = mappedBrandProfile
            ? buildVideoPrompt(prompt, mappedBrandProfile, {
                resolution: resolution || '720p',
                aspectRatio: aspectRatio || '9:16',
                hasReferenceImage: !!effectiveImageUrl,
                useCampaignGradePrompt: true,
                hasBrandLogoReference: Boolean(
                  effectiveImageUrl && mappedBrandProfile?.logo && effectiveImageUrl === mappedBrandProfile.logo,
                ),
              })
            : prompt;

          const selectedModel = model || 'veo-3.1';
          const selectedAspectRatio = aspectRatio || '9:16';
          const selectedResolution = resolution || '720p';

          const isFalProviderModel =
            selectedModel !== 'veo-3.1' && selectedModel !== 'veo-3.1-fast-generate-preview';

          if (effectiveImageUrl && effectiveImageUrl.startsWith('data:') && isFalProviderModel) {
            effectiveImageUrl = await uploadDataUrlImageToBlob(effectiveImageUrl, 'agent-video-reference');
          }

          let finalVideoUrl = '';

          if (selectedModel === 'veo-3.1' || selectedModel === 'veo-3.1-fast-generate-preview') {
            const result = await generateVideoWithGoogleVeo(
              finalPrompt,
              selectedAspectRatio,
              effectiveImageUrl || undefined,
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
              effectiveImageUrl || undefined,
              5,
              generateAudio !== false,
            );

            if (!generatedUrl) {
              throw new Error('Falha ao gerar vídeo no provider externo.');
            }

            const response = await fetch(generatedUrl);
            if (!response.ok) {
              throw new Error(`Falha ao baixar vídeo gerado (${response.status}).`);
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

          return {
            content: [{
              type: 'text',
              text: JSON.stringify(
                ok({
                  session: sessionResult.session,
                  generation,
                  videoUrl: finalVideoUrl,
                  model: selectedModel,
                  aspectRatio: selectedAspectRatio,
                  resolution: selectedResolution,
                }),
              ),
            }],
          };
        } catch (error) {
          logger.error({ err: error }, '[AgentTools] studio_video_generate failed');

          return {
            content: [{ type: 'text', text: JSON.stringify(fail(error)) }],
            isError: true,
          };
        }
      },
    ),
    tool(
      'studio_video_update_generation',
      'Atualiza status de geração de vídeo.',
      {
        generationId: z.string(),
        status: z.enum(['pending', 'generating', 'success', 'error']).optional(),
        videoUrl: z.string().optional(),
        duration: z.number().optional(),
        errorMessage: z.string().optional(),
      },
      async ({ generationId, status, videoUrl, duration, errorMessage }) => {
        try {
          const generation = await updateVideoGeneration(
            sql,
            generationId,
            { status, videoUrl, duration, errorMessage },
            userId,
            organizationId,
          );
          return { content: [{ type: 'text', text: JSON.stringify(ok(generation)) }] };
        } catch (error) {
          return { content: [{ type: 'text', text: JSON.stringify(fail(error)) }], isError: true };
        }
      },
    ),
    tool(
      'studio_video_delete_generation',
      'Exclui uma geração de vídeo.',
      { generationId: z.string() },
      async ({ generationId }) => {
        try {
          await deleteVideoGeneration(sql, generationId, userId, organizationId);
          return { content: [{ type: 'text', text: JSON.stringify(ok({ generationId })) }] };
        } catch (error) {
          return { content: [{ type: 'text', text: JSON.stringify(fail(error)) }], isError: true };
        }
      },
    ),

    // =========================================================================
    // Reading tools — gallery, brand, campaigns, posts, clips, carousels, scheduled
    // =========================================================================

    tool(
      'studio_gallery_search',
      'Busca imagens na galeria do usuário. Pode filtrar por texto (prompt/source) e source.',
      {
        query: z.string().optional(),
        source: z.string().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      },
      async ({ query, source, limit }) => {
        try {
          const max = limit || 20;
          const conditions = [
            organizationId
              ? sql`organization_id = ${organizationId}`
              : sql`user_id = ${userId} AND organization_id IS NULL`,
            sql`deleted_at IS NULL`,
          ];
          if (source) conditions.push(sql`source = ${source}`);
          if (query) {
            const pattern = `%${query}%`;
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
          return { content: [{ type: 'text', text: JSON.stringify(ok(rows)) }] };
        } catch (error) {
          return { content: [{ type: 'text', text: JSON.stringify(fail(error)) }], isError: true };
        }
      },
    ),
    tool(
      'studio_gallery_get',
      'Obtém detalhes completos de uma imagem específica da galeria.',
      { imageId: z.string() },
      async ({ imageId }) => {
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
          if (rows.length === 0) return { content: [{ type: 'text', text: JSON.stringify(fail('Imagem não encontrada.')) }], isError: true };
          return { content: [{ type: 'text', text: JSON.stringify(ok(rows[0])) }] };
        } catch (error) {
          return { content: [{ type: 'text', text: JSON.stringify(fail(error)) }], isError: true };
        }
      },
    ),
    tool(
      'studio_brand_profile_get',
      'Obtém o brand profile do usuário (nome, descrição, logo, cores, tom de voz).',
      {},
      async () => {
        try {
          const raw = await getBrandProfile(sql, userId, organizationId);
          if (!raw) return { content: [{ type: 'text', text: JSON.stringify(ok(null)) }] };
          return {
            content: [{ type: 'text', text: JSON.stringify(ok({
              id: raw.id,
              name: raw.name,
              description: raw.description,
              logoUrl: raw.logo_url,
              primaryColor: raw.primary_color,
              secondaryColor: raw.secondary_color,
              tertiaryColor: raw.tertiary_color,
              toneOfVoice: raw.tone_of_voice,
              settings: raw.settings,
            })) }],
          };
        } catch (error) {
          return { content: [{ type: 'text', text: JSON.stringify(fail(error)) }], isError: true };
        }
      },
    ),
    tool(
      'studio_campaigns_list',
      'Lista campanhas do usuário com contagem de clips, posts, ads e carrosséis.',
      { limit: z.number().int().min(1).max(50).optional() },
      async ({ limit }) => {
        try {
          const max = limit || 20;
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
          return { content: [{ type: 'text', text: JSON.stringify(ok(rows)) }] };
        } catch (error) {
          return { content: [{ type: 'text', text: JSON.stringify(fail(error)) }], isError: true };
        }
      },
    ),
    tool(
      'studio_campaign_get',
      'Obtém campanha completa com clips, posts, ads e carrosséis.',
      { campaignId: z.string() },
      async ({ campaignId }) => {
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
          if (campaigns.length === 0) return { content: [{ type: 'text', text: JSON.stringify(fail('Campanha não encontrada.')) }], isError: true };
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(ok({ ...campaigns[0], clips, posts, ads, carousels })),
            }],
          };
        } catch (error) {
          return { content: [{ type: 'text', text: JSON.stringify(fail(error)) }], isError: true };
        }
      },
    ),
    tool(
      'studio_posts_list',
      'Lista posts de uma campanha.',
      { campaignId: z.string() },
      async ({ campaignId }) => {
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
          return { content: [{ type: 'text', text: JSON.stringify(ok(rows)) }] };
        } catch (error) {
          return { content: [{ type: 'text', text: JSON.stringify(fail(error)) }], isError: true };
        }
      },
    ),
    tool(
      'studio_clips_list',
      'Lista video clips de uma campanha.',
      { campaignId: z.string() },
      async ({ campaignId }) => {
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
          return { content: [{ type: 'text', text: JSON.stringify(ok(rows)) }] };
        } catch (error) {
          return { content: [{ type: 'text', text: JSON.stringify(fail(error)) }], isError: true };
        }
      },
    ),
    tool(
      'studio_carousels_list',
      'Lista carrosséis de uma campanha.',
      { campaignId: z.string() },
      async ({ campaignId }) => {
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
          return { content: [{ type: 'text', text: JSON.stringify(ok(rows)) }] };
        } catch (error) {
          return { content: [{ type: 'text', text: JSON.stringify(fail(error)) }], isError: true };
        }
      },
    ),
    tool(
      'studio_scheduled_posts_list',
      'Lista posts agendados do usuário.',
      { limit: z.number().int().min(1).max(50).optional() },
      async ({ limit }) => {
        try {
          const max = limit || 20;
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
          return { content: [{ type: 'text', text: JSON.stringify(ok(rows)) }] };
        } catch (error) {
          return { content: [{ type: 'text', text: JSON.stringify(fail(error)) }], isError: true };
        }
      },
    ),

    // =========================================================================
    // Mutation tools — edit, flyer, save, text, campaign generation
    // =========================================================================

    tool(
      'studio_image_edit',
      'Edita uma imagem existente com prompt de instrução (ex: alterar cores, adicionar texto, remover fundo). Recebe URL da imagem e prompt de edição.',
      {
        imageUrl: z.string().describe('URL da imagem a editar'),
        prompt: z.string().describe('Instrução de edição'),
        referenceImageUrl: z.string().optional().describe('URL de imagem de referência opcional'),
      },
      async ({ imageUrl, prompt, referenceImageUrl }) => {
        try {
          const base64 = await urlToBase64(imageUrl);
          if (!base64) throw new Error('Falha ao converter imagem para base64.');

          const parts = [
            { text: prompt },
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
          );

          let imageDataUrl = null;
          const contentParts = response.candidates?.[0]?.content?.parts;
          if (Array.isArray(contentParts)) {
            for (const part of contentParts) {
              if (part.inlineData) {
                imageDataUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                break;
              }
            }
          }

          if (!imageDataUrl) throw new Error('Edição retornou resposta vazia.');

          const blobUrl = await uploadDataUrlImageToBlob(imageDataUrl, 'agent-image-edit');
          return { content: [{ type: 'text', text: JSON.stringify(ok({ imageUrl: blobUrl })) }] };
        } catch (error) {
          logger.error({ err: error }, '[AgentTools] studio_image_edit failed');
          return { content: [{ type: 'text', text: JSON.stringify(fail(error)) }], isError: true };
        }
      },
    ),
    tool(
      'studio_flyer_generate',
      'Gera um flyer/arte usando o brand profile e prompt do usuário. Ideal para materiais promocionais.',
      {
        prompt: z.string().describe('Descrição do flyer a gerar'),
        aspectRatio: z.string().optional(),
        imageSize: z.enum(['1K', '2K', '4K']).optional(),
        useBrandProfile: z.boolean().optional().describe('Usar brand profile do usuário? Default true.'),
      },
      async ({ prompt: userPrompt, aspectRatio, imageSize, useBrandProfile }) => {
        try {
          const shouldUseBrand = useBrandProfile !== false;
          const rawBrand = shouldUseBrand ? await getBrandProfile(sql, userId, organizationId) : null;
          const mappedBrand = mapBrandProfileForPrompt(rawBrand);

          const flyerSystemPrompt = mappedBrand ? buildFlyerPrompt(mappedBrand) : '';
          const imagePrompt = mappedBrand
            ? buildImagePrompt(`${flyerSystemPrompt}\n\nSOLICITAÇÃO DO USUÁRIO: ${userPrompt}`, mappedBrand)
            : userPrompt;

          const result = await generateImageWithFallback(
            imagePrompt,
            aspectRatio || '1:1',
            undefined,
            imageSize || '2K',
          );
          return { content: [{ type: 'text', text: JSON.stringify(ok({ imageUrl: result.imageUrl, model: result.usedModel, provider: result.usedProvider })) }] };
        } catch (error) {
          logger.error({ err: error }, '[AgentTools] studio_flyer_generate failed');
          return { content: [{ type: 'text', text: JSON.stringify(fail(error)) }], isError: true };
        }
      },
    ),
    tool(
      'studio_gallery_save',
      'Salva uma imagem na galeria do usuário (para imagens geradas ou editadas).',
      {
        imageUrl: z.string().describe('URL da imagem a salvar'),
        source: z.string().describe('Origem (ex: agent-flyer, agent-edit, agent-image)'),
        prompt: z.string().optional(),
        model: z.string().optional(),
      },
      async ({ imageUrl, source, prompt: imgPrompt, model: imgModel }) => {
        try {
          if (!imageUrl.startsWith('https://')) {
            return { content: [{ type: 'text', text: JSON.stringify(fail('imageUrl deve ser uma URL HTTPS válida (data URLs não são permitidas).')) }], isError: true };
          }
          const rows = await sql`
            INSERT INTO gallery_images (user_id, organization_id, src_url, source, prompt, model)
            VALUES (
              ${userId},
              ${organizationId},
              ${imageUrl},
              ${source},
              ${imgPrompt || null},
              ${imgModel || 'gemini-3-pro-image-preview'}
            )
            RETURNING id, src_url, source, prompt, created_at
          `;
          return { content: [{ type: 'text', text: JSON.stringify(ok(rows[0])) }] };
        } catch (error) {
          logger.error({ err: error }, '[AgentTools] studio_gallery_save failed');
          return { content: [{ type: 'text', text: JSON.stringify(fail(error)) }], isError: true };
        }
      },
    ),
    tool(
      'studio_text_generate',
      'Gera texto de marketing (caption, post, ad copy) usando IA. Pode usar brand profile.',
      {
        type: z.enum(['quick_post', 'caption', 'ad_copy', 'custom']).describe('Tipo de texto'),
        prompt: z.string().describe('Contexto ou instrução do texto'),
        useBrandProfile: z.boolean().optional(),
      },
      async ({ type, prompt: userPrompt, useBrandProfile }) => {
        try {
          const shouldUseBrand = useBrandProfile !== false;
          const rawBrand = shouldUseBrand ? await getBrandProfile(sql, userId, organizationId) : null;
          const mappedBrand = mapBrandProfileForPrompt(rawBrand);

          let systemPrompt;
          let schema;

          if (type === 'quick_post') {
            systemPrompt = buildQuickPostPrompt(mappedBrand, userPrompt);
            schema = quickPostSchema;
          } else {
            systemPrompt = mappedBrand
              ? `Marca: ${mappedBrand.name}. Tom: ${mappedBrand.toneOfVoice || 'Profissional'}. ${userPrompt}`
              : userPrompt;
            schema = quickPostSchema;
          }

          const result = await generateStructuredContent(
            DEFAULT_TEXT_MODEL,
            [{ text: systemPrompt }],
            schema,
            0.8,
          );
          return { content: [{ type: 'text', text: JSON.stringify(ok(JSON.parse(result))) }] };
        } catch (error) {
          logger.error({ err: error }, '[AgentTools] studio_text_generate failed');
          return { content: [{ type: 'text', text: JSON.stringify(fail(error)) }], isError: true };
        }
      },
    ),
    tool(
      'studio_campaign_generate',
      'Gera uma campanha de marketing completa (clips, posts, ads, carrosséis) a partir de um transcript ou briefing.',
      {
        transcript: z.string().describe('Transcript, briefing ou descrição do conteúdo'),
        options: z.object({
          clips: z.number().int().min(0).max(10).optional(),
          posts: z.number().int().min(0).max(10).optional(),
          ads: z.number().int().min(0).max(10).optional(),
          carousels: z.number().int().min(0).max(10).optional(),
        }).optional(),
        useBrandProfile: z.boolean().optional(),
      },
      async ({ transcript, options, useBrandProfile }) => {
        try {
          const shouldUseBrand = useBrandProfile !== false;
          const rawBrand = shouldUseBrand ? await getBrandProfile(sql, userId, organizationId) : null;
          const mappedBrand = mapBrandProfileForPrompt(rawBrand);

          const clipCount = options?.clips ?? 3;
          const postCount = options?.posts ?? 4;
          const adCount = options?.ads ?? 2;
          const carouselCount = options?.carousels ?? 2;

          const brandSection = mappedBrand
            ? `\n\nMARCA: ${mappedBrand.name}${mappedBrand.description ? ` - ${mappedBrand.description}` : ''}${mappedBrand.toneOfVoice ? `\nTOM: ${mappedBrand.toneOfVoice}` : ''}\nCORES: ${mappedBrand.primaryColor || '#000'}, ${mappedBrand.secondaryColor || '#FFF'}`
            : '';

          const systemPrompt = `Você é um estrategista de marketing digital de elite. Crie uma campanha completa de marketing baseada no conteúdo abaixo.${brandSection}

GERE EXATAMENTE:
- ${clipCount} roteiros de vídeo curto (Reels/Shorts/TikTok)
- ${postCount} posts de redes sociais
- ${adCount} criativos de anúncio (Facebook/Google)
- ${carouselCount} carrosséis para Instagram

CONTEÚDO BASE:
${transcript}`;

          const result = await generateStructuredContent(
            DEFAULT_TEXT_MODEL,
            [{ text: systemPrompt }],
            campaignSchema,
            0.8,
          );
          return { content: [{ type: 'text', text: JSON.stringify(ok(JSON.parse(result))) }] };
        } catch (error) {
          logger.error({ err: error }, '[AgentTools] studio_campaign_generate failed');
          return { content: [{ type: 'text', text: JSON.stringify(fail(error)) }], isError: true };
        }
      },
    ),
  ];
}
