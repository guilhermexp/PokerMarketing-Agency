/**
 * CampaignCarouselCard
 */

import React from 'react';
import type { CarouselScript, GalleryImage } from '../../types';
import { Icon } from '../common/Icon';
import { SendToChatButton } from '../common/SendToChatButton';
import { Loader } from '../common/Loader';
import { CarouselPreview } from './CarouselPreview';

interface CampaignCarouselCardProps {
  carousel: CarouselScript;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
  previewImages: GalleryImage[];
  orderedImages: GalleryImage[];
  totalSlides: number;
  slidesWithImages: number;
  hasCover: boolean;
  allGenerated: boolean;
  isGeneratingAny: boolean;
  isPaused: boolean;
  publishing: boolean;
  captions: Record<string, string>;
  onGenerateAll: () => void;
  onTogglePause: () => void;
  onSchedule?: () => void;
  onPublish?: () => void;
  onReorder: (newOrder: GalleryImage[]) => void;
  onOpenEditor: (image: GalleryImage) => void;
  onCaptionChange: (caption: string) => void;
  generatingSlides: Record<string, boolean>;
  totalExpectedSlides: number;
  onDownloadAll?: () => void;
}

export const CampaignCarouselCard: React.FC<CampaignCarouselCardProps> = ({
  carousel,
  index,
  isExpanded,
  onToggle,
  previewImages,
  orderedImages,
  totalSlides,
  slidesWithImages,
  hasCover,
  allGenerated,
  isGeneratingAny,
  isPaused,
  publishing,
  captions,
  onGenerateAll,
  onTogglePause,
  onSchedule,
  onPublish,
  onReorder,
  onOpenEditor,
  onCaptionChange,
  generatingSlides,
  totalExpectedSlides,
  onDownloadAll,
}) => {
  const hasAnyImages = previewImages.length > 0;

  return (
    <div className="bg-white/[0.02] border border-white/[0.08] rounded-xl overflow-hidden">
      <div
        className="px-3 sm:px-4 py-3 border-b border-white/[0.06] flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 cursor-pointer hover:bg-white/[0.02] transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-xs font-medium text-white/60 flex-shrink-0">
            {index + 1}
          </div>
          <h3 className="text-sm font-medium text-white/90 truncate flex-1">
            {carousel.title}
          </h3>
          <Icon
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            className="w-4 h-4 text-white/40 sm:hidden flex-shrink-0"
          />
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto scrollbar-none -mx-3 px-3 sm:mx-0 sm:px-0 pb-1 sm:pb-0 [&>*]:flex-shrink-0">
          <div className="flex items-center gap-1.5 sm:gap-2">
            {hasAnyImages && (
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-medium whitespace-nowrap">
                {previewImages.length} imagens
              </span>
            )}
            <span className="text-[10px] sm:text-xs text-white/40 whitespace-nowrap">
              {hasCover ? '1' : '0'} capa + {slidesWithImages}/{totalSlides} slides
            </span>
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onGenerateAll();
            }}
            disabled={isGeneratingAny}
            className="px-3 py-1.5 text-xs font-medium rounded-full bg-black/40 backdrop-blur-2xl border border-white/10 text-white/60 hover:text-white/90 hover:border-white/30 transition-all shadow-[0_8px_30px_rgba(0,0,0,0.5)] disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap flex items-center gap-1.5"
          >
            {isGeneratingAny ? (
              <>
                <Loader size={12} className="text-white/60" />
                Gerando...
              </>
            ) : allGenerated ? (
              <>
                <Icon name="refresh" className="w-3 h-3" />
                Regenerar
              </>
            ) : (
              <>
                <Icon name="zap" className="w-3 h-3" />
                Gerar Tudo
              </>
            )}
          </button>

          {isGeneratingAny && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onTogglePause();
              }}
              className="px-3 py-1.5 text-xs font-medium rounded-full bg-black/40 backdrop-blur-2xl border border-white/10 text-white/60 hover:text-white/90 hover:border-white/30 transition-all shadow-[0_8px_30px_rgba(0,0,0,0.5)] whitespace-nowrap"
            >
              {isPaused ? 'Retomar' : 'Pausar'}
            </button>
          )}

          {onSchedule && hasAnyImages && orderedImages.length >= 2 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSchedule();
              }}
            className="px-3 py-1.5 text-xs font-medium rounded-full bg-black/40 backdrop-blur-2xl border border-white/10 text-white/60 hover:text-white/90 hover:border-white/30 transition-all shadow-[0_8px_30px_rgba(0,0,0,0.5)] flex items-center gap-1.5 whitespace-nowrap"
          >
              <Icon name="calendar" className="w-3.5 h-3.5" />
              Agendar
            </button>
          )}

          {onPublish && hasAnyImages && orderedImages.length >= 2 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPublish();
              }}
              disabled={publishing}
              className="px-3 py-1.5 text-xs font-medium rounded-full bg-black/40 backdrop-blur-2xl border border-white/10 text-white/60 hover:text-white/90 hover:border-white/30 transition-all shadow-[0_8px_30px_rgba(0,0,0,0.5)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 whitespace-nowrap"
            >
              {publishing ? (
                <>
                  <Loader size={12} className="text-white/60" />
                  Publicando...
                </>
              ) : (
                <>
                  <Icon name="send" className="w-3.5 h-3.5" />
                  Publicar
                </>
              )}
            </button>
          )}

          {onDownloadAll && hasAnyImages && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDownloadAll();
              }}
              className="px-3 py-1.5 text-xs font-medium rounded-full bg-black/40 backdrop-blur-2xl border border-white/10 text-white/60 hover:text-white/90 hover:border-white/30 transition-all shadow-[0_8px_30px_rgba(0,0,0,0.5)] flex items-center gap-1.5 whitespace-nowrap"
            >
              <Icon name="download" className="w-3.5 h-3.5" />
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
          {hasAnyImages ? (
            <CarouselPreview
              images={orderedImages}
              onReorder={onReorder}
              clipTitle={carousel.title}
              onOpenEditor={onOpenEditor}
              caption={captions[carousel.id] || carousel.caption || ''}
              onCaptionChange={onCaptionChange}
              generatingSlides={generatingSlides}
              totalExpectedSlides={totalExpectedSlides}
            />
          ) : isGeneratingAny ? (
            <div className="flex gap-6 items-center">
              <div className="flex-shrink-0">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <span className="px-2 py-0.5 rounded bg-white/10 text-[10px] font-medium text-white/60 border border-white/10">
                    Gerando carrossel...
                  </span>
                </div>
                <div className="w-[320px] bg-black rounded-[32px] p-2 shadow-2xl border border-white/10">
                  <div className="w-24 h-6 bg-black rounded-full mx-auto mb-1" />
                  <div className="relative bg-[#0a0a0a] rounded-[24px] overflow-hidden">
                    <div className="px-3 py-2 flex items-center gap-2 border-b border-white/5">
                      <div className="w-7 h-7 rounded-full bg-white/10" />
                      <div className="flex-1 space-y-1">
                        <div className="w-16 h-2.5 bg-white/10 rounded" />
                        <div className="w-12 h-2 bg-white/5 rounded" />
                      </div>
                    </div>
                    <div className="aspect-[4/5] bg-gradient-to-b from-white/5 to-white/0 flex items-center justify-center">
                      <div className="text-center">
                        <Loader size={32} className="mx-auto mb-3 text-white/60" />
                        <p className="text-sm text-white/70">
                          Gerando capa...
                        </p>
                        <p className="text-xs text-white/40 mt-1">
                          Depois os slides
                        </p>
                      </div>
                    </div>
                    <div className="flex justify-center gap-1 py-2">
                      {Array.from({
                        length: Math.min(totalSlides, 5),
                      }).map((_, idx) => (
                        <div
                          key={idx}
                          className="w-1.5 h-1.5 rounded-full bg-white/20"
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-4">
                  <Loader size={14} className="text-white/60" />
                  <span className="text-xs text-white/50">
                    Gerando imagens do carrossel...
                  </span>
                </div>
                <div className="flex items-center justify-start gap-1 pb-2">
                  {Array.from({ length: Math.min(totalSlides + 1, 6) }).map(
                    (_, idx) => (
                      <div
                        key={`skeleton-${idx}`}
                        className="relative flex-shrink-0 rounded-xl overflow-hidden border-2 border-white/10 shadow-lg"
                        style={{
                          width: idx === 0 ? '10rem' : '5rem',
                          height: '20rem',
                        }}
                      >
                        <div className="w-full h-full bg-gradient-to-b from-white/5 to-white/0 flex items-center justify-center">
                          {idx === 0 && (
                            <div className="text-center">
                              <Loader size={16} className="mx-auto mb-1 text-white/60" />
                              <span className="text-[9px] text-white/50">
                                Capa
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/50 text-xs text-white/40 font-medium">
                          {idx === 0 ? 'C' : idx}
                        </div>
                      </div>
                    ),
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <Icon
                name="image"
                className="w-10 h-10 text-white/20 mx-auto mb-3"
              />
              <p className="text-sm text-white/50 mb-4">
                Clique em "Gerar Tudo" para criar o carrossel completo
              </p>
              <button
                onClick={onGenerateAll}
                disabled={isGeneratingAny}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-amber-600 text-white hover:bg-amber-500 transition-colors disabled:opacity-50"
              >
                {isGeneratingAny ? 'Gerando...' : 'Gerar Tudo'}
              </button>
            </div>
          )}
        </div>
      )}

      {!isExpanded && hasAnyImages && (
        <div className="px-4 py-3 flex gap-3 overflow-x-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
          {orderedImages.slice(0, 8).map((img, idx) => (
            <div
              key={img.id || idx}
              className="relative w-20 h-25 flex-shrink-0 rounded-lg overflow-hidden border-2 border-white/10 hover:border-white/30 hover:scale-105 transition-all shadow-lg group"
            >
              <img
                src={img.src}
                alt={`Preview ${idx + 1}`}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center gap-1.5">
                <SendToChatButton image={img} />
                <button
                  onClick={() => onOpenEditor(img)}
                  className="w-7 h-7 rounded-lg bg-black/60 backdrop-blur-sm flex items-center justify-center text-white/80 hover:bg-black/80 hover:text-primary transition-all"
                  title="Editar"
                >
                  <Icon name="edit" className="w-3.5 h-3.5" />
                </button>
              </div>
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
};
