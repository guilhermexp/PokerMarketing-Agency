/**
 * ImagePreviewModal
 *
 * Container for the image preview and editing experience.
 */

import React, { useState, useEffect } from 'react';
import { downloadImage } from '../../utils/imageHelpers';
import type { ImagePreviewModalProps } from './types';
import type { ImageFile } from './types.ts';
import { ImagePreviewHeader } from './ImagePreviewHeader';
import { ImageViewer } from './ImageViewer';
import { ImageEditor } from './ImageEditor';
import { useAiEdit } from './hooks/useAiEdit';
import { useImageCanvas } from './hooks/useImageCanvas';
import { useImageResize } from './hooks/useImageResize';
import { useImageCrop } from './hooks/useImageCrop';
import { useImageFilters } from './hooks/useImageFilters';
import { useProtectionCanvas } from './hooks/useProtectionCanvas';
import { useTextDetection } from './hooks/useTextDetection';
import { useVideoPlayer } from './hooks/useVideoPlayer';

export const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({
  image,
  onClose,
  onImageUpdate,
  onSetChatReference,
  downloadFilename,
  onQuickPost,
  onPublish,
  onCloneStyle: _onCloneStyle,
  onSchedulePost,
  onNavigatePrev,
  onNavigateNext,
  hasPrev,
  hasNext,
}) => {
  const [error, setError] = useState<string | null>(null);
  // Editor state - controlled by this component
  const [editPrompt, setEditPrompt] = useState('');
  const [referenceImage, setReferenceImage] = useState<ImageFile | null>(null);

  const {
    imageCanvasRef,
    maskCanvasRef,
    containerRef,
    originalDimensions,
    displayDimensions,
    isLoadingImage,
    imageLoadError,
    startDrawing,
    draw,
    stopDrawing,
    clearMask,
    getMaskData,
    getMaskRegion,
    redrawCanvas,
  } = useImageCanvas({ imageSrc: image.src });

  const {
    protectionCanvasRef,
    useProtectionMask,
    setUseProtectionMask,
    drawMode,
    setDrawMode,
    startProtectionDrawing,
    drawProtection,
    stopProtectionDrawing,
    clearProtectionMask,
    hasProtectionDrawing,
  } = useProtectionCanvas({ originalDimensions });

  const { isDetectingText, detectProgress, handleAutoDetectText } = useTextDetection({
    imageSrc: image.src,
    protectionCanvasRef,
    setUseProtectionMask,
    setError,
  });

  const {
    isEditing,
    isRemovingBackground,
    editPreview,
    handleEdit,
    handleRemoveBackground,
    handleSaveEdit,
    handleDiscardEdit,
  } = useAiEdit({
    imageSrc: image.src,
    getMaskData,
    getMaskRegion,
    clearMask,
    onImageUpdate,
    redrawCanvas,
    setError,
    editPrompt,
    setEditPrompt,
    referenceImage,
    setReferenceImage,
    resetEditorState: () => {
      setEditPrompt('');
      setReferenceImage(null);
    },
  });

  const {
    widthPercent,
    heightPercent,
    isResizing,
    resizeProgress,
    resizedPreview,
    handleResize,
    handleSaveResize,
    handleDiscardResize,
  } = useImageResize({
    imageSrc: image.src,
    useProtectionMask,
    protectionCanvasRef,
    onImageUpdate,
    redrawCanvas,
    setError,
  });

  const {
    cropAspect,
    setCropAspect,
    isCropping,
    handleApplyCrop,
    handleResetCrop,
  } = useImageCrop({
    imageSrc: image.src,
    onImageUpdate,
    redrawCanvas,
    setError,
  });

  const {
    filterPreset,
    setFilterPreset,
    isApplyingFilter,
    filterStyle,
    handleApplyFilter,
    handleResetFilter,
  } = useImageFilters({
    imageSrc: image.src,
    onImageUpdate,
    redrawCanvas,
    setError,
  });

  const { videoRef, videoDimensions, isVerticalVideo, handleLoadedMetadata } =
    useVideoPlayer({ src: image.src });

  const isVideo =
    image.src?.endsWith('.mp4') ||
    image.src?.includes('video') ||
    image.source?.startsWith('Video-');

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Reset editor state when image actually changes (not just reloaded)
  const prevImageSrcRef = React.useRef<string | null>(null);
  useEffect(() => {
    if (prevImageSrcRef.current !== image.src) {
      prevImageSrcRef.current = image.src;
      setEditPrompt('');
      setReferenceImage(null);
    }
  }, [image.src]);

  const handleDownload = () => {
    downloadImage(image.src, downloadFilename || 'edited-image.png');
  };

  const handleUseInChat = () => {
    onSetChatReference(image);
    onClose();
  };

  const isActionRunning =
    isEditing || isRemovingBackground || isResizing || isCropping || isApplyingFilter;

  return (
    <div
      className="fixed inset-0 bg-black/95 flex items-center justify-center z-[60] p-3 md:p-6"
      onClick={onClose}
    >
      <div
        className="bg-[#0a0a0a] rounded-2xl w-full max-w-7xl h-[95vh] flex flex-col overflow-hidden border border-white/[0.06] relative shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <ImagePreviewHeader
          image={image}
          onClose={onClose}
          onQuickPost={onQuickPost}
          onPublish={onPublish}
          onSchedulePost={onSchedulePost}
          onUseInChat={handleUseInChat}
          onDownload={handleDownload}
        />

        <div className="flex-grow flex flex-col lg:flex-row overflow-hidden min-h-0 min-w-0">
          <ImageViewer
            image={image}
            isVideo={isVideo}
            videoRef={videoRef}
            isVerticalVideo={isVerticalVideo}
            handleLoadedMetadata={handleLoadedMetadata}
            resizedPreview={resizedPreview}
            editPreview={editPreview}
            originalDimensions={originalDimensions}
            displayDimensions={displayDimensions}
            isLoadingImage={isLoadingImage}
            imageLoadError={imageLoadError}
            imageCanvasRef={imageCanvasRef}
            maskCanvasRef={maskCanvasRef}
            protectionCanvasRef={protectionCanvasRef}
            containerRef={containerRef}
            useProtectionMask={useProtectionMask}
            drawMode={drawMode}
            startDrawing={startDrawing}
            draw={draw}
            stopDrawing={stopDrawing}
            startProtectionDrawing={startProtectionDrawing}
            drawProtection={drawProtection}
            stopProtectionDrawing={stopProtectionDrawing}
            isActionRunning={isActionRunning}
            isResizing={isResizing}
            resizeProgress={resizeProgress}
            filterStyle={filterStyle}
            onNavigatePrev={onNavigatePrev}
            onNavigateNext={onNavigateNext}
            hasPrev={hasPrev}
            hasNext={hasNext}
          />

          <ImageEditor
            sidebar={{
              image,
              isVideo,
              videoDimensions,
              isVerticalVideo,
              originalDimensions,
              widthPercent,
              heightPercent,
              isResizing,
              resizeProgress,
              resizedPreview,
              handleResize,
              handleSaveResize,
              handleDiscardResize,
              useProtectionMask,
              drawMode,
              setUseProtectionMask,
              setDrawMode,
              handleAutoDetectText,
              isDetectingText,
              detectProgress,
              hasProtectionDrawing,
              clearProtectionMask,
              editPrompt,
              setEditPrompt,
              referenceImage,
              setReferenceImage,
              editPreview,
              error,
              cropAspect,
              setCropAspect,
              isCropping,
              handleApplyCrop,
              handleResetCrop,
              filterPreset,
              setFilterPreset,
              isApplyingFilter,
              handleApplyFilter,
              handleResetFilter,
            }}
            footer={{
              isVideo,
              editPreview,
              isEditing,
              isRemovingBackground,
              isActionRunning,
              editPrompt,
              clearMask,
              handleRemoveBackground,
              handleEdit,
              handleDiscardEdit,
              handleSaveEdit,
            }}
            mobileActions={{
              image,
              onQuickPost,
              onSchedulePost,
              onClose,
            }}
          />
        </div>
      </div>
    </div>
  );
};
