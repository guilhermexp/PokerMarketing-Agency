import { z } from 'zod';
import { put } from '@vercel/blob';
import { getGeminiAi } from '../../ai/clients.mjs';
import { buildVideoPrompt } from '../../ai/prompt-builders.mjs';
import {
  generateVideoWithFal,
  generateVideoWithGoogleVeo,
  uploadDataUrlImageToBlob,
} from '../../ai/video-generation.mjs';
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
    {
      name: 'studio_image_list_topics',
      description: 'Lista tópicos do Image Studio.',
      inputSchema: {},
      handler: async () => {
        try {
          const topics = await getImageTopics(sql, userId, organizationId);
          return { content: [{ type: 'text', text: JSON.stringify(ok(topics)) }] };
        } catch (error) {
          return { content: [{ type: 'text', text: JSON.stringify(fail(error)) }], isError: true };
        }
      },
    },
    {
      name: 'studio_image_create_topic',
      description: 'Cria tópico no Image Studio.',
      inputSchema: { title: z.string().optional() },
      handler: async ({ title }) => {
        try {
          const topic = await createImageTopic(sql, userId, organizationId, title || null);
          return { content: [{ type: 'text', text: JSON.stringify(ok(topic)) }] };
        } catch (error) {
          return { content: [{ type: 'text', text: JSON.stringify(fail(error)) }], isError: true };
        }
      },
    },
    {
      name: 'studio_image_update_topic',
      description: 'Renomeia ou atualiza capa de tópico no Image Studio.',
      inputSchema: {
        topicId: z.string(),
        title: z.string().optional(),
        coverUrl: z.string().optional(),
      },
      handler: async ({ topicId, title, coverUrl }) => {
        try {
          const topic = await updateImageTopic(sql, topicId, userId, { title, coverUrl }, organizationId);
          return { content: [{ type: 'text', text: JSON.stringify(ok(topic)) }] };
        } catch (error) {
          return { content: [{ type: 'text', text: JSON.stringify(fail(error)) }], isError: true };
        }
      },
    },
    {
      name: 'studio_image_delete_topic',
      description: 'Exclui tópico do Image Studio.',
      inputSchema: { topicId: z.string() },
      handler: async ({ topicId }) => {
        try {
          await deleteImageTopic(sql, topicId, userId, organizationId);
          return { content: [{ type: 'text', text: JSON.stringify(ok({ topicId })) }] };
        } catch (error) {
          return { content: [{ type: 'text', text: JSON.stringify(fail(error)) }], isError: true };
        }
      },
    },
    {
      name: 'studio_image_list_batches',
      description: 'Lista batches de um tópico do Image Studio.',
      inputSchema: { topicId: z.string(), limit: z.number().optional() },
      handler: async ({ topicId, limit }) => {
        try {
          const batches = await getImageBatches(sql, topicId, userId, organizationId, limit || 100);
          return { content: [{ type: 'text', text: JSON.stringify(ok(batches)) }] };
        } catch (error) {
          return { content: [{ type: 'text', text: JSON.stringify(fail(error)) }], isError: true };
        }
      },
    },
    {
      name: 'studio_image_delete_batch',
      description: 'Exclui batch no Image Studio.',
      inputSchema: { batchId: z.string() },
      handler: async ({ batchId }) => {
        try {
          await deleteImageBatch(sql, batchId, userId, organizationId);
          return { content: [{ type: 'text', text: JSON.stringify(ok({ batchId })) }] };
        } catch (error) {
          return { content: [{ type: 'text', text: JSON.stringify(fail(error)) }], isError: true };
        }
      },
    },
    {
      name: 'studio_image_generate',
      description: 'Gera imagens no Image Studio usando pipeline existente.',
      inputSchema: {
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
      handler: async ({ topicId, prompt, imageNum, aspectRatio, imageSize, referenceImages }) => {
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
    },
    {
      name: 'studio_image_get_generation_status',
      description: 'Consulta status de geração de imagem.',
      inputSchema: {
        generationId: z.string(),
        asyncTaskId: z.string().optional(),
      },
      handler: async ({ generationId, asyncTaskId }) => {
        try {
          const status = await getGenerationStatus(sql, generationId, asyncTaskId || '');
          return { content: [{ type: 'text', text: JSON.stringify(ok(status)) }] };
        } catch (error) {
          return { content: [{ type: 'text', text: JSON.stringify(fail(error)) }], isError: true };
        }
      },
    },
    {
      name: 'studio_image_delete_generation',
      description: 'Exclui uma geração de imagem.',
      inputSchema: { generationId: z.string() },
      handler: async ({ generationId }) => {
        try {
          await deleteImageGeneration(sql, generationId, userId, organizationId);
          return { content: [{ type: 'text', text: JSON.stringify(ok({ generationId })) }] };
        } catch (error) {
          return { content: [{ type: 'text', text: JSON.stringify(fail(error)) }], isError: true };
        }
      },
    },

    {
      name: 'studio_video_list_topics',
      description: 'Lista tópicos do Studio Video.',
      inputSchema: {},
      handler: async () => {
        try {
          const topics = await getVideoTopics(sql, userId, organizationId);
          return { content: [{ type: 'text', text: JSON.stringify(ok(topics)) }] };
        } catch (error) {
          return { content: [{ type: 'text', text: JSON.stringify(fail(error)) }], isError: true };
        }
      },
    },
    {
      name: 'studio_video_create_topic',
      description: 'Cria tópico no Studio Video.',
      inputSchema: { title: z.string().optional() },
      handler: async ({ title }) => {
        try {
          const topic = await createVideoTopic(sql, userId, organizationId, title || null);
          return { content: [{ type: 'text', text: JSON.stringify(ok(topic)) }] };
        } catch (error) {
          return { content: [{ type: 'text', text: JSON.stringify(fail(error)) }], isError: true };
        }
      },
    },
    {
      name: 'studio_video_update_topic',
      description: 'Atualiza tópico do Studio Video.',
      inputSchema: {
        topicId: z.string(),
        title: z.string().optional(),
        coverUrl: z.string().optional(),
      },
      handler: async ({ topicId, title, coverUrl }) => {
        try {
          const topic = await updateVideoTopic(sql, topicId, userId, { title, coverUrl }, organizationId);
          return { content: [{ type: 'text', text: JSON.stringify(ok(topic)) }] };
        } catch (error) {
          return { content: [{ type: 'text', text: JSON.stringify(fail(error)) }], isError: true };
        }
      },
    },
    {
      name: 'studio_video_delete_topic',
      description: 'Exclui tópico do Studio Video.',
      inputSchema: { topicId: z.string() },
      handler: async ({ topicId }) => {
        try {
          await deleteVideoTopic(sql, topicId, userId, organizationId);
          return { content: [{ type: 'text', text: JSON.stringify(ok({ topicId })) }] };
        } catch (error) {
          return { content: [{ type: 'text', text: JSON.stringify(fail(error)) }], isError: true };
        }
      },
    },
    {
      name: 'studio_video_list_sessions',
      description: 'Lista sessões de vídeo de um tópico.',
      inputSchema: { topicId: z.string(), limit: z.number().optional() },
      handler: async ({ topicId, limit }) => {
        try {
          const sessions = await getVideoSessions(sql, topicId, userId, organizationId, limit || 100);
          return { content: [{ type: 'text', text: JSON.stringify(ok(sessions)) }] };
        } catch (error) {
          return { content: [{ type: 'text', text: JSON.stringify(fail(error)) }], isError: true };
        }
      },
    },
    {
      name: 'studio_video_delete_session',
      description: 'Exclui sessão de vídeo.',
      inputSchema: { sessionId: z.string() },
      handler: async ({ sessionId }) => {
        try {
          await deleteVideoSession(sql, sessionId, userId, organizationId);
          return { content: [{ type: 'text', text: JSON.stringify(ok({ sessionId })) }] };
        } catch (error) {
          return { content: [{ type: 'text', text: JSON.stringify(fail(error)) }], isError: true };
        }
      },
    },
    {
      name: 'studio_video_generate',
      description: 'Gera vídeo no Studio Video e atualiza sessão/geração.',
      inputSchema: {
        topicId: z.string(),
        prompt: z.string(),
        model: z.enum(['veo-3.1', 'sora-2']).optional(),
        aspectRatio: z.enum(['16:9', '9:16']).optional(),
        resolution: z.enum(['720p', '1080p']).optional(),
        referenceImageUrl: z.string().optional(),
        useBrandProfile: z.boolean().optional(),
        generateAudio: z.boolean().optional(),
      },
      handler: async ({
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
    },
    {
      name: 'studio_video_update_generation',
      description: 'Atualiza status de geração de vídeo.',
      inputSchema: {
        generationId: z.string(),
        status: z.enum(['pending', 'generating', 'success', 'error']).optional(),
        videoUrl: z.string().optional(),
        duration: z.number().optional(),
        errorMessage: z.string().optional(),
      },
      handler: async ({ generationId, status, videoUrl, duration, errorMessage }) => {
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
    },
    {
      name: 'studio_video_delete_generation',
      description: 'Exclui uma geração de vídeo.',
      inputSchema: { generationId: z.string() },
      handler: async ({ generationId }) => {
        try {
          await deleteVideoGeneration(sql, generationId, userId, organizationId);
          return { content: [{ type: 'text', text: JSON.stringify(ok({ generationId })) }] };
        } catch (error) {
          return { content: [{ type: 'text', text: JSON.stringify(fail(error)) }], isError: true };
        }
      },
    },
  ];
}
