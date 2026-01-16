/**
 * FreeCropOverlay
 * Componente de crop livre com seleção interativa
 */

import React, { useState, useRef } from 'react';
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Icon } from '../common/Icon';

interface FreeCropOverlayProps {
  imageSrc: string;
  onCropComplete: (croppedImageUrl: string) => void;
  onCancel: () => void;
}

export const FreeCropOverlay: React.FC<FreeCropOverlayProps> = ({
  imageSrc,
  onCropComplete,
  onCancel,
}) => {
  const imgRef = useRef<HTMLImageElement>(null);
  const [crop, setCrop] = useState<Crop | undefined>(undefined);
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleCropConfirm = async () => {
    if (!completedCrop || !imgRef.current) return;

    setIsProcessing(true);

    try {
      const image = imgRef.current;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        throw new Error('Failed to get canvas context');
      }

      const scaleX = image.naturalWidth / image.width;
      const scaleY = image.naturalHeight / image.height;

      canvas.width = completedCrop.width * scaleX;
      canvas.height = completedCrop.height * scaleY;

      ctx.drawImage(
        image,
        completedCrop.x * scaleX,
        completedCrop.y * scaleY,
        completedCrop.width * scaleX,
        completedCrop.height * scaleY,
        0,
        0,
        canvas.width,
        canvas.height,
      );

      const croppedDataUrl = canvas.toDataURL('image/png');
      onCropComplete(croppedDataUrl);
    } catch (error) {
      console.error('Crop error:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[10000] flex flex-col bg-black/95"
      style={{
        transform: 'none',
        zoom: 1,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <Icon name="crop" className="w-5 h-5 text-white/60" />
          <h3 className="text-base font-semibold text-white">Recortar Imagem</h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onCancel}
            disabled={isProcessing}
            className="px-4 py-2 text-sm text-white/60 hover:text-white/80 transition-colors disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            onClick={handleCropConfirm}
            disabled={!completedCrop || isProcessing}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isProcessing ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Processando...
              </>
            ) : (
              <>
                <Icon name="check" className="w-4 h-4" />
                Confirmar
              </>
            )}
          </button>
        </div>
      </div>

      {/* Crop Area */}
      <div
        className="flex-1 flex items-center justify-center p-6 overflow-auto relative"
        style={{
          transform: 'none',
          zoom: 1,
        }}
      >
        <div className="relative inline-block">
          <ReactCrop
            crop={crop}
            onChange={(c) => setCrop(c)}
            onComplete={(c) => setCompletedCrop(c)}
            aspect={undefined}
          >
            <img
              ref={imgRef}
              src={imageSrc}
              alt="Crop"
              style={{
                display: 'block',
                maxWidth: '90vw',
                maxHeight: 'calc(100vh - 200px)',
                transform: 'none',
                imageRendering: 'auto',
              }}
              crossOrigin="anonymous"
            />
          </ReactCrop>
        </div>

        {/* Hint quando não há seleção */}
        {!crop && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-black/80 backdrop-blur-sm px-6 py-4 rounded-lg border border-white/10">
              <div className="flex items-center gap-3 text-white/80">
                <Icon name="mouse-pointer-2" className="w-5 h-5" />
                <span className="text-sm">Clique e arraste para selecionar a área</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="px-6 py-3 bg-black/60 border-t border-white/10">
        <p className="text-xs text-white/40 text-center">
          {!crop || !completedCrop
            ? 'Clique e arraste sobre a imagem para criar a área de recorte.'
            : 'Arraste para ajustar a área de recorte. Use as bordas para redimensionar.'}
        </p>
      </div>
    </div>
  );
};
