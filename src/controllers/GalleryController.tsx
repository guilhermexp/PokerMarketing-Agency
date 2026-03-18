import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import { useAssistantHandlers } from "@/hooks/useAssistantHandlers";
import { useBrandProfileController } from "@/controllers/BrandProfileController";
import {
  useGalleryImages,
  useScheduledPosts,
  useCampaigns,
} from "@/hooks/useAppData";
import { useGalleryHandlers } from "@/hooks/useGalleryHandlers";
import { useScheduledPostsHandlers } from "@/hooks/useScheduledPostsHandlers";
import {
  useStyleReferences,
  useTransformedGalleryImages,
  useTransformedScheduledPosts,
} from "@/hooks/useDataTransformers";
import { useChatStore } from "@/stores/chat-store";
import { useGalleryStore } from "@/stores/gallery-store";
import { useScheduledPostsStore } from "@/stores/scheduled-posts-store";
import { useInstagramAccounts } from "@/components/settings/ConnectInstagramModal";
import type {
  ChatReferenceImage,
  GalleryImage,
  InstagramPublishState,
  InstagramContext,
  PendingToolEdit,
  ScheduledPost,
  StyleReference,
} from "@/types";
import type { DbCampaign } from "@/services/apiClient";
import type { EditPreview } from "@/components/image-preview/types";

interface GalleryControllerValue {
  galleryImages: GalleryImage[];
  galleryIsLoading: boolean;
  styleReferences: StyleReference[];
  selectedStyleReference: StyleReference | null;
  scheduledPosts: ScheduledPost[];
  publishingStates: Record<string, InstagramPublishState>;
  instagramContext: InstagramContext | undefined;
  campaigns: DbCampaign[];
  isAssistantOpen: boolean;
  setIsAssistantOpen: (open: boolean) => void;
  handleToggleAssistant: () => void;
  chatHistory: ReturnType<typeof useChatStore.getState>["chatHistory"];
  isAssistantLoading: boolean;
  chatReferenceImage: ChatReferenceImage | null;
  pendingToolEdit: PendingToolEdit | null;
  editingImage: GalleryImage | null;
  toolEditPreview: EditPreview | null;
  handleAssistantSendMessage: ReturnType<
    typeof useAssistantHandlers
  >["handleAssistantSendMessage"];
  handleSetChatReference: ReturnType<
    typeof useChatStore.getState
  >["handleSetChatReference"];
  handleSetChatReferenceSilent: ReturnType<
    typeof useChatStore.getState
  >["handleSetChatReferenceSilent"];
  handleToolEditApproved: ReturnType<
    typeof useChatStore.getState
  >["handleToolEditApproved"];
  handleToolEditRejected: ReturnType<
    typeof useChatStore.getState
  >["handleToolEditRejected"];
  handleCloseImageEditor: ReturnType<
    typeof useChatStore.getState
  >["handleCloseImageEditor"];
  handleRequestImageEdit: (request: {
    toolCallId: string;
    toolName: string;
    prompt: string;
    imageId: string;
  }) => void;
  handleShowToolEditPreview: (payload: {
    toolCallId: string;
    imageUrl: string;
    prompt?: string;
    referenceImageId?: string;
    referenceImageUrl?: string;
  }) => void;
  refreshGallery: () => void;
  quickPostImage: GalleryImage | null;
  setQuickPostImage: (image: GalleryImage | null) => void;
  scheduleModalOpen: boolean;
  setScheduleModalOpen: (open: boolean) => void;
  scheduleModalImage: GalleryImage | null;
  setScheduleModalImage: (image: GalleryImage | null) => void;
  handleAddImageToGallery: ReturnType<
    typeof useGalleryHandlers
  >["handleAddImageToGallery"];
  handleUpdateGalleryImage: ReturnType<
    typeof useGalleryHandlers
  >["handleUpdateGalleryImage"];
  handleDeleteGalleryImage: ReturnType<
    typeof useGalleryHandlers
  >["handleDeleteGalleryImage"];
  handleMarkGalleryImagePublished: ReturnType<
    typeof useGalleryHandlers
  >["handleMarkGalleryImagePublished"];
  handleAddStyleReference: ReturnType<
    typeof useGalleryHandlers
  >["handleAddStyleReference"];
  handleRemoveStyleReference: ReturnType<
    typeof useGalleryHandlers
  >["handleRemoveStyleReference"];
  handleSelectStyleReference: ReturnType<
    typeof useGalleryHandlers
  >["handleSelectStyleReference"];
  handleClearSelectedStyleReference: ReturnType<
    typeof useGalleryHandlers
  >["handleClearSelectedStyleReference"];
  handleSchedulePost: ReturnType<
    typeof useScheduledPostsHandlers
  >["handleSchedulePost"];
  handleUpdateScheduledPost: ReturnType<
    typeof useScheduledPostsHandlers
  >["handleUpdateScheduledPost"];
  handleDeleteScheduledPost: ReturnType<
    typeof useScheduledPostsHandlers
  >["handleDeleteScheduledPost"];
  handleRetryScheduledPost: ReturnType<
    typeof useScheduledPostsHandlers
  >["handleRetryScheduledPost"];
  handlePublishToInstagram: ReturnType<
    typeof useScheduledPostsHandlers
  >["handlePublishToInstagram"];
}

