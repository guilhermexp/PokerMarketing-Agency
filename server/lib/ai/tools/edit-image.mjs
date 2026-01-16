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

        // 3. Chamar API de edição de imagem existente
        const response = await fetch(`${process.env.BASE_URL || 'http://localhost:5010'}/api/ai/edit-image`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${userId}`,
          },
          body: JSON.stringify({
            prompt,
            imageDataUrl: referenceImage.src,
            maskData: referenceImage.maskData || null, // Mask opcional
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Falha ao editar imagem');
        }

        const data = await response.json();

        // 4. Salvar na gallery (nova versão editada)
        const galleryResponse = await fetch(`${process.env.BASE_URL || 'http://localhost:5010'}/api/db/gallery`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${userId}`,
          },
          body: JSON.stringify({
            image_data_url: data.editedImageUrl,
            prompt: `Edição: ${prompt}`,
            organization_id: orgId
          })
        });

        let savedImage = null;
        if (galleryResponse.ok) {
          savedImage = await galleryResponse.json();
        }

        // 5. Enviar evento de conclusão (se dataStream disponível)
        if (dataStream) {
          dataStream.write({
            type: 'data-imageEdited',
            data: {
              id: savedImage?.id || null,
              url: data.editedImageUrl,
              prompt
            }
          });
        }

        console.log(`[Tool:editImage] ✓ Imagem editada | newId: ${savedImage?.id}`);

        return {
          success: true,
          imageId: savedImage?.id,
          imageUrl: data.editedImageUrl,
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
