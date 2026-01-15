/**
 * useTextDetection Hook
 *
 * Handles OCR-based text detection and protection mask generation.
 */

import { useState, useCallback } from 'react';
import type { RefObject } from 'react';
import {
  detectTextRegions,
  drawTextRegionsOnCanvas,
  mergeNearbyRegions,
} from '../../../services/ocrService';
import type { UseTextDetectionReturn } from '../types';

interface UseTextDetectionProps {
  imageSrc: string;
  protectionCanvasRef: RefObject<HTMLCanvasElement>;
  setUseProtectionMask: (enabled: boolean) => void;
  setError: (message: string | null) => void;
}

export function useTextDetection({
  imageSrc,
  protectionCanvasRef,
  setUseProtectionMask,
  setError,
}: UseTextDetectionProps): UseTextDetectionReturn {
  const [isDetectingText, setIsDetectingText] = useState(false);
  const [detectProgress, setDetectProgress] = useState(0);

  const handleAutoDetectText = useCallback(async () => {
    setIsDetectingText(true);
    setDetectProgress(0);
    setUseProtectionMask(true);
    setError(null);

    try {
      const regions = await detectTextRegions(imageSrc, (progress) => {
        setDetectProgress(progress);
      });

      const mergedRegions = mergeNearbyRegions(regions, 15);

      const canvas = protectionCanvasRef.current;
      if (canvas && mergedRegions.length > 0) {
        drawTextRegionsOnCanvas(canvas, mergedRegions, 20);
      } else if (mergedRegions.length === 0) {
        setError('Nenhum texto detectado na imagem. Use o modo Manual para pintar.');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Falha ao detectar texto na imagem');
    } finally {
      setIsDetectingText(false);
      setDetectProgress(0);
    }
  }, [imageSrc, protectionCanvasRef, setUseProtectionMask, setError]);

  return {
    isDetectingText,
    detectProgress,
    handleAutoDetectText,
  };
}
