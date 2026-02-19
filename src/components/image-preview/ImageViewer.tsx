/**
 * ImageViewer
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Icon } from '../common/Icon';
import { ImagePreviewCanvas } from './ImagePreviewCanvas';
import type { ImageViewerProps } from './uiTypes';

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const ImageViewer: React.FC<ImageViewerProps> = (props) => {
  const {
    containerRef,
    onNavigatePrev,
    onNavigateNext,
    hasPrev = true,
    hasNext = true,
    ...canvasProps
  } = props;
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [offsetStart, setOffsetStart] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }
      if (event.code === 'Space') {
        event.preventDefault();
        setIsSpacePressed(true);
      }
      if (event.key === 'ArrowLeft' && onNavigatePrev && hasPrev) {
        onNavigatePrev();
      }
      if (event.key === 'ArrowRight' && onNavigateNext && hasNext) {
        onNavigateNext();
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        setIsSpacePressed(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [onNavigatePrev, onNavigateNext, hasPrev, hasNext]);

  useEffect(() => {
    if (!isPanning) return undefined;

    const handleMouseMove = (event: MouseEvent) => {
      const deltaX = event.clientX - panStart.x;
      const deltaY = event.clientY - panStart.y;
      setOffset({
        x: offsetStart.x + deltaX,
        y: offsetStart.y + deltaY,
      });
    };

    const handleMouseUp = () => {
      setIsPanning(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isPanning, panStart, offsetStart]);

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const nextScale = clamp(scale + (event.deltaY > 0 ? -0.1 : 0.1), 0.6, 2.5);
    setScale(nextScale);
  };

  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!isSpacePressed) return;
    event.preventDefault();
    setIsPanning(true);
    setPanStart({ x: event.clientX, y: event.clientY });
    setOffsetStart(offset);
  };

  const handleZoomIn = () => setScale((prev) => clamp(prev + 0.1, 0.6, 2.5));
  const handleZoomOut = () => setScale((prev) => clamp(prev - 0.1, 0.6, 2.5));
  const handleReset = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  const viewerStyle = useMemo(
    () => ({
      transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
      transformOrigin: 'center center',
    }),
    [offset, scale],
  );

  return (
    <div
      ref={containerRef}
      className="relative flex-1 overflow-hidden min-h-0 min-w-0"
      onWheel={handleWheel}
      onMouseDownCapture={(event) => {
        if (isSpacePressed) {
          event.stopPropagation();
        }
      }}
    >
      <div
        className="h-full w-full"
        style={viewerStyle}
        onMouseDown={handleMouseDown}
      >
        <ImagePreviewCanvas {...canvasProps} />
      </div>

      {(onNavigatePrev || onNavigateNext) && (
        <>
          <button
            onClick={onNavigatePrev}
            disabled={!onNavigatePrev || !hasPrev}
            className="absolute left-4 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-full bg-black/60 border border-border text-muted-foreground hover:text-white hover:bg-black/80 disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Anterior"
          >
            <Icon name="chevron-left" className="w-4 h-4" />
          </button>
          <button
            onClick={onNavigateNext}
            disabled={!onNavigateNext || !hasNext}
            className="absolute right-4 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-full bg-black/60 border border-border text-muted-foreground hover:text-white hover:bg-black/80 disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Próximo"
          >
            <Icon name="chevron-right" className="w-4 h-4" />
          </button>
        </>
      )}

      <div className="absolute top-4 right-4 flex items-center gap-1 rounded-lg bg-black/60 border border-border p-1">
        <button
          onClick={handleZoomOut}
          className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-white hover:bg-white/5 rounded-lg text-[12px]"
          aria-label="Zoom out"
        >
          -
        </button>
        <button
          onClick={handleZoomIn}
          className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-white hover:bg-white/5 rounded-lg"
          aria-label="Zoom in"
        >
          <Icon name="plus" className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleReset}
          className="px-2 h-7 text-[10px] text-muted-foreground hover:text-white hover:bg-white/5 rounded-lg"
        >
          Reset
        </button>
      </div>

      <div className="absolute bottom-4 right-4 text-[9px] text-muted-foreground bg-black/50 rounded-md px-2 py-1">
        Ctrl/Cmd + scroll para zoom • Espaço + arraste para mover
      </div>
    </div>
  );
};
