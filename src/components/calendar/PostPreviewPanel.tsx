import React from 'react';
import type { GalleryImage, InstagramContentType } from '../../types';
import { Icon } from '../common/Icon';
import { PostFormFields } from './PostFormFields';

// Check if gallery item is a video
export const isVideoItem = (image: GalleryImage) => {
  return (
    image.mediaType === 'video' ||
    image.src?.endsWith('.mp4') ||
    image.src?.includes('video') ||
    image.source?.startsWith('Video-') ||
    image.source === 'Video Final'
  );
};

// Check if gallery item is an audio
export const isAudioItem = (image: GalleryImage) => {
  return (
    image.mediaType === 'audio' ||
    image.model === 'tts-generation' ||
    image.src?.endsWith('.mp3') ||
    image.src?.endsWith('.wav')
  );
};

interface PostPreviewPanelProps {
  selectedImage: GalleryImage | null;
  selectedIsVideo: boolean;
  caption: string;
  onCaptionChange: (value: string) => void;
  hashtags: string;
  onHashtagsChange: (value: string) => void;
  contentType: InstagramContentType;
  onContentTypeChange: (type: InstagramContentType) => void;
  onOpenImageSelector: () => void;
}

export const PostPreviewPanel: React.FC<PostPreviewPanelProps> = ({
  selectedImage,
  selectedIsVideo,
  caption,
  onCaptionChange,
  hashtags,
  onHashtagsChange,
  contentType,
  onContentTypeChange,
  onOpenImageSelector,
}) => {
  return (
    <div className="w-full sm:w-80 bg-[#070707] border-b sm:border-b-0 sm:border-r border-border flex flex-col max-h-[50vh] sm:max-h-none overflow-y-auto">
      {/* Image Preview */}
      <div className="h-72 sm:h-96 bg-black flex items-center justify-center relative shrink-0">
        {selectedImage ? (
          <>
            {selectedIsVideo ? (
              <video
                src={selectedImage.src}
                className="w-full h-full object-cover"
                muted
                loop
                playsInline
              />
            ) : (
              <img
                src={selectedImage.src}
                alt=""
                className="w-full h-full object-cover"
              />
            )}
            {/* Change Image Button */}
            <button
              onClick={onOpenImageSelector}
              className="absolute bottom-3 right-3 px-3 py-1.5 bg-background/90 backdrop-blur-xl border border-border rounded-lg text-xs font-medium text-white hover:bg-white/5 transition-all"
            >
              Trocar Imagem
            </button>
          </>
        ) : (
          <button
            onClick={onOpenImageSelector}
            className="w-full h-full flex flex-col items-center justify-center gap-3 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all cursor-pointer border-2 border-dashed border-border hover:border-white/20"
          >
            <div className="w-14 h-14 rounded-2xl bg-white/5 border border-border flex items-center justify-center">
              <Icon name="image" className="w-7 h-7" />
            </div>
            <div className="text-center">
              <span className="text-sm font-medium block">Selecionar Imagem</span>
              <span className="text-[10px] text-muted-foreground">Clique para abrir a galeria</span>
            </div>
          </button>
        )}
      </div>

      {/* Post Details */}
      <PostFormFields
        caption={caption}
        onCaptionChange={onCaptionChange}
        hashtags={hashtags}
        onHashtagsChange={onHashtagsChange}
        contentType={contentType}
        onContentTypeChange={onContentTypeChange}
      />
    </div>
  );
};
