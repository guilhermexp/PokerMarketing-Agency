import React, { Suspense } from "react";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { useBrandProfileController } from "@/controllers/BrandProfileController";
import { useCampaignController } from "@/controllers/CampaignController";
import { useGalleryController } from "@/controllers/GalleryController";
import { ViewLoadingFallback } from "@/components/dashboard/dashboard-shared";
import { lazyWithRetry } from "@/lib/asset-version-recovery";

const GalleryView = lazyWithRetry(() =>
  import("@/components/gallery/GalleryView").then((module) => ({
    default: module.GalleryView,
  }))
);
const CalendarView = lazyWithRetry(() =>
  import("@/components/calendar/CalendarView").then((module) => ({
    default: module.CalendarView,
  }))
);
const CampaignsList = lazyWithRetry(() =>
  import("@/components/campaigns/CampaignsList").then((module) => ({
    default: module.CampaignsList,
  }))
);
const CarouselsList = lazyWithRetry(() =>
  import("@/components/campaigns/CarouselsList").then((module) => ({
    default: module.CarouselsList,
  }))
);
const PlaygroundView = lazyWithRetry(() =>
  import("@/components/playground/PlaygroundView").then((module) => ({
    default: module.PlaygroundView,
  }))
);
const ImagePlaygroundPage = lazyWithRetry(() =>
  import("@/components/image-playground/ImagePlaygroundPage").then((module) => ({
    default: module.ImagePlaygroundPage,
  }))
);

function FeatureSection({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <ErrorBoundary
      fallback={
        <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-border bg-black/30">
          <p className="text-xs text-muted-foreground">
            Falha ao carregar {title}.
          </p>
        </div>
      }
    >
      <Suspense fallback={<ViewLoadingFallback />}>{children}</Suspense>
    </ErrorBoundary>
  );
}

export function DashboardSecondaryViews() {
  const { brandProfile, onViewChange, organizationId, routeView, userId } =
    useBrandProfileController();
  const { campaign, handleCreateCarouselFromPrompt, handleLoadCampaign } =
    useCampaignController();
  const {
    campaigns,
    galleryImages,
    galleryIsLoading,
    handleAddImageToGallery,
    handleDeleteGalleryImage,
    handleDeleteScheduledPost,
    handleMarkGalleryImagePublished: _handleMarkGalleryImagePublished,
    handlePublishToInstagram,
    handleSchedulePost,
    handleAddStyleReference,
    handleRemoveStyleReference,
    handleSelectStyleReference,
    handleSetChatReference,
    handleUpdateGalleryImage,
    handleUpdateScheduledPost,
    handleRetryScheduledPost,
    publishingStates,
    refreshGallery,
    scheduledPosts,
    setQuickPostImage,
    setScheduleModalImage,
    setScheduleModalOpen,
    styleReferences,
  } = useGalleryController();

  if (!brandProfile && (routeView === "carousels" || routeView === "playground")) {
    return null;
  }

  if (routeView === "gallery") {
    return (
      <div className="px-4 py-4 sm:px-6 sm:py-5">
        <FeatureSection title="galeria">
          <GalleryView
            images={galleryImages}
            isLoading={galleryIsLoading}
            onUpdateImage={handleUpdateGalleryImage}
            onDeleteImage={handleDeleteGalleryImage}
            onSetChatReference={handleSetChatReference}
            onRefresh={refreshGallery}
            styleReferences={styleReferences}
            onAddStyleReference={handleAddStyleReference}
            onRemoveStyleReference={handleRemoveStyleReference}
            onSelectStyleReference={handleSelectStyleReference}
            onPublishToCampaign={() => undefined}
            onQuickPost={setQuickPostImage}
            onSchedulePost={(image) => {
              setScheduleModalImage(image);
              setScheduleModalOpen(true);
            }}
          />
        </FeatureSection>
      </div>
    );
  }

  if (routeView === "calendar") {
    return (
      <div className="h-full px-4 py-4 sm:px-6 sm:py-5">
        <FeatureSection title="calendário">
          <CalendarView
            scheduledPosts={scheduledPosts}
            onSchedulePost={handleSchedulePost}
            onUpdateScheduledPost={handleUpdateScheduledPost}
            onDeleteScheduledPost={handleDeleteScheduledPost}
            galleryImages={galleryImages}
            campaigns={campaigns}
            onPublishToInstagram={handlePublishToInstagram}
            onRetryScheduledPost={handleRetryScheduledPost}
            publishingStates={publishingStates}
          />
        </FeatureSection>
      </div>
    );
  }

  if (routeView === "campaigns" && userId) {
    return (
      <div className="px-4 py-4 sm:px-6 sm:py-5">
        <FeatureSection title="campanhas">
          <CampaignsList
            userId={userId}
            organizationId={organizationId}
            onSelectCampaign={handleLoadCampaign}
            onNewCampaign={() => onViewChange("campaign")}
            currentCampaignId={campaign?.id}
          />
        </FeatureSection>
      </div>
    );
  }

  if (routeView === "carousels" && userId) {
    const resolvedBrandProfile = brandProfile;

    return (
      <div className="px-4 py-4 sm:px-6 sm:py-5">
        <FeatureSection title="carrosséis">
          <CarouselsList
            userId={userId}
            organizationId={organizationId}
            brandProfile={resolvedBrandProfile!}
            galleryImages={galleryImages}
            onCreateCarouselFromPrompt={handleCreateCarouselFromPrompt}
            onSelectCampaign={(campaignId) => {
              void handleLoadCampaign(campaignId);
              onViewChange("campaign");
            }}
          />
        </FeatureSection>
      </div>
    );
  }

  if (routeView === "playground") {
    const resolvedBrandProfile = brandProfile;

    return (
      <div className="h-full">
        <FeatureSection title="playground">
          <PlaygroundView
            brandProfile={resolvedBrandProfile!}
            userId={userId ?? undefined}
            onAddImageToGallery={handleAddImageToGallery}
          />
        </FeatureSection>
      </div>
    );
  }

  return (
    <div className="h-full">
      <FeatureSection title="image playground">
        <ImagePlaygroundPage
          userId={userId ?? undefined}
          organizationId={organizationId}
        />
      </FeatureSection>
    </div>
  );
}
