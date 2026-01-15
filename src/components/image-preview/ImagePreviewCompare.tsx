/**
 * ImagePreviewCompare
 */

import React from 'react';
import { Icon } from '../common/Icon';
import type { ImagePreviewCompareProps } from './uiTypes';

export const ImagePreviewCompare: React.FC<ImagePreviewCompareProps> = ({
  src,
  originalDimensions,
  resizedPreview,
  editPreview,
}) => (
  <div className="flex gap-4 items-center justify-center w-full h-full">
    <div className="flex flex-col items-center flex-1 max-w-[45%]">
      <span className="text-[10px] text-white/40 mb-2 uppercase tracking-wider">
        Original
      </span>
      <div className="w-full h-[60vh] flex items-center justify-center">
        <img
          src={src}
          alt="Original"
          className="max-w-full max-h-full w-auto h-auto object-contain rounded-lg shadow-2xl border border-white/10"
        />
      </div>
      <span className="text-[9px] text-white/30 mt-2">
        {originalDimensions.width} × {originalDimensions.height}
      </span>
    </div>

    <div className="flex-shrink-0 text-white/20">
      <Icon name="arrow-right" className="w-6 h-6" />
    </div>

    <div className="flex flex-col items-center flex-1 max-w-[45%]">
      <span className="text-[10px] text-primary mb-2 uppercase tracking-wider font-semibold">
        {resizedPreview
          ? 'Redimensionada'
          : editPreview?.type === 'removeBg'
            ? 'Sem fundo'
            : 'Editada'}
      </span>
      <div className="w-full h-[60vh] flex items-center justify-center">
        <img
          src={resizedPreview ? resizedPreview.dataUrl : editPreview!.dataUrl}
          alt="Preview"
          className="max-w-full max-h-full w-auto h-auto object-contain rounded-lg shadow-2xl border border-primary/30"
        />
      </div>
      {resizedPreview ? (
        <span className="text-[9px] text-primary/70 mt-2">
          {resizedPreview.width} × {resizedPreview.height}
        </span>
      ) : editPreview?.prompt ? (
        <span className="text-[9px] text-primary/70 mt-2 max-w-[200px] truncate">
          {editPreview.prompt}
        </span>
      ) : null}
    </div>
  </div>
);
