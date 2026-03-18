import React from "react";
import { ExportVideoModal } from "../../common/ExportVideoModal";
import { ImagePreviewModal } from "../../common/ImagePreviewModal";
import type { GalleryImage } from "../../../types";
import type { ExportProgress } from "../../../services/ffmpegService";

interface ClipCardMediaModalsProps {
  clipTitle: string;
  editingSceneImage: { sceneNumber: number; image: GalleryImage } | null;
  editingThumbnail: GalleryImage | null;
  exportProgress: ExportProgress | null;
  isExportModalOpen: boolean;
  onCloseEditingSceneImage: () => void;
  onCloseEditingThumbnail: () => void;
  onCloseExportModal: () => void;
  onSceneImageUpdate: (newSrc: string) => void;
  onSetChatReference: (image: GalleryImage | null) => void;
  onThumbnailUpdate: (newSrc: string) => void;
  onQuickPost?: (image: GalleryImage) => void;
  onSchedulePost?: (image: GalleryImage) => void;
}

export function ClipCardMediaModals({
  clipTitle,
  editingSceneImage,
  editingThumbnail,
  exportProgress,
  isExportModalOpen,
  onCloseEditingSceneImage,
  onCloseEditingThumbnail,
  onCloseExportModal,
  onQuickPost,
  onSceneImageUpdate,
  onSchedulePost,
  onSetChatReference,
  onThumbnailUpdate,
}: ClipCardMediaModalsProps) {
  return (
    <>
      {editingThumbnail ? (
        <ImagePreviewModal
          image={editingThumbnail}
          onClose={onCloseEditingThumbnail}
          onImageUpdate={onThumbnailUpdate}
          onSetChatReference={onSetChatReference}
          downloadFilename={`thumbnail-${clipTitle.toLowerCase().replace(/\s+/g, "_")}.png`}
          onQuickPost={onQuickPost}
          onSchedulePost={onSchedulePost}
        />
      ) : null}

      {editingSceneImage ? (
        <ImagePreviewModal
          image={editingSceneImage.image}
          onClose={onCloseEditingSceneImage}
          onImageUpdate={onSceneImageUpdate}
          onSetChatReference={onSetChatReference}
          downloadFilename={`cena-${editingSceneImage.sceneNumber}-${clipTitle.toLowerCase().replace(/\s+/g, "_")}.png`}
          onQuickPost={onQuickPost}
          onSchedulePost={onSchedulePost}
        />
      ) : null}

      <ExportVideoModal
        isOpen={isExportModalOpen}
        onClose={onCloseExportModal}
        progress={exportProgress}
      />
    </>
  );
}
