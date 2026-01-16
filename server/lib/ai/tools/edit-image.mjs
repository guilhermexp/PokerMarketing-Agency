/**
 * Edit Image Tool - Vercel AI SDK
 *
 * Edita a imagem atualmente em foco (chatReferenceImage)
 */

import { tool } from 'ai';
import { z } from 'zod';

/**
 * Tool para editar imagens existentes
 *
 * @param {object} context - Contexto da execução
 * @param {string} context.userId - ID do usuário (Clerk)
 * @param {string} context.orgId - ID da organização (Clerk)
 * @param {object} context.dataStream - Writer para enviar eventos customizados
 * @param {object} context.referenceImage - Imagem de referência (URL ou base64)
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

export const editImageTool = ({ userId, orgId, dataStream, referenceImage }) =>
  tool({
    description: 'Edita a imagem atualmente em foco. Use quando o usuário pedir para modificar/ajustar/editar a imagem atual.',

    inputSchema: z.object({
      prompt: z.string().describe('Descrição das alterações desejadas em português (ex: "mudar cor de fundo para azul")')
    }),

    needsApproval: true, // Requer confirmação do usuário

    // Metadata para preview (UI)
    metadata: {
      preview: {
        title: 'Editar Imagem',
        description: 'Esta ferramenta irá editar a imagem atualmente em foco usando IA',
        estimatedTime: '20-40 segundos',
        cost: 'Grátis (limite: 30/dia)',
        icon: 'edit',
        willDo: [
          'Analisar a imagem de referência atual',
          'Aplicar as alterações solicitadas usando IA',
          'Salvar a nova versão na galeria',
          'Retornar URL da imagem editada'
        ]
      }
    },

    execute: async ({ prompt }) => {
      try {
        // 1. Validar se existe imagem de referência
        if (!referenceImage || !referenceImage.src) {
          return {
            success: false,
            error: 'Nenhuma imagem de referência encontrada',
            message: 'Por favor, selecione uma imagem para editar antes de usar esta ferramenta.'
          };
        }

        // 2. Enviar evento de início (se dataStream disponível)
        if (dataStream) {
          dataStream.write({
            type: 'data-imageEditing',
            data: {
              status: 'editing',
              prompt,
              referenceImageId: referenceImage.id
            }
          });
        }

        console.log(`[Tool:editImage] Editando imagem | orgId: ${orgId} | refId: ${referenceImage.id}`);

        // 3. Baixar e converter imagem para base64
        console.log(`[Tool:editImage] Baixando imagem: ${referenceImage.src}`);
        let base64Data = '';
        let mimeType = 'image/jpeg';
        if (referenceImage.src.startsWith('data:')) {
          const [header, data] = referenceImage.src.split(',');
          const match = header.match(/data:(.*?);base64/);
          mimeType = match?.[1] || 'image/png';
          base64Data = data || '';
        } else {
          const imageResponse = await fetch(referenceImage.src);
          const imageBuffer = await imageResponse.arrayBuffer();
          base64Data = Buffer.from(imageBuffer).toString('base64');
          mimeType = imageResponse.headers.get('content-type') || 'image/jpeg';
        }

        console.log(`[Tool:editImage] Imagem convertida para base64: ${base64Data.length} bytes, ${mimeType}`);
        console.log(`[Tool:editImage] Prompt da edição: "${prompt}"`);

        // 4. Chamar API de edição de imagem
        const baseUrl = getInternalBaseUrl();
        const response = await fetch(`${baseUrl}/api/ai/edit-image`, {
          method: 'POST',
          headers: getInternalHeaders(userId, orgId),
          body: JSON.stringify({
            image: {
              base64: base64Data,
              mimeType: mimeType
            },
            prompt,
            mask: referenceImage.maskData || null,
            maskRegion: referenceImage.maskRegion || null,
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Falha ao editar imagem');
        }

        const data = await response.json();

        console.log(`[Tool:editImage] Resposta da API:`, {
          success: data.success,
          imageUrlLength: data.imageUrl?.length
        });

        // 5. Salvar na gallery (nova versão editada)
        const galleryResponse = await fetch(`${baseUrl}/api/db/gallery`, {
          method: 'POST',
          headers: getInternalHeaders(userId, orgId),
          body: JSON.stringify({
            user_id: userId,
            organization_id: orgId,
            src_url: data.imageUrl,
            prompt: `Edição: ${prompt}`,
            source: 'ai-tool-edit',
            model: 'gemini-3-pro-image-preview',
            aspect_ratio: '1:1',
            image_size: '1K'
          })
        });

        let savedImage = null;
        if (galleryResponse.ok) {
          savedImage = await galleryResponse.json();
          console.log(`[Tool:editImage] Imagem salva na galeria:`, savedImage?.id);
        } else {
          const errorData = await galleryResponse.json().catch(() => ({ error: 'unknown' }));
          console.error(`[Tool:editImage] Erro ao salvar na galeria:`, galleryResponse.status, errorData);
        }

        // 6. Enviar evento de conclusão (se dataStream disponível)
        if (dataStream) {
          dataStream.write({
            type: 'data-imageEdited',
            data: {
              id: savedImage?.id || null,
              url: data.imageUrl,
              prompt
            }
          });
        }

        console.log(`[Tool:editImage] ✓ Imagem editada | newId: ${savedImage?.id}`);

        return {
          success: true,
          imageId: savedImage?.id,
          imageUrl: data.imageUrl,
          referenceImageId: referenceImage.id,
          referenceImageUrl: referenceImage.src,
          prompt,
          message: `Imagem editada com sucesso!`
        };
      } catch (error) {
        console.error('[Tool:editImage] Erro:', error);

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
          message: `Erro ao editar imagem: ${error.message}`
        };
      }
    }
  });
