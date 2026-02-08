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
  onDelete?: (image: GalleryImage) => void;
  showPublish?: boolean;
  emptyTitle: string;
  emptyDescription: string;
  selectedFlyerId?: string | null;
  onSelectFlyer?: (id: string) => void;
}

export const FlyerThumbStrip: React.FC<FlyerThumbStripProps> = ({
  images,
  onEdit: _onEdit,
  onQuickPost: _onQuickPost,
  onSchedule: _onSchedule,
  onPublish: _onPublish,
  onDownload: _onDownload,
  onCloneStyle: _onCloneStyle,
  onDelete,
  showPublish: _showPublish = true,
  emptyTitle,
  emptyDescription,
  selectedFlyerId,
  onSelectFlyer,
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
            className="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-7 h-7 rounded-full bg-black/60 border border-white/[0.06] flex items-center justify-center text-white hover:bg-white/20 hover:text-white transition-all"
            aria-label="Anterior"
          >
            <Icon name="chevron-up" className="w-3.5 h-3.5 -rotate-90" />
          </button>
          <button
            type="button"
            onClick={() => scrollStrip('next')}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-20 w-7 h-7 rounded-full bg-black/60 border border-white/[0.06] flex items-center justify-center text-white hover:bg-white/20 hover:text-white transition-all"
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
        {images.map((flyer, index) => {
          const isSelected = flyer !== 'loading' && flyer.id === selectedFlyerId;
          return (
            <div
              key={flyer === 'loading' ? `loading-${index}` : flyer.id}
              className="flex-shrink-0 w-[140px] group"
              style={{ scrollSnapAlign: 'start' }}
            >
              <div className={`aspect-[9/16] bg-black/80 rounded-xl overflow-hidden border-2 transition-all relative ${
                isSelected
                  ? 'border-white/60 shadow-[0_0_15px_rgba(255,255,255,0.3)]'
                  : 'border-white/5 hover:border-white/20'
              }`}>
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
                      onClick={() => {
                        if (onSelectFlyer) {
                          onSelectFlyer(flyer.id);
                        }
                      }}
                      title="Clique para selecionar"
                    />
                    {isSelected && (
                      <div className="absolute top-2 right-2 bg-white/90 rounded-full p-1">
                        <Icon name="check" className="w-3 h-3 text-black" />
                      </div>
                    )}
                    {/* Delete button - appears on hover */}
                    {onDelete && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(flyer);
                        }}
                        className="absolute top-2 left-2 w-6 h-6 rounded-full bg-red-500/80 hover:bg-red-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Excluir flyer"
                      >
                        <Icon name="x" className="w-3 h-3 text-white" />
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
