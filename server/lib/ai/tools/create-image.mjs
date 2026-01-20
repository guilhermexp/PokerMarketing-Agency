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
  if (!internalToken && process.env.NODE_ENV === 'production') {
    throw new Error('INTERNAL_API_TOKEN não configurada para chamadas internas em produção');
  }
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
      const startTime = Date.now();
      console.log(`[Tool:createImage] ========================================`);
      console.log(`[Tool:createImage] INÍCIO DA EXECUÇÃO`);
      console.log(`[Tool:createImage] userId: ${userId}`);
      console.log(`[Tool:createImage] orgId: ${orgId || 'null (personal)'}`);
      console.log(`[Tool:createImage] description: "${description}"`);
      console.log(`[Tool:createImage] aspectRatio: ${aspectRatio}`);
      console.log(`[Tool:createImage] brandProfile presente: ${!!brandProfile}`);

      if (brandProfile) {
        console.log(`[Tool:createImage] brandProfile.name: ${brandProfile.name || 'undefined'}`);
        console.log(`[Tool:createImage] brandProfile.logo: ${brandProfile.logo ? 'presente' : 'ausente'}`);
        console.log(`[Tool:createImage] brandProfile.colors: ${brandProfile.colors ? JSON.stringify(brandProfile.colors) : 'ausente'}`);
      }

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

        // 2. Chamar API de geração de imagem existente
        // Nota: Fazemos uma requisição interna ao endpoint existente
        const baseUrl = getInternalBaseUrl();
        const requestUrl = `${baseUrl}/api/ai/image`;
        const requestBody = {
          prompt: description,
          brandProfile,
          aspectRatio,
          imageSize: '1K'
        };

        console.log(`[Tool:createImage] Fazendo requisição para: ${requestUrl}`);
        console.log(`[Tool:createImage] Request body:`, JSON.stringify(requestBody, null, 2));

        const response = await fetch(requestUrl, {
          method: 'POST',
          headers: getInternalHeaders(userId, orgId),
          body: JSON.stringify(requestBody)
        });

        console.log(`[Tool:createImage] Response status: ${response.status} ${response.statusText}`);

        if (!response.ok) {
          let errorData;
          try {
            errorData = await response.json();
            console.error(`[Tool:createImage] Erro da API (JSON):`, errorData);
          } catch (jsonError) {
            const errorText = await response.text();
            console.error(`[Tool:createImage] Erro da API (text):`, errorText);
            throw new Error(`Falha ao gerar imagem (${response.status}): ${errorText}`);
          }
          throw new Error(errorData.error || `Falha ao gerar imagem (${response.status})`);
        }

        const data = await response.json();
        console.log(`[Tool:createImage] Resposta da API recebida:`, {
          success: data.success,
          hasImageUrl: !!data.imageUrl,
          model: data.model
        });

        // 3. Salvar na gallery (via API interna)
        console.log(`[Tool:createImage] Salvando imagem na galeria...`);
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

        console.log(`[Tool:createImage] Gallery response status: ${galleryResponse.status}`);

        let savedImage = null;
        if (galleryResponse.ok) {
          savedImage = await galleryResponse.json();
          console.log(`[Tool:createImage] Imagem salva na galeria com id: ${savedImage?.id}`);
        } else {
          const galleryError = await galleryResponse.text();
          console.warn(`[Tool:createImage] Falha ao salvar na galeria: ${galleryError}`);
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

        const elapsedTime = Date.now() - startTime;
        console.log(`[Tool:createImage] ✓ SUCESSO | Tempo total: ${elapsedTime}ms | id: ${savedImage?.id}`);
        console.log(`[Tool:createImage] ========================================`);

        return {
          success: true,
          imageId: savedImage?.id,
          imageUrl: data.imageUrl,
          message: `Imagem criada com sucesso! ${aspectRatio}`
        };
      } catch (error) {
        const elapsedTime = Date.now() - startTime;
        console.error(`[Tool:createImage] ========================================`);
        console.error(`[Tool:createImage] ✗ ERRO após ${elapsedTime}ms`);
        console.error(`[Tool:createImage] Tipo de erro: ${error.constructor.name}`);
        console.error(`[Tool:createImage] Mensagem: ${error.message}`);
        console.error(`[Tool:createImage] Stack:`, error.stack);
        console.error(`[Tool:createImage] ========================================`);

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
