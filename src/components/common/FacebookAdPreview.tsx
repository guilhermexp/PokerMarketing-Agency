import React from "react";
import { Icon } from "./Icon";
import { ImageGenerationLoader } from "../ui/ai-chat-image-generation-1";
import type { GalleryImage } from "../../types";

interface FacebookAdPreviewProps {
  image: string | null;
  headline: string;
  body: string;
  cta: string;
  username?: string;
  isGenerating?: boolean;
  onGenerate?: () => void;
  onImageClick?: () => void;
  imagePrompt?: string;
  error?: string | null;
  galleryImage?: GalleryImage;
}

export const FacebookAdPreview: React.FC<FacebookAdPreviewProps> = ({
  image,
  headline,
  body,
  cta,
  username = "Marca",
  isGenerating = false,
  onGenerate,
  onImageClick,
  imagePrompt,
  error,
  galleryImage,
}) => {
  const [isImageLoading, setIsImageLoading] = React.useState(false);
  const [loadedImage, setLoadedImage] = React.useState<string | null>(null);

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
      {/* Facebook Ad Card */}
      <div className="w-full bg-black rounded-xl border border-border overflow-hidden flex-1 flex flex-col">
        {/* Header */}
        <div className="p-3 pb-1 flex items-start gap-2.5">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center flex-shrink-0">
            <span className="text-[10px] font-bold text-white">
              {username.substring(0, 2).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <span className="text-[11px] font-semibold text-white truncate">
                {username}
              </span>
            </div>
            <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
              <span>Patrocinado</span>
            </div>
          </div>
          <Icon name="more-horizontal" className="w-5 h-5 text-muted-foreground flex-shrink-0" />
        </div>

        {/* Body text */}
        <div className="px-3 py-2">
          <p className="text-[10px] text-white/90 leading-relaxed line-clamp-2">
            {body}
          </p>
        </div>

        {/* Image - fills remaining space */}
        <div
          className={`flex-1 bg-white/5 overflow-y-auto min-h-[150px] relative ${onImageClick ? "cursor-pointer" : ""}`}
          onClick={onImageClick}
        >
          {showLoader && (
            <div className="absolute inset-0 z-10">
              <ImageGenerationLoader prompt={imagePrompt || ""} showLabel={true} />
            </div>
          )}
          {image ? (
            <img
              src={image}
              alt="Facebook ad"
              className="w-full h-full object-cover"
              draggable={false}
              onLoad={handleImageLoad}
              style={{ opacity: isImageLoading ? 0 : 1 }}
            />
          ) : !isGenerating ? (
            <div className="w-full flex flex-col items-center justify-center p-3">
              <Icon name="image" className="w-8 h-8 text-muted-foreground mb-2" />
              {imagePrompt && (
                <p className="text-[8px] text-muted-foreground italic text-center leading-relaxed">
                  "{imagePrompt}"
                </p>
              )}
            </div>
          ) : null}
        </div>

        {/* Ad Info */}
        <div className="px-3 py-2 bg-white/5 border-t border-border flex-1 overflow-y-auto">
          <p className="text-[9px] text-muted-foreground uppercase tracking-wide mb-1">
            {username.toLowerCase().replace(/\s+/g, '')}.com
          </p>
          <p className="text-[11px] font-semibold text-white">
            {headline}
          </p>
          <p className="text-[9px] text-muted-foreground mt-0.5 leading-relaxed">
            {body}
          </p>
        </div>

        {/* CTA Button */}
        <div className="px-3 py-2 border-t border-border">
          <button className="w-full py-2 bg-white/10 hover:bg-white/15 rounded text-[11px] font-semibold text-white/90 transition-colors mb-2">
            {cta}
          </button>

          {/* Action buttons - integrated */}
          {(onGenerate || (image && (onImageClick || galleryImage))) && (
            <div className="space-y-1.5">
              {!image && onGenerate && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onGenerate();
                  }}
                  className="w-full px-3 py-1.5 text-[8px] font-medium rounded-lg bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-white/80 transition-colors flex items-center justify-center gap-1.5 border border-border"
                >
                  <Icon name="zap" className="w-3 h-3" />
                  Gerar
                </button>
              )}
              {image && onImageClick && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onImageClick();
                  }}
                  className="w-full px-3 py-1.5 text-[8px] font-medium rounded-lg bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-white/80 transition-colors flex items-center justify-center gap-1.5 border border-border"
                >
                  <Icon name="edit" className="w-3 h-3" />
                  Editar
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      {error && (
        <p className="text-red-400 text-[9px] mt-2 text-center">{error}</p>
      )}
    </div>
  );
};
