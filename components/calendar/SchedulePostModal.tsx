import React, { useState, useMemo, useRef } from 'react';
import type { ScheduledPost, GalleryImage, SchedulingPlatform, InstagramContentType } from '../../types';
import { Icon } from '../common/Icon';

interface SchedulePostModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSchedule: (post: Omit<ScheduledPost, 'id' | 'createdAt' | 'updatedAt'>) => void;
  galleryImages: GalleryImage[];
  initialDate?: string | null;
}

// Check if gallery item is a video
const isVideoItem = (image: GalleryImage) => {
  return (
    image.mediaType === 'video' ||
    image.src?.endsWith('.mp4') ||
    image.src?.includes('video') ||
    image.source?.startsWith('Video-') ||
    image.source === 'Video Final'
  );
};

// Check if gallery item is an audio
const isAudioItem = (image: GalleryImage) => {
  return (
    image.mediaType === 'audio' ||
    image.model === 'tts-generation' ||
    image.src?.endsWith('.mp3') ||
    image.src?.endsWith('.wav')
  );
};

export const SchedulePostModal: React.FC<SchedulePostModalProps> = ({
  isOpen,
  onClose,
  onSchedule,
  galleryImages,
  initialDate
}) => {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const getDefaultTime = () => {
    const now = new Date();
    const minutes = Math.ceil(now.getMinutes() / 5) * 5 + 5;
    now.setMinutes(minutes);
    now.setSeconds(0);
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes() % 60).padStart(2, '0')}`;
  };

  const videoRef = useRef<HTMLVideoElement>(null);
  const [selectedImages, setSelectedImages] = useState<GalleryImage[]>([]);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [scheduledDate, setScheduledDate] = useState(initialDate || todayStr);
  const [scheduledTime, setScheduledTime] = useState(getDefaultTime());
  const [platforms] = useState<SchedulingPlatform>('instagram');
  const [contentType, setContentType] = useState<InstagramContentType>('photo');
  const [publishNow, setPublishNow] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [galleryFilter, setGalleryFilter] = useState<'all' | 'flyers' | 'posts' | 'videos'>('all');

  const isCarousel = contentType === 'carousel';
  const isReel = contentType === 'reel';
  const isStory = contentType === 'story';
  const selectedImage = selectedImages[0] || null;
  const selectedIsVideo = selectedImage && isVideoItem(selectedImage);

  const isTimeInPast = useMemo(() => {
    if (publishNow) return false;
    const scheduled = new Date(`${scheduledDate}T${scheduledTime}`);
    return scheduled.getTime() < Date.now();
  }, [scheduledDate, scheduledTime, publishNow]);

  // Helper to check item type by source
  const isFlyer = (img: GalleryImage) =>
    img.source === 'Flyer' || img.source === 'Flyer Diário';

  const isPost = (img: GalleryImage) =>
    img.source === 'Post' || img.source === 'Anúncio';

  // Filter media based on content type and gallery filter
  const eligibleImages = useMemo(() => {
    return galleryImages.filter(img => {
      const isAudio = isAudioItem(img);
      const isVideo = isVideoItem(img);

      // Audio is never allowed
      if (isAudio) return false;

      // For Reels, allow both images and videos
      // For other types, only images
      if (!isReel && isVideo) return false;

      // Apply gallery filter
      if (galleryFilter === 'flyers') return isFlyer(img);
      if (galleryFilter === 'posts') return isPost(img);
      if (galleryFilter === 'videos') return isVideo;

      return true;
    });
  }, [galleryImages, isReel, galleryFilter]);

  const handleSelectImage = (image: GalleryImage) => {
    // Pause video when changing selection
    if (videoRef.current) {
      videoRef.current.pause();
      setIsPlaying(false);
    }

    if (isCarousel) {
      // Toggle selection for carousel
      const isSelected = selectedImages.some(img => img.id === image.id);
      if (isSelected) {
        setSelectedImages(prev => prev.filter(img => img.id !== image.id));
      } else if (selectedImages.length < 10) {
        setSelectedImages(prev => [...prev, image]);
      }
    } else {
      // Single selection
      setSelectedImages([image]);
    }
  };

  const handleContentTypeChange = (type: InstagramContentType) => {
    setContentType(type);
    if (type !== 'carousel' && selectedImages.length > 1) {
      // Keep only first image when switching from carousel
      setSelectedImages(selectedImages.slice(0, 1));
    }
    setCarouselIndex(0);
  };

  const getSelectionIndex = (image: GalleryImage) => {
    return selectedImages.findIndex(img => img.id === image.id);
  };

  const togglePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleSubmit = () => {
    if (selectedImages.length === 0) return;

    const hashtagsArray = hashtags
      .split(/[\s,]+/)
      .map(tag => tag.startsWith('#') ? tag : `#${tag}`)
      .filter(tag => tag.length > 1);

    const finalDate = publishNow ? todayStr : scheduledDate;
    const finalTime = publishNow ? getDefaultTime() : scheduledTime;
    const scheduledTimestamp = publishNow ? Date.now() : new Date(`${finalDate}T${finalTime}`).getTime();

    onSchedule({
      type: selectedImage?.source === 'Post' ? 'campaign_post' :
            selectedImage?.source === 'Anúncio' ? 'ad_creative' : 'flyer',
      contentId: selectedImage?.id || '',
      imageUrl: selectedImage?.src || '',
      caption,
      hashtags: hashtagsArray,
      scheduledDate: finalDate,
      scheduledTime: finalTime,
      scheduledTimestamp,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      platforms,
      status: 'scheduled',
      createdFrom: 'gallery',
      instagramContentType: contentType
    });
  };

  if (!isOpen) return null;

  // Get aspect ratio class based on content type
  const getAspectRatio = () => {
    if (isReel || isStory) return 'aspect-[9/16]';
    return 'aspect-square';
  };

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[300] flex items-center justify-center p-4 md:p-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-6xl max-h-[90vh] bg-[#0a0a0a] rounded-2xl border border-white/10 shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/5 flex justify-between items-center shrink-0">
          <div>
            <h2 className="text-lg font-black text-white uppercase tracking-tight">
              Agendar Publicação
            </h2>
            <p className="text-[9px] font-bold text-white/30 uppercase tracking-wider mt-0.5">
              {isCarousel
                ? `Selecione até 10 imagens (${selectedImages.length}/10)`
                : 'Selecione uma imagem da galeria'
              }
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-white/30 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
          >
            <Icon name="x" className="w-5 h-5" />
          </button>
        </div>

        {/* Content - Two columns on large screens */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          {/* Gallery Grid */}
          <div className="flex-1 overflow-y-auto border-b lg:border-b-0 lg:border-r border-white/5 flex flex-col">
            {/* Gallery Filter */}
            <div className="px-4 pt-4 pb-2 flex gap-1 shrink-0">
              {[
                { id: 'all', label: 'Todos' },
                { id: 'flyers', label: 'Flyers' },
                { id: 'posts', label: 'Campanhas' },
                ...(isReel ? [{ id: 'videos', label: 'Vídeos' }] : []),
              ].map((filter) => (
                <button
                  key={filter.id}
                  onClick={() => setGalleryFilter(filter.id as typeof galleryFilter)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                    galleryFilter === filter.id
                      ? 'bg-white/10 text-white'
                      : 'text-white/40 hover:text-white/60 hover:bg-white/5'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-4">
            {eligibleImages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
                  <Icon name="image" className="w-8 h-8 text-white/20" />
                </div>
                <p className="text-sm font-bold text-white/40">Galeria Vazia</p>
                <p className="text-xs text-white/20 mt-1">
                  Gere imagens em Campanhas ou Flyers para aparecerem aqui
                </p>
              </div>
            ) : (
              <div className="columns-2 sm:columns-3 lg:columns-3 gap-3">
                {eligibleImages.map((image) => {
                  const selectionIndex = getSelectionIndex(image);
                  const isSelected = selectionIndex !== -1;
                  const itemIsVideo = isVideoItem(image);
                  return (
                    <div
                      key={image.id}
                      onClick={() => handleSelectImage(image)}
                      className={`group relative overflow-hidden rounded-xl border-2 bg-[#111111] transition-all break-inside-avoid mb-3 cursor-pointer ${
                        isSelected
                          ? 'border-primary shadow-lg shadow-primary/20'
                          : 'border-white/5 hover:border-white/20'
                      }`}
                    >
                      {itemIsVideo ? (
                        <video
                          src={image.src}
                          className="w-full h-auto object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                          muted
                          playsInline
                          preload="metadata"
                        />
                      ) : (
                        <img
                          src={image.src}
                          alt={image.prompt}
                          className="w-full h-auto object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                        />
                      )}

                      {/* Overlay */}
                      <div className={`absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent transition-all duration-300 flex flex-col justify-end p-3 ${
                        isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      }`}>
                        <p className="text-white text-[10px] font-bold leading-snug line-clamp-2 mb-2">
                          {image.prompt}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          <span className="text-[8px] text-white/80 font-bold bg-white/10 backdrop-blur-sm px-2 py-0.5 rounded-full uppercase tracking-wide">
                            {image.source}
                          </span>
                        </div>
                      </div>

                      {/* Video indicator */}
                      {itemIsVideo && (
                        <div className="absolute bottom-2 left-2 bg-black/70 backdrop-blur-sm rounded-full px-2 py-1 flex items-center gap-1">
                          <Icon name="video" className="w-3 h-3 text-white" />
                          <span className="text-[8px] font-bold text-white uppercase">Vídeo</span>
                        </div>
                      )}

                      {/* Selected indicator */}
                      {isSelected && (
                        <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-primary flex items-center justify-center shadow-lg">
                          {isCarousel ? (
                            <span className="text-[10px] font-black text-black">{selectionIndex + 1}</span>
                          ) : (
                            <Icon name="check" className="w-3.5 h-3.5 text-black" />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            </div>
          </div>

          {/* Instagram Preview Panel */}
          <div className="w-full lg:w-96 shrink-0 overflow-y-auto bg-black flex flex-col">
            {/* Preview based on content type */}
            <div className="bg-black border-b border-white/10 flex-1 flex flex-col">

              {/* Story Preview */}
              {isStory && (
                <div className="flex-1 flex items-center justify-center p-4">
                  <div className="relative w-full max-w-[280px] aspect-[9/16] bg-[#111] rounded-2xl overflow-hidden">
                    {selectedImages.length > 0 ? (
                      <>
                        <img
                          src={selectedImages[0]?.src}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                        {/* Story Header */}
                        <div className="absolute top-0 left-0 right-0 p-3">
                          <div className="h-0.5 bg-white/30 rounded-full mb-3">
                            <div className="h-full w-1/3 bg-white rounded-full" />
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 p-[2px]">
                              <div className="w-full h-full rounded-full bg-black" />
                            </div>
                            <span className="text-xs font-semibold text-white">seu_perfil</span>
                            <span className="text-[10px] text-white/50">2h</span>
                          </div>
                        </div>
                        {/* Story Footer */}
                        <div className="absolute bottom-0 left-0 right-0 p-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 px-4 py-2 border border-white/30 rounded-full">
                              <span className="text-xs text-white/50">Enviar mensagem</span>
                            </div>
                            <Icon name="heart" className="w-6 h-6 text-white" />
                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <line x1="22" y1="2" x2="11" y2="13" />
                              <polygon points="22 2 15 22 11 13 2 9 22 2" />
                            </svg>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <div className="text-center">
                          <Icon name="image" className="w-12 h-12 text-white/20 mx-auto mb-2" />
                          <p className="text-xs text-white/30">Selecione uma imagem</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Reel Preview */}
              {isReel && (
                <div className="flex-1 flex items-center justify-center p-4">
                  <div className="relative w-full max-w-[280px] aspect-[9/16] bg-[#111] rounded-2xl overflow-hidden">
                    {selectedImages.length > 0 ? (
                      <>
                        {selectedIsVideo ? (
                          <video
                            ref={videoRef}
                            src={selectedImages[0]?.src}
                            className="w-full h-full object-cover"
                            loop
                            playsInline
                            onClick={togglePlayPause}
                            onEnded={() => setIsPlaying(false)}
                          />
                        ) : (
                          <img
                            src={selectedImages[0]?.src}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        )}
                        {/* Reel UI */}
                        <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent">
                          <div className="flex items-end gap-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 p-[2px]">
                                  <div className="w-full h-full rounded-full bg-black" />
                                </div>
                                <span className="text-xs font-semibold text-white">seu_perfil</span>
                                <button className="px-3 py-1 border border-white rounded text-[10px] font-semibold text-white">
                                  Seguir
                                </button>
                              </div>
                              <p className="text-xs text-white line-clamp-2">
                                {caption || 'Sua legenda aqui...'}
                              </p>
                              {hashtags && (
                                <p className="text-xs text-white/70 mt-1">
                                  {hashtags.split(/[\s,]+/).slice(0, 3).map(tag => tag.startsWith('#') ? tag : `#${tag}`).join(' ')}
                                </p>
                              )}
                            </div>
                            <div className="flex flex-col items-center gap-4">
                              <div className="text-center">
                                <Icon name="heart" className="w-7 h-7 text-white" />
                                <span className="text-[10px] text-white">1.2k</span>
                              </div>
                              <div className="text-center">
                                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                                </svg>
                                <span className="text-[10px] text-white">234</span>
                              </div>
                              <div className="text-center">
                                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                  <line x1="22" y1="2" x2="11" y2="13" />
                                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                                </svg>
                              </div>
                              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                                <circle cx="5" cy="12" r="2" />
                                <circle cx="12" cy="12" r="2" />
                                <circle cx="19" cy="12" r="2" />
                              </svg>
                            </div>
                          </div>
                        </div>
                        {/* Play/Pause button */}
                        {selectedIsVideo ? (
                          <button
                            onClick={togglePlayPause}
                            className={`absolute inset-0 flex items-center justify-center transition-opacity duration-200 ${
                              isPlaying ? 'opacity-0 hover:opacity-100' : 'opacity-100'
                            }`}
                          >
                            <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                              {isPlaying ? (
                                <Icon name="pause" className="w-8 h-8 text-white" />
                              ) : (
                                <Icon name="play" className="w-8 h-8 text-white ml-1" />
                              )}
                            </div>
                          </button>
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                              <Icon name="play" className="w-8 h-8 text-white ml-1" />
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <div className="text-center">
                          <Icon name="video" className="w-12 h-12 text-white/20 mx-auto mb-2" />
                          <p className="text-xs text-white/30">Selecione um vídeo ou imagem</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Feed / Carousel Preview */}
              {(contentType === 'photo' || isCarousel) && (
                <>
                  {/* Post Header */}
                  <div className="flex items-center gap-3 p-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 p-[2px]">
                      <div className="w-full h-full rounded-full bg-black flex items-center justify-center">
                        <span className="text-[10px] font-bold text-white">IG</span>
                      </div>
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-white">seu_perfil</p>
                      <p className="text-[10px] text-white/50">Local</p>
                    </div>
                    <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <circle cx="5" cy="12" r="2" />
                      <circle cx="12" cy="12" r="2" />
                      <circle cx="19" cy="12" r="2" />
                    </svg>
                  </div>

                  {/* Post Image / Carousel */}
                  <div className={`${getAspectRatio()} bg-[#111] flex items-center justify-center relative`}>
                    {selectedImages.length > 0 ? (
                      <>
                        <img
                          src={selectedImages[carouselIndex]?.src}
                          alt=""
                          className="w-full h-full object-cover"
                        />

                        {/* Carousel Navigation */}
                        {isCarousel && selectedImages.length > 1 && (
                          <>
                            {carouselIndex > 0 && (
                              <button
                                onClick={() => setCarouselIndex(prev => prev - 1)}
                                className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 flex items-center justify-center shadow-lg"
                              >
                                <Icon name="chevron-left" className="w-5 h-5 text-black" />
                              </button>
                            )}
                            {carouselIndex < selectedImages.length - 1 && (
                              <button
                                onClick={() => setCarouselIndex(prev => prev + 1)}
                                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 flex items-center justify-center shadow-lg"
                              >
                                <Icon name="chevron-right" className="w-5 h-5 text-black" />
                              </button>
                            )}
                            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1">
                              {selectedImages.map((_, idx) => (
                                <button
                                  key={idx}
                                  onClick={() => setCarouselIndex(idx)}
                                  className={`w-1.5 h-1.5 rounded-full transition-all ${
                                    idx === carouselIndex ? 'bg-[#0095f6] w-2' : 'bg-white/50'
                                  }`}
                                />
                              ))}
                            </div>
                            <div className="absolute top-3 right-3 px-2 py-1 bg-black/60 rounded-full">
                              <span className="text-[10px] font-semibold text-white">
                                {carouselIndex + 1}/{selectedImages.length}
                              </span>
                            </div>
                          </>
                        )}
                      </>
                    ) : (
                      <div className="text-center">
                        <Icon name="image" className="w-12 h-12 text-white/20 mx-auto mb-2" />
                        <p className="text-xs text-white/30">
                          {isCarousel ? 'Selecione as imagens' : 'Selecione uma imagem'}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Post Actions */}
                  <div className="p-3">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-4">
                        <Icon name="heart" className="w-6 h-6 text-white" />
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                        </svg>
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <line x1="22" y1="2" x2="11" y2="13" />
                          <polygon points="22 2 15 22 11 13 2 9 22 2" />
                        </svg>
                      </div>
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                      </svg>
                    </div>

                    {isCarousel && selectedImages.length > 1 && (
                      <div className="flex justify-center gap-1 mb-3">
                        {selectedImages.map((_, idx) => (
                          <div
                            key={idx}
                            className={`w-1.5 h-1.5 rounded-full ${
                              idx === carouselIndex ? 'bg-[#0095f6]' : 'bg-white/30'
                            }`}
                          />
                        ))}
                      </div>
                    )}

                    <p className="text-xs font-semibold text-white mb-1">1.234 curtidas</p>

                    <div className="text-xs text-white">
                      <span className="font-semibold">seu_perfil</span>{' '}
                      <span className="text-white/80">
                        {caption || <span className="text-white/30 italic">Sua legenda aparecerá aqui...</span>}
                      </span>
                    </div>

                    {hashtags && (
                      <p className="text-xs text-[#00a3ff] mt-1">
                        {hashtags.split(/[\s,]+/).map(tag => tag.startsWith('#') ? tag : `#${tag}`).filter(t => t.length > 1).join(' ')}
                      </p>
                    )}

                    <p className="text-[10px] text-white/40 mt-2">
                      {publishNow ? 'Agora' : new Date(`${scheduledDate}T${scheduledTime}`).toLocaleDateString('pt-BR', {
                        day: 'numeric',
                        month: 'long',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Form Fields */}
            <div className="p-4 space-y-4 bg-[#0a0a0a]">
              {/* Caption Input */}
              <div>
                <label className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-2 block">
                  Legenda
                </label>
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Escreva a legenda..."
                  rows={2}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/20 outline-none focus:border-white/20 resize-none"
                />
              </div>

              {/* Hashtags Input */}
              <div>
                <label className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-2 block">
                  Hashtags
                </label>
                <input
                  type="text"
                  value={hashtags}
                  onChange={(e) => setHashtags(e.target.value)}
                  placeholder="#poker #torneio"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/20 outline-none focus:border-white/20"
                />
              </div>

              {/* Schedule Options */}
              <div className="flex gap-2">
                <button
                  onClick={() => setPublishNow(true)}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                    publishNow ? 'bg-white text-black' : 'bg-white/5 text-white/50 hover:bg-white/10'
                  }`}
                >
                  Agora
                </button>
                <button
                  onClick={() => setPublishNow(false)}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                    !publishNow ? 'bg-white text-black' : 'bg-white/5 text-white/50 hover:bg-white/10'
                  }`}
                >
                  Agendar
                </button>
              </div>

              {/* Date & Time */}
              {!publishNow && (
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    min={todayStr}
                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-white/20"
                  />
                  <input
                    type="time"
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                    className={`flex-1 bg-white/5 border rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-white/20 ${
                      isTimeInPast ? 'border-red-500/50' : 'border-white/10'
                    }`}
                  />
                </div>
              )}

              {/* Content Type */}
              <div>
                <label className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-2 block">
                  Tipo de Publicação
                </label>
                <div className="flex gap-1">
                  {[
                    { id: 'photo', label: 'Feed' },
                    { id: 'carousel', label: 'Carousel' },
                    { id: 'reel', label: 'Reel' },
                    { id: 'story', label: 'Story' },
                  ].map((t) => (
                    <button
                      key={t.id}
                      onClick={() => handleContentTypeChange(t.id as InstagramContentType)}
                      className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase transition-all ${
                        contentType === t.id ? 'bg-white/10 text-white' : 'bg-white/5 text-white/40 hover:bg-white/10'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/5 flex gap-3 shrink-0 bg-[#0a0a0a]">
          <button
            onClick={onClose}
            className="flex-1 py-3 text-sm font-bold text-white/50 hover:text-white transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={selectedImages.length === 0 || isTimeInPast}
            className="flex-1 py-3 bg-white text-black text-sm font-bold rounded-xl hover:bg-white/90 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {publishNow ? 'Publicar' : 'Agendar'}
          </button>
        </div>
      </div>
    </div>
  );
};
