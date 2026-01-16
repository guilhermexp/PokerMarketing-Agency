/**
 * Create Logo Tool - Vercel AI SDK
 *
 * Cria um logo para a marca
 */

import { tool } from 'ai';
import { z } from 'zod';

/**
 * Tool para criar logos de marca
 *
 * @param {object} context - Contexto da execução
 * @param {string} context.userId - ID do usuário (Clerk)
 * @param {string} context.orgId - ID da organização (Clerk)
 * @param {object} context.dataStream - Writer para enviar eventos customizados
 * @param {object} context.brandProfile - Profile da marca
 * @returns {Tool} - Tool configurada
 */
export const createLogoTool = ({ userId, orgId, dataStream, brandProfile }) =>
  tool({
    description: 'Cria um novo logo para a marca. Use quando o usuário pedir especificamente por um logo/logotipo.',

    inputSchema: z.object({
      prompt: z.string().describe('Descrição do logo desejado em português (estilo, elementos, conceito)')
    }),

    needsApproval: true, // Requer confirmação do usuário

    // Metadata para preview (UI)
    metadata: {
      preview: {
        title: 'Criar Logo',
        description: 'Esta ferramenta irá criar um novo logo profissional para sua marca',
        estimatedTime: '30-60 segundos',
        cost: 'Grátis (limite: 20/dia)',
        icon: 'sparkles',
        willDo: [
          'Gerar logo profissional usando IA',
          'Aplicar cores e estilo do perfil da marca',
          'Salvar automaticamente na galeria',
          'Retornar URL do logo em alta resolução'
        ]
      }
    },

    execute: async ({ prompt }) => {
      try {
        // 1. Enviar evento de início (se dataStream disponível)
        if (dataStream) {
          dataStream.write({
            type: 'data-logoGenerating',
            data: {
              status: 'generating',
              prompt
            }
          });
        }

        console.log(`[Tool:createLogo] Gerando logo | orgId: ${orgId}`);

        // 2. Construir prompt específico para logo
        const brandName = brandProfile?.name || 'a marca';
        const logoPrompt = `
Logo profissional para ${brandName}.

Estilo e conceito: ${prompt}

${brandProfile?.primaryColor ? `Cor primária: ${brandProfile.primaryColor}` : ''}
${brandProfile?.secondaryColor ? `Cor secundária: ${brandProfile.secondaryColor}` : ''}

Requisitos:
- Design moderno e minimalista
- Versátil para diferentes tamanhos
- Fundo transparente ou branco
- Alta qualidade vetorial
- Legível em pequenas dimensões
        `.trim();

        // 3. Chamar API de geração de imagem (formato quadrado 1:1)
        const response = await fetch(`${process.env.BASE_URL || 'http://localhost:5010'}/api/ai/image`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${userId}`,
          },
          body: JSON.stringify({
            prompt: logoPrompt,
            brandProfile,
            aspectRatio: '1:1', // Logos são sempre quadrados
            imageSize: '1K'
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Falha ao gerar logo');
        }

        const data = await response.json();

        // 4. Salvar na gallery
        const galleryResponse = await fetch(`${process.env.BASE_URL || 'http://localhost:5010'}/api/db/gallery`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${userId}`,
          },
          body: JSON.stringify({
            image_data_url: data.imageUrl,
            prompt: `Logo: ${prompt}`,
            aspect_ratio: '1:1',
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
            type: 'data-logoCreated',
            data: {
              id: savedImage?.id || null,
              url: data.imageUrl,
              prompt
            }
          });
        }

        console.log(`[Tool:createLogo] ✓ Logo criado | id: ${savedImage?.id}`);

        return {
          success: true,
          imageId: savedImage?.id,
          imageUrl: data.imageUrl,
          message: `Logo criado com sucesso!`
        };
      } catch (error) {
        console.error('[Tool:createLogo] Erro:', error);

        // Enviar evento de erro (se dataStream disponível)
        if (dataStream) {
          dataStream.write({
            type: 'data-logoError',
            data: {
              error: error.message
            }
          });
        }

        return {
          success: false,
          error: error.message,
          message: `Erro ao criar logo: ${error.message}`
        };
      }
    }
  });
