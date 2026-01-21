/**
 * useImageResize Hook
 *
 * Handles content-aware resizing with optional protection mask.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import type { RefObject } from 'react';
import { uploadImageToBlob } from '../../../services/blobService';
import {
  resizeImageContentAware,
  loadImageData,
  createProtectionMaskFromCanvas,
} from '../../../services/seamCarvingService';
import type { UseImageResizeReturn } from '../types';

interface UseImageResizeProps {
  imageSrc: string;
  useProtectionMask: boolean;
  protectionCanvasRef: RefObject<HTMLCanvasElement>;
  onImageUpdate: (newImageUrl: string) => void;
  redrawCanvas: () => void;
  setError: (message: string | null) => void;
}

export function useImageResize({
  imageSrc,
  useProtectionMask,
  protectionCanvasRef,
  onImageUpdate,
  redrawCanvas,
  setError,
}: UseImageResizeProps): UseImageResizeReturn {
  const [widthPercent, setWidthPercent] = useState(100);
  const [heightPercent, setHeightPercent] = useState(100);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeProgress, setResizeProgress] = useState(0);
  const [resizedPreview, setResizedPreview] = useState<{
    dataUrl: string;
    width: number;
    height: number;
  } | null>(null);

  const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setWidthPercent(100);
    setHeightPercent(100);
    setResizedPreview(null);
  }, [imageSrc]);

  useEffect(() => () => {
    if (resizeTimeoutRef.current) {
      clearTimeout(resizeTimeoutRef.current);
    }
  }, []);

  const handleResize = useCallback(
    async (newWidthPercent: number, newHeightPercent: number) => {
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }

      setWidthPercent(newWidthPercent);
      setHeightPercent(newHeightPercent);

      if (newWidthPercent === 100 && newHeightPercent === 100) {
        setResizedPreview(null);
        return;
      }

      if (
        newWidthPercent < 10 ||
        newWidthPercent > 100 ||
        newHeightPercent < 10 ||
        newHeightPercent > 100
      ) {
        return;
      }

      resizeTimeoutRef.current = setTimeout(async () => {
        setIsResizing(true);
        setResizeProgress(0);
        setError(null);

        try {
          const imageData = await loadImageData(imageSrc);

          const targetWidth = Math.round((imageData.width * newWidthPercent) / 100);
          const targetHeight = Math.round((imageData.height * newHeightPercent) / 100);

          let protectionMask = undefined;
          if (useProtectionMask && protectionCanvasRef.current) {
            protectionMask = createProtectionMaskFromCanvas(protectionCanvasRef.current);
          }

          const resizedImageData = await resizeImageContentAware(
            imageData,
            targetWidth,
            targetHeight,
            (progress) => setResizeProgress(progress),
            protectionMask || undefined,
          );

          const canvas = document.createElement('canvas');
          canvas.width = resizedImageData.width;
          canvas.height = resizedImageData.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.putImageData(resizedImageData, 0, 0);
            const dataUrl = canvas.toDataURL('image/png');
            setResizedPreview({
              dataUrl,
              width: resizedImageData.width,
              height: resizedImageData.height,
            });
          }
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : 'Falha ao redimensionar a imagem.');
        } finally {
          setIsResizing(false);
          setResizeProgress(0);
        }
      }, 500);
    },
    [imageSrc, useProtectionMask, protectionCanvasRef, setError],
  );

  const handleSaveResize = useCallback(async () => {
    if (!resizedPreview) return;

    setIsResizing(true);
    setError(null);

    try {
      const base64 = resizedPreview.dataUrl.split(',')[1];
      const newImageUrl = await uploadImageToBlob(base64, 'image/png');

      onImageUpdate(newImageUrl);

      setWidthPercent(100);
      setHeightPercent(100);
      setResizedPreview(null);

      setTimeout(() => redrawCanvas(), 100);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar a imagem.');
    } finally {
      setIsResizing(false);
    }
  }, [resizedPreview, onImageUpdate, redrawCanvas, setError]);

  const handleDiscardResize = useCallback(() => {
    setResizedPreview(null);
    setWidthPercent(100);
    setHeightPercent(100);
  }, []);

  return {
    widthPercent,
    heightPercent,
    isResizing,
    resizeProgress,
    resizedPreview,
    handleResize,
    handleSaveResize,
    handleDiscardResize,
  };
}
