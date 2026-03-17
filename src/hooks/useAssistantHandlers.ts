/**
 * Assistant Handlers Hook
 *
 * Manages all chat/assistant-related operations:
 * - Sending messages to assistant
 * - Executing tool calls (create_image, edit_referenced_image, etc.)
 * - Image resizing for chat
 * - Chat history management
 */

import { useCallback } from "react";
import type {
  BrandProfile,
  ChatMessage,
  ChatReferenceImage,
  ChatPart,
  AssistantFunctionCall,
  GalleryImage,
} from "@/types";
import { runAssistantConversationStream } from "@/services/assistantService";
import {
  editImage,
  generateLogo,
  generateImage,
} from "@/services/geminiService";

// =============================================================================
// Constants
// =============================================================================

const MAX_CHAT_HISTORY_MESSAGES = 10;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Resize image for chat (to reduce payload size)
 */
export function resizeImageForChat(
  dataUrl: string,
  maxWidth: number,
  maxHeight: number
): Promise<{ base64: string; mimeType: "image/jpeg" }> {
  return new Promise((resolve, reject) => {
    const loadImage = async () => {
      let imageSrc = dataUrl;
      let revokeUrl = false;

      if (!dataUrl.startsWith("data:")) {
        const response = await fetch(dataUrl);
        if (!response.ok) {
          throw new Error(`Falha ao carregar imagem (${response.status})`);
        }
        const blob = await response.blob();
        imageSrc = URL.createObjectURL(blob);
        revokeUrl = true;
      }

      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round(height * (maxWidth / width));
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round(width * (maxHeight / height));
            height = maxHeight;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas context error"));
        ctx.drawImage(img, 0, 0, width, height);
        if (revokeUrl) URL.revokeObjectURL(imageSrc);
        const resizedDataUrl = canvas.toDataURL("image/jpeg", 0.6);
        resolve({
          base64: resizedDataUrl.split(",")[1],
          mimeType: "image/jpeg",
        });
      };
      img.onerror = (err) => reject(err);
      img.src = imageSrc;
    };

    loadImage().catch(reject);
  });
}

/**
 * Truncate chat history to prevent token overflow
 */
export function getTruncatedHistory(
  history: ChatMessage[],
  maxLength: number = MAX_CHAT_HISTORY_MESSAGES
): ChatMessage[] {
  const truncated =
    history.length <= maxLength ? [...history] : history.slice(-maxLength);
  return truncated.map((msg, index) => {
    if (index < truncated.length - 2) {
      return {
        ...msg,
        parts: msg.parts.map((part) =>
          part.inlineData ? { text: "[Imagem de referência anterior]" } : part
        ),
      };
    }
    return msg;
  });
}

// =============================================================================
// Types
// =============================================================================

type ToolResult =
  | { success: true; image_data: string; message: string }
  | { error: string };

interface UseAssistantHandlersParams {
  brandProfile: BrandProfile | null;
  chatHistory: ChatMessage[];
  setChatHistory: (
    action: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])
  ) => void;
  setIsAssistantLoading: (loading: boolean) => void;
  setChatReferenceImage: (ref: ChatReferenceImage | null) => void;
  toolImageReference: ChatReferenceImage | null;
  setToolImageReference: (ref: ChatReferenceImage | null) => void;
  lastUploadedImage: ChatReferenceImage | null;
  setLastUploadedImage: (ref: ChatReferenceImage | null) => void;
  handleAddImageToGallery: (image: Omit<GalleryImage, "id">) => GalleryImage;
  handleUpdateGalleryImage: (imageId: string, newImageSrc: string) => void;
}

interface AssistantHandlers {
  handleAssistantSendMessage: (
    message: string,
    image: ChatReferenceImage | null
  ) => Promise<void>;
  executeTool: (toolCall: {
    name: string;
    args: Record<string, unknown>;
  }) => Promise<ToolResult>;
}

// =============================================================================
// Hook
// =============================================================================

