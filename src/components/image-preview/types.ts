/**
 * Image Preview Modal Types
 *
 * Shared types for the image preview components.
 */

import type { RefObject, MouseEvent, TouchEvent, SyntheticEvent } from 'react';
import type { GalleryImage, PendingToolEdit } from '../../types';

// =============================================================================
// Props Types
// =============================================================================

export interface ImagePreviewModalProps {
  image: GalleryImage;
  onClose: () => void;
  onImageUpdate: (newImageUrl: string) => void;
  onSetChatReference?: (image: GalleryImage) => void;
  downloadFilename?: string;
  // Action props
  onQuickPost?: (image: GalleryImage) => void;
  onPublish?: (image: GalleryImage) => void;
  onCloneStyle?: (image: GalleryImage) => void;
  onSchedulePost?: (image: GalleryImage) => void;
  onNavigatePrev?: () => void;
  onNavigateNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  // Tool edit approval props
  pendingToolEdit?: PendingToolEdit | null;
  onToolEditApproved?: (toolCallId: string, imageUrl: string) => void;
  onToolEditRejected?: (toolCallId: string, reason?: string) => void;
  initialEditPreview?: EditPreview | null;
}

// =============================================================================
// Image File Types
// =============================================================================

export interface ImageFile {
  base64: string;
  mimeType: string;
  preview: string;
}

// =============================================================================
// Canvas State Types
// =============================================================================

export interface Dimensions {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export type DrawMode = 'brush' | 'rectangle';

// =============================================================================
// Preview Types
// =============================================================================

export interface ResizedPreview {
  dataUrl: string;
  width: number;
  height: number;
}

export interface EditPreview {
  dataUrl: string;
  type: 'edit' | 'removeBg';
  prompt?: string;
}

// =============================================================================
// Mask Region Types
// =============================================================================

export interface MaskRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  imageWidth: number;
  imageHeight: number;
}

// =============================================================================
// Hook Return Types
// =============================================================================

export interface UseImageCanvasReturn {
  imageCanvasRef: RefObject<HTMLCanvasElement>;
  maskCanvasRef: RefObject<HTMLCanvasElement>;
  containerRef: RefObject<HTMLDivElement>;
  originalDimensions: Dimensions;
  displayDimensions: Dimensions;
  isLoadingImage: boolean;
  imageLoadError: string | null;
  isDrawing: boolean;
  startDrawing: (e: CanvasEvent) => void;
  draw: (e: CanvasEvent) => void;
  stopDrawing: () => void;
  clearMask: () => void;
  getMaskData: () => { base64: string; mimeType: string } | undefined;
  getMaskRegion: () => MaskRegion | undefined;
  redrawCanvas: () => void;
  brushSize: number;
  setBrushSize: (size: number) => void;
}

export interface UseProtectionCanvasReturn {
  protectionCanvasRef: RefObject<HTMLCanvasElement>;
  isDrawingProtection: boolean;
  useProtectionMask: boolean;
  setUseProtectionMask: (enabled: boolean) => void;
  drawMode: DrawMode;
  setDrawMode: (mode: DrawMode) => void;
  startProtectionDrawing: (e: CanvasEvent) => void;
  drawProtection: (e: CanvasEvent) => void;
  stopProtectionDrawing: () => void;
  clearProtectionMask: () => void;
  hasProtectionDrawing: () => boolean;
}

export interface UseImageResizeReturn {
  widthPercent: number;
  heightPercent: number;
  isResizing: boolean;
  resizeProgress: number;
  resizedPreview: ResizedPreview | null;
  handleResize: (newWidthPercent: number, newHeightPercent: number) => void;
  handleSaveResize: () => Promise<void>;
  handleDiscardResize: () => void;
}

export interface UseAiEditReturn {
  editPrompt: string;
  setEditPrompt: (prompt: string) => void;
  referenceImage: ImageFile | null;
  setReferenceImage: (image: ImageFile | null) => void;
  isEditing: boolean;
  isRemovingBackground: boolean;
  editPreview: EditPreview | null;
  handleEdit: () => Promise<void>;
  handleRemoveBackground: () => Promise<void>;
  handleSaveEdit: () => Promise<void>;
  handleDiscardEdit: () => void;
}

export interface UseTextDetectionReturn {
  isDetectingText: boolean;
  detectProgress: number;
  handleAutoDetectText: () => Promise<void>;
}

export interface UseImageCropReturn {
  cropAspect: 'original' | '1:1' | '4:5' | '16:9';
  setCropAspect: (aspect: 'original' | '1:1' | '4:5' | '16:9') => void;
  isCropping: boolean;
  handleApplyCrop: () => Promise<void>;
  handleResetCrop: () => void;
}

export interface UseImageFiltersReturn {
  filterPreset: 'none' | 'bw' | 'warm' | 'cool' | 'vivid';
  setFilterPreset: (preset: 'none' | 'bw' | 'warm' | 'cool' | 'vivid') => void;
  isApplyingFilter: boolean;
  filterStyle: string;
  handleApplyFilter: () => Promise<void>;
  handleResetFilter: () => void;
}

export interface UseVideoPlayerReturn {
  videoRef: RefObject<HTMLVideoElement>;
  videoDimensions: Dimensions | null;
  isVerticalVideo: boolean;
  handleLoadedMetadata: (event: SyntheticEvent<HTMLVideoElement>) => void;
}

// =============================================================================
// Utility Types
// =============================================================================

export type CanvasEvent = MouseEvent<HTMLCanvasElement> | TouchEvent<HTMLCanvasElement>;

/**
 * Helper to convert File to ImageFile
 */
export const fileToImageFile = (file: File): Promise<ImageFile> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve({
        base64,
        mimeType: file.type,
        preview: URL.createObjectURL(file),
      });
    };
    reader.onerror = (error) => reject(error);
  });
