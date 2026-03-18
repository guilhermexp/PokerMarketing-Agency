import React, { useEffect } from "react";
import type { GalleryImage } from "../../types";
import { Icon } from "../common/Icon";

export interface GalleryItemProps {
  image: GalleryImage;
  isAudio: (img: GalleryImage) => boolean;
  isVideo: (img: GalleryImage) => boolean;
  isFavorite: (img: GalleryImage) => boolean;
  formatDuration: (seconds: number) => string;
  onToggleFavorite: (img: GalleryImage) => void;
  onSelect: (img: GalleryImage | null) => void;
  getVideoPoster: (img: GalleryImage) => string | undefined;
  onDelete?: (id: string) => void;
  className?: string;
  isNew?: boolean;
  isSelectMode?: boolean;
  isSelected?: boolean;
  onToggleSelection?: (id: string) => void;
}

export const GalleryItem: React.FC<GalleryItemProps> = ({
  image,
  isAudio,
  isVideo,
  isFavorite,
  formatDuration,
  onToggleFavorite,
  onSelect,
  getVideoPoster,
  onDelete,
  className = "",
  isNew = false,
  isSelectMode = false,
  isSelected = false,
  onToggleSelection,
}) => {
  const [videoError, setVideoError] = React.useState(false);
  const [imageError, setImageError] = React.useState(false);
  const [showHighlight, setShowHighlight] = React.useState(isNew);
  const [isLoaded, setIsLoaded] = React.useState(false);
  const poster = getVideoPoster(image);
  const imagePreviewSrc = image.thumbnailSrc || image.src;

  useEffect(() => {
    if (isNew) {
      setShowHighlight(true);
      const timer = setTimeout(() => setShowHighlight(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [isNew]);

  useEffect(() => {
    setIsLoaded(false);
    setImageError(false);
  }, [imagePreviewSrc]);

  const handleClick = () => {
    if (isSelectMode && onToggleSelection) {
      onToggleSelection(image.id);
    } else if (!isAudio(image)) {
      onSelect(image);
    }
  };

  return (
    <div
      onClick={handleClick}
      className={`group relative overflow-hidden rounded-xl border transition-all hover:shadow-lg hover:shadow-black/20 ${
        isAudio(image) && !isSelectMode ? "" : "cursor-pointer"
      } ${
        isSelected
          ? "border-primary/60 ring-2 ring-primary/40 bg-card"
          : showHighlight
          ? "border-primary/60 shadow-lg shadow-primary/30 animate-[pulse_2s_ease-in-out] bg-card"
          : "border-border bg-card"
      } ${className}`}
    >
      {isAudio(image) ? (
        <div className="w-full aspect-[4/3] bg-gradient-to-br from-primary/20 via-[#1a1a1a] to-[#111] flex flex-col items-center justify-center p-4">
          <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center mb-2">
            <Icon name="volume-2" className="w-6 h-6 text-primary" />
          </div>
          <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-wide mb-1">
            Narração
          </p>
          {image.duration && (
            <span className="text-[10px] text-muted-foreground font-mono mb-2">
              {formatDuration(image.duration)}
            </span>
          )}
          <audio
            src={image.src}
            className="w-full h-7"
            controls
            preload="metadata"
          />
          <a
            href={image.src}
            download={`narracao-${image.id.substring(0, 8)}.mp3`}
            className="mt-2 text-[9px] text-primary hover:text-primary/80 font-bold uppercase tracking-wide flex items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            <Icon name="download" className="w-3 h-3" />
            Download
          </a>
        </div>
      ) : isVideo(image) ? (
        videoError ? (
          // Fallback when video fails to load
          <div className="w-full aspect-[9/16] bg-gradient-to-br from-red-500/10 via-[#1a1a1a] to-[#111] flex flex-col items-center justify-center p-4">
            <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mb-2">
              <Icon name="alert-triangle" className="w-6 h-6 text-red-400" />
            </div>
            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wide text-center">
              Vídeo indisponível
            </p>
            <p className="text-[8px] text-muted-foreground mt-1 text-center">
              O arquivo pode ter expirado
            </p>
          </div>
        ) : (
          <video
            src={image.src}
            poster={poster}
            className="w-full h-auto object-cover transition-transform duration-500 group-hover:scale-[1.02]"
            muted
            playsInline
            preload={poster ? "none" : "metadata"}
            onMouseEnter={(e) => e.currentTarget.play().catch(() => {})}
            onMouseLeave={(e) => {
              e.currentTarget.pause();
              e.currentTarget.currentTime = 0;
            }}
            onError={() => setVideoError(true)}
          />
        )
      ) : imageError ? (
        // Fallback when image fails to load
        <div className="w-full aspect-square bg-gradient-to-br from-white/[0.02] via-[#1a1a1a] to-[#111] flex flex-col items-center justify-center p-4">
          <div className="w-10 h-10 rounded-full bg-white/[0.06] flex items-center justify-center mb-2">
            <Icon name="image" className="w-5 h-5 text-muted-foreground" />
          </div>
          <p className="text-[9px] text-muted-foreground font-medium text-center">
            Imagem indisponível
          </p>
        </div>
      ) : (
        <div className="relative w-full min-h-[120px]">
          {/* Shimmer placeholder */}
          {!isLoaded && (
            <div className="absolute inset-0 bg-muted rounded-xl overflow-hidden">
              <div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent"
                style={{
                  animation: "shimmer 1.5s infinite",
                  backgroundSize: "200% 100%",
                }}
              />
            </div>
          )}
          <img
            src={imagePreviewSrc}
            alt={image.prompt}
            className={`w-full h-auto object-cover transition-all duration-500 group-hover:scale-[1.02] ${
              isLoaded ? "opacity-100" : "opacity-0"
            }`}
            loading="lazy"
            decoding="async"
            fetchPriority="low"
            onLoad={() => setIsLoaded(true)}
            onError={() => setImageError(true)}
          />
        </div>
      )}

      {/* Overlay */}
      {!isAudio(image) && (
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col justify-end p-3 pointer-events-none">
          <p className="text-white text-[10px] font-bold leading-snug line-clamp-2 mb-2">
            {image.prompt || "Sem descrição"}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <span className="text-[8px] text-white/80 font-bold bg-white/10 backdrop-blur-sm px-2 py-0.5 rounded-full uppercase tracking-wide">
              {image.source}
            </span>
            {image.model && (
              <span className="text-[8px] text-primary font-bold bg-primary/20 backdrop-blur-sm px-2 py-0.5 rounded-full uppercase tracking-wide">
                Gemini
              </span>
            )}
            {image.published_at && (
              <span className="text-[8px] text-green-400 font-bold bg-green-500/20 backdrop-blur-sm px-2 py-0.5 rounded-full uppercase tracking-wide flex items-center gap-1">
                <Icon name="check" className="w-2.5 h-2.5" />
                Publicado
              </span>
            )}
          </div>
        </div>
      )}

      {/* Actions - hide in select mode */}
      {!isSelectMode && (
        <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-all duration-200">
          {!isAudio(image) && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFavorite(image);
                }}
                className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all backdrop-blur-sm ${isFavorite(image) ? "bg-primary text-black shadow-lg shadow-primary/30" : "bg-black/60 text-white/80 hover:bg-black/80 hover:text-primary"}`}
                title={
                  isFavorite(image)
                    ? "Remover dos favoritos"
                    : "Adicionar aos favoritos"
                }
              >
                <Icon name="heart" className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(image);
                }}
                className="w-7 h-7 rounded-lg bg-black/60 backdrop-blur-sm flex items-center justify-center text-white/80 hover:bg-black/80 transition-all"
                title="Editar imagem"
              >
                <Icon name="edit" className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (
                  confirm(
                    isAudio(image)
                      ? "Tem certeza que deseja excluir este áudio?"
                      : "Tem certeza que deseja excluir esta imagem?",
                  )
                )
                  onDelete(image.id);
              }}
              className="w-7 h-7 rounded-lg bg-black/60 backdrop-blur-sm flex items-center justify-center text-white/80 hover:bg-red-500/80 hover:text-white transition-all"
              title={isAudio(image) ? "Excluir áudio" : "Excluir imagem"}
            >
              <Icon name="trash" className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Selection checkbox */}
      {isSelectMode && (
        <div
          className={`absolute top-2 left-2 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${
            isSelected
              ? "bg-primary border-primary"
              : "bg-black/60 border-white/30 group-hover:border-white/50"
          }`}
        >
          {isSelected && <Icon name="check" className="w-3.5 h-3.5 text-black" />}
        </div>
      )}

      {/* Favorite indicator */}
      {!isSelectMode && !isAudio(image) && isFavorite(image) && (
        <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-primary flex items-center justify-center shadow-lg shadow-primary/30">
          <Icon name="heart" className="w-3 h-3 text-black" />
        </div>
      )}

      {/* Video indicator */}
      {isVideo(image) && !videoError && (
        <div className="absolute bottom-2 left-2 bg-black/70 backdrop-blur-sm rounded-full px-2 py-1 flex items-center gap-1">
          <Icon name="video" className="w-3 h-3 text-white" />
          <span className="text-[8px] font-bold text-white uppercase">Vídeo</span>
        </div>
      )}
    </div>
  );
};
