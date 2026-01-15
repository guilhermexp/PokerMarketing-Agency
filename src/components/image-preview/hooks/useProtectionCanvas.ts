/**
 * useProtectionCanvas Hook
 *
 * Manages the protection mask canvas for content-aware resizing.
 * Allows users to mark areas (text, logos) that should be protected
 * during seam carving operations.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import type { CanvasEvent, Dimensions, DrawMode, Point, UseProtectionCanvasReturn } from '../types';

interface UseProtectionCanvasProps {
  originalDimensions: Dimensions;
}

export function useProtectionCanvas({ originalDimensions }: UseProtectionCanvasProps): UseProtectionCanvasReturn {
  const protectionCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawingProtection, setIsDrawingProtection] = useState(false);
  const [useProtectionMask, setUseProtectionMask] = useState(false);
  const [drawMode, setDrawMode] = useState<DrawMode>('rectangle');
  const [rectStart, setRectStart] = useState<Point | null>(null);
  const [tempCanvas, setTempCanvas] = useState<HTMLCanvasElement | null>(null);

  // Initialize protection canvas when dimensions change
  const initializeCanvas = useCallback(() => {
    const canvas = protectionCanvasRef.current;
    if (!canvas || originalDimensions.width === 0) return;

    canvas.width = originalDimensions.width;
    canvas.height = originalDimensions.height;
  }, [originalDimensions]);

  // Initialize canvas when dimensions are available
  useEffect(() => {
    initializeCanvas();
  }, [initializeCanvas]);

  // Get coordinates from mouse/touch event
  const getCoords = useCallback((e: CanvasEvent): Point => {
    const canvas = protectionCanvasRef.current;
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

  // Start protection drawing
  const startProtectionDrawing = useCallback((e: CanvasEvent) => {
    setIsDrawingProtection(true);
    const { x, y } = getCoords(e);

    if (drawMode === 'rectangle') {
      // Store starting point for rectangle
      setRectStart({ x, y });
      // Save current canvas state
      const canvas = protectionCanvasRef.current;
      if (canvas) {
        const temp = document.createElement('canvas');
        temp.width = canvas.width;
        temp.height = canvas.height;
        const tempCtx = temp.getContext('2d', { willReadFrequently: true });
        tempCtx?.drawImage(canvas, 0, 0);
        setTempCanvas(temp);
      }
    } else {
      // Brush mode
      const ctx = protectionCanvasRef.current?.getContext('2d');
      if (!ctx) return;
      ctx.beginPath();
      ctx.moveTo(x, y);
    }
  }, [drawMode, getCoords]);

  // Draw protection area
  const drawProtection = useCallback((e: CanvasEvent) => {
    if (!isDrawingProtection) return;
    const { x, y } = getCoords(e);
    const canvas = protectionCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;

    if (drawMode === 'rectangle' && rectStart && tempCanvas) {
      // Clear and restore previous state
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(tempCanvas, 0, 0);

      // Draw preview rectangle
      ctx.fillStyle = 'rgba(0, 255, 100, 0.6)';
      const width = x - rectStart.x;
      const height = y - rectStart.y;
      ctx.fillRect(rectStart.x, rectStart.y, width, height);
    } else {
      // Brush mode
      ctx.lineTo(x, y);
      ctx.strokeStyle = 'rgba(0, 255, 100, 0.6)';
      ctx.lineWidth = 80;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
  }, [isDrawingProtection, drawMode, rectStart, tempCanvas, getCoords]);

  // Stop protection drawing
  const stopProtectionDrawing = useCallback(() => {
    if (drawMode === 'rectangle') {
      // Rectangle is already drawn, just clean up
      setRectStart(null);
      setTempCanvas(null);
    } else {
      const ctx = protectionCanvasRef.current?.getContext('2d');
      ctx?.closePath();
    }
    setIsDrawingProtection(false);
  }, [drawMode]);

  // Clear protection mask
  const clearProtectionMask = useCallback(() => {
    const canvas = protectionCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  // Check if protection canvas has any drawing
  const hasProtectionDrawing = useCallback(() => {
    const canvas = protectionCanvasRef.current;
    if (!canvas) return false;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return false;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    return data.some((channel) => channel !== 0);
  }, []);

  return {
    protectionCanvasRef,
    isDrawingProtection,
    useProtectionMask,
    setUseProtectionMask,
    drawMode,
    setDrawMode,
    startProtectionDrawing,
    drawProtection,
    stopProtectionDrawing,
    clearProtectionMask,
    hasProtectionDrawing,
  };
}
