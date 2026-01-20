import React from "react";
import { Icon } from "./Icon";
import { SendToChatButton } from "./SendToChatButton";
import { Loader } from "./Loader";
import type { GalleryImage } from "../../types";

interface FacebookPostPreviewProps {
  image: string | null;
  content: string;
  hashtags: string[];
  username?: string;
  isGenerating?: boolean;
  onGenerate?: () => void;
  onImageClick?: () => void;
  imagePrompt?: string;
  error?: string | null;
  galleryImage?: GalleryImage;
}

export const FacebookPostPreview: React.FC<FacebookPostPreviewProps> = ({
  image,
  content,
  hashtags,
  username = "Marca",
  isGenerating = false,
  onGenerate,
  onImageClick,
  imagePrompt,
  error,
  galleryImage,
}) => {
  const cleanHashtags = hashtags.map(h => h.startsWith('#') ? h : `#${h}`);

  return (
    <div className="h-full flex flex-col">
      {/* Facebook Card */}
      <div className="w-full bg-black rounded-xl border border-white/20 overflow-hidden flex-1 flex flex-col">
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
              {/* Verified badge */}
              <svg className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
              </svg>
              <span className="text-[10px] text-blue-400 hover:underline cursor-pointer">Seguir</span>
            </div>
            <div className="flex items-center gap-1 text-[9px] text-white/50">
              <span>6 de janeiro às 05:09</span>
              <span>·</span>
              <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zM1.5 8a6.5 6.5 0 1 1 13 0 6.5 6.5 0 0 1-13 0z"/>
              </svg>
            </div>
          </div>
          <Icon name="more-horizontal" className="w-5 h-5 text-white/40 flex-shrink-0" />
        </div>

        {/* Content text */}
        <div className="px-3 py-2">
          <p className="text-[10px] text-white/90 leading-relaxed line-clamp-3">
            {content}
            {hashtags.length > 0 && (
              <span className="text-blue-400/80"> {cleanHashtags.slice(0, 3).join(' ')}</span>
            )}
          </p>
        </div>

        {/* Image - fills remaining space */}
        <div
          className={`flex-1 bg-white/5 overflow-hidden min-h-[120px] ${onImageClick ? "cursor-pointer" : ""}`}
          onClick={onImageClick}
        >
          {isGenerating ? (
            <div className="w-full h-full flex items-center justify-center">
              <Loader className="text-white/60" />
            </div>
          ) : image ? (
            <div className="relative w-full h-full">
              <img
                src={image}
                alt="Facebook post"
                className="w-full h-full object-cover"
                draggable={false}
              />
              {(onImageClick || galleryImage) && (
                <div className="absolute inset-0 bg-black/60 opacity-0 hover:opacity-100 transition-all flex items-center justify-center gap-2">
                  {galleryImage && (
                    <SendToChatButton image={galleryImage} />
                  )}
                  {onImageClick && (
                    <div className="px-3 py-1.5 rounded-lg bg-white/20 backdrop-blur-sm text-xs text-white font-medium cursor-pointer">
                      Editar
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-3">
              <Icon name="image" className="w-8 h-8 text-white/10 mb-2" />
              {imagePrompt && (
                <p className="text-[8px] text-white/20 italic text-center line-clamp-2">
                  "{imagePrompt}"
                </p>
              )}
              {onGenerate && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onGenerate();
                  }}
                  className="mt-2 px-3 py-1 text-[9px] font-medium rounded-md bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors flex items-center gap-1"
                >
                  <Icon name="zap" className="w-3 h-3" />
                  Gerar
                </button>
              )}
            </div>
          )}
        </div>

        {/* Engagement stats */}
        <div className="px-3 py-1.5 flex items-center justify-between text-[9px] text-white/40">
          <div className="flex items-center gap-1">
            <div className="flex -space-x-1">
              <span className="w-4 h-4 rounded-full bg-blue-600 flex items-center justify-center text-[7px]">👍</span>
              <span className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center text-[7px]">❤️</span>
            </div>
            <span>28 mil</span>
          </div>
          <div className="flex items-center gap-2 text-[8px]">
            <span>109 comentários</span>
            <span>·</span>
            <span>2,7 mil compartilhamentos</span>
          </div>
        </div>

        {/* Action Bar */}
        <div className="px-2 py-1 flex items-center justify-around border-t border-white/10">
          <button className="flex items-center justify-center gap-1.5 py-2 flex-1 rounded-md hover:bg-white/5 transition-colors text-white/60 hover:text-white/80">
            <Icon name="thumbs-up" className="w-4 h-4" />
            <span className="text-[10px] font-medium">Curtir</span>
          </button>
          <button className="flex items-center justify-center gap-1.5 py-2 flex-1 rounded-md hover:bg-white/5 transition-colors text-white/60 hover:text-white/80">
            <Icon name="message-circle" className="w-4 h-4" />
            <span className="text-[10px] font-medium">Comentar</span>
          </button>
          <button className="flex items-center justify-center gap-1.5 py-2 flex-1 rounded-md hover:bg-white/5 transition-colors text-white/60 hover:text-white/80">
            <Icon name="share" className="w-4 h-4" />
            <span className="text-[10px] font-medium">Compartilhar</span>
          </button>
        </div>
      </div>
      {error && (
        <p className="text-red-400 text-[9px] mt-2 text-center">{error}</p>
      )}
    </div>
  );
};
