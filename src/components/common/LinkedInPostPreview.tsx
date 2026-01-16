import React from "react";
import { Icon } from "./Icon";
import { SendToChatButton } from "./SendToChatButton";
import { Loader } from "./Loader";
import type { GalleryImage } from "../../types";

interface LinkedInPostPreviewProps {
  image: string | null;
  content: string;
  hashtags: string[];
  username?: string;
  headline?: string;
  isGenerating?: boolean;
  onGenerate?: () => void;
  onImageClick?: () => void;
  imagePrompt?: string;
  error?: string | null;
  galleryImage?: GalleryImage;
}

export const LinkedInPostPreview: React.FC<LinkedInPostPreviewProps> = ({
  image,
  content,
  hashtags,
  username = "Marca",
  headline = "Empresa",
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
      {/* LinkedIn Card */}
      <div className="w-full bg-black rounded-xl border border-white/20 overflow-hidden flex-1 flex flex-col">
        {/* Header */}
        <div className="p-3 pb-2 flex items-start gap-2.5">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center flex-shrink-0">
            <span className="text-[10px] font-bold text-white">
              {username.substring(0, 2).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <span className="text-[11px] font-semibold text-white block truncate">
                  {username}
                </span>
                <span className="text-[9px] text-white/50 block truncate">
                  {headline}
                </span>
                <span className="text-[9px] text-white/40">3h · 🌐</span>
              </div>
              <button className="px-2.5 py-1 text-[10px] font-semibold text-blue-400 hover:bg-blue-400/10 rounded transition-colors flex-shrink-0">
                + Seguir
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-3 pb-2">
          <p className="text-[10px] text-white/90 leading-relaxed line-clamp-4">
            {content}
          </p>
          {hashtags.length > 0 && (
            <p className="text-[9px] text-blue-400/70 mt-1.5 line-clamp-1">
              {cleanHashtags.slice(0, 4).join(' ')}
            </p>
          )}
        </div>

        {/* Image - fills remaining space */}
        <div
          className={`flex-1 bg-white/5 overflow-hidden min-h-[100px] ${onImageClick ? "cursor-pointer" : ""}`}
          onClick={onImageClick}
        >
          {isGenerating ? (
            <div className="w-full h-full flex items-center justify-center">
              <Loader />
            </div>
          ) : image ? (
            <div className="relative w-full h-full">
              <img
                src={image}
                alt="LinkedIn post"
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
        <div className="px-3 py-1.5 flex items-center justify-between text-[9px] text-white/40 border-b border-white/5">
          <div className="flex items-center gap-1">
            <div className="flex -space-x-1">
              <span className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center text-[8px]">👍</span>
              <span className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center text-[8px]">❤️</span>
            </div>
            <span>128</span>
          </div>
          <span>24 comentários</span>
        </div>

        {/* Action Bar */}
        <div className="px-2 py-1.5 flex items-center justify-between">
          <button className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded hover:bg-white/5 transition-colors text-white/50 hover:text-white/70">
            <Icon name="thumbs-up" className="w-4 h-4" />
            <span className="text-[10px] font-medium">Gostei</span>
          </button>
          <button className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded hover:bg-white/5 transition-colors text-white/50 hover:text-white/70">
            <Icon name="message-circle" className="w-4 h-4" />
            <span className="text-[10px] font-medium">Comentar</span>
          </button>
          <button className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded hover:bg-white/5 transition-colors text-white/50 hover:text-white/70">
            <Icon name="share" className="w-4 h-4" />
            <span className="text-[10px] font-medium">Enviar</span>
          </button>
        </div>
      </div>
      {error && (
        <p className="text-red-400 text-[9px] mt-2 text-center">{error}</p>
      )}
    </div>
  );
};
