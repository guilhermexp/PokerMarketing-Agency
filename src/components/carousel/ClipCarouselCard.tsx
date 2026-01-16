/**
 * ClipCarouselCard
 */

import React from 'react';
import type { GalleryImage, VideoClipScript } from '../../types';
import { Icon } from '../common/Icon';
import { Loader } from '../common/Loader';
import { CarouselPreview } from './CarouselPreview';

interface ClipCarouselCardProps {
  clip: VideoClipScript;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
  orderedImages: GalleryImage[];
  carrosselCount: number;
  totalScenes: number;
  hasCarrosselImages: boolean;
  hasAnyOriginal: boolean;
  allGenerated: boolean;
  isGeneratingAny: boolean;
  isPaused: boolean;
  publishing: boolean;
  caption: string;
  onGenerateAll: () => void;
  onTogglePause: () => void;
  onSchedule?: () => void;
  onPublish?: () => void;
  onReorder: (newOrder: GalleryImage[]) => void;
  onOpenEditor: (image: GalleryImage) => void;
  onCaptionChange: (caption: string) => void;
  onGenerateCaption: () => void;
  isGeneratingCaption: boolean;
  onDownloadAll?: () => void;
}

export const ClipCarouselCard: React.FC<ClipCarouselCardProps> = ({
  clip,
  index,
  isExpanded,
  onToggle,
  orderedImages,
  carrosselCount,
  totalScenes,
  hasCarrosselImages,
  hasAnyOriginal,
  allGenerated,
  isGeneratingAny,
  isPaused,
  publishing,
  caption,
  onGenerateAll,
  onTogglePause,
  onSchedule,
  onPublish,
  onReorder,
  onOpenEditor,
  onCaptionChange,
  onGenerateCaption,
  isGeneratingCaption,
  onDownloadAll,
}) => (
  <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl overflow-hidden">
    <div
      className="px-3 sm:px-4 py-3 border-b border-white/[0.06] flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 cursor-pointer hover:bg-white/[0.02] transition-colors"
      onClick={onToggle}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-xs font-medium text-white/60 flex-shrink-0">
          {index + 1}
        </div>
        <h3 className="text-sm font-medium text-white/90 truncate flex-1">
          {clip.title}
        </h3>
        <Icon
          name={isExpanded ? 'chevron-up' : 'chevron-down'}
          className="w-4 h-4 text-white/40 sm:hidden flex-shrink-0"
        />
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto scrollbar-none -mx-3 px-3 sm:mx-0 sm:px-0 pb-1 sm:pb-0 [&>*]:flex-shrink-0">
        <div className="flex items-center gap-1.5 sm:gap-2">
          {hasCarrosselImages && (
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-medium whitespace-nowrap">
              {carrosselCount} slides
            </span>
          )}
          <span className="text-[10px] sm:text-xs text-white/40 whitespace-nowrap">
            {carrosselCount}/{totalScenes} em 4:5
          </span>
        </div>

        {hasAnyOriginal && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onGenerateAll();
            }}
            disabled={isGeneratingAny}
            className="px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs font-medium rounded-md bg-white/10 text-white/70 hover:bg-white/15 transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {isGeneratingAny
              ? 'Gerando...'
              : allGenerated
                ? 'Regenerar 4:5'
                : 'Gerar 4:5'}
          </button>
        )}

        {isGeneratingAny && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onTogglePause();
            }}
            className="px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs font-medium rounded-md bg-white/10 text-white/70 hover:bg-white/15 transition-colors whitespace-nowrap"
          >
            {isPaused ? 'Retomar' : 'Pausar'}
          </button>
        )}

        {onSchedule && hasCarrosselImages && orderedImages.length >= 2 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSchedule();
            }}
            className="px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs font-medium rounded-md bg-white/10 text-white/70 hover:bg-white/15 transition-colors flex items-center gap-1 sm:gap-1.5 whitespace-nowrap"
          >
            <Icon name="calendar" className="w-3 sm:w-3.5 h-3 sm:h-3.5" />
            Agendar
          </button>
        )}

        {onPublish && hasCarrosselImages && orderedImages.length >= 2 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPublish();
            }}
            disabled={publishing}
            className="px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs font-medium rounded-md bg-white/10 text-white/70 hover:bg-white/15 transition-colors disabled:opacity-50 flex items-center gap-1 sm:gap-1.5 whitespace-nowrap"
          >
            {publishing ? (
              <>
                <Loader className="h-3 w-3" />
                Publicando...
              </>
            ) : (
              <>
                <Icon name="send" className="w-3 sm:w-3.5 h-3 sm:h-3.5" />
                Publicar
              </>
            )}
          </button>
        )}

        {onDownloadAll && hasCarrosselImages && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDownloadAll();
            }}
            className="px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs font-medium rounded-md bg-white/10 text-white/70 hover:bg-white/15 transition-colors flex items-center gap-1 sm:gap-1.5 whitespace-nowrap"
          >
            <Icon name="download" className="w-3 sm:w-3.5 h-3 sm:h-3.5" />
            Baixar Todas
          </button>
        )}

        <Icon
          name={isExpanded ? 'chevron-up' : 'chevron-down'}
          className="w-4 h-4 text-white/40 hidden sm:block"
        />
      </div>
    </div>

    {isExpanded && (
      <div className="p-6">
        {hasCarrosselImages ? (
          <CarouselPreview
            images={orderedImages}
            onReorder={onReorder}
            clipTitle={clip.title}
            onOpenEditor={onOpenEditor}
            caption={caption}
            onCaptionChange={onCaptionChange}
            onGenerateCaption={onGenerateCaption}
            isGeneratingCaption={isGeneratingCaption}
          />
        ) : hasAnyOriginal ? (
          <div className="text-center py-8">
            <Icon name="image" className="w-10 h-10 text-white/20 mx-auto mb-3" />
            <p className="text-sm text-white/50 mb-4">
              Gere as imagens 4:5 para visualizar o carrossel
            </p>
            <button
              onClick={onGenerateAll}
              disabled={isGeneratingAny}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-white/10 text-white/70 hover:bg-white/15 transition-colors disabled:opacity-50"
            >
              {isGeneratingAny ? 'Gerando...' : 'Gerar Todas as Imagens 4:5'}
            </button>
          </div>
        ) : (
          <div className="text-center py-8">
            <Icon name="image" className="w-10 h-10 text-white/20 mx-auto mb-3" />
            <p className="text-sm text-white/50">
              Gere as capas na aba Clips primeiro
            </p>
          </div>
        )}
      </div>
    )}

    {!isExpanded && hasCarrosselImages && (
      <div className="px-4 py-3 flex gap-3 overflow-x-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
        {orderedImages.slice(0, 8).map((img, idx) => (
          <div
            key={img.id || idx}
            className="w-20 h-25 flex-shrink-0 rounded-lg overflow-hidden border-2 border-white/10 cursor-pointer hover:border-white/30 hover:scale-105 transition-all shadow-lg"
            onClick={() => onOpenEditor(img)}
          >
            <img
              src={img.src}
              alt={`Preview ${idx + 1}`}
              className="w-full h-full object-cover"
            />
          </div>
        ))}
        {orderedImages.length > 8 && (
          <div className="w-20 h-25 flex-shrink-0 rounded-lg bg-white/5 border-2 border-white/10 flex items-center justify-center">
            <span className="text-sm font-medium text-white/50">
              +{orderedImages.length - 8}
            </span>
          </div>
        )}
      </div>
    )}
  </div>
);
