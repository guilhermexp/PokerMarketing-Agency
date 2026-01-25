import { Drawer } from 'antd';
import { useResponsive } from 'antd-style';
import { X } from 'lucide-react';
import { AiEditSection } from './sections/AiEditSection';
import { FilterSection } from './sections/CropAndFilterSection';
import { VideoMetaSection } from './sections/VideoMetaSection';
import { ErrorBanner } from '../ErrorBanner';
import { ImagePreviewFooter } from '../ImagePreviewFooter';
import type { GalleryImage, PendingToolEdit, EditPreview, ImageFile, Dimensions, ResizedPreview } from '../types';

interface EditPanelSlideInProps {
  open: boolean;
  image: GalleryImage;
  onClose: () => void;
  onImageUpdate: (newImageUrl: string) => void;
  onSetChatReference?: (image: GalleryImage) => void;
  pendingToolEdit?: PendingToolEdit | null;
  onToolEditApproved?: (toolCallId: string, imageUrl: string) => void;
  onToolEditRejected?: (toolCallId: string, reason?: string) => void;
  initialEditPreview?: EditPreview | null;
  onQuickPost?: () => void;
  onPublish?: () => void;
  onSchedulePost?: () => void;

  // Props para AiEditSection
  editPrompt?: string;
  setEditPrompt?: (prompt: string) => void;
  referenceImage?: ImageFile | null;
  setReferenceImage?: (image: ImageFile | null) => void;
  brushSize?: number;
  setBrushSize?: (size: number) => void;

  // Props para ResizeWithProtectionSection
  originalDimensions?: Dimensions;
  widthPercent?: number;
  heightPercent?: number;
  isResizing?: boolean;
  resizeProgress?: number;
  resizedPreview?: ResizedPreview | null;
  handleResize?: (newWidthPercent: number, newHeightPercent: number) => void;
  handleSaveResize?: () => Promise<void>;
  handleDiscardResize?: () => void;
  useProtectionMask?: boolean;
  drawMode?: 'brush' | 'rectangle';
  setUseProtectionMask?: (enabled: boolean) => void;
  setDrawMode?: (mode: 'brush' | 'rectangle') => void;
  handleAutoDetectText?: () => Promise<void>;
  isDetectingText?: boolean;
  detectProgress?: number;
  hasProtectionDrawing?: () => boolean;
  clearProtectionMask?: () => void;

  // Props para FilterSection
  filterPreset?: 'none' | 'bw' | 'warm' | 'cool' | 'vivid';
  setFilterPreset?: (preset: 'none' | 'bw' | 'warm' | 'cool' | 'vivid') => void;
  isApplyingFilter?: boolean;
  handleApplyFilter?: () => Promise<void>;
  handleResetFilter?: () => void;

  // Props para VideoMetaSection
  videoDimensions?: Dimensions | null;
  isVerticalVideo?: boolean;

  // Props para ImagePreviewFooter
  editPreview?: EditPreview | null;
  isEditing?: boolean;
  isRemovingBackground?: boolean;
  isActionRunning?: boolean;
  clearMask?: () => void;
  handleRemoveBackground?: () => Promise<void>;
  handleEdit?: () => Promise<void>;
  handleDiscardEdit?: () => void;
  handleSaveEdit?: () => Promise<void>;

  // Error handling
  error?: string | null;
}

