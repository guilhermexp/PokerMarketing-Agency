/**
 * Create Image Tool - Vercel AI SDK
 *
 * Gera uma nova imagem de marketing do zero
 */

import { tool } from 'ai';
import { z } from 'zod';

/**
 * Tool para criar imagens de marketing
 *
 * @param {object} context - Contexto da execução
 * @param {string} context.userId - ID do usuário (Clerk)
 * @param {string} context.orgId - ID da organização (Clerk)
 * @param {object} context.dataStream - Writer para enviar eventos customizados
 * @param {object} context.brandProfile - Profile da marca
 * @returns {Tool} - Tool configurada
 */
const getInternalBaseUrl = () => {
  const fallbackPort = process.env.PORT || '3002';
  return process.env.BASE_URL || process.env.INTERNAL_API_BASE_URL || `http://localhost:${fallbackPort}`;
};

const getInternalHeaders = (userId, orgId) => {
  const headers = {
    'Content-Type': 'application/json',
  };
  const internalToken = process.env.INTERNAL_API_TOKEN;
  if (internalToken) {
    headers['X-Internal-Token'] = internalToken;
    headers['X-Internal-User-Id'] = userId;
    if (orgId) {
      headers['X-Internal-Org-Id'] = orgId;
    }
  } else {
    headers['Authorization'] = `Bearer ${userId}`;
  }
  return headers;
};

export const createImageTool = ({ userId, orgId, dataStream, brandProfile }) =>
  tool({
    description: 'Gera uma nova imagem de marketing do zero usando IA. Use quando o usuário pedir para criar/gerar uma imagem.',

    inputSchema: z.object({
      description: z.string().describe('Descrição detalhada da imagem em português'),
      aspectRatio: z.enum(['1:1', '16:9', '9:16'])
        .default('1:1')
        .describe('Proporção da imagem (1:1 para quadrado, 16:9 para horizontal, 9:16 para vertical)')
    }),

    needsApproval: true, // Requer confirmação do usuário

    // Metadata para preview (UI)
    metadata: {
      preview: {
        title: 'Criar Imagem',
        description: 'Esta ferramenta irá gerar uma nova imagem de marketing usando IA',
        estimatedTime: '15-30 segundos',
        cost: 'Grátis (limite: 50/dia)',
        icon: 'image',
        willDo: [
          'Gerar imagem com IA baseada na descrição fornecida',
          'Salvar automaticamente na sua galeria',
          'Retornar URL da imagem para visualização',
          'Aplicar perfil da marca se disponível'
        ]
      }
    },

    execute: async ({ description, aspectRatio }) => {
      try {
        // 1. Enviar evento de início (se dataStream disponível)
        if (dataStream) {
          dataStream.write({
            type: 'data-imageGenerating',
            data: {
              status: 'generating',
              description,
              aspectRatio
            }
          });
        }

        console.log(`[Tool:createImage] Gerando imagem | orgId: ${orgId} | aspectRatio: ${aspectRatio}`);

        // 2. Chamar API de geração de imagem existente
        // Nota: Fazemos uma requisição interna ao endpoint existente
        const baseUrl = getInternalBaseUrl();
        const response = await fetch(`${baseUrl}/api/ai/image`, {
          method: 'POST',
          headers: getInternalHeaders(userId, orgId),
          body: JSON.stringify({
            prompt: description,
            brandProfile,
            aspectRatio,
            imageSize: '1K'
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Falha ao gerar imagem');
        }

        const data = await response.json();

        // 3. Salvar na gallery (via API interna)
        const galleryResponse = await fetch(`${baseUrl}/api/db/gallery`, {
          method: 'POST',
          headers: getInternalHeaders(userId, orgId),
          body: JSON.stringify({
            user_id: userId,
            organization_id: orgId,
            src_url: data.imageUrl,
            prompt: description,
            source: 'ai-tool-create',
            model: data.model || 'gemini-3-pro-image-preview',
            aspect_ratio: aspectRatio,
            image_size: '1K'
          })
        });

        let savedImage = null;
        if (galleryResponse.ok) {
          savedImage = await galleryResponse.json();
        }

        // 4. Enviar evento de conclusão (se dataStream disponível)
        if (dataStream) {
          dataStream.write({
            type: 'data-imageCreated',
            data: {
              id: savedImage?.id || null,
              url: data.imageUrl,
              aspectRatio,
              prompt: description
            }
          });
        }

        console.log(`[Tool:createImage] ✓ Imagem criada | id: ${savedImage?.id}`);

        return {
          success: true,
          imageId: savedImage?.id,
          imageUrl: data.imageUrl,
          message: `Imagem criada com sucesso! ${aspectRatio}`
        };
      } catch (error) {
        console.error('[Tool:createImage] Erro:', error);

        // Enviar evento de erro (se dataStream disponível)
        if (dataStream) {
          dataStream.write({
            type: 'data-imageError',
            data: {
              error: error.message
            }
          });
        }

        return {
          success: false,
          error: error.message,
          message: `Erro ao criar imagem: ${error.message}`
        };
      }
    }
  });
