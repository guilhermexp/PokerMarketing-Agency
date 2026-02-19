import React from "react";
import { Icon } from "./Icon";
import { ImageGenerationLoader } from "../ui/ai-chat-image-generation-1";
import type { GalleryImage } from "../../types";

interface GoogleAdPreviewProps {
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

export const GoogleAdPreview: React.FC<GoogleAdPreviewProps> = ({
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
  const domain = `${username.toLowerCase().replace(/\s+/g, '')}.com.br`;

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
      {/* Google Display Ad Card */}
      <div className="w-full bg-black rounded-xl border border-border overflow-hidden flex-1 flex flex-col shadow-sm">
        {/* Image - main focus */}
        <div
          className={`flex-1 bg-black overflow-hidden min-h-[120px] relative ${onImageClick ? "cursor-pointer" : ""}`}
          onClick={onImageClick}
        >
          {showLoader && (
            <div className="absolute inset-0 z-10">
              <ImageGenerationLoader
                prompt={imagePrompt || ""}
                isGenerating={isGenerating}
                imageSrc={isImageLoading ? null : image}
              />
            </div>
          )}
          {image ? (
            <div className="relative w-full h-full">
              <img
                src={image}
                alt="Google ad"
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
              {/* Ad badge */}
              {!isImageLoading && (
                <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-primary text-black text-[8px] font-bold rounded">
                  Anúncio
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

        {/* Ad Content */}
        <div className="p-3 bg-black">
          {/* Headline */}
          <p className="text-[12px] font-medium text-blue-400 hover:underline cursor-pointer line-clamp-1">
            {headline}
          </p>

          {/* URL */}
          <div className="flex items-center gap-1 mt-1">
            <span className="text-[10px] text-green-400">{domain}</span>
          </div>

          {/* Description */}
          <p className="text-[10px] text-muted-foreground leading-relaxed mt-1 line-clamp-2">
            {body}
          </p>

          {/* CTA */}
          <button className="mt-2 w-full py-2 bg-blue-600 hover:bg-blue-700 rounded text-[10px] font-semibold text-white transition-colors">
            {cta}
          </button>
        </div>

        {/* Google branding */}
        <div className="px-3 py-1.5 bg-white/5 border-t border-border flex items-center justify-between">
          <div className="flex items-center gap-1">
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <span className="text-[9px] text-muted-foreground">Google Ads</span>
          </div>
          <Icon name="info" className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
      </div>
      {error && (
        <p className="text-red-400/80 text-[9px] mt-2 text-center">{error}</p>
      )}
    </div>
  );
};
