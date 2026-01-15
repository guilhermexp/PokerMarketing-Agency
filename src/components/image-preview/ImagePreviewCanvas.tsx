/**
 * ImagePreviewCanvas
 */

import React from 'react';
import { ImagePreviewVideoPlayer } from './ImagePreviewVideoPlayer';
import { ImagePreviewCompare } from './ImagePreviewCompare';
import { ImagePreviewMaskCanvas } from './ImagePreviewMaskCanvas';
import { ImagePreviewHint } from './ImagePreviewHint';
import { ImagePreviewLoadingOverlay } from './ImagePreviewLoadingOverlay';
import type { ImagePreviewCanvasProps } from './uiTypes';

export const ImagePreviewCanvas: React.FC<ImagePreviewCanvasProps> = ({
  image,
  isVideo,
  videoRef,
  isVerticalVideo,
  handleLoadedMetadata,
  resizedPreview,
  editPreview,
  originalDimensions,
  isLoadingImage,
  imageLoadError,
  imageCanvasRef,
  maskCanvasRef,
  protectionCanvasRef,
  useProtectionMask,
  drawMode,
  startDrawing,
  draw,
  stopDrawing,
  startProtectionDrawing,
  drawProtection,
  stopProtectionDrawing,
  isActionRunning,
  isResizing,
  resizeProgress,
  filterStyle,
}) => (
  <div className="relative flex-1 flex flex-col items-center justify-center p-6 lg:p-10 overflow-hidden bg-[#080808] min-h-0 min-w-0">
    <div
      className={`relative flex-1 w-full flex items-center justify-center min-h-0 min-w-0 ${isVerticalVideo ? 'max-w-[400px] mx-auto' : ''}`}
    >

      <div className="flex w-full h-full items-center justify-center min-h-0 min-w-0" style={{ filter: filterStyle || 'none' }}>
        {isVideo ? (
          <ImagePreviewVideoPlayer
            src={image.src}
            videoRef={videoRef}
            isVerticalVideo={isVerticalVideo}
            handleLoadedMetadata={handleLoadedMetadata}
          />
        ) : resizedPreview || editPreview ? (
          <ImagePreviewCompare
            src={image.src}
            originalDimensions={originalDimensions}
            resizedPreview={resizedPreview}
            editPreview={editPreview}
          />
        ) : (
          <ImagePreviewMaskCanvas
            imageSrc={image.src}
            imageCanvasRef={imageCanvasRef}
            maskCanvasRef={maskCanvasRef}
            protectionCanvasRef={protectionCanvasRef}
            useProtectionMask={useProtectionMask}
            startDrawing={startDrawing}
            draw={draw}
            stopDrawing={stopDrawing}
            startProtectionDrawing={startProtectionDrawing}
            drawProtection={drawProtection}
            stopProtectionDrawing={stopProtectionDrawing}
          />
        )}
      </div>

      {isActionRunning && (
        <ImagePreviewLoadingOverlay
          isResizing={isResizing}
          resizeProgress={resizeProgress}
        />
      )}

      {!isVideo && (isLoadingImage || imageLoadError) && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <div className="flex flex-col items-center gap-2 text-center px-4">
            <div className="w-10 h-10 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-white/60 text-xs">
              {imageLoadError ? '!' : '...'}
            </div>
            <p className="text-xs text-white/70">
              {imageLoadError || 'Carregando imagem...'}
            </p>
            {imageLoadError && (
              <p className="text-[10px] text-white/40">
                Tente novamente ou verifique a URL da imagem.
              </p>
            )}
          </div>
        </div>
      )}
    </div>

    {!isVideo && !isActionRunning && !resizedPreview && !editPreview && (
      <ImagePreviewHint useProtectionMask={useProtectionMask} drawMode={drawMode} />
    )}
  </div>
);
