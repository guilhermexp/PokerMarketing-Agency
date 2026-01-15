/**
 * VideoCard Component
 * Displays a video in the playground feed with TikTok-style card layout
 */

import { motion } from 'framer-motion';
import React, { useRef, useState } from 'react';
import { Download, AlertCircle, Sparkles, ImageIcon, Volume2, VolumeX } from 'lucide-react';
import { FeedPost, PostStatus, MediaType } from './types';
import { VeoLogo } from './VeoLogo';

interface VideoCardProps {
  post: FeedPost;
}

export const VideoCard: React.FC<VideoCardProps> = ({ post }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [_isHovered, setIsHovered] = useState(false);
  const [isMuted, setIsMuted] = useState(true);

  const status = post.status ?? PostStatus.SUCCESS;
  const aspectClass = post.aspectRatio === '16:9'
    ? 'aspect-[16/9]'
    : post.aspectRatio === '1:1'
      ? 'aspect-square'
      : 'aspect-[9/16]';

  const handleMouseEnter = () => {
    setIsHovered(true);
    if (status === PostStatus.SUCCESS && videoRef.current) {
      videoRef.current.play().catch(() => { });
    }
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  const handleToggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const isImage = post.mediaType === MediaType.IMAGE;
    const mediaUrl = isImage ? post.imageUrl : post.videoUrl;

    if (!mediaUrl || status !== PostStatus.SUCCESS) return;

    const extension = isImage ? 'png' : 'mp4';
    const filename = `playground-${isImage ? 'image' : 'video'}-${post.id}.${extension}`;

    try {
      if (mediaUrl.startsWith('blob:')) {
        const a = document.createElement('a');
        a.href = mediaUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else if (mediaUrl.startsWith('data:')) {
        // Handle data URLs (common for images)
        const a = document.createElement('a');
        a.href = mediaUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        const response = await fetch(mediaUrl);
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error("Download failed:", error);
    }
  };

  const renderContent = () => {
    switch (status) {
      case PostStatus.GENERATING:
        return (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-900 p-6 text-center">
            <div className="absolute inset-0 bg-gradient-to-br from-neutral-800 to-neutral-950 animate-pulse"></div>

            {post.referenceImageBase64 && (
              <div className="absolute inset-0 z-0 opacity-20 blur-md">
                <img src={`data:image/png;base64,${post.referenceImageBase64}`} alt="Reference" className="w-full h-full object-cover" />
              </div>
            )}

            <div className="relative z-10 flex flex-col items-center gap-4">
              <div className="relative">
                <div className="w-12 h-12 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                <VeoLogo className="w-5 h-5 text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
              </div>
              <div>
                <p className="text-sm font-bold uppercase tracking-widest text-white mb-1 animate-pulse">Gerando Cena</p>
                <p className="text-xs text-neutral-400 line-clamp-2 px-2 max-w-[200px] mx-auto">"{post.description}"</p>
              </div>
            </div>
            <div className="absolute inset-0 bg-black/30 pointer-events-none" />
          </div>
        );
      case PostStatus.ERROR:
        return (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-900/80 border border-red-500/30 p-6 text-center">
            <AlertCircle className="w-10 h-10 text-red-500 mb-3 opacity-80" />
            <p className="text-sm font-bold uppercase tracking-widest text-white mb-1">Erro na Geracao</p>
            <p className="text-xs text-red-300 line-clamp-3 px-2">{post.errorMessage || "Ocorreu um erro inesperado."}</p>
          </div>
        );
      case PostStatus.SUCCESS:
      default:
        // Check if this is an image or video
        if (post.mediaType === MediaType.IMAGE && post.imageUrl) {
          return (
            <img
              src={post.imageUrl}
              alt={post.description}
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
            />
          );
        }
        return (
          <video
            ref={videoRef}
            src={post.videoUrl}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
            loop
            muted={isMuted}
            playsInline
            autoPlay
          />
        );
    }
  };

  return (
    <motion.div
      className={`relative w-full h-full rounded-3xl overflow-hidden bg-neutral-900/40 border border-white/5 ${aspectClass} group shadow-2xl shadow-black/50 ring-1 ring-black/50 flex flex-col`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      initial={{ opacity: 0, scale: 0.95, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.4, type: 'spring' }}
      layout
    >
      {status === PostStatus.SUCCESS && post.status && (
        <div className="absolute top-4 left-4 z-20 bg-white/90 backdrop-blur-md px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest text-black flex items-center gap-1 shadow-[0_2px_10px_rgba(0,0,0,0.2)]">
          <Sparkles className="w-3 h-3 text-black" />
          Novo
        </div>
      )}

      <div className="flex-1 relative w-full h-full">
        {renderContent()}
      </div>

      {status === PostStatus.SUCCESS && (
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/80 pointer-events-none transition-opacity duration-300 group-hover:opacity-90" />
      )}

      <div className="absolute top-4 right-4 flex items-center gap-1.5 bg-black/30 border border-white/10 backdrop-blur-xl px-2.5 py-1.5 rounded-full text-xs font-medium text-white/90 pointer-events-none shadow-lg z-20">
        {post.mediaType === MediaType.IMAGE ? (
          <ImageIcon className="w-3 h-3 opacity-80" />
        ) : (
          <VeoLogo className="w-3 h-3 opacity-80" />
        )}
        {post.modelTag}
      </div>

      <div className={`absolute bottom-0 left-0 w-full p-5 flex items-end justify-between z-20 pt-16 bg-gradient-to-t from-black via-black/50 to-transparent transition-opacity duration-300 ${status !== PostStatus.SUCCESS ? 'opacity-50 pointer-events-none' : ''}`}>
        <div className="flex-1 mr-4 pointer-events-none">
          <div className="flex items-center gap-2.5 mb-2">
            <img src={post.avatarUrl} alt={post.username} className="w-8 h-8 rounded-full border border-white/20 shadow-md" />
            <span className="font-semibold text-sm text-white drop-shadow-md backdrop-blur-[1px]">{post.username}</span>
          </div>
          <p className="text-sm text-neutral-200 line-clamp-2 drop-shadow-md font-light leading-snug opacity-90 group-hover:opacity-100 transition-opacity">{post.description}</p>
        </div>

        {status === PostStatus.SUCCESS && (
          <div className="flex flex-col gap-3 items-center shrink-0 pointer-events-auto">
            {post.mediaType === MediaType.VIDEO && post.videoUrl && (
              <button
                onClick={handleToggleMute}
                className={`p-3 rounded-full border backdrop-blur-xl transition-all text-white shadow-[0_4px_12px_rgba(0,0,0,0.3)] hover:scale-105 ${isMuted
                    ? 'bg-white/10 border-white/20 hover:bg-white/20 hover:border-white/40'
                    : 'bg-white/30 border-white/40 hover:bg-white/40'
                  }`}
                title={isMuted ? "Ativar audio" : "Desativar audio"}
              >
                {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>
            )}
            <button
              onClick={handleDownload}
              className="p-3 rounded-full bg-white/10 border border-white/20 backdrop-blur-xl hover:bg-white/20 transition-all text-white shadow-[0_4px_12px_rgba(0,0,0,0.3)] hover:scale-105 hover:border-white/40"
              title={post.mediaType === MediaType.IMAGE ? "Download Imagem" : "Download Video"}
            >
              <Download className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default VideoCard;
