import { Typography } from 'antd';
import {
  ZoomIn,
  ZoomOut,
  RotateCw,
  RotateCcw,
  Download,
  Edit3,
  Maximize2,
  Scan,
  Crop,
  MessageSquare,
} from 'lucide-react';

interface ToolbarButtonProps {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  onClick: () => void;
  title?: string;
  disabled?: boolean;
  active?: boolean;
}

const ToolbarButton = ({ icon: Icon, onClick, title, disabled = false, active = false }: ToolbarButtonProps) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
      disabled
        ? 'opacity-30 cursor-not-allowed'
        : active
        ? 'bg-white/20 text-white hover:bg-white/30'
        : 'bg-transparent text-white/60 hover:text-white hover:bg-white/10'
    }`}
  >
    <Icon size={16} />
  </button>
);

interface ImagePreviewToolbarProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onRotateLeft: () => void;
  onRotateRight: () => void;
  onDownload: () => void;
  onToggleEditPanel: () => void;
  onToggleCrop: () => void;
  onSendToChat?: () => void;
  editPanelOpen: boolean;
  cropActive: boolean;
  imageDimensions?: { width: number; height: number } | null;
  onFitToScreen: () => void;
  onOriginalSize: () => void;
  onReset: () => void;
}

export const ImagePreviewToolbar = ({
  zoom,
  onZoomIn,
  onZoomOut,
  onRotateLeft,
  onRotateRight,
  onDownload,
  onToggleEditPanel,
  onToggleCrop,
  onSendToChat,
  editPanelOpen,
  cropActive,
  imageDimensions,
  onFitToScreen,
  onOriginalSize,
  onReset,
}: ImagePreviewToolbarProps) => {
  return (
    <div className="preview-toolbar">
      {/* Controles em linha única */}
      <ToolbarButton
        icon={Maximize2}
        onClick={onFitToScreen}
        title="Ajustar à tela (F)"
      />

      <div className="toolbar-separator" />

      <ToolbarButton
        icon={Scan}
        onClick={onOriginalSize}
        title="Tamanho original (O)"
      />

      <ToolbarButton
        icon={RotateCcw}
        onClick={onRotateLeft}
        title="Rotacionar à esquerda"
      />

      <ToolbarButton
        icon={RotateCw}
        onClick={onRotateRight}
        title="Rotacionar à direita (R)"
      />

      <ToolbarButton
        icon={ZoomOut}
        onClick={onZoomOut}
        title="Diminuir zoom (-)"
        disabled={zoom <= 0.5}
      />

      <ToolbarButton
        icon={ZoomIn}
        onClick={onZoomIn}
        title="Aumentar zoom (+)"
        disabled={zoom >= 3}
      />

      {/* Dimensões e controles extras - desktop only */}
      {imageDimensions && (
        <>
          <div className="toolbar-separator" />
          <Typography.Text
            style={{
              color: 'rgba(255,255,255,0.6)',
              fontSize: '11px',
              whiteSpace: 'nowrap',
            }}
          >
            {imageDimensions.width} × {imageDimensions.height}
          </Typography.Text>
        </>
      )}

      <div className="toolbar-separator" />

      <ToolbarButton
        icon={RotateCcw}
        onClick={onReset}
        title="Resetar (0)"
      />

      <ToolbarButton
        icon={Crop}
        onClick={onToggleCrop}
        title="Recortar (C)"
        active={cropActive}
      />

      <ToolbarButton
        icon={Edit3}
        onClick={onToggleEditPanel}
        title="Editar (E)"
        active={editPanelOpen}
      />

      {onSendToChat && (
        <ToolbarButton
          icon={MessageSquare}
          onClick={onSendToChat}
          title="Enviar para o chat"
        />
      )}

      <ToolbarButton
        icon={Download}
        onClick={onDownload}
        title="Baixar imagem"
      />
    </div>
  );
};
