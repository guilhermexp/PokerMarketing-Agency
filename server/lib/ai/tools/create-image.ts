/**
 * Create Image Tool - Vercel AI SDK
 *
 * Gera uma nova imagem de marketing do zero
 */

import { tool } from "ai";
import { z } from "zod";

// ============================================================================
// TYPES
// ============================================================================

export interface BrandProfile {
  name?: string;
  logo?: string;
  colors?: Record<string, string>;
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

interface CreateImageResult {
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

const createImageParamsSchema = z.object({
  description: z.string().describe("Descrição detalhada da imagem em português"),
  aspectRatio: z.enum(["1:1", "16:9", "9:16"])
    .default("1:1")
    .describe("Proporção da imagem (1:1 para quadrado, 16:9 para horizontal, 9:16 para vertical)"),
});

type CreateImageParams = z.infer<typeof createImageParamsSchema>;

export function createImageTool({ userId, orgId, dataStream, brandProfile }: ToolContext) {
  return tool({
    description: "Gera uma nova imagem de marketing do zero usando IA. Use quando o usuário pedir para criar/gerar uma imagem.",
    parameters: createImageParamsSchema,
    // @ts-expect-error - AI SDK tool type definitions are complex, execute works at runtime
    execute: async (params: CreateImageParams): Promise<CreateImageResult> => {
      const { description, aspectRatio } = params;
      const startTime = Date.now();
      console.log(`[Tool:createImage] ========================================`);
      console.log(`[Tool:createImage] INÍCIO DA EXECUÇÃO`);
      console.log(`[Tool:createImage] userId: ${userId}`);
      console.log(`[Tool:createImage] orgId: ${orgId || "null (personal)"}`);
      console.log(`[Tool:createImage] description: "${description}"`);
      console.log(`[Tool:createImage] aspectRatio: ${aspectRatio}`);
      console.log(`[Tool:createImage] brandProfile presente: ${!!brandProfile}`);

      if (brandProfile) {
        console.log(`[Tool:createImage] brandProfile.name: ${brandProfile.name || "undefined"}`);
        console.log(`[Tool:createImage] brandProfile.logo: ${brandProfile.logo ? "presente" : "ausente"}`);
        console.log(`[Tool:createImage] brandProfile.colors: ${brandProfile.colors ? JSON.stringify(brandProfile.colors) : "ausente"}`);
      }

      try {
        // 1. Enviar evento de início (se dataStream disponível)
        if (dataStream) {
          dataStream.write({
            type: "data-imageGenerating",
            data: {
              status: "generating",
              description,
              aspectRatio,
            },
          });
        }

        // 2. Chamar API de geração de imagem existente
        const baseUrl = getInternalBaseUrl();
        const requestUrl = `${baseUrl}/api/ai/image`;
        const requestBody = {
          prompt: description,
          brandProfile,
          aspectRatio,
          imageSize: "1K",
        };

        console.log(`[Tool:createImage] Fazendo requisição para: ${requestUrl}`);
        console.log(`[Tool:createImage] Request body:`, JSON.stringify(requestBody, null, 2));

        const response = await fetch(requestUrl, {
          method: "POST",
          headers: getInternalHeaders(userId, orgId),
          body: JSON.stringify(requestBody),
        });

        console.log(`[Tool:createImage] Response status: ${response.status} ${response.statusText}`);

        if (!response.ok) {
          let errorData: GenerateImageResponse;
          try {
            errorData = await response.json() as GenerateImageResponse;
            console.error(`[Tool:createImage] Erro da API (JSON):`, errorData);
          } catch {
            const errorText = await response.text();
            console.error(`[Tool:createImage] Erro da API (text):`, errorText);
            throw new Error(`Falha ao gerar imagem (${response.status}): ${errorText}`);
          }
          throw new Error(errorData.error || `Falha ao gerar imagem (${response.status})`);
        }

        const data = await response.json() as GenerateImageResponse;
        console.log(`[Tool:createImage] Resposta da API recebida:`, {
          success: data.success,
          hasImageUrl: !!data.imageUrl,
          model: data.model,
        });

        // 3. Salvar na gallery (via API interna)
        console.log(`[Tool:createImage] Salvando imagem na galeria...`);
        const galleryResponse = await fetch(`${baseUrl}/api/db/gallery`, {
          method: "POST",
          headers: getInternalHeaders(userId, orgId),
          body: JSON.stringify({
            user_id: userId,
            organization_id: orgId,
            src_url: data.imageUrl,
            prompt: description,
            source: "ai-tool-create",
            model: data.model || "gemini-3-pro-image-preview",
            aspect_ratio: aspectRatio,
            image_size: "1K",
          }),
        });

        console.log(`[Tool:createImage] Gallery response status: ${galleryResponse.status}`);

        let savedImage: GalleryResponse | null = null;
        if (galleryResponse.ok) {
          savedImage = await galleryResponse.json() as GalleryResponse;
          console.log(`[Tool:createImage] Imagem salva na galeria com id: ${savedImage?.id}`);
        } else {
          const galleryError = await galleryResponse.text();
          console.warn(`[Tool:createImage] Falha ao salvar na galeria: ${galleryError}`);
        }

        // 4. Enviar evento de conclusão (se dataStream disponível)
        if (dataStream) {
          dataStream.write({
            type: "data-imageCreated",
            data: {
              id: savedImage?.id || null,
              url: data.imageUrl,
              aspectRatio,
              prompt: description,
            },
          });
        }

        const elapsedTime = Date.now() - startTime;
        console.log(`[Tool:createImage] SUCESSO | Tempo total: ${elapsedTime}ms | id: ${savedImage?.id}`);
        console.log(`[Tool:createImage] ========================================`);

        return {
          success: true,
          imageId: savedImage?.id,
          imageUrl: data.imageUrl,
          message: `Imagem criada com sucesso! ${aspectRatio}`,
        };
      } catch (error) {
        const elapsedTime = Date.now() - startTime;
        const err = error as Error;
        console.error(`[Tool:createImage] ========================================`);
        console.error(`[Tool:createImage] ERRO após ${elapsedTime}ms`);
        console.error(`[Tool:createImage] Tipo de erro: ${err.constructor.name}`);
        console.error(`[Tool:createImage] Mensagem: ${err.message}`);
        console.error(`[Tool:createImage] Stack:`, err.stack);
        console.error(`[Tool:createImage] ========================================`);

        // Enviar evento de erro (se dataStream disponível)
        if (dataStream) {
          dataStream.write({
            type: "data-imageError",
            data: {
              error: err.message,
            },
          });
        }

        return {
          success: false,
          error: err.message,
          message: `Erro ao criar imagem: ${err.message}`,
        };
      }
    },
  });
}
