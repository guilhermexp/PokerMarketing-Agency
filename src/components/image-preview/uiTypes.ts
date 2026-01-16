/**
 * Image preview UI prop types.
 */

import type {
  RefObject,
  SyntheticEvent,
  MouseEvent,
  TouchEvent,
} from 'react';
import type { GalleryImage } from '../../types';
import type { Dimensions, EditPreview, ImageFile, ResizedPreview } from './types';

export interface ImagePreviewHeaderProps {
  image: GalleryImage;
  onClose: () => void;
  onQuickPost?: (image: GalleryImage) => void;
  onPublish?: (image: GalleryImage) => void;
  onSchedulePost?: (image: GalleryImage) => void;
  onUseInChat: () => void;
  onDownload: () => void;
}

export interface ImageExportProps {
  onDownload: () => void;
}

export interface ImagePreviewCanvasProps {
  image: GalleryImage;
  isVideo: boolean;
  videoRef: RefObject<HTMLVideoElement>;
  isVerticalVideo: boolean;
  handleLoadedMetadata: (event: SyntheticEvent<HTMLVideoElement>) => void;
  resizedPreview: ResizedPreview | null;
  editPreview: EditPreview | null;
  originalDimensions: Dimensions;
  isLoadingImage: boolean;
  imageLoadError: string | null;
  imageCanvasRef: RefObject<HTMLCanvasElement>;
  maskCanvasRef: RefObject<HTMLCanvasElement>;
  protectionCanvasRef: RefObject<HTMLCanvasElement>;
  useProtectionMask: boolean;
  drawMode: 'brush' | 'rectangle';
  startDrawing: (e: MouseEvent<HTMLCanvasElement> | TouchEvent<HTMLCanvasElement>) => void;
  draw: (e: MouseEvent<HTMLCanvasElement> | TouchEvent<HTMLCanvasElement>) => void;
  stopDrawing: () => void;
  startProtectionDrawing: (e: MouseEvent<HTMLCanvasElement> | TouchEvent<HTMLCanvasElement>) => void;
  drawProtection: (e: MouseEvent<HTMLCanvasElement> | TouchEvent<HTMLCanvasElement>) => void;
  stopProtectionDrawing: () => void;
  isActionRunning: boolean;
  isResizing: boolean;
  resizeProgress: number;
  filterStyle?: string;
}

export interface ImagePreviewSidebarProps {
  image: GalleryImage;
  isVideo: boolean;
  videoDimensions: Dimensions | null;
  isVerticalVideo: boolean;
  originalDimensions: Dimensions;
  widthPercent: number;
  heightPercent: number;
  isResizing: boolean;
  resizeProgress: number;
  resizedPreview: ResizedPreview | null;
  handleResize: (newWidthPercent: number, newHeightPercent: number) => void;
  handleSaveResize: () => Promise<void>;
  handleDiscardResize: () => void;
  useProtectionMask: boolean;
  drawMode: 'brush' | 'rectangle';
  setUseProtectionMask: (enabled: boolean) => void;
  setDrawMode: (mode: 'brush' | 'rectangle') => void;
  handleAutoDetectText: () => Promise<void>;
  isDetectingText: boolean;
  detectProgress: number;
  hasProtectionDrawing: () => boolean;
  clearProtectionMask: () => void;
  editPrompt: string;
  setEditPrompt: (prompt: string) => void;
  referenceImage: ImageFile | null;
  setReferenceImage: (image: ImageFile | null) => void;
  brushSize: number;
  setBrushSize: (size: number) => void;
  editPreview: EditPreview | null;
  error: string | null;
  cropAspect: 'original' | '1:1' | '4:5' | '16:9';
  setCropAspect: (aspect: 'original' | '1:1' | '4:5' | '16:9') => void;
  isCropping: boolean;
  handleApplyCrop: () => Promise<void>;
  handleResetCrop: () => void;
  filterPreset: 'none' | 'bw' | 'warm' | 'cool' | 'vivid';
  setFilterPreset: (preset: 'none' | 'bw' | 'warm' | 'cool' | 'vivid') => void;
  isApplyingFilter: boolean;
  handleApplyFilter: () => Promise<void>;
  handleResetFilter: () => void;
}

export interface ImagePreviewFooterProps {
  isVideo: boolean;
  editPreview: EditPreview | null;
  isEditing: boolean;
  isRemovingBackground: boolean;
  isActionRunning: boolean;
  editPrompt: string;
  clearMask: () => void;
  handleRemoveBackground: () => Promise<void>;
  handleEdit: () => Promise<void>;
  handleDiscardEdit: () => void;
  handleSaveEdit: () => Promise<void>;
  // Tool approval mode
  isToolApprovalMode?: boolean;
  onApprove?: () => void;
  onReject?: () => void;
}

export interface ImagePreviewMobileActionsProps {
  image: GalleryImage;
  onQuickPost?: (image: GalleryImage) => void;
  onSchedulePost?: (image: GalleryImage) => void;
  onClose: () => void;
}

export interface CropAndFilterSectionProps {
  cropAspect: 'original' | '1:1' | '4:5' | '16:9';
  setCropAspect: (aspect: 'original' | '1:1' | '4:5' | '16:9') => void;
  isCropping: boolean;
  handleApplyCrop: () => Promise<void>;
  handleResetCrop: () => void;
  filterPreset: 'none' | 'bw' | 'warm' | 'cool' | 'vivid';
  setFilterPreset: (preset: 'none' | 'bw' | 'warm' | 'cool' | 'vivid') => void;
  isApplyingFilter: boolean;
  handleApplyFilter: () => Promise<void>;
  handleResetFilter: () => void;
}

