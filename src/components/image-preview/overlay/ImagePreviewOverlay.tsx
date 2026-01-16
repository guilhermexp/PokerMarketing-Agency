import { useState, useEffect } from 'react';
import { useResponsive } from 'antd-style';
import { X } from 'lucide-react';
import { ImagePreviewToolbar } from './ImagePreviewToolbar';
import { ImageViewerCanvas } from './ImageViewerCanvas';
import { EditPanelSlideIn } from '../edit-panel/EditPanelSlideIn';
import type { GalleryImage, PendingToolEdit, EditPreview, ImageFile, Dimensions, ResizedPreview } from '../types';
import '../preview-overlay.css';

interface ImagePreviewOverlayProps {
  visible: boolean;
  image: GalleryImage;
  onClose: () => void;
  onImageUpdate: (newImageUrl: string) => void;
  onSetChatReference?: (image: GalleryImage) => void;
  pendingToolEdit?: PendingToolEdit | null;
  onToolEditApproved?: (toolCallId: string, imageUrl: string) => void;
  onToolEditRejected?: (toolCallId: string, reason?: string) => void;
  initialEditPreview?: EditPreview | null;
  downloadFilename?: string;
  onQuickPost?: () => void;
  onPublish?: () => void;
  onSchedulePost?: () => void;

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
  const { mobile } = useResponsive();

  // Estado do preview
  const [editPanelOpen, setEditPanelOpen] = useState(!!pendingToolEdit);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);

  // Abre painel automaticamente quando há pendingToolEdit
  useEffect(() => {
    if (pendingToolEdit) {
      setEditPanelOpen(true);
    }
  }, [pendingToolEdit]);

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
  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.1, 3));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.1, 0.5));
  const handleRotateLeft = () => setRotation(prev => prev - 90);
  const handleRotateRight = () => setRotation(prev => prev + 90);

  // Handler de wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    // Apenas zoom com Ctrl/Cmd pressionado
    if (!e.ctrlKey && !e.metaKey) return;

    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom(prev => Math.max(0.5, Math.min(3.0, prev + delta)));
  };

  // Handler de fit to screen
  const handleFitToScreen = () => {
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
  };

  // Handler de tamanho original
  const handleOriginalSize = () => {
    setZoom(1);
    setRotation(0);
  };

  // Handler de reset
  const handleReset = () => {
    setZoom(1);
    setRotation(0);
    // Offset será resetado automaticamente pelo effect no canvas
  };

  // Handler de download
  const handleDownload = async () => {
    const link = document.createElement('a');
    link.href = image.src;
    link.download = downloadFilename || `image-${image.id}.png`;
    link.click();
  };

  // Handler de fechar com ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editPanelOpen) {
          setEditPanelOpen(false);
        } else {
          onClose();
        }
      } else if (e.key === 'e' || e.key === 'E') {
        setEditPanelOpen(!editPanelOpen);
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
  }, [visible, editPanelOpen, onClose]);

  if (!visible) return null;

  return (
    <div className="image-preview-overlay">
      {/* Backdrop */}
      <div className="overlay-mask" onClick={onClose} />

      {/* Container principal */}
      <div className="preview-container">
        {/* Botão close no canto superior direito */}
        <button
          onClick={onClose}
          className="preview-close-button"
          aria-label="Fechar"
        >
          <X size={24} />
        </button>

        {/* Conteúdo principal (viewer + painel) */}
        <div className={`preview-content ${editPanelOpen ? 'panel-open' : ''}`}>
          {/* Viewer de imagem */}
          <ImageViewerCanvas
            image={image}
            zoom={zoom}
            rotation={rotation}
            onWheel={handleWheel}
          />

          {/* Toolbar flutuante na parte inferior */}
          <div className="preview-toolbar-bottom">
            <ImagePreviewToolbar
              zoom={zoom}
              onZoomIn={handleZoomIn}
              onZoomOut={handleZoomOut}
              onRotateLeft={handleRotateLeft}
              onRotateRight={handleRotateRight}
              onDownload={handleDownload}
              onToggleEditPanel={() => setEditPanelOpen(!editPanelOpen)}
              editPanelOpen={editPanelOpen}
              imageDimensions={imageDimensions}
              onFitToScreen={handleFitToScreen}
              onOriginalSize={handleOriginalSize}
              onReset={handleReset}
            />
          </div>

          {/* Painel de edição (slide-in lateral ou bottom sheet) */}
          <EditPanelSlideIn
            {...props}
            open={editPanelOpen}
            onClose={() => setEditPanelOpen(false)}
          />
        </div>
      </div>
    </div>
  );
};
