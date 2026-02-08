/**
 * useVideoPlayer Hook
 *
 * Tracks video dimensions and orientation for previews.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import type { SyntheticEvent } from 'react';
import type { Dimensions, UseVideoPlayerReturn } from '../types';

interface UseVideoPlayerProps {
  src: string;
}

export function useVideoPlayer({ src }: UseVideoPlayerProps): UseVideoPlayerReturn {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoDimensions, setVideoDimensions] = useState<Dimensions | null>(null);

  useEffect(() => {
    setVideoDimensions(null);
  }, [src]);

  const handleLoadedMetadata = useCallback((event: SyntheticEvent<HTMLVideoElement>) => {
    const video = event.currentTarget;
    setVideoDimensions({
      width: video.videoWidth,
      height: video.videoHeight,
    });
  }, []);

  const isVerticalVideo = videoDimensions
    ? videoDimensions.height > videoDimensions.width
    : false;

  return {
    videoRef,
    videoDimensions,
    isVerticalVideo,
    handleLoadedMetadata,
  };
}