export interface ResizeWithProtectionProps {
  originalDimensions: Dimensions;
  widthPercent: number;
  heightPercent: number;
  isResizing: boolean;
  resizeProgress: number;
  resizedPreview: ResizedPreview | null;
  handleResize: (newWidthPercent: number, newHeightPercent: number) => void;
  handleSaveResize: () => Promise<void>;
  handleDiscardResize: () => void;
  useProtectionMask: boolean;
  drawMode: 'brush' | 'rectangle';
  setUseProtectionMask: (enabled: boolean) => void;
  setDrawMode: (mode: 'brush' | 'rectangle') => void;
  handleAutoDetectText: () => Promise<void>;
  isDetectingText: boolean;
  detectProgress: number;
  hasProtectionDrawing: () => boolean;
  clearProtectionMask: () => void;
}

/**
 * @deprecated Use ResizeWithProtectionProps instead
 */
export interface ResizeSectionProps {
  originalDimensions: Dimensions;
  widthPercent: number;
  heightPercent: number;
  isResizing: boolean;
  resizeProgress: number;
  resizedPreview: ResizedPreview | null;
  handleResize: (newWidthPercent: number, newHeightPercent: number) => void;
  handleSaveResize: () => Promise<void>;
  handleDiscardResize: () => void;
}

/**
 * @deprecated Use ResizeWithProtectionProps instead
 */
export interface ProtectionSectionProps {
  useProtectionMask: boolean;
  drawMode: 'brush' | 'rectangle';
  setUseProtectionMask: (enabled: boolean) => void;
  setDrawMode: (mode: 'brush' | 'rectangle') => void;
  handleDiscardResize: () => void;
  handleAutoDetectText: () => Promise<void>;
  isDetectingText: boolean;
  detectProgress: number;
  hasProtectionDrawing: () => boolean;
  clearProtectionMask: () => void;
}

export interface AiEditSectionProps {
  editPrompt: string;
  setEditPrompt: (prompt: string) => void;
  referenceImage: ImageFile | null;
  setReferenceImage: (image: ImageFile | null) => void;
  brushSize: number;
  setBrushSize: (size: number) => void;
}

export interface ErrorBannerProps {
  message: string | null;
}

export interface VideoMetaSectionProps {
  image: GalleryImage;
  videoDimensions: Dimensions | null;
  isVerticalVideo: boolean;
}

export interface PreviewReadyNoteProps {
  visible: boolean;
}

export interface ImagePreviewVideoPlayerProps {
  src: string;
  videoRef: RefObject<HTMLVideoElement>;
  isVerticalVideo: boolean;
  handleLoadedMetadata: (event: SyntheticEvent<HTMLVideoElement>) => void;
}

export interface ImagePreviewCompareProps {
  src: string;
  originalDimensions: Dimensions;
  resizedPreview: ResizedPreview | null;
  editPreview: EditPreview | null;
}

export interface ImagePreviewMaskCanvasProps {
  imageSrc: string;
  imageCanvasRef: RefObject<HTMLCanvasElement>;
  maskCanvasRef: RefObject<HTMLCanvasElement>;
  protectionCanvasRef: RefObject<HTMLCanvasElement>;
  useProtectionMask: boolean;
  startDrawing: (e: MouseEvent<HTMLCanvasElement> | TouchEvent<HTMLCanvasElement>) => void;
  draw: (e: MouseEvent<HTMLCanvasElement> | TouchEvent<HTMLCanvasElement>) => void;
  stopDrawing: () => void;
  startProtectionDrawing: (e: MouseEvent<HTMLCanvasElement> | TouchEvent<HTMLCanvasElement>) => void;
  drawProtection: (e: MouseEvent<HTMLCanvasElement> | TouchEvent<HTMLCanvasElement>) => void;
  stopProtectionDrawing: () => void;
}

export interface ImagePreviewHintProps {
  useProtectionMask: boolean;
  drawMode: 'brush' | 'rectangle';
}

export interface ImagePreviewLoadingOverlayProps {
  isResizing: boolean;
  resizeProgress: number;
}

export interface ImageViewerProps extends ImagePreviewCanvasProps {
  containerRef?: RefObject<HTMLDivElement>;
  onNavigatePrev?: () => void;
  onNavigateNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
}

export interface ImageEditorProps {
  sidebar: ImagePreviewSidebarProps;
  footer: ImagePreviewFooterProps;
  mobileActions: ImagePreviewMobileActionsProps;
}

/**
 * @deprecated Use CropAndFilterSectionProps instead
 */
export interface ImageCropperProps {
  cropAspect: 'original' | '1:1' | '4:5' | '16:9';
  setCropAspect: (aspect: 'original' | '1:1' | '4:5' | '16:9') => void;
  isCropping: boolean;
  handleApplyCrop: () => Promise<void>;
  handleResetCrop: () => void;
  cropOptions?: { label: string; value: 'original' | '1:1' | '4:5' | '16:9' }[];
}

/**
 * @deprecated Use CropAndFilterSectionProps instead
 */
export interface ImageFiltersProps {
  filterPreset: 'none' | 'bw' | 'warm' | 'cool' | 'vivid';
  setFilterPreset: (preset: 'none' | 'bw' | 'warm' | 'cool' | 'vivid') => void;
  isApplyingFilter: boolean;
  handleApplyFilter: () => Promise<void>;
  handleResetFilter: () => void;
  filterOptions?: { label: string; value: 'none' | 'bw' | 'warm' | 'cool' | 'vivid' }[];
}

export interface MinimalImageUploaderProps {
  onImageChange: (image: ImageFile | null) => void;
}
