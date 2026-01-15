/**
 * ImagePreviewLoadingOverlay
 */

import React from 'react';
import { Loader } from '../common/Loader';
import type { ImagePreviewLoadingOverlayProps } from './uiTypes';

export const ImagePreviewLoadingOverlay: React.FC<ImagePreviewLoadingOverlayProps> = ({
  isResizing,
  resizeProgress,
}) => (
  <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center z-20 rounded-lg">
    <Loader className="w-10 h-10 mb-4" />
    <p className="text-sm font-medium text-white/80">
      {isResizing ? `Redimensionando... ${resizeProgress}%` : 'Processando...'}
    </p>
    {isResizing && (
      <div className="w-48 h-1.5 bg-white/10 rounded-full mt-3 overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-150"
          style={{ width: `${resizeProgress}%` }}
        />
      </div>
    )}
  </div>
);
