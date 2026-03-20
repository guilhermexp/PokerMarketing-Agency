import React, { Suspense } from "react";
import { QuickPostModal } from "@/components/common/QuickPostModal";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { PublishedStoriesWidget } from "@/components/ui/published-stories-widget";
import { ViewLoadingFallback } from "@/components/dashboard/dashboard-shared";
import { useBrandProfileController } from "@/controllers/BrandProfileController";
import { useGalleryController } from "@/controllers/GalleryController";
import { authClient } from "@/lib/auth-client";
import { lazyWithRetry } from "@/lib/asset-version-recovery";

const SchedulePostModal = lazyWithRetry(() =>
  import("@/components/calendar/SchedulePostModal").then((module) => ({
    default: module.SchedulePostModal,
  }))
);
const ImagePreviewModal = lazyWithRetry(() =>
  import("@/components/image-preview/ImagePreviewModal").then((module) => ({
    default: module.ImagePreviewModal,
  }))
);
const AssistantPanel = lazyWithRetry(() =>
  import("@/components/assistant/AssistantPanel").then((module) => ({
    default: module.AssistantPanel,
  }))
);
const AssistantPanelNew = lazyWithRetry(() =>
  import("@/components/assistant/AssistantPanelNew").then((module) => ({
    default: module.AssistantPanelNew,
  }))
);

export function DashboardOverlays() {
  const { brandProfile, handleEditProfile } = useBrandProfileController();
  const {
    campaigns,
    chatHistory,
    chatReferenceImage,
    editingImage,
    galleryImages,
    handleAssistantSendMessage,
    handleCloseImageEditor,
    handleMarkGalleryImagePublished,
    handleRequestImageEdit,
    handleSchedulePost,
    handleSetChatReference,
    handleSetChatReferenceSilent,
    handleShowToolEditPreview,
    handleToolEditApproved,
    handleToolEditRejected,
    handleUpdateGalleryImage,
    isAssistantLoading,
    instagramContext,
    pendingToolEdit,
    quickPostImage,
    scheduleModalImage,
    scheduleModalOpen,
    scheduledPosts,
    setQuickPostImage,
    setScheduleModalImage,
    setScheduleModalOpen,
    toolEditPreview,
  } = useGalleryController();

  if (!brandProfile) {
    return null;
  }

  return (
    <>
      {editingImage ? (
        <ErrorBoundary fallback={<ViewLoadingFallback />}>
          <Suspense fallback={<ViewLoadingFallback />}>
            <ImagePreviewModal
              image={editingImage}
              onClose={handleCloseImageEditor}
              onImageUpdate={(newSrc) =>
                handleUpdateGalleryImage(editingImage.id, newSrc)
              }
              onSetChatReference={handleSetChatReference}
              onSetChatReferenceSilent={
                handleSetChatReferenceSilent
                  ? (image) => handleSetChatReferenceSilent(image)
                  : undefined
              }
              pendingToolEdit={pendingToolEdit}
              onToolEditApproved={handleToolEditApproved}
              onToolEditRejected={handleToolEditRejected}
              initialEditPreview={toolEditPreview || null}
              chatReferenceImageId={chatReferenceImage?.id || null}
              chatComponent={
                <Suspense fallback={<ViewLoadingFallback />}>
                  {import.meta.env.VITE_USE_VERCEL_AI_SDK === "true" ? (
                    <AssistantPanelNew
                      isOpen
                      onClose={() => undefined}
                      referenceImage={chatReferenceImage}
                      onClearReference={() => handleSetChatReference(null)}
                      onUpdateReference={(reference) =>
                        handleSetChatReference({
                          id: reference.id,
                          model: "gemini-3-pro-image-preview",
                          source: "Edição",
                          src: reference.src,
                        })
                      }
                      galleryImages={galleryImages}
                      brandProfile={brandProfile}
                      pendingToolEdit={pendingToolEdit}
                      onRequestImageEdit={handleRequestImageEdit}
                      onToolEditApproved={handleToolEditApproved}
                      onToolEditRejected={handleToolEditRejected}
                      onShowToolEditPreview={handleShowToolEditPreview}
                    />
                  ) : (
                    <AssistantPanel
                      isOpen
                      onClose={() => undefined}
                      history={chatHistory}
                      isLoading={isAssistantLoading}
                      onSendMessage={handleAssistantSendMessage}
                      referenceImage={chatReferenceImage}
                      onClearReference={() => handleSetChatReference(null)}
                    />
                  )}
                </Suspense>
              }
            />
          </Suspense>
        </ErrorBoundary>
      ) : null}

      {quickPostImage ? (
        <QuickPostModal
          isOpen={!!quickPostImage}
          onClose={() => setQuickPostImage(null)}
          image={quickPostImage}
          brandProfile={brandProfile}
          context={quickPostImage.prompt || "Imagem da galeria"}
          onImagePublished={handleMarkGalleryImagePublished}
          instagramContext={instagramContext}
        />
      ) : null}

      <PublishedStoriesWidget
        scheduledPosts={scheduledPosts}
        brandProfile={brandProfile}
      />

      {scheduleModalOpen ? (
        <ErrorBoundary fallback={<ViewLoadingFallback />}>
          <Suspense fallback={<ViewLoadingFallback />}>
            <SchedulePostModal
              isOpen={scheduleModalOpen}
              onClose={() => {
                setScheduleModalOpen(false);
                setScheduleModalImage(null);
              }}
              onSchedule={(post) => {
                void handleSchedulePost(post);
                setScheduleModalOpen(false);
                setScheduleModalImage(null);
              }}
              galleryImages={galleryImages}
              campaigns={campaigns}
              initialImage={scheduleModalImage}
            />
          </Suspense>
        </ErrorBoundary>
      ) : null}

      <footer className="fixed bottom-4 left-4 z-[10000] hidden pointer-events-auto flex-col items-center gap-2 rounded-2xl border border-border bg-black/40 p-2 shadow-[0_25px_90px_rgba(0,0,0,0.7)] backdrop-blur-2xl lg:flex">
        <button
          onClick={handleEditProfile}
          className="flex cursor-pointer items-center justify-center transition-transform active:scale-95"
          title={brandProfile.name}
        >
          {brandProfile.logo ? (
            <img
              src={brandProfile.logo}
              alt="Logo"
              className="h-10 w-10 rounded-xl object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white">
              <span className="text-sm font-semibold">
                {brandProfile.name.substring(0, 1).toUpperCase()}
              </span>
            </div>
          )}
        </button>

        <button
          onClick={() => authClient.signOut()}
          className="flex cursor-pointer items-center justify-center rounded-xl p-2.5 text-white transition-all hover:bg-white/5 hover:text-red-400 active:scale-95"
          title="Sair"
        >
          <span className="h-5 w-5" />
        </button>
      </footer>
    </>
  );
}
