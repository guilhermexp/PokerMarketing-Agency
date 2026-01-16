import { ActionIcon } from '@lobehub/ui';
import { Button, Space, Typography } from 'antd';
import {
  ZoomIn,
  ZoomOut,
  RotateCw,
  RotateCcw,
  Download,
  X,
  Edit3,
  Maximize2,
  Scan,
} from 'lucide-react';

interface ImagePreviewToolbarProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onRotateLeft: () => void;
  onRotateRight: () => void;
  onDownload: () => void;
  onToggleEditPanel: () => void;
  editPanelOpen: boolean;
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
  editPanelOpen,
  imageDimensions,
  onFitToScreen,
  onOriginalSize,
  onReset,
}: ImagePreviewToolbarProps) => {
  return (
    <div className="preview-toolbar">
      {/* Controles em linha única */}
      <ActionIcon
        icon={Maximize2}
        onClick={onFitToScreen}
        title="Ajustar à tela (F)"
        size="small"
      />

      <div className="toolbar-separator" />

      <ActionIcon
        icon={Scan}
        onClick={onOriginalSize}
        title="Tamanho original (O)"
        size="small"
      />

      <ActionIcon
        icon={RotateCcw}
        onClick={onRotateLeft}
        title="Rotacionar à esquerda"
        size="small"
      />

      <ActionIcon
        icon={RotateCw}
        onClick={onRotateRight}
        title="Rotacionar à direita (R)"
        size="small"
      />

      <ActionIcon
        icon={ZoomOut}
        onClick={onZoomOut}
        title="Diminuir zoom (-)"
        disabled={zoom <= 0.5}
        size="small"
      />

      <ActionIcon
        icon={ZoomIn}
        onClick={onZoomIn}
        title="Aumentar zoom (+)"
        disabled={zoom >= 3}
        size="small"
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

      <ActionIcon
        icon={RotateCcw}
        onClick={onReset}
        title="Resetar (0)"
        size="small"
      />

      <ActionIcon
        icon={Edit3}
        onClick={onToggleEditPanel}
        title="Editar (E)"
        size="small"
        style={{
          background: editPanelOpen ? 'rgba(24, 144, 255, 0.2)' : 'transparent',
          color: editPanelOpen ? '#1890ff' : 'inherit',
        }}
      />

      <ActionIcon
        icon={Download}
        onClick={onDownload}
        title="Baixar imagem"
        size="small"
      />
    </div>
  );
};
