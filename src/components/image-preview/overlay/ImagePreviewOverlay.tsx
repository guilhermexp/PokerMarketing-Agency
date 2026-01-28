import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { ImagePreviewToolbar } from './ImagePreviewToolbar';
import { ImagePreviewActionsBar } from './ImagePreviewActionsBar';
import { ImagePreviewCanvas } from '../ImagePreviewCanvas';
import { EditPanelSlideIn } from '../edit-panel/EditPanelSlideIn';
import { ChatPanelSlideIn } from '../chat-panel/ChatPanelSlideIn';
import { FreeCropOverlay } from '../FreeCropOverlay';
import type { GalleryImage, PendingToolEdit, EditPreview, ImageFile, Dimensions, ResizedPreview } from '../types';
import '../preview-overlay.css';

interface ImagePreviewOverlayProps {
  visible: boolean;
  image: GalleryImage;
  onClose: () => void;
  onImageUpdate: (newImageUrl: string) => void;
  onSetChatReference?: (image: GalleryImage) => void;
  onSetChatReferenceSilent?: (image: GalleryImage | null) => void;
  pendingToolEdit?: PendingToolEdit | null;
  onToolEditApproved?: (toolCallId: string, imageUrl: string) => void;
  onToolEditRejected?: (toolCallId: string, reason?: string) => void;
  initialEditPreview?: EditPreview | null;
  downloadFilename?: string;
  onQuickPost?: () => void;
  onPublish?: () => void;
  onSchedulePost?: () => void;
  chatComponent?: React.ReactNode;
  chatReferenceImageId?: string | null;

