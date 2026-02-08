/**
 * useImageCanvas Hook
 *
 * Manages the main image canvas and mask drawing for AI editing.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import type { CanvasEvent, Dimensions, MaskRegion, UseImageCanvasReturn } from '../types';

interface UseImageCanvasProps {
  imageSrc: string;
}

export function useImageCanvas({ imageSrc }: UseImageCanvasProps): UseImageCanvasReturn {
  const imageCanvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [originalDimensions, setOriginalDimensions] = useState<Dimensions>({ width: 0, height: 0 });
  const [displayDimensions, setDisplayDimensions] = useState<Dimensions>({ width: 0, height: 0 });
  const [isLoadingImage, setIsLoadingImage] = useState(false);
  const [imageLoadError, setImageLoadError] = useState<string | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushSize, setBrushSize] = useState(60);

  // Log when imageSrc changes
  useEffect(() => {
    console.log('🖌️ [useImageCanvas] imageSrc changed:', imageSrc.substring(0, 50));
  }, [imageSrc]);

  // Calculate display dimensions based on container size and natural image size
  const calculateDisplayDimensions = useCallback((
    containerWidth: number,
    containerHeight: number,
    naturalWidth: number,
    naturalHeight: number,
  ): Dimensions => {
    if (!containerWidth || !containerHeight || !naturalWidth || !naturalHeight) {
      // Return proportional dimensions based on aspect ratio when container size is unknown
      if (naturalWidth && naturalHeight) {
        // Use a reasonable default scale
        const aspectRatio = naturalWidth / naturalHeight;
        return {
          width: Math.min(naturalWidth, 800),
          height: Math.min(naturalHeight, Math.floor(800 / aspectRatio)),
        };
      }
      return { width: 0, height: 0 };
    }

    const scale = Math.min(containerWidth / naturalWidth, containerHeight / naturalHeight, 1);
    const displayWidth = Math.max(1, Math.floor(naturalWidth * scale));
    const displayHeight = Math.max(1, Math.floor(naturalHeight * scale));
    return { width: displayWidth, height: displayHeight };
  }, []);

  // Draw the image on canvas
  const drawCanvases = useCallback(() => {
    let isActive = true;
    let resizeObserver: ResizeObserver | null = null;

    const loadImage = async () => {
      if (!imageSrc) {
        setIsLoadingImage(false);
        setImageLoadError('Imagem indisponível.');
        return;
      }

      let imageSource = imageSrc;
      let revokeUrl = false;

      setIsLoadingImage(true);
      setImageLoadError(null);

      if (!imageSource) {
        setIsLoadingImage(false);
        setImageLoadError('Imagem inválida.');
        return;
      }

      if (!imageSource.startsWith('data:') && !imageSource.startsWith('blob:')) {
        try {
          const response = await fetch(imageSource);
          if (!response.ok) {
            throw new Error(`Falha ao carregar imagem (${response.status})`);
          }
          const blob = await response.blob();
          imageSource = URL.createObjectURL(blob);
          revokeUrl = true;
        } catch {
          // Fallback: try loading the original URL directly if fetch fails (CORS, auth, etc).
          imageSource = imageSrc;
          revokeUrl = false;
        }
      }

      const tryLoad = (withCors: boolean) => {
        const img = new Image();
        if (withCors && !imageSource.startsWith('blob:') && !imageSource.startsWith('data:')) {
          img.crossOrigin = 'anonymous';
        }

        img.onload = () => {
          if (!isActive) {
            if (revokeUrl) URL.revokeObjectURL(imageSource);
            return;
          }

          const { naturalWidth, naturalHeight } = img;
          const container = containerRef.current || imageCanvasRef.current?.parentElement;
          const imageCanvas = imageCanvasRef.current;
          const maskCanvas = maskCanvasRef.current;

          if (!imageCanvas || !maskCanvas || !container) {
            if (revokeUrl) URL.revokeObjectURL(imageSource);
            return;
          }

          // Store original dimensions immediately
          setOriginalDimensions({ width: naturalWidth, height: naturalHeight });

          // Set up ResizeObserver to track container size changes
          const updateCanvasSize = () => {
            const containerRect = container.getBoundingClientRect();
            const displayDims = calculateDisplayDimensions(
              containerRect.width,
              containerRect.height,
              naturalWidth,
              naturalHeight,
            );

            setDisplayDimensions(displayDims);

            // Canvas internal resolution matches image natural size
            // CSS display size is handled by max-w-full/max-h-full
            imageCanvas.width = naturalWidth;
            imageCanvas.height = naturalHeight;

            maskCanvas.width = naturalWidth;
            maskCanvas.height = naturalHeight;

            const protectionCanvas = container.querySelector<HTMLCanvasElement>(
              'canvas[data-role="protection"]',
            );
            if (protectionCanvas) {
              protectionCanvas.width = naturalWidth;
              protectionCanvas.height = naturalHeight;
            }
          };

          // Initial size calculation
          updateCanvasSize();

          // Set up ResizeObserver for responsive updates
          if (typeof ResizeObserver !== 'undefined') {
            resizeObserver = new ResizeObserver((entries) => {
              for (const entry of entries) {
                const { width, height } = entry.contentRect;
                const displayDims = calculateDisplayDimensions(
                  width,
                  height,
                  naturalWidth,
                  naturalHeight,
                );
                setDisplayDimensions(displayDims);
                // Canvas internal resolution stays the same, CSS handles display size
              }
            });
            resizeObserver.observe(container);
          }

          // Draw image
          const ctx = imageCanvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, naturalWidth, naturalHeight);
          setIsLoadingImage(false);
          if (revokeUrl) URL.revokeObjectURL(imageSource);
        };
        img.onerror = () => {
          if (withCors) {
            // Retry without CORS if the host does not allow it.
            tryLoad(false);
            return;
          }
          setIsLoadingImage(false);
          setImageLoadError('Falha ao carregar imagem.');
          if (revokeUrl) URL.revokeObjectURL(imageSource);
        };
        img.src = imageSource;
      };

      tryLoad(true);
    };

    loadImage().catch(() => {
      setIsLoadingImage(false);
      setImageLoadError('Falha ao carregar imagem.');
    });

    return () => {
      isActive = false;
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [imageSrc, calculateDisplayDimensions, containerRef]);

  // Initialize canvas on mount and when image changes
  useEffect(() => {
    const cleanup = drawCanvases();
    return () => cleanup?.();
  }, [drawCanvases]);

  // Get coordinates from mouse/touch event
  const getCoords = useCallback((e: CanvasEvent): { x: number; y: number } => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    let clientX: number, clientY: number;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }, []);

  // Start drawing on mask canvas
  const startDrawing = useCallback((e: CanvasEvent) => {
    setIsDrawing(true);
    const { x, y } = getCoords(e);
    const ctx = maskCanvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(x, y);
  }, [getCoords]);

  // Draw on mask canvas
  const draw = useCallback((e: CanvasEvent) => {
    if (!isDrawing) return;
    const { x, y } = getCoords(e);
    const ctx = maskCanvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.lineTo(x, y);
    // Use red for visibility (will be converted to black for Gemini API)
    // Gemini format: Black = area to edit, White = area to preserve
    ctx.strokeStyle = 'rgba(255, 50, 50, 0.8)';
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }, [isDrawing, getCoords, brushSize]);

  // Stop drawing
  const stopDrawing = useCallback(() => {
    const ctx = maskCanvasRef.current?.getContext('2d');
    ctx?.closePath();
    setIsDrawing(false);
  }, []);

  // Clear the mask canvas
  const clearMask = useCallback(() => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  // Get mask data as base64 for API
  const getMaskData = useCallback((): { base64: string; mimeType: string } | undefined => {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return undefined;

    const ctx = maskCanvas.getContext('2d');
    const imageData = ctx?.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
    const data = imageData?.data;
    const hasDrawing = data?.some((channel) => channel !== 0);

    if (!hasDrawing) return undefined;

    // Convert red mask to black (Gemini format: black = edit, white = preserve)
    // Create a new canvas for the black mask
    const blackMaskCanvas = document.createElement('canvas');
    blackMaskCanvas.width = maskCanvas.width;
    blackMaskCanvas.height = maskCanvas.height;
    const blackCtx = blackMaskCanvas.getContext('2d');

    if (blackCtx && imageData) {
      const blackImageData = blackCtx.createImageData(maskCanvas.width, maskCanvas.height);
      const blackData = blackImageData.data;

      // Convert any drawn pixel (red) to black
      for (let i = 0; i < data.length; i += 4) {
        const hasColor = data[i] !== 0 || data[i + 1] !== 0 || data[i + 2] !== 0 || data[i + 3] !== 0;
        if (hasColor) {
          blackData[i] = 0;       // R = 0 (black)
          blackData[i + 1] = 0;   // G = 0 (black)
          blackData[i + 2] = 0;   // B = 0 (black)
          blackData[i + 3] = 255; // A = opaque
        }
        // else: leave as transparent (0,0,0,0)
      }

      blackCtx.putImageData(blackImageData, 0, 0);
    }

    const maskDataUrl = blackMaskCanvas.toDataURL('image/png');
    const [, maskBase64] = maskDataUrl.split(',');
    return { base64: maskBase64, mimeType: 'image/png' };
  }, []);

  // Get mask region (bounding box of drawn area)
  const getMaskRegion = useCallback((): MaskRegion | undefined => {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return undefined;

    const ctx = maskCanvas.getContext('2d');
    const imageData = ctx?.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
    const data = imageData?.data;
    if (!data) return undefined;

    const hasDrawing = data.some((channel) => channel !== 0);
    if (!hasDrawing) return undefined;

    // Calculate bounding box
    let minX = maskCanvas.width;
    let minY = maskCanvas.height;
    let maxX = 0;
    let maxY = 0;

    for (let y = 0; y < maskCanvas.height; y++) {
      for (let x = 0; x < maskCanvas.width; x++) {
        const idx = (y * maskCanvas.width + x) * 4;
        if (data[idx] !== 0 || data[idx + 1] !== 0 || data[idx + 2] !== 0 || data[idx + 3] !== 0) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX < minX || maxY < minY) return undefined;

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
      imageWidth: maskCanvas.width,
      imageHeight: maskCanvas.height,
    };
  }, []);

  return {
    imageCanvasRef,
    maskCanvasRef,
    containerRef,
    originalDimensions,
    displayDimensions,
    isLoadingImage,
    imageLoadError,
    isDrawing,
    startDrawing,
    draw,
    stopDrawing,
    clearMask,
    getMaskData,
    getMaskRegion,
    redrawCanvas: drawCanvases,
    brushSize,
    setBrushSize,
  };
}
