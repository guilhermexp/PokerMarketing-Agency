/**
 * Create Logo Tool - Vercel AI SDK
 *
 * Cria um logo para a marca
 */

import { tool } from "ai";
import { z } from "zod";
import logger from "../../logger.js";

// ============================================================================
// TYPES
// ============================================================================

export interface BrandProfile {
  name?: string;
  primaryColor?: string;
  secondaryColor?: string;
  [key: string]: unknown;
}

export interface ToolContext {
  userId: string;
  orgId?: string;
  dataStream?: DataStreamWriter;
  brandProfile?: BrandProfile;
}

interface DataStreamWriter {
  write: (data: { type: string; data: Record<string, unknown> }) => void;
}

interface GenerateImageResponse {
  success?: boolean;
  imageUrl?: string;
  model?: string;
  error?: string;
}

interface GalleryResponse {
  id?: string;
}

interface CreateLogoResult {
  success: boolean;
  imageId?: string;
  imageUrl?: string;
  error?: string;
  message: string;
}

// ============================================================================
// HELPERS
// ============================================================================

function getInternalBaseUrl(): string {
  const fallbackPort = process.env.PORT || "3002";
  return process.env.BASE_URL || process.env.INTERNAL_API_BASE_URL || `http://localhost:${fallbackPort}`;
}

function getInternalHeaders(userId: string, orgId?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const internalToken = process.env.INTERNAL_API_TOKEN;
  if (!internalToken && process.env.NODE_ENV === "production") {
    throw new Error("INTERNAL_API_TOKEN não configurada para chamadas internas em produção");
  }
  if (internalToken) {
    headers["X-Internal-Token"] = internalToken;
    headers["X-Internal-User-Id"] = userId;
    if (orgId) {
      headers["X-Internal-Org-Id"] = orgId;
    }
  } else {
    headers["Authorization"] = `Bearer ${userId}`;
  }
  return headers;
}

// ============================================================================
// TOOL
// ============================================================================

const createLogoParamsSchema = z.object({
  prompt: z.string().describe("Descrição do logo desejado em português (estilo, elementos, conceito)"),
});

type CreateLogoParams = z.infer<typeof createLogoParamsSchema>;

export function createLogoTool({ userId, orgId, dataStream, brandProfile }: ToolContext) {
  return tool({
    description: "Cria um novo logo para a marca. Use quando o usuário pedir especificamente por um logo/logotipo.",
    parameters: createLogoParamsSchema,
    // @ts-expect-error - AI SDK tool type definitions are complex, execute works at runtime
    execute: async (params: CreateLogoParams): Promise<CreateLogoResult> => {
      const { prompt } = params;
      try {
        // 1. Enviar evento de início (se dataStream disponível)
        if (dataStream) {
          dataStream.write({
            type: "data-logoGenerating",
            data: {
              status: "generating",
              prompt,
            },
          });
        }

        logger.info(`[Tool:createLogo] Gerando logo | orgId: ${orgId}`);

        // 2. Construir prompt específico para logo
        const brandName = brandProfile?.name || "a marca";
        const logoPrompt = `
Logo profissional para ${brandName}.

Estilo e conceito: ${prompt}

${brandProfile?.primaryColor ? `Cor primária: ${brandProfile.primaryColor}` : ""}
${brandProfile?.secondaryColor ? `Cor secundária: ${brandProfile.secondaryColor}` : ""}

Requisitos:
- Design moderno e minimalista
- Versátil para diferentes tamanhos
- Fundo transparente ou branco
- Alta qualidade vetorial
- Legível em pequenas dimensões
        `.trim();

        // 3. Chamar API de geração de imagem (formato quadrado 1:1)
        const baseUrl = getInternalBaseUrl();
        const response = await fetch(`${baseUrl}/api/ai/image`, {
          method: "POST",
          headers: getInternalHeaders(userId, orgId),
          body: JSON.stringify({
            prompt: logoPrompt,
            brandProfile,
            aspectRatio: "1:1", // Logos são sempre quadrados
            imageSize: "1K",
          }),
        });

        if (!response.ok) {
          const errorData = await response.json() as GenerateImageResponse;
          throw new Error(errorData.error || "Falha ao gerar logo");
        }

        const data = await response.json() as GenerateImageResponse;

        // 4. Salvar na gallery
        const galleryResponse = await fetch(`${baseUrl}/api/db/gallery`, {
          method: "POST",
          headers: getInternalHeaders(userId, orgId),
          body: JSON.stringify({
            user_id: userId,
            organization_id: orgId,
            src_url: data.imageUrl,
            prompt: `Logo: ${prompt}`,
            source: "ai-tool-logo",
            model: data.model || "gemini-3-pro-image-preview",
            aspect_ratio: "1:1",
            image_size: "1K",
          }),
        });

        let savedImage: GalleryResponse | null = null;
        if (galleryResponse.ok) {
          savedImage = await galleryResponse.json() as GalleryResponse;
        }

        // 5. Enviar evento de conclusão (se dataStream disponível)
        if (dataStream) {
          dataStream.write({
            type: "data-logoCreated",
            data: {
              id: savedImage?.id || null,
              url: data.imageUrl,
              prompt,
            },
          });
        }

        logger.info(`[Tool:createLogo] Logo criado | id: ${savedImage?.id}`);

        return {
          success: true,
          imageId: savedImage?.id,
          imageUrl: data.imageUrl,
          message: `Logo criado com sucesso!`,
        };
      } catch (error) {
        const err = error as Error;
        logger.error("[Tool:createLogo] Erro:", err);

        // Enviar evento de erro (se dataStream disponível)
        if (dataStream) {
          dataStream.write({
            type: "data-logoError",
            data: {
              error: err.message,
            },
          });
        }

        return {
          success: false,
          error: err.message,
          message: `Erro ao criar logo: ${err.message}`,
        };
      }
    },
  });
}
