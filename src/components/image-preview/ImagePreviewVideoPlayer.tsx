/**
 * ImagePreviewVideoPlayer
 */

import React from 'react';
import type { ImagePreviewVideoPlayerProps } from './uiTypes';

export const ImagePreviewVideoPlayer: React.FC<ImagePreviewVideoPlayerProps> = ({
  src,
  videoRef,
  isVerticalVideo,
  handleLoadedMetadata,
}) => (
  <video
    ref={videoRef}
    src={src}
    controls
    autoPlay
    onLoadedMetadata={handleLoadedMetadata}
    className={`rounded-lg ${
      isVerticalVideo
        ? 'h-full max-h-[calc(95vh-200px)] w-auto'
        : 'max-w-full max-h-full object-contain'
    }`}
  />
);
