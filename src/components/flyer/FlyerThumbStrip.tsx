/**
 * FlyerThumbStrip Component
 *
 * Displays a horizontal scrollable strip of generated flyers
 * with edit, quick post, schedule, publish, and download actions.
 */

import React, { useRef } from 'react';
import { Icon } from '@/components/common/Icon';
import { Loader } from '@/components/common/Loader';
import { EmptyState } from '@/components/common/EmptyState';
import type { GalleryImage } from '@/types';

interface FlyerThumbStripProps {
  images: (GalleryImage | 'loading')[];
  onEdit: (image: GalleryImage) => void;
  onQuickPost: (image: GalleryImage) => void;
  onSchedule?: (image: GalleryImage) => void;
  onPublish: (image: GalleryImage) => void;
  onDownload: (image: GalleryImage, index: number) => void;
  onCloneStyle?: (image: GalleryImage) => void;
  showPublish?: boolean;
  emptyTitle: string;
  emptyDescription: string;
}

export const FlyerThumbStrip: React.FC<FlyerThumbStripProps> = ({
  images,
  onEdit,
  onQuickPost,
  onSchedule,
  onPublish,
  onDownload,
  onCloneStyle,
  showPublish = true,
  emptyTitle,
  emptyDescription,
}) => {
  const stripRef = useRef<HTMLDivElement>(null);

  const scrollStrip = (direction: 'prev' | 'next') => {
    const el = stripRef.current;
    if (!el) return;
    const scrollAmount = Math.round(el.clientWidth * 0.8);
    el.scrollBy({
      left: direction === 'next' ? scrollAmount : -scrollAmount,
      behavior: 'smooth',
    });
  };

  if (images.length === 0) {
    return (
      <div className="py-4 w-full">
        <EmptyState
          icon="image"
          title={emptyTitle}
          description={emptyDescription}
          size="large"
          className="w-full"
        />
      </div>
    );
  }

  return (
    <div className="relative">
      {images.length > 2 && (
        <>
          <button
            type="button"
            onClick={() => scrollStrip('prev')}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-7 h-7 rounded-full bg-black/60 border border-white/[0.06] flex items-center justify-center text-white hover:bg-primary hover:text-black transition-all"
            aria-label="Anterior"
          >
            <Icon name="chevron-up" className="w-3.5 h-3.5 -rotate-90" />
          </button>
          <button
            type="button"
            onClick={() => scrollStrip('next')}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-20 w-7 h-7 rounded-full bg-black/60 border border-white/[0.06] flex items-center justify-center text-white hover:bg-primary hover:text-black transition-all"
            aria-label="Próximo"
          >
            <Icon name="chevron-up" className="w-3.5 h-3.5 rotate-90" />
          </button>
        </>
      )}
      <div
        ref={stripRef}
        className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent scroll-smooth px-4"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        {images.map((flyer, index) => (
          <div
            key={flyer === 'loading' ? `loading-${index}` : flyer.id}
            className="flex-shrink-0 w-[140px] group"
            style={{ scrollSnapAlign: 'start' }}
          >
            <div className="aspect-[9/16] bg-black/80 rounded-xl overflow-hidden border border-white/5 relative">
              {flyer === 'loading' ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80">
                  <Loader size={24} className="mb-2 text-white/60" />
                  <p className="text-[8px] font-black text-white/40 uppercase tracking-widest animate-pulse">
                    Gerando...
                  </p>
                </div>
              ) : (
                <>
                  <img
                    src={flyer.src}
                    className="w-full h-full object-cover cursor-pointer transition-transform duration-300 group-hover:scale-105"
                    onClick={() => onEdit(flyer)}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-200 flex flex-col justify-end p-2 gap-1">
                    {/* Primary action */}
                    <button
                      onClick={() => onQuickPost(flyer)}
                      className="w-full flex items-center justify-center gap-1 px-2 py-1.5 bg-primary hover:bg-primary/90 rounded-lg text-black font-bold text-[8px] uppercase tracking-wide transition-all"
                    >
                      <Icon name="zap" className="w-2.5 h-2.5" />
                      Publicar
                    </button>
                    {/* Secondary actions - compact icons */}
                    <div className="flex gap-1 justify-center">
                      {onSchedule && (
                        <button
                          onClick={() => onSchedule(flyer)}
                          className="w-7 h-7 flex items-center justify-center bg-white/15 hover:bg-white/25 rounded-lg text-white transition-all"
                          title="Agendar"
                        >
                          <Icon name="calendar" className="w-3 h-3" />
                        </button>
                      )}
                      <button
                        onClick={() => onEdit(flyer)}
                        className="w-7 h-7 flex items-center justify-center bg-white/15 hover:bg-white/25 rounded-lg text-white transition-all"
                        title="Visualizar"
                      >
                        <Icon name="eye" className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => onDownload(flyer, index)}
                        className="w-7 h-7 flex items-center justify-center bg-white/15 hover:bg-white/25 rounded-lg text-white transition-all"
                        title="Download"
                      >
                        <Icon name="download" className="w-3 h-3" />
                      </button>
                      {showPublish && (
                        <button
                          onClick={() => onPublish(flyer)}
                          className="w-7 h-7 flex items-center justify-center bg-white/15 hover:bg-white/25 rounded-lg text-white transition-all"
                          title="Campanha"
                        >
                          <Icon name="users" className="w-3 h-3" />
                        </button>
                      )}
                      {onCloneStyle && (
                        <button
                          onClick={() => onCloneStyle(flyer)}
                          className="w-7 h-7 flex items-center justify-center bg-white/15 hover:bg-white/25 rounded-lg text-white transition-all"
                          title="Usar como modelo"
                        >
                          <Icon name="copy" className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
