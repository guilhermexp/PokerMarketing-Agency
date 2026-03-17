/**
 * Chat Store - Assistant/Chat state management
 *
 * Manages:
 * - Assistant panel visibility
 * - Chat history and messages
 * - Reference images for chat
 * - Tool edit approval flow (AI Studio integration)
 */

import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type {
  ChatMessage,
  ChatReferenceImage,
  PendingToolEdit,
  GalleryImage,
  BrandProfile,
} from "@/types";
import type { EditPreview } from "@/components/image-preview/types";

// =============================================================================
// Types
// =============================================================================

type SetChatHistoryAction =
  | ChatMessage[]
  | ((prev: ChatMessage[]) => ChatMessage[]);

type SetPendingToolEditAction =
  | PendingToolEdit
  | null
  | ((prev: PendingToolEdit | null) => PendingToolEdit | null);

interface ChatState {
  // State
  isAssistantOpen: boolean;
  chatHistory: ChatMessage[];
  isAssistantLoading: boolean;
  chatReferenceImage: ChatReferenceImage | null;
  toolImageReference: ChatReferenceImage | null;
  lastUploadedImage: ChatReferenceImage | null;
  pendingToolEdit: PendingToolEdit | null;
  editingImage: GalleryImage | null;
  toolEditPreview: EditPreview | null;
  chatInitialized: boolean;

  // Basic setters
  setIsAssistantOpen: (open: boolean) => void;
  toggleAssistant: () => void;
  setChatHistory: (action: SetChatHistoryAction) => void;
  addChatMessage: (message: ChatMessage) => void;
  updateLastChatMessage: (updater: (msg: ChatMessage) => ChatMessage) => void;
  setIsAssistantLoading: (loading: boolean) => void;
  setChatReferenceImage: (image: ChatReferenceImage | null) => void;
  setToolImageReference: (image: ChatReferenceImage | null) => void;
  setLastUploadedImage: (image: ChatReferenceImage | null) => void;
  setPendingToolEdit: (action: SetPendingToolEditAction) => void;
  setEditingImage: (image: GalleryImage | null) => void;
  setToolEditPreview: (preview: EditPreview | null) => void;
  setChatInitialized: (initialized: boolean) => void;

  // Complex handlers
  handleSetChatReference: (img: GalleryImage | ChatReferenceImage | null) => void;
  handleSetChatReferenceSilent: (img: GalleryImage | ChatReferenceImage | null) => void;
  handleToggleAssistant: () => void;
  handleRequestImageEdit: (
    request: {
      toolCallId: string;
      toolName: string;
      prompt: string;
      imageId: string;
    },
    galleryImages: GalleryImage[]
  ) => void;
  handleToolEditApproved: (toolCallId: string, imageUrl: string) => void;
  handleToolEditRejected: (toolCallId: string, reason?: string) => void;
  handleShowToolEditPreview: (
    payload: {
      toolCallId: string;
      imageUrl: string;
      prompt?: string;
      referenceImageId?: string;
      referenceImageUrl?: string;
    },
    galleryImages: GalleryImage[]
  ) => void;
  handleCloseImageEditor: () => void;
  initializeChatWithBrandProfile: (brandProfile: BrandProfile) => void;
  resetChatState: () => void;
}

// =============================================================================
// Initial State
// =============================================================================

const initialState = {
  isAssistantOpen: false,
  chatHistory: [] as ChatMessage[],
  isAssistantLoading: false,
  chatReferenceImage: null,
  toolImageReference: null,
  lastUploadedImage: null,
  pendingToolEdit: null,
  editingImage: null,
  toolEditPreview: null,
  chatInitialized: false,
};

// =============================================================================
// Store
// =============================================================================