const GalleryControllerContext = createContext<GalleryControllerValue | null>(
  null
);

interface GalleryControllerProps {
  children: ReactNode;
}

export function GalleryController({ children }: GalleryControllerProps) {
  const { brandProfile, onViewChange, organizationId, userId } =
    useBrandProfileController();

  const selectedStyleReference = useGalleryStore(
    (state) => state.selectedStyleReference
  );
  const setSelectedStyleReference = useGalleryStore(
    (state) => state.setSelectedStyleReference
  );
  const publishingStates = useScheduledPostsStore(
    (state) => state.publishingStates
  );
  const setPublishingStates = useScheduledPostsStore(
    (state) => state.setPublishingStates
  );

  const isAssistantOpen = useChatStore((state) => state.isAssistantOpen);
  const setIsAssistantOpen = useChatStore((state) => state.setIsAssistantOpen);
  const chatHistory = useChatStore((state) => state.chatHistory);
  const setChatHistory = useChatStore((state) => state.setChatHistory);
  const isAssistantLoading = useChatStore(
    (state) => state.isAssistantLoading
  );
  const setIsAssistantLoading = useChatStore(
    (state) => state.setIsAssistantLoading
  );
  const chatReferenceImage = useChatStore((state) => state.chatReferenceImage);
  const setChatReferenceImage = useChatStore(
    (state) => state.setChatReferenceImage
  );
  const toolImageReference = useChatStore((state) => state.toolImageReference);
  const setToolImageReference = useChatStore(
    (state) => state.setToolImageReference
  );
  const lastUploadedImage = useChatStore((state) => state.lastUploadedImage);
  const setLastUploadedImage = useChatStore(
    (state) => state.setLastUploadedImage
  );
  const pendingToolEdit = useChatStore((state) => state.pendingToolEdit);
  const editingImage = useChatStore((state) => state.editingImage);
  const toolEditPreview = useChatStore((state) => state.toolEditPreview);
  const handleSetChatReference = useChatStore(
    (state) => state.handleSetChatReference
  );
  const handleSetChatReferenceSilent = useChatStore(
    (state) => state.handleSetChatReferenceSilent
  );
  const handleToggleAssistant = useChatStore(
    (state) => state.handleToggleAssistant
  );
  const handleToolEditApproved = useChatStore(
    (state) => state.handleToolEditApproved
  );
  const handleToolEditRejected = useChatStore(
    (state) => state.handleToolEditRejected
  );
  const handleCloseImageEditor = useChatStore(
    (state) => state.handleCloseImageEditor
  );
  const storeHandleRequestImageEdit = useChatStore(
    (state) => state.handleRequestImageEdit
  );
  const storeHandleShowToolEditPreview = useChatStore(
    (state) => state.handleShowToolEditPreview
  );

  const [quickPostImage, setQuickPostImage] = useState<GalleryImage | null>(
    null
  );
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [scheduleModalImage, setScheduleModalImage] =
    useState<GalleryImage | null>(null);

  const {
    images: swrGalleryImages,
    addImage: swrAddGalleryImage,
    removeImage: swrRemoveGalleryImage,
    updateImage: swrUpdateGalleryImage,
    refresh: refreshGallery,
    isLoading: galleryIsLoading,
  } = useGalleryImages(userId, organizationId);
  const {
    posts: swrScheduledPosts,
    addPost: swrAddScheduledPost,
    updatePost: swrUpdateScheduledPost,
    removePost: swrRemoveScheduledPost,
  } = useScheduledPosts(userId, organizationId);
  const { campaigns = [] } = useCampaigns(userId, organizationId);
  const { accounts: instagramAccounts } = useInstagramAccounts(
    userId || "",
    organizationId
  );

  const galleryImages = useTransformedGalleryImages(swrGalleryImages);
  const scheduledPosts = useTransformedScheduledPosts(swrScheduledPosts);
  const styleReferences = useStyleReferences(swrGalleryImages);

  const instagramContext = useMemo<InstagramContext | undefined>(() => {
    const activeAccount = instagramAccounts.find((account) => account.is_active);

    return activeAccount && userId
      ? {
          instagramAccountId: activeAccount.id,
          userId,
          organizationId: organizationId || undefined,
        }
      : undefined;
  }, [instagramAccounts, organizationId, userId]);

  const galleryHandlers = useGalleryHandlers({
    userId,
    organizationId,
    toolImageReference,
    setToolImageReference,
    swrAddGalleryImage,
    swrRemoveGalleryImage,
    swrUpdateGalleryImage,
    refreshGallery,
    swrGalleryImages,
    setSelectedStyleReference,
    selectedStyleReference,
    onViewChange,
  });

  const {
    handleSchedulePost,
    handleUpdateScheduledPost,
    handleDeleteScheduledPost,
    handleRetryScheduledPost,
    handlePublishToInstagram,
  } = useScheduledPostsHandlers({
    userId,
    organizationId,
    instagramContext,
    swrScheduledPosts,
    swrAddScheduledPost,
    swrUpdateScheduledPost,
    swrRemoveScheduledPost,
    setPublishingStates,
  });

  const { handleAssistantSendMessage } = useAssistantHandlers({
    brandProfile,
    chatHistory,
    setChatHistory,
    setIsAssistantLoading,
    setChatReferenceImage,
    toolImageReference,
    setToolImageReference,
    lastUploadedImage,
    setLastUploadedImage,
    handleAddImageToGallery: galleryHandlers.handleAddImageToGallery,
    handleUpdateGalleryImage: galleryHandlers.handleUpdateGalleryImage,
  });

  const handleRequestImageEdit = useCallback(
    (request: {
      toolCallId: string;
      toolName: string;
      prompt: string;
      imageId: string;
    }) => {
      storeHandleRequestImageEdit(request, galleryImages);
    },
    [galleryImages, storeHandleRequestImageEdit]
  );

  const handleShowToolEditPreview = useCallback(
    (payload: {
      toolCallId: string;
      imageUrl: string;
      prompt?: string;
      referenceImageId?: string;
      referenceImageUrl?: string;
    }) => {
      storeHandleShowToolEditPreview(payload, galleryImages);
    },
    [galleryImages, storeHandleShowToolEditPreview]
  );

  const value = useMemo<GalleryControllerValue>(
    () => ({
      galleryImages,
      galleryIsLoading,
      styleReferences,
      selectedStyleReference,
      scheduledPosts,
      publishingStates,
      instagramContext,
      campaigns,
      isAssistantOpen,
      setIsAssistantOpen,
      handleToggleAssistant,
      chatHistory,
      isAssistantLoading,
      chatReferenceImage,
      pendingToolEdit,
      editingImage,
      toolEditPreview,
      handleAssistantSendMessage,
      handleSetChatReference,
      handleSetChatReferenceSilent,
      handleToolEditApproved,
      handleToolEditRejected,
      handleCloseImageEditor,
      handleRequestImageEdit,
      handleShowToolEditPreview,
      refreshGallery,
      quickPostImage,
      setQuickPostImage,
      scheduleModalOpen,
      setScheduleModalOpen,
      scheduleModalImage,
      setScheduleModalImage,
      handleAddImageToGallery: galleryHandlers.handleAddImageToGallery,
      handleUpdateGalleryImage: galleryHandlers.handleUpdateGalleryImage,
      handleDeleteGalleryImage: galleryHandlers.handleDeleteGalleryImage,
      handleMarkGalleryImagePublished:
        galleryHandlers.handleMarkGalleryImagePublished,
      handleAddStyleReference: galleryHandlers.handleAddStyleReference,
      handleRemoveStyleReference: galleryHandlers.handleRemoveStyleReference,
      handleSelectStyleReference: galleryHandlers.handleSelectStyleReference,
      handleClearSelectedStyleReference:
        galleryHandlers.handleClearSelectedStyleReference,
      handleSchedulePost,
      handleUpdateScheduledPost,
      handleDeleteScheduledPost,
      handleRetryScheduledPost,
      handlePublishToInstagram,
    }),
    [
      galleryImages,
      galleryIsLoading,
      styleReferences,
      selectedStyleReference,
      scheduledPosts,
      publishingStates,
      instagramContext,
      campaigns,
      isAssistantOpen,
      setIsAssistantOpen,
      handleToggleAssistant,
      chatHistory,
      isAssistantLoading,
      chatReferenceImage,
      pendingToolEdit,
      editingImage,
      toolEditPreview,
      handleAssistantSendMessage,
      handleSetChatReference,
      handleSetChatReferenceSilent,
      handleToolEditApproved,
      handleToolEditRejected,
      handleCloseImageEditor,
      handleRequestImageEdit,
      handleShowToolEditPreview,
      refreshGallery,
      quickPostImage,
      scheduleModalOpen,
      scheduleModalImage,
      galleryHandlers,
      handleSchedulePost,
      handleUpdateScheduledPost,
      handleDeleteScheduledPost,
      handleRetryScheduledPost,
      handlePublishToInstagram,
    ]
  );

  return (
    <GalleryControllerContext.Provider value={value}>
      {children}
    </GalleryControllerContext.Provider>
  );
}

export function useGalleryController() {
  const context = useContext(GalleryControllerContext);

  if (!context) {
    throw new Error("useGalleryController must be used within GalleryController");
  }

  return context;
}
