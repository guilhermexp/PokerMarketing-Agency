import React, { useState } from "react";
import type {
  VideoClipScript,
  BrandProfile,
  GalleryImage,
  ImageModel,
  StyleReference,
  ScheduledPost,
  ImageFile,
} from "../../types";
import { QuickPostModal } from "../common/QuickPostModal";
import { SchedulePostModal } from "../calendar/SchedulePostModal";
import type { InstagramContext } from "../../services/rubeService";

import { ClipCard } from "./clips/ClipCard";
import { useClipsTab } from "./clips/useClipsTab";

export interface ClipsTabProps {
  videoClipScripts: VideoClipScript[];
  brandProfile: BrandProfile;
  onAddImageToGallery: (image: Omit<GalleryImage, "id">) => GalleryImage;
  onUpdateGalleryImage: (imageId: string, newImageSrc: string) => void;
  onSetChatReference: (image: GalleryImage | null) => void;
  styleReferences?: StyleReference[];
  onAddStyleReference?: (ref: Omit<StyleReference, "id" | "createdAt">) => void;
  onRemoveStyleReference?: (id: string) => void;
  userId?: string | null;
  galleryImages?: GalleryImage[];
  campaignId?: string;
  // Instagram & Scheduling
  instagramContext?: InstagramContext;
  onSchedulePost?: (
    post: Omit<ScheduledPost, "id" | "createdAt" | "updatedAt">,
  ) => void;
  productImages?: ImageFile[] | null;
  selectedImageModel: ImageModel;
  onChangeSelectedImageModel: (model: ImageModel) => void;
}

export const ClipsTab = React.memo<ClipsTabProps>(function ClipsTab({
  videoClipScripts,
  brandProfile,
  onAddImageToGallery,
  onUpdateGalleryImage,
  onSetChatReference,
  styleReferences,
  onAddStyleReference,
  onRemoveStyleReference,
  userId,
  galleryImages,
  campaignId,
  instagramContext,
  onSchedulePost,
  productImages,
  selectedImageModel,
  onChangeSelectedImageModel,
}) {
  // QuickPost and Schedule modals
  const [quickPostImage, setQuickPostImage] = useState<GalleryImage | null>(
    null,
  );
  const [scheduleImage, setScheduleImage] = useState<GalleryImage | null>(null);

  const {
    thumbnails,
    extraInstructions,
    setExtraInstructions,
    generationState,
    generatingAllForClip,
    sceneImageTriggers,
    handleGenerateThumbnail,
    handleGenerateAllForClip,
  } = useClipsTab({
    videoClipScripts,
    brandProfile,
    galleryImages,
    userId,
    onAddImageToGallery,
    onUpdateGalleryImage,
    productImages,
  });

  return (
    <div className="space-y-6">
      {/* Clips */}
      {videoClipScripts.map((clip, index) => (
        <ClipCard
          key={index}
          clip={clip}
          brandProfile={brandProfile}
          thumbnail={thumbnails[index]}
          isGeneratingThumbnail={generationState.isGenerating[index]}
          onGenerateThumbnail={(model: ImageModel) =>
            handleGenerateThumbnail(index, extraInstructions[index], model)
          }
          onRegenerateThumbnail={(model: ImageModel) =>
            handleGenerateThumbnail(index, extraInstructions[index], model)
          }
          extraInstruction={extraInstructions[index] || ""}
          onExtraInstructionChange={(value) => {
            setExtraInstructions((prev) => {
              const next = [...prev];
              next[index] = value;
              return next;
            });
          }}
          onUpdateGalleryImage={onUpdateGalleryImage}
          onSetChatReference={onSetChatReference}
          selectedImageModel={selectedImageModel}
          onChangeSelectedImageModel={onChangeSelectedImageModel}
          styleReferences={styleReferences}
          onAddStyleReference={onAddStyleReference}
          onRemoveStyleReference={onRemoveStyleReference}
          triggerSceneImageGeneration={sceneImageTriggers[index]}
          onAddImageToGallery={onAddImageToGallery}
          galleryImages={galleryImages}
          campaignId={campaignId}
          onGenerateAllClipImages={(model: ImageModel) =>
            handleGenerateAllForClip(index, model)
          }
          isGeneratingAllClipImages={generatingAllForClip === index}
          onQuickPost={setQuickPostImage}
          onSchedulePost={onSchedulePost ? setScheduleImage : undefined}
          userId={userId}
          productImages={productImages}
        />
      ))}

      {/* QuickPost Modal */}
      {quickPostImage && (
        <QuickPostModal
          isOpen={!!quickPostImage}
          onClose={() => setQuickPostImage(null)}
          image={quickPostImage}
          brandProfile={brandProfile}
          context={quickPostImage.prompt || "Imagem do clip"}
          instagramContext={instagramContext}
        />
      )}

      {/* Schedule Modal */}
      {scheduleImage && onSchedulePost && (
        <SchedulePostModal
          isOpen={!!scheduleImage}
          onClose={() => setScheduleImage(null)}
          onSchedule={(post) => {
            onSchedulePost(post);
            setScheduleImage(null);
          }}
          galleryImages={galleryImages || []}
          initialImage={scheduleImage}
        />
      )}
    </div>
  );
});
