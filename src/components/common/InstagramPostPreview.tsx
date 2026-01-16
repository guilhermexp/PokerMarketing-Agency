import React, { useState } from "react";
import { Icon } from "./Icon";
import { SendToChatButton } from "./SendToChatButton";
import { Loader } from "./Loader";
import type { GalleryImage } from "../../types";

interface InstagramPostPreviewProps {
  image: string | null;
  caption: string;
  hashtags: string[];
  username?: string;
  isGenerating?: boolean;
  onGenerate?: () => void;
  onImageClick?: () => void;
  imagePrompt?: string;
  error?: string | null;
  galleryImage?: GalleryImage;
}

export const InstagramPostPreview: React.FC<InstagramPostPreviewProps> = ({
  image,
  caption,
  hashtags,
  username = "marca",
  isGenerating = false,
  onGenerate,
  onImageClick,
  imagePrompt,
  error,
  galleryImage,
}) => {
  const [showFullCaption, setShowFullCaption] = useState(false);

  // Truncate caption for preview - show more by default
  const truncatedCaption = caption.length > 250 ? caption.slice(0, 250) + "..." : caption;
  const displayCaption = showFullCaption ? caption : truncatedCaption;

  return (
    <div className="flex flex-col h-full">
      {/* Phone Frame */}
      <div className="w-full max-w-[320px] mx-auto bg-black rounded-[32px] p-2 shadow-2xl border border-white/10 flex-1 flex flex-col">
        {/* Phone notch */}
        <div className="w-20 h-5 bg-black rounded-full mx-auto mb-0.5" />

        {/* Screen */}
        <div className="relative bg-[#0a0a0a] rounded-[20px] overflow-hidden flex-1 flex flex-col">
          {/* Instagram Header */}
          <div className="px-2.5 py-1.5 flex items-center gap-2 border-b border-white/5">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center flex-shrink-0">
              <span className="text-[7px] font-bold text-white">CPC</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-semibold text-white truncate">
                {username}
              </p>
              <p className="text-[7px] text-white/40">Patrocinado</p>
            </div>
            <Icon name="more-horizontal" className="w-3.5 h-3.5 text-white/60 flex-shrink-0" />
          </div>

          {/* Post Image */}
          <div
            className={`relative aspect-square bg-black overflow-hidden ${onImageClick ? "cursor-pointer" : ""}`}
            onClick={onImageClick}
          >
            {isGenerating ? (
              <div className="w-full h-full flex items-center justify-center">
                <Loader />
              </div>
            ) : image ? (
              <>
                <img
                  src={image}
                  alt="Post preview"
                  className="w-full h-full object-cover"
                  draggable={false}
                />
                {/* Hover overlay for editing and chat */}
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
              </>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-3">
                <Icon name="image" className="w-8 h-8 text-white/10 mb-2" />
                {imagePrompt && (
                  <p className="text-[8px] text-white/20 italic text-center line-clamp-3">
                    "{imagePrompt}"
                  </p>
                )}
                {onGenerate && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onGenerate();
                    }}
                    className="mt-2 px-3 py-1 text-[9px] font-medium rounded-md bg-primary/20 text-primary hover:bg-primary/30 transition-colors flex items-center gap-1"
                  >
                    <Icon name="zap" className="w-3 h-3" />
                    Gerar
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Action Bar */}
          <div className="px-2.5 py-1.5 flex items-center gap-3">
            <Icon name="heart" className="w-4 h-4 text-white" />
            <Icon name="message-circle" className="w-4 h-4 text-white" />
            <Icon name="send" className="w-4 h-4 text-white" />
            <div className="flex-1" />
            <Icon name="bookmark" className="w-4 h-4 text-white" />
          </div>

          {/* Caption */}
          <div className="px-2.5 pb-3 flex-1 overflow-y-auto max-h-[120px]">
            <p className="text-[9px] text-white/90 leading-relaxed">
              <span className="font-semibold">{username}</span>{" "}
              {displayCaption}
            </p>
            {caption.length > 250 && (
              <button
                onClick={() => setShowFullCaption(!showFullCaption)}
                className="text-[8px] text-white/40 hover:text-white/60 transition-colors mt-1"
              >
                {showFullCaption ? "menos" : "mais"}
              </button>
            )}
            {/* Hashtags */}
            {hashtags.length > 0 && (
              <p className="text-[8px] text-blue-400/70 mt-1.5">
                {hashtags.map((tag) => `#${tag}`).join(" ")}
              </p>
            )}
          </div>
        </div>
      </div>
      {error && (
        <p className="text-red-400 text-[9px] mt-2 text-center">{error}</p>
      )}
    </div>
  );
};