const EditPanelContent = (props: Omit<EditPanelSlideInProps, 'open' | 'onClose'>) => {
  const {
    image,
    error,
    // AI Edit props
    editPrompt,
    setEditPrompt,
    referenceImage,
    setReferenceImage,
    brushSize,
    setBrushSize,
    // Resize props
    originalDimensions: _originalDimensions,
    widthPercent: _widthPercent,
    heightPercent: _heightPercent,
    isResizing: _isResizing,
    resizeProgress: _resizeProgress,
    resizedPreview: _resizedPreview,
    handleResize: _handleResize,
    handleSaveResize: _handleSaveResize,
    handleDiscardResize: _handleDiscardResize,
    useProtectionMask: _useProtectionMask,
    drawMode: _drawMode,
    setUseProtectionMask: _setUseProtectionMask,
    setDrawMode: _setDrawMode,
    handleAutoDetectText: _handleAutoDetectText,
    isDetectingText: _isDetectingText,
    detectProgress: _detectProgress,
    hasProtectionDrawing: _hasProtectionDrawing,
    clearProtectionMask: _clearProtectionMask,
    // Filter props
    filterPreset,
    setFilterPreset,
    isApplyingFilter,
    handleApplyFilter,
    handleResetFilter,
    // Video props
    videoDimensions,
    isVerticalVideo,
    // Footer props
    editPreview,
    isEditing,
    isRemovingBackground,
    isActionRunning,
    clearMask,
    handleRemoveBackground,
    handleEdit,
    handleDiscardEdit,
    handleSaveEdit,
    pendingToolEdit,
  } = props;

  const isVideo =
    image.src?.endsWith('.mp4') ||
    image.src?.includes('video') ||
    image.source?.startsWith('Video-');

  const isToolApprovalMode = Boolean(pendingToolEdit);

  return (
    <div className="edit-panel-content">
      {/* Error Banner */}
      {error && <ErrorBanner message={error} />}

      {/* AI Edit Section */}
      {editPrompt !== undefined && setEditPrompt && setBrushSize && (
        <AiEditSection
          editPrompt={editPrompt}
          setEditPrompt={setEditPrompt}
          referenceImage={referenceImage || null}
          setReferenceImage={setReferenceImage || (() => {})}
          brushSize={brushSize || 50}
          setBrushSize={setBrushSize}
        />
      )}

      {/* Filter Section */}
      {setFilterPreset && (
        <FilterSection
          filterPreset={filterPreset || 'none'}
          setFilterPreset={setFilterPreset}
          isApplyingFilter={isApplyingFilter || false}
          handleApplyFilter={handleApplyFilter || (async () => {})}
          handleResetFilter={handleResetFilter || (() => {})}
        />
      )}

      {/* Video Meta Section (only for videos) */}
      {isVideo && videoDimensions && (
        <VideoMetaSection
          image={image}
          videoDimensions={videoDimensions}
          isVerticalVideo={isVerticalVideo || false}
        />
      )}

      {/* Footer with action buttons */}
      {handleEdit && clearMask && (
        <ImagePreviewFooter
          isVideo={isVideo}
          editPreview={editPreview || null}
          isEditing={isEditing || false}
          isRemovingBackground={isRemovingBackground || false}
          isActionRunning={isActionRunning || false}
          editPrompt={editPrompt || ''}
          clearMask={clearMask}
          handleRemoveBackground={handleRemoveBackground || (async () => {})}
          handleEdit={handleEdit}
          handleDiscardEdit={handleDiscardEdit || (() => {})}
          handleSaveEdit={handleSaveEdit || (async () => {})}
          isToolApprovalMode={isToolApprovalMode}
          onApprove={props.onToolEditApproved ? () => {
            if (pendingToolEdit && handleSaveEdit) {
              handleSaveEdit();
            }
          } : undefined}
          onReject={props.onToolEditRejected ? () => {
            if (pendingToolEdit && props.onToolEditRejected) {
              props.onToolEditRejected(pendingToolEdit.toolCallId);
            }
          } : undefined}
        />
      )}
    </div>
  );
};

export const EditPanelSlideIn = (props: EditPanelSlideInProps) => {
  const { open, onClose } = props;
  const { mobile } = useResponsive();

  if (mobile) {
    // Mobile: Bottom Sheet
    return (
      <Drawer
        placement="bottom"
        open={open}
        onClose={onClose}
        height="60%"
        styles={{
          header: {
            background: '#000000',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
            padding: '16px 20px',
          },
          body: {
            padding: '16px',
            background: '#000000',
          },
          content: {
            background: '#000000',
            borderTopLeftRadius: '16px',
            borderTopRightRadius: '16px',
          },
          mask: {
            background: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(8px)',
          },
        }}
        closeIcon={<X size={20} className="text-white/40 hover:text-white transition-colors" />}
        title={<span className="text-white font-semibold">Editar Imagem</span>}
      >
        <EditPanelContent {...props} />
      </Drawer>
    );
  }

  // Desktop: Slide-in lateral
  return (
    <div className={`edit-panel-slide ${open ? 'open' : 'closed'}`}>
      {/* Header */}
      <div className="panel-header">
        <h3>Editar Imagem</h3>
        <button className="close-button" onClick={onClose} aria-label="Fechar painel">
          <X size={20} />
        </button>
      </div>

      {/* Content (scrollable) */}
      <div className="panel-scroll-content">
        <EditPanelContent {...props} />
      </div>
    </div>
  );
};
