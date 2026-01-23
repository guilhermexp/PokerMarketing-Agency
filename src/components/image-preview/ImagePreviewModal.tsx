/**
 * ImagePreviewModal
 *
 * Container for the image preview and editing experience.
 * REFATORADO: Agora usa a nova arquitetura com ImagePreviewOverlay
 */

import React, { useState, useEffect } from 'react';
import type { ImagePreviewModalProps } from './types';
import type { ImageFile } from './types.ts';
import { ImagePreviewOverlay } from './overlay/ImagePreviewOverlay';
import { useChatContext } from '../../contexts/ChatContext';
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
  onSetChatReferenceSilent,
  downloadFilename,
  onQuickPost,
  onPublish,
  onCloneStyle: _onCloneStyle,
  onSchedulePost,
  onNavigatePrev,
  onNavigateNext,
  hasPrev,
  hasNext,
  pendingToolEdit,
  onToolEditApproved,
  onToolEditRejected,
  initialEditPreview,
  chatComponent,
}) => {
  const chatContext = useChatContext();
  const resolvedChatComponent = chatComponent ?? chatContext?.renderPreviewChatPanel?.();

  const [error, setError] = useState<string | null>(null);
  // Editor state - controlled by this component
  const [editPrompt, setEditPrompt] = useState('');
  const [referenceImage, setReferenceImage] = useState<ImageFile | null>(null);

  // Tool approval mode detection
  const isToolApprovalMode = Boolean(pendingToolEdit);

  const {
    imageCanvasRef,
    maskCanvasRef,
    containerRef,
    originalDimensions,
    isLoadingImage,
    imageLoadError,
    startDrawing,
    draw,
    stopDrawing,
    clearMask,
    getMaskData,
    getMaskRegion,
    redrawCanvas,
    brushSize,
    setBrushSize,
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
    // Tool approval mode
    pendingToolEdit,
    onToolEditComplete: (imageUrl: string) => {
      if (isToolApprovalMode && onToolEditApproved && pendingToolEdit) {
        onToolEditApproved(pendingToolEdit.toolCallId, imageUrl);
      }
    },
    initialEditPreview,
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

  // Reset editor state when image actually changes (not just reloaded)
  const prevImageSrcRef = React.useRef<string | null>(null);
  useEffect(() => {
    if (prevImageSrcRef.current !== image.src) {
      prevImageSrcRef.current = image.src;
      setEditPrompt('');
      setReferenceImage(null);
    }
  }, [image.src]);

  const isActionRunning =
    isEditing || isRemovingBackground || isResizing || isCropping || isApplyingFilter;

  const isVideo =
    image.src?.endsWith('.mp4') ||
    image.src?.includes('video') ||
    image.source?.startsWith('Video-');

  return (
    <ImagePreviewOverlay
      visible={true}
      image={image}
      onClose={onClose}
      onImageUpdate={onImageUpdate}
      onSetChatReference={onSetChatReference}
      onSetChatReferenceSilent={onSetChatReferenceSilent}
      downloadFilename={downloadFilename}
      onQuickPost={onQuickPost ? () => onQuickPost(image) : undefined}
      onPublish={onPublish ? () => onPublish(image) : undefined}
      onSchedulePost={onSchedulePost ? () => onSchedulePost(image) : undefined}
      pendingToolEdit={pendingToolEdit}
      onToolEditApproved={onToolEditApproved}
      onToolEditRejected={onToolEditRejected}
      initialEditPreview={initialEditPreview}
      // Canvas refs and handlers
      imageCanvasRef={imageCanvasRef}
      maskCanvasRef={maskCanvasRef}
      protectionCanvasRef={protectionCanvasRef}
      startDrawing={startDrawing}
      draw={draw}
      stopDrawing={stopDrawing}
      startProtectionDrawing={startProtectionDrawing}
      drawProtection={drawProtection}
      stopProtectionDrawing={stopProtectionDrawing}
      isLoadingImage={isLoadingImage}
      imageLoadError={imageLoadError}
      // Video props
      videoRef={videoRef}
      handleLoadedMetadata={handleLoadedMetadata}
      // Editor state props
      editPrompt={editPrompt}
      setEditPrompt={setEditPrompt}
      referenceImage={referenceImage}
      setReferenceImage={setReferenceImage}
      brushSize={brushSize}
      setBrushSize={setBrushSize}
      // Resize props
      originalDimensions={originalDimensions}
      widthPercent={widthPercent}
      heightPercent={heightPercent}
      isResizing={isResizing}
      resizeProgress={resizeProgress}
      resizedPreview={resizedPreview}
      handleResize={handleResize}
      handleSaveResize={handleSaveResize}
      handleDiscardResize={handleDiscardResize}
      // Protection props
      useProtectionMask={useProtectionMask}
      drawMode={drawMode}
      setUseProtectionMask={setUseProtectionMask}
      setDrawMode={setDrawMode}
      handleAutoDetectText={handleAutoDetectText}
      isDetectingText={isDetectingText}
      detectProgress={detectProgress}
      hasProtectionDrawing={hasProtectionDrawing}
      clearProtectionMask={clearProtectionMask}
      // Crop & Filter props
      cropAspect={cropAspect}
      setCropAspect={setCropAspect}
      isCropping={isCropping}
      handleApplyCrop={handleApplyCrop}
      handleResetCrop={handleResetCrop}
      filterPreset={filterPreset}
      setFilterPreset={setFilterPreset}
      isApplyingFilter={isApplyingFilter}
      handleApplyFilter={handleApplyFilter}
      handleResetFilter={handleResetFilter}
      filterStyle={filterStyle}
      // Video props
      videoDimensions={videoDimensions}
      isVerticalVideo={isVerticalVideo}
      // Edit preview props
      editPreview={editPreview}
      isEditing={isEditing}
      isRemovingBackground={isRemovingBackground}
      isActionRunning={isActionRunning}
      clearMask={clearMask}
      handleRemoveBackground={handleRemoveBackground}
      handleEdit={handleEdit}
      handleDiscardEdit={handleDiscardEdit}
      handleSaveEdit={handleSaveEdit}
      // Error
      error={error}
      // Chat
      chatComponent={resolvedChatComponent}
    />
  );
};
