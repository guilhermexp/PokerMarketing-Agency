import React, { useEffect, useMemo, useState } from 'react';
import { Icon } from '../../common/Icon';
import type { GalleryImage } from '../types';

interface ImageViewerCanvasProps {
  image: GalleryImage;
  zoom: number;
  rotation: number;
  containerRef?: React.RefObject<HTMLDivElement>;
  onNavigatePrev?: () => void;
  onNavigateNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  onWheel?: (e: React.WheelEvent) => void;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const ImageViewerCanvas: React.FC<ImageViewerCanvasProps> = ({
  image,
  zoom,
  rotation,
  containerRef,
  onNavigatePrev,
  onNavigateNext,
  hasPrev = true,
  hasNext = true,
  onWheel,
}) => {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [offsetStart, setOffsetStart] = useState({ x: 0, y: 0 });

  // Keyboard handlers para navegação e panning
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

  // Mouse panning
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

  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!isSpacePressed) return;
    event.preventDefault();
    setIsPanning(true);
    setPanStart({ x: event.clientX, y: event.clientY });
    setOffsetStart(offset);
  };

  // Reset offset quando zoom ou rotação mudam
  useEffect(() => {
    setOffset({ x: 0, y: 0 });
  }, [zoom, rotation]);

  const viewerStyle = useMemo(
    () => ({
      transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom}) rotate(${rotation}deg)`,
      transformOrigin: 'center center',
      transition: isPanning ? 'none' : 'transform 0.2s ease-out',
    }),
    [offset, zoom, rotation, isPanning],
  );

  const isVideo = image.src?.endsWith('.mp4') || image.src?.includes('video') || image.source?.startsWith('Video-');

  return (
    <div
      ref={containerRef}
      className="image-viewer-canvas"
      onMouseDownCapture={(event) => {
        if (isSpacePressed) {
          event.stopPropagation();
        }
      }}
      onWheel={onWheel}
    >
      <div
        className="h-full w-full flex items-center justify-center"
        style={viewerStyle}
        onMouseDown={handleMouseDown}
      >
        {isVideo ? (
          <video
            src={image.src}
            controls
            className="max-w-full max-h-full object-contain"
          />
        ) : (
          <img
            src={image.src}
            alt={image.prompt || 'Preview'}
            className="max-w-full max-h-full object-contain"
          />
        )}
      </div>

      {/* Botões de navegação (se houver galeria) */}
      {(onNavigatePrev || onNavigateNext) && (
        <>
          <button
            onClick={onNavigatePrev}
            disabled={!onNavigatePrev || !hasPrev}
            className="absolute left-4 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-full bg-black/60 border border-white/10 text-white/60 hover:text-white hover:bg-black/80 disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Anterior"
          >
            <Icon name="chevron-left" className="w-4 h-4" />
          </button>
          <button
            onClick={onNavigateNext}
            disabled={!onNavigateNext || !hasNext}
            className="absolute right-4 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-full bg-black/60 border border-white/10 text-white/60 hover:text-white hover:bg-black/80 disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Próximo"
          >
            <Icon name="chevron-right" className="w-4 h-4" />
          </button>
        </>
      )}

      {/* Hint para controles - movido para canto superior esquerdo */}
      <div className="absolute top-4 left-4 text-[9px] text-white/30 bg-black/50 rounded-md px-2 py-1">
        Espaço + arraste para mover
      </div>
    </div>
  );
};