  // Canvas refs and handlers (needed by ImagePreviewCanvas)
  imageCanvasRef?: React.RefObject<HTMLCanvasElement>;
  maskCanvasRef?: React.RefObject<HTMLCanvasElement>;
  protectionCanvasRef?: React.RefObject<HTMLCanvasElement>;
  startDrawing?: (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => void;
  draw?: (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => void;
  stopDrawing?: () => void;
  startProtectionDrawing?: (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => void;
  drawProtection?: (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => void;
  stopProtectionDrawing?: () => void;
  isLoadingImage?: boolean;
  imageLoadError?: string | null;

  // Video props
  videoRef?: React.RefObject<HTMLVideoElement>;
  handleLoadedMetadata?: (event: React.SyntheticEvent<HTMLVideoElement>) => void;

  // Editor state props
  editPrompt?: string;
  setEditPrompt?: (prompt: string) => void;
  referenceImage?: ImageFile | null;
  setReferenceImage?: (image: ImageFile | null) => void;
  brushSize?: number;
  setBrushSize?: (size: number) => void;

  // Resize props
  originalDimensions?: Dimensions;
  widthPercent?: number;
  heightPercent?: number;
  isResizing?: boolean;
  resizeProgress?: number;
  resizedPreview?: ResizedPreview | null;
  handleResize?: (newWidthPercent: number, newHeightPercent: number) => void;
  handleSaveResize?: () => Promise<void>;
  handleDiscardResize?: () => void;

  // Protection props
  useProtectionMask?: boolean;
  drawMode?: 'brush' | 'rectangle';
  setUseProtectionMask?: (enabled: boolean) => void;
  setDrawMode?: (mode: 'brush' | 'rectangle') => void;
  handleAutoDetectText?: () => Promise<void>;
  isDetectingText?: boolean;
  detectProgress?: number;
  hasProtectionDrawing?: () => boolean;
  clearProtectionMask?: () => void;

  // Crop & Filter props
  cropAspect?: 'original' | '1:1' | '4:5' | '16:9';
  setCropAspect?: (aspect: 'original' | '1:1' | '4:5' | '16:9') => void;
  isCropping?: boolean;
  handleApplyCrop?: () => Promise<void>;
  handleResetCrop?: () => void;
  filterPreset?: 'none' | 'bw' | 'warm' | 'cool' | 'vivid';
  setFilterPreset?: (preset: 'none' | 'bw' | 'warm' | 'cool' | 'vivid') => void;
  isApplyingFilter?: boolean;
  handleApplyFilter?: () => Promise<void>;
  handleResetFilter?: () => void;
  filterStyle?: string;

  // Video props
  videoDimensions?: Dimensions | null;
  isVerticalVideo?: boolean;

  // Edit preview props
  editPreview?: EditPreview | null;
  isEditing?: boolean;
  isRemovingBackground?: boolean;
  isActionRunning?: boolean;
  clearMask?: () => void;
  handleRemoveBackground?: () => Promise<void>;
  handleEdit?: () => Promise<void>;
  handleDiscardEdit?: () => void;
  handleSaveEdit?: () => Promise<void>;

  // Error
  error?: string | null;
}

export const ImagePreviewOverlay = (props: ImagePreviewOverlayProps) => {
  const {
    visible,
    image,
    onClose,
    onImageUpdate,
    downloadFilename,
    pendingToolEdit,
  } = props;

  // Estado do preview
  const [activePanel, setActivePanel] = useState<'edit' | 'chat' | null>(null);
  const [cropActive, setCropActive] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);

  const editPanelOpen = activePanel === 'edit';
  const chatPanelOpen = activePanel === 'chat';

  // Log when image.src changes
  useEffect(() => {
    console.log('🎨 [ImagePreviewOverlay] image.src changed:', {
      imageId: image.id,
      src: image.src.substring(0, 50),
    });
  }, [image.src, image.id]);

  // Carregar dimensões da imagem
  useEffect(() => {
    const img = new window.Image();
    img.onload = () => {
      setImageDimensions({
        width: img.naturalWidth,
        height: img.naturalHeight,
      });
    };
    img.src = image.src;
  }, [image.src]);

  // Handlers de zoom e rotação
  const handleZoomIn = useCallback(() => {
    setZoom(prev => Math.min(prev + 0.1, 3));
  }, []);
  const handleZoomOut = useCallback(() => {
    setZoom(prev => Math.max(prev - 0.1, 0.5));
  }, []);
  const handleRotateLeft = useCallback(() => {
    setRotation(prev => prev - 90);
  }, []);
  const handleRotateRight = useCallback(() => {
    setRotation(prev => prev + 90);
  }, []);

  // Handler de fit to screen
  const handleFitToScreen = useCallback(() => {
    if (!imageDimensions) return;

    // Dimensões do viewport (aproximadas)
    const viewportWidth = window.innerWidth - 48; // padding
    const viewportHeight = window.innerHeight - 120; // toolbar + padding

    // Calcular escala para caber
    const scaleX = viewportWidth / imageDimensions.width;
    const scaleY = viewportHeight / imageDimensions.height;
    const fitZoom = Math.min(scaleX, scaleY, 1); // Não aumentar além de 100%

    setZoom(fitZoom);
    setRotation(0); // Reset rotação para fit consistente
  }, [imageDimensions]);

  // Handler de tamanho original
  const handleOriginalSize = useCallback(() => {
    setZoom(1);
    setRotation(0);
  }, []);

  // Handler de reset
  const handleReset = useCallback(() => {
    setZoom(1);
    setRotation(0);
    // Offset será resetado automaticamente pelo effect no canvas
  }, []);

  // Handler de download
  const handleDownload = async () => {
    try {
      // Fetch the image as blob to bypass cross-origin download restrictions
      const response = await fetch(image.src);
      const blob = await response.blob();

      // Create a blob URL and trigger download
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = downloadFilename || `image-${image.id}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Clean up the blob URL
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('Failed to download image:', error);
      // Fallback: open in new tab
      window.open(image.src, '_blank');
    }
  };

  // Handler de crop
  const handleToggleCrop = useCallback(() => {
    setCropActive(prev => !prev);
  }, []);

  const handleCropComplete = (croppedImageUrl: string) => {
    // Atualiza a imagem com o crop
    onImageUpdate(croppedImageUrl);
    setCropActive(false);
  };

  const handleCropCancel = () => {
    setCropActive(false);
  };

  // Handler de enviar para o chat
  const handleSendToChat = () => {
    // Define a referência da imagem no chat
    if (props.onSetChatReferenceSilent) {
      props.onSetChatReferenceSilent(image);
    } else if (props.onSetChatReference) {
      props.onSetChatReference(image);
    }

    // Aguarda múltiplos frames para garantir que o ciclo de render complete
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setActivePanel('chat');
      });
    });
  };

  // Handler de fechar com ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (cropActive) {
          handleCropCancel();
        } else if (activePanel) {
          setActivePanel(null);
        } else {
          onClose();
        }
      } else if (cropActive) {
        // Bloquear todos os outros atalhos quando crop está ativo
        return;
      } else if (e.key === 'c' || e.key === 'C') {
        handleToggleCrop();
      } else if (e.key === 'e' || e.key === 'E') {
        setActivePanel(activePanel === 'edit' ? null : 'edit');
      } else if (e.key === '+' || e.key === '=') {
        handleZoomIn();
      } else if (e.key === '-' || e.key === '_') {
        handleZoomOut();
      } else if (e.key === 'r' || e.key === 'R') {
        handleRotateRight();
      } else if (e.key === 'f' || e.key === 'F') {
        handleFitToScreen();
      } else if (e.key === 'o' || e.key === 'O') {
        handleOriginalSize();
      } else if (e.key === '0') {
        handleReset();
      }
    };

    if (visible) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [
    visible,
    activePanel,
    cropActive,
    onClose,
    handleFitToScreen,
    handleOriginalSize,
    handleReset,
    handleRotateRight,
    handleToggleCrop,
    handleZoomIn,
    handleZoomOut,
  ]);


  if (!visible) return null;

  return createPortal(
    <div className="image-preview-overlay">
      {/* Backdrop */}
      <div className="overlay-mask" onClick={onClose} />

      {/* Container principal */}
      <div className="preview-container">
        {/* Toolbar de ações superior (Quick Post, Agendar, Campanha) */}
        <ImagePreviewActionsBar
          onQuickPost={props.onQuickPost}
          onSchedulePost={props.onSchedulePost}
          onPublish={props.onPublish}
        />

        {/* Botão close no canto superior direito */}
        <button
          onClick={onClose}
          className="preview-close-button"
          aria-label="Fechar"
        >
          <X size={24} />
        </button>

        {/* Conteúdo principal (viewer + painel) */}
        <div className={`preview-content ${activePanel ? 'panel-open' : ''}`}>
          {/* Wrapper com zoom e rotação aplicados */}
          <div
            className="relative flex-1 flex items-center justify-center overflow-hidden"
            style={{
              transform: `scale(${zoom}) rotate(${rotation}deg)`,
              transformOrigin: 'center center',
              transition: 'transform 0.2s ease-out',
              zIndex: 1, // Atrás do painel lateral
            }}
          >
            {/* Canvas de imagem com edição */}
            <ImagePreviewCanvas
              image={props.image}
              isVideo={props.image.src?.endsWith('.mp4') || props.image.src?.includes('video') || props.image.source?.startsWith('Video-') || false}
              videoRef={props.videoRef || { current: null } as React.RefObject<HTMLVideoElement>}
              isVerticalVideo={props.isVerticalVideo || false}
              handleLoadedMetadata={props.handleLoadedMetadata || (() => {})}
              resizedPreview={props.resizedPreview || null}
              editPreview={props.editPreview || null}
              originalDimensions={props.originalDimensions || { width: 0, height: 0 }}
              isLoadingImage={props.isLoadingImage || false}
              imageLoadError={props.imageLoadError || null}
              imageCanvasRef={props.imageCanvasRef || { current: null } as React.RefObject<HTMLCanvasElement>}
              maskCanvasRef={props.maskCanvasRef || { current: null } as React.RefObject<HTMLCanvasElement>}
              protectionCanvasRef={props.protectionCanvasRef || { current: null } as React.RefObject<HTMLCanvasElement>}
              useProtectionMask={props.useProtectionMask || false}
              drawMode={props.drawMode || 'brush'}
              startDrawing={props.startDrawing || (() => {})}
              draw={props.draw || (() => {})}
              stopDrawing={props.stopDrawing || (() => {})}
              startProtectionDrawing={props.startProtectionDrawing || (() => {})}
              drawProtection={props.drawProtection || (() => {})}
              stopProtectionDrawing={props.stopProtectionDrawing || (() => {})}
              isActionRunning={props.isActionRunning || false}
              isResizing={props.isResizing || false}
              resizeProgress={props.resizeProgress || 0}
              filterStyle={props.filterStyle}
            />

          </div>

          {/* Painel de edição (slide-in lateral ou bottom sheet) */}
          <EditPanelSlideIn
            {...props}
            open={editPanelOpen}
            onClose={() => setActivePanel(null)}
          />

          {/* Painel de chat (slide-in lateral ou bottom sheet) */}
          {props.chatComponent && (
            <ChatPanelSlideIn
              open={chatPanelOpen}
              image={image}
              onClose={() => setActivePanel(null)}
              chatComponent={props.chatComponent}
            />
          )}
        </div>

        {/* Toolbar flutuante na parte inferior - FORA do preview-content */}
        <div className="preview-toolbar-bottom">
          <ImagePreviewToolbar
            zoom={zoom}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onRotateLeft={handleRotateLeft}
            onRotateRight={handleRotateRight}
            onDownload={handleDownload}
            onToggleEditPanel={() => setActivePanel(activePanel === 'edit' ? null : 'edit')}
            onToggleCrop={handleToggleCrop}
            onSendToChat={(props.onSetChatReference || props.onSetChatReferenceSilent) ? handleSendToChat : undefined}
            editPanelOpen={editPanelOpen}
            cropActive={cropActive}
            imageDimensions={imageDimensions}
            onFitToScreen={handleFitToScreen}
            onOriginalSize={handleOriginalSize}
            onReset={handleReset}
            // Tool approval mode
            pendingToolEdit={pendingToolEdit}
            hasEditPreview={!!props.editPreview}
            isEditing={props.isEditing}
            onApproveEdit={props.handleSaveEdit}
            onRejectEdit={props.onToolEditRejected ? () => props.onToolEditRejected?.(pendingToolEdit?.toolCallId || '') : undefined}
          />
        </div>
      </div>

      {/* Crop Overlay (quando ativo) */}
      {cropActive && (
        <FreeCropOverlay
          imageSrc={image.src}
          onCropComplete={handleCropComplete}
          onCancel={handleCropCancel}
        />
      )}
    </div>,
    document.body
  );
};
