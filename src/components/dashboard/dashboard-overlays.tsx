import React, { Suspense, lazy } from "react";
import type { DbCampaign } from "../../services/apiClient";
import { QuickPostModal } from "../common/QuickPostModal";
import { PublishedStoriesWidget } from "../ui/published-stories-widget";
import type { DashboardProps } from "./dashboard-shared";
import { ViewLoadingFallback } from "./dashboard-shared";

const SchedulePostModal = lazy(() =>
  import("../calendar/SchedulePostModal").then((m) => ({
    default: m.SchedulePostModal,
  })),
);
const ImagePreviewModal = lazy(() =>
  import("../image-preview/ImagePreviewModal").then((m) => ({
    default: m.ImagePreviewModal,
  })),
);
const AssistantPanel = lazy(() =>
  import("../assistant/AssistantPanel").then((m) => ({ default: m.AssistantPanel })),
);
const AssistantPanelNew = lazy(() =>
  import("../assistant/AssistantPanelNew").then((m) => ({
    default: m.AssistantPanelNew,
  })),
);

interface DashboardOverlaysProps {
  assistantHistory: DashboardProps["assistantHistory"];
  brandProfile: DashboardProps["brandProfile"];
  campaigns: DbCampaign[];
  chatReferenceImage: DashboardProps["chatReferenceImage"];
  editingImage?: DashboardProps["editingImage"];
  galleryImages: DashboardProps["galleryImages"];
  instagramContext?: DashboardProps["instagramContext"];
  isAssistantLoading: DashboardProps["isAssistantLoading"];
  onAssistantSendMessage: DashboardProps["onAssistantSendMessage"];
  onCloseImageEditor?: DashboardProps["onCloseImageEditor"];
  onEditProfile: DashboardProps["onEditProfile"];
  onMarkGalleryImagePublished?: DashboardProps["onMarkGalleryImagePublished"];
  onRequestImageEdit?: DashboardProps["onRequestImageEdit"];
  onSchedulePost: DashboardProps["onSchedulePost"];
  onSetChatReference: DashboardProps["onSetChatReference"];
  onSetChatReferenceSilent?: DashboardProps["onSetChatReferenceSilent"];
  onShowToolEditPreview?: DashboardProps["onShowToolEditPreview"];
  onSignOut: () => void;
  onToolEditApproved?: DashboardProps["onToolEditApproved"];
  onToolEditRejected?: DashboardProps["onToolEditRejected"];
  onUpdateGalleryImage: DashboardProps["onUpdateGalleryImage"];
  pendingToolEdit?: DashboardProps["pendingToolEdit"];
  quickPostImage: DashboardProps["galleryImages"][number] | null;
  scheduleModalImage: DashboardProps["galleryImages"][number] | null;
  scheduleModalOpen: boolean;
  scheduledPosts: DashboardProps["scheduledPosts"];
  setQuickPostImage: (image: DashboardProps["galleryImages"][number] | null) => void;
  setScheduleModalImage: (image: DashboardProps["galleryImages"][number] | null) => void;
  setScheduleModalOpen: (value: boolean) => void;
  toolEditPreview?: DashboardProps["toolEditPreview"];
}

