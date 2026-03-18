/**
 * Edit Image Tool - Vercel AI SDK
 *
 * Edita a imagem atualmente em foco (chatReferenceImage)
 */

import { tool } from "ai";
import { z } from "zod";
import logger from "../../logger.js";

// ============================================================================
// TYPES
// ============================================================================

export interface ReferenceImage {
  id?: string;
  src: string;
  maskData?: string;
  maskRegion?: string;
}

export interface ToolContext {
  userId: string;
  orgId?: string;
  dataStream?: DataStreamWriter;
  referenceImage?: ReferenceImage;
}

interface DataStreamWriter {
  write: (data: { type: string; data: Record<string, unknown> }) => void;
}

interface EditImageResponse {
  success?: boolean;
  imageUrl?: string;
  error?: string;
}

interface GalleryResponse {
  id?: string;
}

interface EditImageResult {
  success: boolean;
  imageId?: string;
  imageUrl?: string;
  referenceImageId?: string;
  referenceImageUrl?: string;
  prompt?: string;
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

const editImageParamsSchema = z.object({
  prompt: z.string().describe("Descrição das alterações desejadas em português (ex: \"mudar cor de fundo para azul\")"),
});

type EditImageParams = z.infer<typeof editImageParamsSchema>;

export function editImageTool({ userId, orgId, dataStream, referenceImage }: ToolContext) {
  return tool({
    description: "Edita a imagem atualmente em foco. Use quando o usuário pedir para modificar/ajustar/editar a imagem atual.",
    parameters: editImageParamsSchema,
    // @ts-expect-error - AI SDK tool type definitions are complex, execute works at runtime
    execute: async (params: EditImageParams): Promise<EditImageResult> => {
      const { prompt } = params;
      try {
        // 1. Validar se existe imagem de referência
        if (!referenceImage || !referenceImage.src) {
          return {
            success: false,
            error: "Nenhuma imagem de referência encontrada",
            message: "Por favor, selecione uma imagem para editar antes de usar esta ferramenta.",
          };
        }

        // 2. Enviar evento de início (se dataStream disponível)
        if (dataStream) {
          dataStream.write({
            type: "data-imageEditing",
            data: {
              status: "editing",
              prompt,
              referenceImageId: referenceImage.id,
            },
          });
        }

        logger.info(`[Tool:editImage] Editando imagem | orgId: ${orgId} | refId: ${referenceImage.id}`);

        // 3. Baixar e converter imagem para base64
        logger.info(`[Tool:editImage] Baixando imagem: ${referenceImage.src}`);
        let base64Data = "";
        let mimeType = "image/jpeg";
        if (referenceImage.src.startsWith("data:")) {
          const [header, data] = referenceImage.src.split(",");
          const match = header?.match(/data:(.*?);base64/);
          mimeType = match?.[1] || "image/png";
          base64Data = data || "";
        } else {
          const imageResponse = await fetch(referenceImage.src);
          const imageBuffer = await imageResponse.arrayBuffer();
          base64Data = Buffer.from(imageBuffer).toString("base64");
          mimeType = imageResponse.headers.get("content-type") || "image/jpeg";
        }

        logger.info(`[Tool:editImage] Imagem convertida para base64: ${base64Data.length} bytes, ${mimeType}`);
        logger.info(`[Tool:editImage] Prompt da edição: "${prompt}"`);

        // 4. Chamar API de edição de imagem
        const baseUrl = getInternalBaseUrl();
        const response = await fetch(`${baseUrl}/api/ai/edit-image`, {
          method: "POST",
          headers: getInternalHeaders(userId, orgId),
          body: JSON.stringify({
            image: {
              base64: base64Data,
              mimeType: mimeType,
            },
            prompt,
            mask: referenceImage.maskData || null,
            maskRegion: referenceImage.maskRegion || null,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json() as EditImageResponse;
          throw new Error(errorData.error || "Falha ao editar imagem");
        }

        const data = await response.json() as EditImageResponse;

        logger.info(`[Tool:editImage] Resposta da API:`, {
          success: data.success,
          imageUrlLength: data.imageUrl?.length,
        });

        // 5. Salvar na gallery (nova versão editada)
        const galleryResponse = await fetch(`${baseUrl}/api/db/gallery`, {
          method: "POST",
          headers: getInternalHeaders(userId, orgId),
          body: JSON.stringify({
            user_id: userId,
            organization_id: orgId,
            src_url: data.imageUrl,
            prompt: `Edição: ${prompt}`,
            source: "ai-tool-edit",
            model: "gemini-3-pro-image-preview",
            aspect_ratio: "1:1",
            image_size: "1K",
          }),
        });

        let savedImage: GalleryResponse | null = null;
        if (galleryResponse.ok) {
          savedImage = await galleryResponse.json() as GalleryResponse;
          logger.info(`[Tool:editImage] Imagem salva na galeria:`, savedImage?.id);
        } else {
          const errorData = await galleryResponse.json().catch(() => ({ error: "unknown" })) as { error: string };
          logger.error(`[Tool:editImage] Erro ao salvar na galeria:`, galleryResponse.status, errorData);
        }

        // 6. Enviar evento de conclusão (se dataStream disponível)
        if (dataStream) {
          dataStream.write({
            type: "data-imageEdited",
            data: {
              id: savedImage?.id || null,
              url: data.imageUrl,
              prompt,
            },
          });
        }

        logger.info(`[Tool:editImage] Imagem editada | newId: ${savedImage?.id}`);

        return {
          success: true,
          imageId: savedImage?.id,
          imageUrl: data.imageUrl,
          referenceImageId: referenceImage.id,
          referenceImageUrl: referenceImage.src,
          prompt,
          message: `Imagem editada com sucesso!`,
        };
      } catch (error) {
        const err = error as Error;
        logger.error("[Tool:editImage] Erro:", err);

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
          message: `Erro ao editar imagem: ${err.message}`,
        };
      }
    },
  });
}
