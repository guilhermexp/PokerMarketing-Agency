/**
 * CarouselPreview
 */

import React, { useRef, useState } from 'react';
import type { GalleryImage } from '../../types';
import { Icon } from '../common/Icon';
import { SendToChatButton } from '../common/SendToChatButton';
import { Loader } from '../common/Loader';

interface CarouselPreviewProps {
  images: GalleryImage[];
  onReorder: (newOrder: GalleryImage[]) => void;
  clipTitle: string;
  onOpenEditor?: (image: GalleryImage) => void;
  caption?: string;
  onCaptionChange?: (caption: string) => void;
  onGenerateCaption?: () => void;
  isGeneratingCaption?: boolean;
  // For showing loading state on individual slides
  generatingSlides?: Record<string, boolean>;
  totalExpectedSlides?: number;
}

export const CarouselPreview: React.FC<CarouselPreviewProps> = ({
  images,
  onReorder,
  clipTitle,
  onOpenEditor,
  caption = "",
  onCaptionChange,
  onGenerateCaption,
  isGeneratingCaption = false,
  generatingSlides = {},
  totalExpectedSlides = 0,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const thumbnailsRef = useRef<HTMLDivElement>(null);
  // Image position offset (for panning) - stored per image index
  const [imageOffsets, setImageOffsets] = useState<Record<number, number>>({});
  const [isPanning, setIsPanning] = useState(false);
  const [panStartY, setPanStartY] = useState(0);
  const [panStartOffset, setPanStartOffset] = useState(0);
  // Caption editor toggle
  const [showCaptionEditor, setShowCaptionEditor] = useState(false);


  const goToSlide = (index: number) => {
    setCurrentIndex(Math.max(0, Math.min(index, images.length - 1)));
  };

  // Get current image offset (0-100, where 50 is center)
  const getCurrentOffset = () => imageOffsets[currentIndex] ?? 50;

  // Pan handlers for the preview image
  const handlePanStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsPanning(true);
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    setPanStartY(clientY);
    setPanStartOffset(getCurrentOffset());
  };

  const handlePanMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isPanning) return;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    const deltaY = clientY - panStartY;
    // Convert pixel movement to percentage (negative = image moves up, showing bottom)
    const sensitivity = 0.5; // Adjust sensitivity
    const newOffset = Math.max(0, Math.min(100, panStartOffset + deltaY * sensitivity));
    setImageOffsets((prev) => ({ ...prev, [currentIndex]: newOffset }));
  };

  const handlePanEnd = () => {
    setIsPanning(false);
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragEnd = () => {
    if (
      draggedIndex !== null &&
      dragOverIndex !== null &&
      draggedIndex !== dragOverIndex
    ) {
      const newImages = [...images];
      const [removed] = newImages.splice(draggedIndex, 1);
      newImages.splice(dragOverIndex, 0, removed);
      onReorder(newImages);
      setCurrentIndex(dragOverIndex);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const scrollThumbnails = (direction: 'left' | 'right') => {
    const container = thumbnailsRef.current;
    if (!container) return;
    const delta = direction === 'left' ? -320 : 320;
    container.scrollBy({ left: delta, behavior: 'smooth' });
  };

  if (images.length === 0) return null;

  return (
    <div className="flex gap-6 items-center">
      {/* Instagram Phone Preview */}
      <div className="flex-shrink-0">
        {/* Format label */}
        <div className="flex items-center justify-center gap-2 mb-2">
          <span className="px-2 py-0.5 rounded bg-white/10 text-[10px] font-medium text-white/60 border border-white/10">
            Feed Instagram 4:5
          </span>
        </div>
        <div className="w-[320px] bg-black rounded-[32px] p-2 shadow-2xl border border-white/10">
          {/* Phone notch */}
          <div className="w-24 h-6 bg-black rounded-full mx-auto mb-1" />

          {/* Screen */}
          <div className="relative bg-[#0a0a0a] rounded-[24px] overflow-hidden">
            {/* Instagram Header */}
            <div className="px-3 py-2 flex items-center gap-2 border-b border-white/5">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                <span className="text-[8px] font-bold text-white">CPC</span>
              </div>
              <div className="flex-1">
                <p className="text-[10px] font-semibold text-white">
                  cpc_poker
                </p>
                <p className="text-[8px] text-white/40">Patrocinado</p>
              </div>
              <Icon name="more-horizontal" className="w-4 h-4 text-white/60" />
            </div>

            {/* Carousel Image - Draggable for positioning */}
            <div
              className={`relative aspect-[4/5] bg-black overflow-hidden ${isPanning ? "cursor-grabbing" : "cursor-grab"}`}
              onMouseDown={handlePanStart}
              onMouseMove={handlePanMove}
              onMouseUp={handlePanEnd}
              onMouseLeave={handlePanEnd}
              onTouchStart={handlePanStart}
              onTouchMove={handlePanMove}
              onTouchEnd={handlePanEnd}
            >
              <img
                src={images[currentIndex]?.src}
                alt={`Slide ${currentIndex + 1}`}
                className="w-full h-full object-cover select-none pointer-events-none"
                style={{ objectPosition: `center ${getCurrentOffset()}%` }}
                draggable={false}
              />
              {/* Pan hint */}
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2 py-1 rounded-full bg-black/60 backdrop-blur-sm text-[8px] text-white/60 flex items-center gap-1 opacity-0 hover:opacity-100 transition-opacity pointer-events-none">
                <Icon name="move" className="w-2.5 h-2.5" />
                Arraste para ajustar
              </div>

              {/* Navigation Arrows */}
              {images.length > 1 && (
                <>
                  {currentIndex > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        goToSlide(currentIndex - 1);
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      className="absolute left-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white/90 hover:bg-black/80 transition-colors z-10"
                    >
                      <Icon name="chevron-left" className="w-3 h-3" />
                    </button>
                  )}
                  {currentIndex < images.length - 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        goToSlide(currentIndex + 1);
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white/90 hover:bg-black/80 transition-colors z-10"
                    >
                      <Icon name="chevron-right" className="w-3 h-3" />
                    </button>
                  )}
                </>
              )}

              {/* Slide Counter */}
              <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-sm text-[10px] text-white/90 font-medium">
                {currentIndex + 1}/{images.length}
              </div>
            </div>

            {/* Dots Indicator */}
            {images.length > 1 && (
              <div className="flex justify-center gap-1 py-2">
                {images.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => goToSlide(idx)}
                    className={`w-1.5 h-1.5 rounded-full transition-all ${
                      idx === currentIndex
                        ? "bg-blue-500 w-2"
                        : "bg-white/30 hover:bg-white/50"
                    }`}
                  />
                ))}
              </div>
            )}

            {/* Action Bar */}
            <div className="px-3 py-2 flex items-center gap-4">
              <Icon name="heart" className="w-5 h-5 text-white" />
              <Icon name="message-circle" className="w-5 h-5 text-white" />
              <Icon name="send" className="w-5 h-5 text-white" />
              <div className="flex-1" />
              <Icon name="bookmark" className="w-5 h-5 text-white" />
            </div>

            {/* Caption Preview with Toggle */}
            <div className="px-3 pb-3">
              <button
                onClick={() => setShowCaptionEditor(!showCaptionEditor)}
                className="w-full text-left hover:bg-white/5 rounded p-1 -m-1 transition-colors"
              >
                <p className="text-[10px] text-white/90 line-clamp-2">
                  <span className="font-semibold">cpc_poker</span> {caption || clipTitle}
                </p>
                <span className="text-[8px] text-white/40 mt-1 flex items-center gap-1">
                  <Icon name="edit-2" className="w-2.5 h-2.5" />
                  Clique para editar legenda
                </span>
              </button>
            </div>

            {/* Caption Editor Overlay */}
            {showCaptionEditor && (
              <div className="absolute inset-0 bg-black/95 rounded-[24px] z-20 flex flex-col p-4">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-xs font-medium text-white/80">Editar Legenda</label>
                  <button
                    onClick={() => setShowCaptionEditor(false)}
                    className="p-1 rounded-full hover:bg-white/10 transition-colors"
                  >
                    <Icon name="x" className="w-4 h-4 text-white/60" />
                  </button>
                </div>
                <textarea
                  value={caption}
                  onChange={(e) => onCaptionChange?.(e.target.value)}
                  placeholder="Escreva a legenda do carrossel..."
                  className="flex-1 w-full px-3 py-2 text-xs text-white/90 bg-white/[0.05] border border-white/[0.1] rounded-lg resize-none focus:outline-none focus:border-amber-500/50 placeholder:text-white/30"
                  autoFocus
                />
                <div className="flex items-center justify-between mt-3">
                  {onGenerateCaption && (
                    <button
                      onClick={onGenerateCaption}
                      disabled={isGeneratingCaption}
                      className="px-3 py-1.5 text-[10px] font-medium rounded-lg bg-amber-600/20 text-amber-500 hover:bg-amber-600/30 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {isGeneratingCaption ? (
                        <>
                        <Loader className="h-2.5 w-2.5" />
                          Gerando...
                        </>
                      ) : (
                        <>
                          <Icon name="sparkles" className="w-3 h-3" />
                          Gerar com IA
                        </>
                      )}
                    </button>
                  )}
                  <button
                    onClick={() => setShowCaptionEditor(false)}
                    className="px-3 py-1.5 text-[10px] font-medium rounded-lg bg-white/10 text-white/70 hover:bg-white/20 transition-colors"
                  >
                    Concluir
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Reorderable Thumbnails - Expand on Hover */}
      <div className="flex-1 min-w-0 -mt-4">
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <Icon name="move" className="w-4 h-4 text-white/40" />
            <span className="text-xs text-white/50">Arraste para reordenar</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => scrollThumbnails('left')}
              className="w-7 h-7 flex items-center justify-center rounded-md bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/80 transition-colors"
              aria-label="Scroll para esquerda"
            >
              <Icon name="chevron-left" className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => scrollThumbnails('right')}
              className="w-7 h-7 flex items-center justify-center rounded-md bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/80 transition-colors"
              aria-label="Scroll para direita"
            >
              <Icon name="chevron-right" className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <div
          ref={thumbnailsRef}
          className="flex items-center justify-start gap-1 pb-2 overflow-x-auto scrollbar-none"
        >
          {images.map((img, idx) => {
            // Check if this specific slide is being generated
            const isGenerating = Object.entries(generatingSlides).some(
              ([key, val]) => val && (key.endsWith(`-${idx}`) || key.endsWith(`-${idx + 1}`) || key.endsWith('-cover'))
            );
            return (
            <div
              key={img.id || idx}
              draggable={!isGenerating}
              onDragStart={(e) => handleDragStart(e, idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDragEnd={handleDragEnd}
              onClick={() => !isGenerating && onOpenEditor?.(img)}
              className={`
                relative flex-shrink-0 rounded-xl overflow-hidden cursor-move group
                border-2 transition-all duration-500 ease-in-out shadow-lg
                ${idx === currentIndex ? "border-white/30 ring-2 ring-white/10" : "border-white/10"}
                ${dragOverIndex === idx ? "scale-105 border-blue-500" : ""}
                ${draggedIndex === idx ? "opacity-50 scale-95" : ""}
                hover:border-white/30
              `}
              style={{
                width: "20rem",
                height: "28rem",
              }}
            >
              <img
                src={img.src}
                alt={`Thumbnail ${idx + 1}`}
                className="w-full h-full object-cover"
                draggable={false}
              />
              <div className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-black/70 text-sm text-white font-medium">
                {idx + 1}
              </div>
              {/* Action buttons - appear on hover */}
              {!isGenerating && (
                <div className="absolute top-3 right-3 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-all">
                  <SendToChatButton image={img} />
                  {onOpenEditor && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenEditor(img);
                      }}
                      className="w-8 h-8 rounded-lg bg-black/70 hover:bg-primary text-white/70 hover:text-black flex items-center justify-center transition-all"
                      title="Editar no AI Studio"
                    >
                      <Icon name="edit" className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}
            </div>
            );
          })}
          {/* Skeleton placeholders for slides being generated */}
          {totalExpectedSlides > images.length && Object.values(generatingSlides).some(v => v) && (
            Array.from({ length: Math.min(totalExpectedSlides - images.length, 5) }).map((_, idx) => (
              <div
                key={`skeleton-${idx}`}
                className="relative flex-shrink-0 rounded-xl overflow-hidden border-2 border-white/10 shadow-lg"
                style={{
                  width: "7rem",
                  height: "28rem",
                }}
              >
                <div className="w-full h-full bg-gradient-to-b from-white/5 to-white/0 flex items-center justify-center">
                  <div className="text-center">
                    <Loader className="h-5 w-5 mx-auto mb-2" />
                    <span className="text-[10px] text-white/50">Gerando...</span>
                  </div>
                </div>
                <div className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-black/50 text-sm text-white/40 font-medium">
                  {images.length + idx + 1}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
