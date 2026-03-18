import React, { Suspense, lazy, useMemo } from "react";
import { OnboardingModal } from "@/components/brand/OnboardingModal";
import { SettingsModal } from "@/components/settings/SettingsModal";
import { Loader } from "@/components/common/Loader";
import { Icon } from "@/components/common/Icon";
import { BackgroundJobsIndicator } from "@/components/common/BackgroundJobsIndicator";
import { ToastContainer } from "@/components/common/ToastContainer";
import { OverlayPortal } from "@/components/common/OverlayPortal";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { BrandProfileSetup, useBrandProfileController } from "@/controllers/BrandProfileController";
import { useGalleryController } from "@/controllers/GalleryController";
import { ChatProvider } from "@/contexts/ChatContext";

const ClientFeedback = lazy(() =>
  import("@/feedback/client-feedback").then((module) => ({
    default: module.ClientFeedback,
  }))
);
const Dashboard = lazy(() =>
  import("@/components/dashboard/Dashboard").then((module) => ({
    default: module.Dashboard,
  }))
);
const AssistantPanel = lazy(() =>
  import("@/components/assistant/AssistantPanel").then((module) => ({
    default: module.AssistantPanel,
  }))
);
const AssistantPanelNew = lazy(() =>
  import("@/components/assistant/AssistantPanelNew").then((module) => ({
    default: module.AssistantPanelNew,
  }))
);

const LazyFallback = () => (
  <div className="flex h-full min-h-[220px] w-full items-center justify-center">
    <span className="text-xs text-muted-foreground">Carregando...</span>
  </div>
);

export function MainAppContent() {
  const {
    brandProfile,
    error,
    isAppLoading,
    isEditingProfile,
    saveBrandProfile,
    setIsEditingProfile,
    setShowOnboarding,
    showOnboarding,
    submitBrandProfile,
  } = useBrandProfileController();
  const {
    chatHistory,
    chatReferenceImage,
    editingImage,
    galleryImages,
    handleAssistantSendMessage,
    handleRequestImageEdit,
    handleSetChatReference,
    handleSetChatReferenceSilent,
    handleShowToolEditPreview,
    handleToggleAssistant,
    handleToolEditApproved,
    handleToolEditRejected,
    isAssistantLoading,
    isAssistantOpen,
    pendingToolEdit,
    setIsAssistantOpen,
  } = useGalleryController();

  const chatContextValue = useMemo(
    () => ({
      onSetChatReference: handleSetChatReference,
      isAssistantOpen,
      setIsAssistantOpen,
      renderPreviewChatPanel: () => (
        <Suspense fallback={<LazyFallback />}>
          {import.meta.env.VITE_USE_VERCEL_AI_SDK === "true" ? (
            <AssistantPanelNew
              isOpen
              onClose={() => {
                handleToggleAssistant();
              }}
              referenceImage={chatReferenceImage}
              onClearReference={() => handleSetChatReferenceSilent(null)}
              onUpdateReference={handleSetChatReferenceSilent}
              galleryImages={galleryImages}
              brandProfile={brandProfile ?? undefined}
              pendingToolEdit={pendingToolEdit}
              onRequestImageEdit={handleRequestImageEdit}
              onToolEditApproved={handleToolEditApproved}
              onToolEditRejected={handleToolEditRejected}
              onShowToolEditPreview={handleShowToolEditPreview}
            />
          ) : (
            <AssistantPanel
              isOpen
              onClose={handleToggleAssistant}
              history={chatHistory}
              isLoading={isAssistantLoading}
              onSendMessage={handleAssistantSendMessage}
              referenceImage={chatReferenceImage}
              onClearReference={() => handleSetChatReferenceSilent(null)}
            />
          )}
        </Suspense>
      ),
    }),
    [
      brandProfile,
      chatHistory,
      chatReferenceImage,
      galleryImages,
      handleAssistantSendMessage,
      handleRequestImageEdit,
      handleSetChatReference,
      handleSetChatReferenceSilent,
      handleShowToolEditPreview,
      handleToggleAssistant,
      handleToolEditApproved,
      handleToolEditRejected,
      isAssistantLoading,
      isAssistantOpen,
      pendingToolEdit,
      setIsAssistantOpen,
    ]
  );

  if (isAppLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <Loader size={64} className="text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      {error ? (
        <OverlayPortal>
          <div className="fixed bottom-6 right-6 z-[2147483645] flex max-w-sm items-start space-x-4 rounded-xl border border-red-500/50 bg-surface p-4 animate-fade-in-up">
            <Icon name="x" className="h-4 w-4 text-red-400" />
            <div className="flex-1">
              <p className="text-sm font-bold">Erro</p>
              <p className="text-sm opacity-50">{error}</p>
            </div>
          </div>
        </OverlayPortal>
      ) : null}

      {!brandProfile ? (
        showOnboarding ? (
          <OnboardingModal
            onInviteAccepted={() => window.location.reload()}
            onCreateBrand={() => setShowOnboarding(false)}
          />
        ) : (
          <BrandProfileSetup
            onProfileSubmit={submitBrandProfile}
            existingProfile={null}
          />
        )
      ) : (
        <>
          <SettingsModal
            isOpen={isEditingProfile}
            onClose={() => setIsEditingProfile(false)}
            brandProfile={brandProfile}
            onSaveProfile={saveBrandProfile}
          />
          <ChatProvider value={chatContextValue}>
            <ErrorBoundary resetKeys={[brandProfile.name, editingImage?.id]}>
              <Suspense fallback={<LazyFallback />}>
                <Dashboard />
              </Suspense>
            </ErrorBoundary>
          </ChatProvider>
        </>
      )}

      <Suspense fallback={null}>
        <ClientFeedback />
      </Suspense>
      <BackgroundJobsIndicator isAssistantOpen={isAssistantOpen} />
      <ToastContainer />
    </>
  );
}
