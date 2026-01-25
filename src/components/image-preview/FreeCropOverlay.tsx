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
      {/* Header minimalista */}
      <div className="flex items-center justify-between px-4 py-3">
        <button
          onClick={onCancel}
          disabled={isProcessing}
          className="p-2 text-white/40 hover:text-white/70 transition-colors disabled:opacity-40"
        >
          <Icon name="x" className="w-5 h-5" />
        </button>
        <span className="text-xs text-white/30 uppercase tracking-wider">Recortar</span>
        <div className="w-9" /> {/* Spacer para centralizar */}
      </div>

      {/* Crop Area */}
      <div
        className="flex-1 flex flex-col items-center justify-center p-4 overflow-auto relative"
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
                maxHeight: 'calc(100vh - 180px)',
                transform: 'none',
                imageRendering: 'auto',
              }}
              crossOrigin="anonymous"
            />
          </ReactCrop>
        </div>

        {/* Botão confirmar embaixo da imagem */}
        {completedCrop && (
          <button
            onClick={handleCropConfirm}
            disabled={isProcessing}
            className="mt-4 px-3 py-1.5 text-[10px] text-white/50 hover:text-white/80 border border-white/10 hover:border-white/20 rounded-full transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 backdrop-blur-sm"
          >
            {isProcessing ? (
              <>
                <span className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />
                <span>Aplicando...</span>
              </>
            ) : (
              <>
                <Icon name="check" className="w-3 h-3" />
                <span>Aplicar recorte</span>
              </>
            )}
          </button>
        )}

        {/* Hint quando não há seleção */}
        {!crop && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-black/60 backdrop-blur-sm px-4 py-2.5 rounded-lg border border-white/5">
              <div className="flex items-center gap-2 text-white/50">
                <Icon name="mouse-pointer-2" className="w-4 h-4" />
                <span className="text-xs">Clique e arraste para selecionar</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
