/**
 * ImagePreviewMaskCanvas
 */

import React from 'react';
import type { ImagePreviewMaskCanvasProps } from './uiTypes';

export const ImagePreviewMaskCanvas: React.FC<ImagePreviewMaskCanvasProps> = ({
  imageSrc,
  imageCanvasRef,
  maskCanvasRef,
  protectionCanvasRef,
  useProtectionMask,
  startDrawing,
  draw,
  stopDrawing,
  startProtectionDrawing,
  drawProtection,
  stopProtectionDrawing,
}) => {
  return (
    <div className="flex items-center justify-center w-full h-full p-4">
      <div className="relative" style={{ maxWidth: '100%', maxHeight: '100%' }}>
        <img
          src={imageSrc}
          alt=""
          className="max-w-full max-h-[calc(100vh-280px)] object-contain block"
        />
        <canvas
          ref={imageCanvasRef}
          data-role="image"
          className="absolute top-0 left-0 pointer-events-none"
          style={{ width: '100%', height: '100%' }}
        />
        <canvas
          ref={maskCanvasRef}
          data-role="mask"
          className={`absolute top-0 left-0 cursor-crosshair opacity-60 ${
            useProtectionMask ? 'hidden' : ''
          }`}
          style={{ width: '100%', height: '100%' }}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseOut={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
        <canvas
          ref={protectionCanvasRef}
          data-role="protection"
          className={`absolute top-0 left-0 cursor-crosshair opacity-60 ${
            useProtectionMask ? '' : 'hidden'
          }`}
          style={{ width: '100%', height: '100%', mixBlendMode: 'screen' }}
          onMouseDown={startProtectionDrawing}
          onMouseMove={drawProtection}
          onMouseUp={stopProtectionDrawing}
          onMouseOut={stopProtectionDrawing}
          onTouchStart={startProtectionDrawing}
          onTouchMove={drawProtection}
          onTouchEnd={stopProtectionDrawing}
        />
      </div>
    </div>
  );
};
