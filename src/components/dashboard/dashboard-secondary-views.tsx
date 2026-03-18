import React, { Suspense, lazy } from "react";
import type { DbCampaign } from "../../services/apiClient";
import type { DashboardProps, View } from "./dashboard-shared";
import { ViewLoadingFallback } from "./dashboard-shared";

const GalleryView = lazy(() =>
  import("../gallery/GalleryView").then((m) => ({ default: m.GalleryView })),
);
const CalendarView = lazy(() =>
  import("../calendar/CalendarView").then((m) => ({ default: m.CalendarView })),
);
const CampaignsList = lazy(() =>
  import("../campaigns/CampaignsList").then((m) => ({ default: m.CampaignsList })),
);
const CarouselsList = lazy(() =>
  import("../campaigns/CarouselsList").then((m) => ({ default: m.CarouselsList })),
);
const PlaygroundView = lazy(() =>
  import("../playground/PlaygroundView").then((m) => ({ default: m.PlaygroundView })),
);
const ImagePlaygroundPage = lazy(() =>
  import("../image-playground/ImagePlaygroundPage").then((m) => ({
    default: m.ImagePlaygroundPage,
  })),
);

interface DashboardSecondaryViewsProps {
  activeView: Exclude<View, "campaign" | "flyer">;
  brandProfile: DashboardProps["brandProfile"];
  campaign: DashboardProps["campaign"];
  campaigns: DbCampaign[];
  galleryImages: DashboardProps["galleryImages"];
  galleryIsLoading?: DashboardProps["galleryIsLoading"];
  onAddImageToGallery: DashboardProps["onAddImageToGallery"];
  onCreateCarouselFromPrompt?: DashboardProps["onCreateCarouselFromPrompt"];
  onDeleteGalleryImage?: DashboardProps["onDeleteGalleryImage"];
  onDeleteScheduledPost: DashboardProps["onDeleteScheduledPost"];
  onLoadCampaign: DashboardProps["onLoadCampaign"];
  onMarkGalleryImagePublished?: DashboardProps["onMarkGalleryImagePublished"];
  onPublishToInstagram: DashboardProps["onPublishToInstagram"];
  onRefreshGallery?: DashboardProps["onRefreshGallery"];
  onRetryScheduledPost?: DashboardProps["onRetryScheduledPost"];
  onSchedulePost: DashboardProps["onSchedulePost"];
  onSelectStyleReference: DashboardProps["onSelectStyleReference"];
  onSetQuickPostImage: (image: DashboardProps["galleryImages"][number]) => void;
  onSetScheduleModalImage: (image: DashboardProps["galleryImages"][number]) => void;
  onSetScheduleModalOpen: (value: boolean) => void;
  onSetChatReference: DashboardProps["onSetChatReference"];
  onUpdateGalleryImage: DashboardProps["onUpdateGalleryImage"];
  onUpdateScheduledPost: DashboardProps["onUpdateScheduledPost"];
  organizationId?: DashboardProps["organizationId"];
  publishingStates: DashboardProps["publishingStates"];
  scheduledPosts: DashboardProps["scheduledPosts"];
  styleReferences: DashboardProps["styleReferences"];
  userId?: DashboardProps["userId"];
  onViewChange: DashboardProps["onViewChange"];
}

export function DashboardSecondaryViews({
  activeView,
  brandProfile,
  campaign,
  campaigns,
  galleryImages,
  galleryIsLoading,
  onAddImageToGallery,
  onCreateCarouselFromPrompt,
  onDeleteGalleryImage,
  onDeleteScheduledPost,
  onLoadCampaign,
  onMarkGalleryImagePublished,
  onPublishToInstagram,
  onRefreshGallery,
  onRetryScheduledPost,
  onSchedulePost,
  onSelectStyleReference,
  onSetQuickPostImage,
  onSetScheduleModalImage,
  onSetScheduleModalOpen,
  onSetChatReference,
  onUpdateGalleryImage,
  onUpdateScheduledPost,
  organizationId,
  publishingStates,
  scheduledPosts,
  styleReferences,
  userId,
  onViewChange,
}: DashboardSecondaryViewsProps) {
  if (activeView === "gallery") {
    return (
      <div className="px-4 py-4 sm:px-6 sm:py-5">
        <Suspense fallback={<ViewLoadingFallback />}>
          <GalleryView
            images={galleryImages}
            isLoading={galleryIsLoading}
            onUpdateImage={onUpdateGalleryImage}
            onDeleteImage={onDeleteGalleryImage}
            onSetChatReference={onSetChatReference}
            onRefresh={onRefreshGallery}
            styleReferences={styleReferences}
            onAddStyleReference={() => undefined}
            onRemoveStyleReference={() => undefined}
            onSelectStyleReference={onSelectStyleReference}
            onPublishToCampaign={() => undefined}
            onQuickPost={onSetQuickPostImage}
            onSchedulePost={(image) => {
              onSetScheduleModalImage(image);
              onSetScheduleModalOpen(true);
            }}
          />
        </Suspense>
      </div>
    );
  }

  if (activeView === "calendar") {
    return (
      <div className="px-4 py-4 sm:px-6 sm:py-5 h-full">
        <Suspense fallback={<ViewLoadingFallback />}>
          <CalendarView
            scheduledPosts={scheduledPosts}
            onSchedulePost={onSchedulePost}
            onUpdateScheduledPost={onUpdateScheduledPost}
            onDeleteScheduledPost={onDeleteScheduledPost}
            galleryImages={galleryImages}
            campaigns={campaigns}
            onPublishToInstagram={onPublishToInstagram}
            onRetryScheduledPost={onRetryScheduledPost}
            publishingStates={publishingStates}
          />
        </Suspense>
      </div>
    );
  }

  if (activeView === "campaigns" && userId) {
    return (
      <div className="px-4 py-4 sm:px-6 sm:py-5">
        <Suspense fallback={<ViewLoadingFallback />}>
          <CampaignsList
            userId={userId}
            organizationId={organizationId}
            onSelectCampaign={onLoadCampaign}
            onNewCampaign={() => onViewChange("campaign")}
            currentCampaignId={campaign?.id}
          />
        </Suspense>
      </div>
    );
  }

  if (activeView === "carousels" && userId) {
    return (
      <div className="px-4 py-4 sm:px-6 sm:py-5">
        <Suspense fallback={<ViewLoadingFallback />}>
          <CarouselsList
            userId={userId}
            organizationId={organizationId}
            brandProfile={brandProfile}
            galleryImages={galleryImages}
            onCreateCarouselFromPrompt={onCreateCarouselFromPrompt}
            onSelectCampaign={(campaignId) => {
              onLoadCampaign(campaignId);
              onViewChange("campaign");
            }}
          />
        </Suspense>
      </div>
    );
  }

  if (activeView === "playground") {
    return (
      <div className="h-full">
        <Suspense fallback={<ViewLoadingFallback />}>
          <PlaygroundView
            brandProfile={brandProfile}
            userId={userId}
            onAddImageToGallery={onAddImageToGallery}
          />
        </Suspense>
      </div>
    );
  }

  return (
    <div className="h-full">
      <Suspense fallback={<ViewLoadingFallback />}>
        <ImagePlaygroundPage userId={userId} organizationId={organizationId} />
      </Suspense>
    </div>
  );
}
