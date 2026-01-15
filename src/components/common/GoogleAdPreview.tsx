import React from "react";
import { Icon } from "./Icon";
import { Loader } from "./Loader";

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
}) => {
  const domain = `${username.toLowerCase().replace(/\s+/g, '')}.com.br`;

  return (
    <div className="h-full flex flex-col">
      {/* Google Display Ad Card */}
      <div className="w-full bg-white rounded-xl border border-gray-200 overflow-hidden flex-1 flex flex-col shadow-sm">
        {/* Image - main focus */}
        <div
          className={`flex-1 bg-gray-100 overflow-hidden min-h-[120px] relative ${onImageClick ? "cursor-pointer" : ""}`}
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
                alt="Google ad"
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
              {/* Ad badge */}
              <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-yellow-400 text-black text-[8px] font-bold rounded">
                Anúncio
              </div>
            </div>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-3">
              <Icon name="image" className="w-8 h-8 text-gray-300 mb-2" />
              {imagePrompt && (
                <p className="text-[8px] text-gray-400 italic text-center line-clamp-2">
                  "{imagePrompt}"
                </p>
              )}
              {onGenerate && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onGenerate();
                  }}
                  className="mt-2 px-3 py-1 text-[9px] font-medium rounded-md bg-blue-500/20 text-blue-600 hover:bg-blue-500/30 transition-colors flex items-center gap-1"
                >
                  <Icon name="zap" className="w-3 h-3" />
                  Gerar
                </button>
              )}
            </div>
          )}
        </div>

        {/* Ad Content */}
        <div className="p-3 bg-white">
          {/* Headline */}
          <p className="text-[12px] font-medium text-blue-600 hover:underline cursor-pointer line-clamp-1">
            {headline}
          </p>

          {/* URL */}
          <div className="flex items-center gap-1 mt-1">
            <span className="text-[10px] text-green-700">{domain}</span>
          </div>

          {/* Description */}
          <p className="text-[10px] text-gray-600 leading-relaxed mt-1 line-clamp-2">
            {body}
          </p>

          {/* CTA */}
          <button className="mt-2 w-full py-2 bg-blue-600 hover:bg-blue-700 rounded text-[10px] font-semibold text-white transition-colors">
            {cta}
          </button>
        </div>

        {/* Google branding */}
        <div className="px-3 py-1.5 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <span className="text-[9px] text-gray-400">Google Ads</span>
          </div>
          <Icon name="info" className="w-3.5 h-3.5 text-gray-400" />
        </div>
      </div>
      {error && (
        <p className="text-red-400 text-[9px] mt-2 text-center">{error}</p>
      )}
    </div>
  );
};
