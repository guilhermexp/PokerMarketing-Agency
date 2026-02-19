import React from "react";
import { Icon } from "./Icon";
import { ImageGenerationLoader } from "../ui/ai-chat-image-generation-1";
import type { GalleryImage } from "../../types";

interface TwitterPostPreviewProps {
  image: string | null;
  content: string;
  hashtags: string[];
  username?: string;
  handle?: string;
  isGenerating?: boolean;
  onGenerate?: () => void;
  onRegenerate?: () => void;
  onImageClick?: () => void;
  imagePrompt?: string;
  error?: string | null;
  galleryImage?: GalleryImage;
}

export const TwitterPostPreview: React.FC<TwitterPostPreviewProps> = ({
  image,
  content,
  hashtags,
  username = "Marca",
  handle,
  isGenerating = false,
  onGenerate,
  onRegenerate,
  onImageClick,
  imagePrompt,
  error,
  galleryImage,
}) => {
  const [isImageLoading, setIsImageLoading] = React.useState(false);
  const [loadedImage, setLoadedImage] = React.useState<string | null>(null);
  const displayHandle = handle || `@${username.toLowerCase().replace(/\s+/g, "_")}`;
  const cleanHashtags = hashtags.map(h => h.startsWith('#') ? h : `#${h}`);

  // Track when image URL changes to show loading
  React.useEffect(() => {
    if (image && image !== loadedImage) {
      setIsImageLoading(true);
    }
  }, [image, loadedImage]);

  const handleImageLoad = () => {
    setIsImageLoading(false);
    setLoadedImage(image);
  };

  const showLoader = isGenerating || isImageLoading;

  return (
    <div className="h-full flex flex-col">
      {/* Twitter Card */}
      <div className="w-full bg-black rounded-xl border border-border overflow-hidden flex-1 flex flex-col">
        {/* Header */}
        <div className="p-3 pb-2 flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center flex-shrink-0">
            <span className="text-[9px] font-bold text-white">
              {username.substring(0, 2).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[11px] font-bold text-white truncate">
                {username}
              </span>
              <svg className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.5 12.5c0-1.58-.875-2.95-2.148-3.6.154-.435.238-.905.238-1.4 0-2.21-1.71-3.998-3.818-3.998-.47 0-.92.084-1.336.25C14.818 2.415 13.51 1.5 12 1.5s-2.816.917-3.437 2.25c-.415-.165-.866-.25-1.336-.25-2.11 0-3.818 1.79-3.818 4 0 .494.083.964.237 1.4-1.272.65-2.147 2.018-2.147 3.6 0 1.495.782 2.798 1.942 3.486-.02.17-.032.34-.032.514 0 2.21 1.708 4 3.818 4 .47 0 .92-.086 1.335-.25.62 1.334 1.926 2.25 3.437 2.25 1.512 0 2.818-.916 3.437-2.25.415.163.865.248 1.336.248 2.11 0 3.818-1.79 3.818-4 0-.174-.012-.344-.033-.513 1.158-.687 1.943-1.99 1.943-3.484zm-6.616-3.334l-4.334 6.5c-.145.217-.382.334-.625.334-.143 0-.288-.04-.416-.126l-.115-.094-2.415-2.415c-.293-.293-.293-.768 0-1.06s.768-.294 1.06 0l1.77 1.767 3.825-5.74c.23-.345.696-.436 1.04-.207.346.23.44.696.21 1.04z" />
              </svg>
              <span className="text-[10px] text-muted-foreground">
                {displayHandle} · 2h
              </span>
            </div>
            <p className="text-[10px] text-white/90 leading-relaxed line-clamp-4 mt-1">
              {content}
            </p>
          </div>
        </div>

        {/* Image - fills remaining space */}
        <div
          className={`flex-1 bg-black overflow-hidden mx-3 mb-2 rounded-xl min-h-[120px] relative ${onImageClick ? "cursor-pointer" : ""}`}
          onClick={onImageClick}
        >
          {showLoader && (
            <div className="absolute inset-0 z-10">
              <ImageGenerationLoader prompt={imagePrompt || ""} showLabel={true} />
            </div>
          )}
          {image ? (
            <div className="relative w-full h-full">
              <img
                src={image}
                alt="Tweet media"
                className="w-full h-full object-cover"
                draggable={false}
                onLoad={handleImageLoad}
                style={{ opacity: isImageLoading ? 0 : 1 }}
              />
              {!isImageLoading && onImageClick && (
                <div className="absolute inset-0 bg-black/60 opacity-0 hover:opacity-100 transition-all flex items-center justify-center gap-2">
                  <div className="px-3 py-1.5 rounded-lg bg-white/20 backdrop-blur-sm text-xs text-white font-medium cursor-pointer">
                    Editar
                  </div>
                </div>
              )}
            </div>
          ) : !isGenerating ? (
            <div className="w-full h-full flex flex-col items-center justify-center p-3">
              <Icon name="image" className="w-8 h-8 text-muted-foreground mb-2" />
              {imagePrompt && (
                <p className="text-[8px] text-muted-foreground italic text-center line-clamp-2">
                  "{imagePrompt}"
                </p>
              )}
              {onGenerate && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onGenerate();
                  }}
                  className="mt-2 px-3 py-1 text-[9px] font-medium rounded-md bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-white/80 transition-colors flex items-center gap-1 border border-border"
                >
                  <Icon name="zap" className="w-3 h-3" />
                  Gerar
                </button>
              )}
            </div>
          ) : null}
        </div>

        {/* Regenerate button - integrated in mockup when image exists */}
        {image && !isGenerating && onRegenerate && (
          <div className="px-3 py-2 border-t border-border">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRegenerate();
              }}
              disabled={isGenerating}
              className="w-full px-3 py-1.5 text-[8px] font-medium rounded-lg bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-white/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5 border border-border"
            >
              <Icon name="refresh" className="w-3 h-3" />
              Regenerar imagem
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="px-3 pb-3">
          {hashtags.length > 0 && (
            <p className="text-[9px] text-blue-400/70 mb-2 line-clamp-1">
              {cleanHashtags.slice(0, 4).join(' ')}
            </p>
          )}
          <div className="flex items-center justify-between text-muted-foreground">
            <div className="flex items-center gap-1 hover:text-blue-400 transition-colors cursor-pointer">
              <Icon name="message-circle" className="w-4 h-4" />
              <span className="text-[10px]">24</span>
            </div>
            <div className="flex items-center gap-1 hover:text-green-400 transition-colors cursor-pointer">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 1l4 4-4 4" />
                <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                <path d="M7 23l-4-4 4-4" />
                <path d="M21 13v2a4 4 0 0 1-4 4H3" />
              </svg>
              <span className="text-[10px]">12</span>
            </div>
            <div className="flex items-center gap-1 hover:text-pink-400 transition-colors cursor-pointer">
              <Icon name="heart" className="w-4 h-4" />
              <span className="text-[10px]">248</span>
            </div>
            <div className="flex items-center gap-1">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              <span className="text-[10px]">1.2K</span>
            </div>
            <Icon name="bookmark" className="w-4 h-4 hover:text-blue-400 transition-colors cursor-pointer" />
          </div>
        </div>
      </div>
      {error && (
        <p className="text-red-400 text-[9px] mt-2 text-center">{error}</p>
      )}
    </div>
  );
};