export const useChatStore = create<ChatState>()(
  devtools(
    (set, get) => ({
      ...initialState,

      // Basic setters
      setIsAssistantOpen: (open) => set({ isAssistantOpen: open }),

      toggleAssistant: () =>
        set((state) => ({ isAssistantOpen: !state.isAssistantOpen })),

      setChatHistory: (action) =>
        set((state) => ({
          chatHistory:
            typeof action === "function" ? action(state.chatHistory) : action,
        })),

      addChatMessage: (message) =>
        set((state) => ({
          chatHistory: [...state.chatHistory, message],
        })),

      updateLastChatMessage: (updater) =>
        set((state) => {
          if (state.chatHistory.length === 0) return state;
          const updated = [...state.chatHistory];
          updated[updated.length - 1] = updater(updated[updated.length - 1]);
          return { chatHistory: updated };
        }),

      setIsAssistantLoading: (loading) => set({ isAssistantLoading: loading }),

      setChatReferenceImage: (image) => set({ chatReferenceImage: image }),

      setToolImageReference: (image) => set({ toolImageReference: image }),

      setLastUploadedImage: (image) => set({ lastUploadedImage: image }),

      setPendingToolEdit: (action) =>
        set((state) => ({
          pendingToolEdit:
            typeof action === "function" ? action(state.pendingToolEdit) : action,
        })),

      setEditingImage: (image) => set({ editingImage: image }),

      setToolEditPreview: (preview) => set({ toolEditPreview: preview }),

      setChatInitialized: (initialized) => set({ chatInitialized: initialized }),

      // Complex handlers
      handleSetChatReference: (img) => {
        const state = get();
        set({
          chatReferenceImage: img ? { id: img.id, src: img.src } : null,
          isAssistantOpen: img ? true : state.isAssistantOpen,
        });
      },

      handleSetChatReferenceSilent: (img) => {
        set({
          chatReferenceImage: img ? { id: img.id, src: img.src } : null,
        });
      },

      handleToggleAssistant: () => {
        set((state) => ({ isAssistantOpen: !state.isAssistantOpen }));
      },

      handleRequestImageEdit: (request, galleryImages) => {
        console.debug("[ChatStore] Tool edit requested:", request);

        const image = galleryImages.find((img) => img.id === request.imageId);

        if (!image) {
          console.error("[ChatStore] Image not found:", request.imageId);
          set({
            pendingToolEdit: {
              ...request,
              result: "rejected",
              error: "Imagem n\u00e3o encontrada na galeria",
            },
          });
          return;
        }

        set({
          editingImage: image,
          pendingToolEdit: request,
        });
      },

      handleToolEditApproved: (toolCallId, imageUrl) => {
        console.log("[ChatStore] Tool edit approved:", {
          toolCallId,
          imageUrl,
          imageUrlType: typeof imageUrl,
          imageUrlLength: imageUrl?.length,
          isHttps: imageUrl?.startsWith("https://"),
          isBlob: imageUrl?.startsWith("blob:"),
        });

        set((state) => ({
          pendingToolEdit: state.pendingToolEdit
            ? {
                ...state.pendingToolEdit,
                result: "approved" as const,
                imageUrl,
              }
            : null,
        }));

        // Clear states after AssistantPanel gets the result
        setTimeout(() => {
          set({
            pendingToolEdit: null,
            editingImage: null,
            toolEditPreview: null,
          });
        }, 100);
      },

      handleToolEditRejected: (toolCallId, reason) => {
        console.debug("[ChatStore] Tool edit rejected:", { toolCallId, reason });

        set((state) => ({
          pendingToolEdit: state.pendingToolEdit
            ? {
                ...state.pendingToolEdit,
                result: "rejected" as const,
                error: reason || "Edi\u00e7\u00e3o rejeitada pelo usu\u00e1rio",
              }
            : null,
        }));

        // Clear states after AssistantPanel gets the result
        setTimeout(() => {
          set({
            pendingToolEdit: null,
            editingImage: null,
          });
        }, 100);
      },

      handleShowToolEditPreview: (payload, galleryImages) => {
        const { toolCallId, imageUrl, prompt, referenceImageId, referenceImageUrl } =
          payload;

        const imageFromGallery = referenceImageId
          ? galleryImages.find((img) => img.id === referenceImageId)
          : null;

        const previewImage =
          imageFromGallery ||
          (referenceImageUrl
            ? ({
                id: referenceImageId || `tool-edit-${toolCallId}`,
                src: referenceImageUrl,
                source: "ai-tool-edit",
                model: "gemini-3-pro-image-preview",
              } as GalleryImage)
            : null);

        if (!previewImage) {
          console.warn(
            "[ChatStore] Tool edit preview skipped: reference image not found"
          );
          return;
        }

        const state = get();

        set({
          editingImage: previewImage,
          toolEditPreview: {
            dataUrl: imageUrl,
            type: "edit",
            prompt,
          },
          pendingToolEdit:
            state.pendingToolEdit?.toolCallId === toolCallId
              ? state.pendingToolEdit
              : {
                  toolCallId,
                  toolName: "edit_image",
                  prompt: prompt || "",
                  imageId: previewImage.id,
                },
        });
      },

      handleCloseImageEditor: () => {
        set({
          editingImage: null,
          toolEditPreview: null,
        });
      },

      initializeChatWithBrandProfile: (brandProfile) => {
        const state = get();
        if (state.chatInitialized || state.chatHistory.length > 0) return;

        const greeting: ChatMessage = {
          role: "model",
          parts: [
            {
              text: `Ol\u00e1! Sou seu assistente de marketing da ${brandProfile.name}. Posso ajudar voc\u00ea a criar imagens, editar fotos e gerar conte\u00fado. O que deseja fazer hoje?`,
            },
          ],
        };

        set({
          chatHistory: [greeting],
          chatInitialized: true,
        });
      },

      resetChatState: () => set(initialState),
    }),
    { name: "ChatStore" }
  )
);

// =============================================================================
// Selectors
// =============================================================================

export const selectIsAssistantOpen = (state: ChatState) => state.isAssistantOpen;
export const selectChatHistory = (state: ChatState) => state.chatHistory;
export const selectIsAssistantLoading = (state: ChatState) => state.isAssistantLoading;
export const selectChatReferenceImage = (state: ChatState) => state.chatReferenceImage;
export const selectPendingToolEdit = (state: ChatState) => state.pendingToolEdit;
export const selectEditingImage = (state: ChatState) => state.editingImage;
export const selectToolEditPreview = (state: ChatState) => state.toolEditPreview;