export function useAssistantHandlers({
  brandProfile,
  chatHistory,
  setChatHistory,
  setIsAssistantLoading,
  setChatReferenceImage,
  toolImageReference,
  setToolImageReference,
  lastUploadedImage,
  setLastUploadedImage,
  handleAddImageToGallery,
  handleUpdateGalleryImage,
}: UseAssistantHandlersParams): AssistantHandlers {
  const executeTool = useCallback(
    async (toolCall: {
      name: string;
      args: Record<string, unknown>;
    }): Promise<ToolResult> => {
      const { name, args } = toolCall;
      if (name === "create_image") {
        try {
          const productImages = lastUploadedImage
            ? [
                {
                  base64: lastUploadedImage.src.split(",")[1],
                  mimeType:
                    lastUploadedImage.src.match(/:(.*?);/)?.[1] || "image/png",
                },
              ]
            : undefined;
          const imageUrl = await generateImage(
            args.description as string,
            brandProfile!,
            {
              aspectRatio: (args.aspect_ratio as string) || "1:1",
              model: "gemini-3-pro-image-preview",
              productImages,
            }
          );
          const newImg = handleAddImageToGallery({
            src: imageUrl,
            prompt: args.description as string,
            source: "Edição",
            model: "gemini-3-pro-image-preview",
          });
          setToolImageReference({ id: newImg.id, src: newImg.src });
          return {
            success: true,
            image_data: imageUrl,
            message: "Asset visual forjado com sucesso.",
          };
        } catch (err: unknown) {
          return { error: err instanceof Error ? err.message : String(err) };
        }
      }
      if (name === "edit_referenced_image") {
        if (!toolImageReference) return { error: "Nenhuma imagem em foco." };
        try {
          const [h, b64] = toolImageReference.src.split(",");
          const m = h.match(/:(.*?);/)?.[1] || "image/png";
          const newUrl = await editImage(b64, m, args.prompt as string);
          handleUpdateGalleryImage(toolImageReference.id, newUrl);
          return {
            success: true,
            image_data: newUrl,
            message: "Ajuste aplicado.",
          };
        } catch (err: unknown) {
          return { error: err instanceof Error ? err.message : String(err) };
        }
      }
      if (name === "add_collab_logo_to_image") {
        if (!toolImageReference)
          return {
            error: "Nenhuma imagem de arte em foco para adicionar o logo.",
          };
        if (!lastUploadedImage)
          return {
            error:
              "Nenhum logo foi enviado no chat. Peça ao usuário para anexar o logo.",
          };
        try {
          const [h, b64] = toolImageReference.src.split(",");
          const m = h.match(/:(.*?);/)?.[1] || "image/png";
          const editPrompt = `Adicione um logotipo de parceiro na imagem. ${
            (args.style_instruction as string) ||
            "Posicione no canto inferior direito de forma harmoniosa."
          }`;
          const newUrl = await editImage(b64, m, editPrompt);
          handleUpdateGalleryImage(toolImageReference.id, newUrl);
          return {
            success: true,
            image_data: newUrl,
            message: "Logo de parceria adicionado com sucesso.",
          };
        } catch (err: unknown) {
          return { error: err instanceof Error ? err.message : String(err) };
        }
      }
      if (name === "create_brand_logo") {
        try {
          const logoUrl = await generateLogo(args.prompt as string);
          const newImg = handleAddImageToGallery({
            src: logoUrl,
            prompt: args.prompt as string,
            source: "Logo",
            model: "gemini-3-pro-image-preview",
          });
          setToolImageReference({ id: newImg.id, src: newImg.src });
          return {
            success: true,
            image_data: logoUrl,
            message: "Logo criado com sucesso.",
          };
        } catch (err: unknown) {
          return { error: err instanceof Error ? err.message : String(err) };
        }
      }
      return { error: `Comando não reconhecido: ${name}` };
    },
    [
      brandProfile,
      handleAddImageToGallery,
      handleUpdateGalleryImage,
      lastUploadedImage,
      setToolImageReference,
      toolImageReference,
    ]
  );

  const handleAssistantSendMessage = useCallback(
    async (message: string, image: ChatReferenceImage | null) => {
      setIsAssistantLoading(true);
      const userMessageParts: ChatPart[] = [];
      if (image) {
        setLastUploadedImage(image);
        if (!image.id.startsWith("local-")) setToolImageReference(image);
        const { base64, mimeType } = await resizeImageForChat(
          image.src,
          384,
          384
        );
        userMessageParts.push({ inlineData: { data: base64, mimeType } });
      }
      if (message.trim()) userMessageParts.push({ text: message });
      const userMessage: ChatMessage = { role: "user", parts: userMessageParts };
      const history = [...chatHistory, userMessage];
      setChatHistory(history);
      setChatReferenceImage(null);
      try {
        setChatHistory((prev) => [
          ...prev,
          { role: "model", parts: [{ text: "" }] },
        ]);
        const streamResponse = await runAssistantConversationStream(
          getTruncatedHistory(history),
          brandProfile
        );
        let accumulatedText = "";
        let functionCall: AssistantFunctionCall | undefined;
        for await (const chunk of streamResponse) {
          if (chunk.text) {
            accumulatedText += chunk.text;
            setChatHistory((prev) => {
              const next = [...prev];
              if (next[next.length - 1].role === "model")
                next[next.length - 1] = {
                  ...next[next.length - 1],
                  parts: [{ text: accumulatedText }],
                };
              return next;
            });
          }
          if (chunk.functionCall) functionCall = chunk.functionCall;
        }
        if (functionCall) {
          const modelMsg: ChatMessage = {
            role: "model",
            parts: [{ functionCall }],
          };
          setChatHistory((prev) => {
            const next = [...prev];
            next[next.length - 1] = modelMsg;
            return next;
          });
          const result = await executeTool(functionCall);
          const toolMsg: ChatMessage = {
            role: "user",
            parts: [
              {
                functionResponse: { name: functionCall.name, response: result },
              },
            ],
          };
          setChatHistory((prev) => [...prev, toolMsg]);
          if ("success" in result && result.success && result.image_data) {
            const [header, base64] = result.image_data.split(",");
            setChatHistory((prev) => [
              ...prev,
              {
                role: "model",
                parts: [
                  {
                    text: "Gerei uma prévia:",
                    inlineData: {
                      data: base64,
                      mimeType: header.match(/:(.*?);/)?.[1] || "image/png",
                    },
                  },
                ],
              },
            ]);
          }
          setChatHistory((prev) => [
            ...prev,
            { role: "model", parts: [{ text: "" }] },
          ]);
          const finalStream = await runAssistantConversationStream(
            getTruncatedHistory([...history, modelMsg, toolMsg]),
            brandProfile
          );
          let finalAcc = "";
          for await (const chunk of finalStream) {
            if (chunk.text) {
              finalAcc += chunk.text;
              setChatHistory((prev) => {
                const next = [...prev];
                if (next[next.length - 1].role === "model")
                  next[next.length - 1] = {
                    ...next[next.length - 1],
                    parts: [{ text: finalAcc }],
                  };
                return next;
              });
            }
          }
        }
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error("[Chat] Error sending message:", err);
        setChatHistory((prev) => {
          const next = [...prev];
          if (next.length > 0)
            next[next.length - 1] = {
              ...next[next.length - 1],
              parts: [{ text: `Erro: ${errorMessage}` }],
            };
          return next;
        });
      } finally {
        setIsAssistantLoading(false);
      }
    },
    [
      brandProfile,
      chatHistory,
      executeTool,
      setChatHistory,
      setChatReferenceImage,
      setIsAssistantLoading,
      setLastUploadedImage,
      setToolImageReference,
    ]
  );

  return {
    handleAssistantSendMessage,
    executeTool,
  };
}
