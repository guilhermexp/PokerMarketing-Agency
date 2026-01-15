import React from "react";
import { Icon } from "./Icon";
import { Loader } from "./Loader";

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
}) => {
  return (
    <div className="h-full flex flex-col">
      {/* Facebook Ad Card */}
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
            </div>
            <div className="flex items-center gap-1 text-[9px] text-white/50">
              <span>Patrocinado</span>
              <span>·</span>
              <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zM1.5 8a6.5 6.5 0 1 1 13 0 6.5 6.5 0 0 1-13 0z"/>
              </svg>
            </div>
          </div>
          <Icon name="more-horizontal" className="w-5 h-5 text-white/40 flex-shrink-0" />
        </div>

        {/* Body text */}
        <div className="px-3 py-2">
          <p className="text-[10px] text-white/90 leading-relaxed line-clamp-2">
            {body}
          </p>
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
                alt="Facebook ad"
                className="w-full h-full object-cover"
                draggable={false}
              />
              {onImageClick && (
                <div className="absolute inset-0 bg-black/60 opacity-0 hover:opacity-100 transition-all flex items-center justify-center">
                  <div className="px-3 py-1.5 rounded-lg bg-white/20 backdrop-blur-sm text-xs text-white font-medium">
                    Editar
                  </div>
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

        {/* Ad Info */}
        <div className="px-3 py-2 bg-white/5 border-t border-white/10">
          <p className="text-[9px] text-white/50 uppercase tracking-wide mb-1">
            {username.toLowerCase().replace(/\s+/g, '')}.com
          </p>
          <p className="text-[11px] font-semibold text-white line-clamp-1">
            {headline}
          </p>
          <p className="text-[9px] text-white/50 line-clamp-1 mt-0.5">
            {body.substring(0, 60)}...
          </p>
        </div>

        {/* CTA Button */}
        <div className="px-3 py-2 border-t border-white/10 flex items-center justify-between">
          <button className="flex-1 py-2 bg-white/10 hover:bg-white/15 rounded text-[11px] font-semibold text-white/90 transition-colors">
            {cta}
          </button>
        </div>
      </div>
      {error && (
        <p className="text-red-400 text-[9px] mt-2 text-center">{error}</p>
      )}
    </div>
  );
};