export function DashboardOverlays({
  assistantHistory,
  brandProfile,
  campaigns,
  chatReferenceImage,
  editingImage,
  galleryImages,
  instagramContext,
  isAssistantLoading,
  onAssistantSendMessage,
  onCloseImageEditor,
  onEditProfile,
  onMarkGalleryImagePublished,
  onRequestImageEdit,
  onSchedulePost,
  onSetChatReference,
  onSetChatReferenceSilent,
  onShowToolEditPreview,
  onSignOut,
  onToolEditApproved,
  onToolEditRejected,
  onUpdateGalleryImage,
  pendingToolEdit,
  quickPostImage,
  scheduleModalImage,
  scheduleModalOpen,
  scheduledPosts,
  setQuickPostImage,
  setScheduleModalImage,
  setScheduleModalOpen,
  toolEditPreview,
}: DashboardOverlaysProps) {
  return (
    <>
      {editingImage ? (
        <Suspense fallback={<ViewLoadingFallback />}>
          <ImagePreviewModal
            image={editingImage}
            onClose={onCloseImageEditor || (() => {})}
            onImageUpdate={(newSrc) => onUpdateGalleryImage?.(editingImage.id, newSrc)}
            onSetChatReference={onSetChatReference}
            onSetChatReferenceSilent={
              onSetChatReferenceSilent
                ? (image) => onSetChatReferenceSilent(image)
                : undefined
            }
            pendingToolEdit={pendingToolEdit}
            onToolEditApproved={onToolEditApproved}
            onToolEditRejected={onToolEditRejected}
            initialEditPreview={toolEditPreview || null}
            chatReferenceImageId={chatReferenceImage?.id || null}
            chatComponent={
              <Suspense fallback={<ViewLoadingFallback />}>
                {import.meta.env.VITE_USE_VERCEL_AI_SDK === "true" ? (
                  <AssistantPanelNew
                    isOpen={true}
                    onClose={() => {}}
                    referenceImage={chatReferenceImage}
                    onClearReference={() => onSetChatReference(null)}
                    onUpdateReference={(ref) =>
                      onSetChatReference({
                        id: ref.id,
                        model: "",
                        source: "",
                        src: ref.src,
                      } as unknown as DashboardProps["galleryImages"][number])
                    }
                    galleryImages={galleryImages}
                    brandProfile={brandProfile}
                    pendingToolEdit={pendingToolEdit}
                    onRequestImageEdit={onRequestImageEdit}
                    onToolEditApproved={onToolEditApproved}
                    onToolEditRejected={onToolEditRejected}
                    onShowToolEditPreview={onShowToolEditPreview}
                  />
                ) : (
                  <AssistantPanel
                    isOpen={true}
                    onClose={() => {}}
                    history={assistantHistory}
                    isLoading={isAssistantLoading}
                    onSendMessage={onAssistantSendMessage}
                    referenceImage={chatReferenceImage}
                    onClearReference={() => onSetChatReference(null)}
                  />
                )}
              </Suspense>
            }
          />
        </Suspense>
      ) : null}

      {quickPostImage ? (
        <QuickPostModal
          isOpen={!!quickPostImage}
          onClose={() => setQuickPostImage(null)}
          image={quickPostImage}
          brandProfile={brandProfile}
          context={quickPostImage.prompt || "Imagem da galeria"}
          onImagePublished={onMarkGalleryImagePublished}
          instagramContext={instagramContext}
        />
      ) : null}

      <PublishedStoriesWidget
        scheduledPosts={scheduledPosts}
        brandProfile={brandProfile}
      />

      {scheduleModalOpen ? (
        <Suspense fallback={<ViewLoadingFallback />}>
          <SchedulePostModal
            isOpen={scheduleModalOpen}
            onClose={() => {
              setScheduleModalOpen(false);
              setScheduleModalImage(null);
            }}
            onSchedule={(post) => {
              onSchedulePost(post);
              setScheduleModalOpen(false);
              setScheduleModalImage(null);
            }}
            galleryImages={galleryImages}
            campaigns={campaigns}
            initialImage={scheduleModalImage}
          />
        </Suspense>
      ) : null}

      <footer className="fixed bottom-4 left-4 z-[10000] pointer-events-auto hidden lg:flex flex-col items-center gap-2 rounded-2xl bg-black/40 backdrop-blur-2xl border border-border p-2 shadow-[0_25px_90px_rgba(0,0,0,0.7)]">
        <button
          onClick={onEditProfile}
          className="flex items-center justify-center cursor-pointer active:scale-95 transition-transform"
          title={brandProfile.name}
        >
          {brandProfile.logo ? (
            <img
              src={brandProfile.logo}
              alt="Logo"
              className="w-10 h-10 rounded-xl object-cover"
            />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-white">
              <span className="text-sm font-semibold">
                {brandProfile.name.substring(0, 1).toUpperCase()}
              </span>
            </div>
          )}
        </button>

        <button
          onClick={onSignOut}
          className="flex items-center justify-center p-2.5 cursor-pointer text-white hover:text-red-400 active:scale-95 transition-all rounded-xl hover:bg-white/5"
          title="Sair"
        >
          <span className="w-5 h-5" />
        </button>
      </footer>
    </>
  );
}
