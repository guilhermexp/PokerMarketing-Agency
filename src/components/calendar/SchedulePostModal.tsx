import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { ScheduledPost, GalleryImage, SchedulingPlatform, InstagramContentType } from '../../types';
import { Icon, type IconName } from '../common/Icon';
import { CampaignAccordion, type CampaignWithImages } from './CampaignAccordion';
import type { DbCampaign } from '../../services/apiClient';

interface SchedulePostModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSchedule: (post: Omit<ScheduledPost, 'id' | 'createdAt' | 'updatedAt'>) => void;
  galleryImages: GalleryImage[];
  campaigns?: DbCampaign[];
  initialDate?: string | null;
  initialTime?: string | null;
  initialImage?: GalleryImage | null;
  // For carousel pre-selection from CarrosselTab
  initialCarouselImages?: GalleryImage[];
  initialCaption?: string;
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

// Generate time slots from 6:00 to 23:45 in 15-minute intervals
const generateTimeSlots = () => {
  const slots: string[] = [];
  for (let hour = 6; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute += 15) {
      const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      slots.push(timeStr);
    }
  }
  return slots;
};

const TIME_SLOTS = generateTimeSlots();

export const SchedulePostModal: React.FC<SchedulePostModalProps> = ({
  isOpen,
  onClose,
  onSchedule,
  galleryImages,
  campaigns = [],
  initialDate,
  initialTime,
  initialImage,
  initialCarouselImages,
  initialCaption,
}) => {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const getDefaultTime = () => {
    const now = new Date();
    const minutes = Math.ceil(now.getMinutes() / 15) * 15 + 15;
    now.setMinutes(minutes);
    now.setSeconds(0);
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes() % 60).padStart(2, '0')}`;
  };

  const timeListRef = useRef<HTMLDivElement>(null);
  const [selectedImages, setSelectedImages] = useState<GalleryImage[]>([]);
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState('');

  const [scheduledDate, setScheduledDate] = useState(initialDate || todayStr);
  const [scheduledTime, setScheduledTime] = useState(initialTime || getDefaultTime());
  const [platforms] = useState<SchedulingPlatform>('instagram');
  const [contentType, setContentType] = useState<InstagramContentType>('photo');
  const [publishNow] = useState(false);
  const [galleryFilter, setGalleryFilter] = useState<'all' | 'flyers' | 'posts' | 'videos'>('all');
  const [expandedCampaignId, setExpandedCampaignId] = useState<string | null>(null);
  const [showImageSelector, setShowImageSelector] = useState(false);

  // Calendar state
  const [calendarDate, setCalendarDate] = useState(new Date(initialDate || todayStr));

  // Set initial image when modal opens with a pre-selected image
  useEffect(() => {
    if (isOpen) {
      // Carousel pre-selection takes priority
      if (initialCarouselImages && initialCarouselImages.length > 0) {
        setSelectedImages(initialCarouselImages);
        setContentType('carousel');
        setCaption(initialCaption || '');
      } else if (initialImage) {
        setSelectedImages([initialImage]);
        setCaption(''); // Don't auto-fill with image prompt
      }
      // Set initial caption if provided separately
      if (initialCaption && !initialCarouselImages) {
        setCaption(initialCaption);
      }

      // Show image selector if no initial image
      setShowImageSelector(!initialImage && !initialCarouselImages);
    } else {
      // Reset when modal closes
      setSelectedImages([]);
      setCaption('');
      setHashtags('');
      setContentType('photo');
      setShowImageSelector(false);
    }
  }, [isOpen, initialImage, initialCarouselImages, initialCaption]);

  // Update date/time when modal opens with initial values
  useEffect(() => {
    if (isOpen) {
      if (initialDate) {
        setScheduledDate(initialDate);
        setCalendarDate(new Date(initialDate));
      }
      if (initialTime) setScheduledTime(initialTime);
    }
  }, [isOpen, initialDate, initialTime]);

  // Scroll to selected time when time changes
  useEffect(() => {
    if (isOpen && timeListRef.current && scheduledTime) {
      const selectedIndex = TIME_SLOTS.indexOf(scheduledTime);
      if (selectedIndex !== -1) {
        const itemHeight = 48; // height of each time slot item
        const scrollPosition = selectedIndex * itemHeight - 100; // Center it roughly
        timeListRef.current.scrollTo({ top: scrollPosition, behavior: 'smooth' });
      }
    }
  }, [isOpen, scheduledTime]);

  const isCarousel = contentType === 'carousel';
  const isReel = contentType === 'reel';
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

  // Deduplicate images by src URL (keep the first/newest occurrence)
  const deduplicatedImages = useMemo(() => {
    const seen = new Set<string>();
    return galleryImages.filter((img) => {
      const key = img.src;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }, [galleryImages]);

  // Filter media based on content type and gallery filter
  const eligibleImages = useMemo(() => {
    return deduplicatedImages.filter(img => {
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
  }, [deduplicatedImages, isReel, galleryFilter]);

  // Check if image was created today
  const isToday = (dateString?: string) => {
    if (!dateString) return false;
    const imageDate = new Date(dateString);
    const todayDate = new Date();
    return (
      imageDate.getDate() === todayDate.getDate() &&
      imageDate.getMonth() === todayDate.getMonth() &&
      imageDate.getFullYear() === todayDate.getFullYear()
    );
  };

  // Separate images into today and older
  const todayEligibleImages = eligibleImages.filter((img) => isToday(img.created_at));
  const olderEligibleImages = eligibleImages.filter((img) => !isToday(img.created_at));

  // Group images by campaign for the campaigns filter
  const campaignsWithImages = useMemo((): CampaignWithImages[] => {
    if (galleryFilter !== 'posts') return [];

    // Build campaign list from campaigns data (which has counts and previews)
    // and associate images that have campaign_id
    const campaignImages = deduplicatedImages.filter(img =>
      img.campaign_id && (img.source === 'Post' || img.source === 'Anúncio')
    );

    // Group images by campaign_id
    const imagesByCampaign = new Map<string, GalleryImage[]>();
    campaignImages.forEach(img => {
      const existing = imagesByCampaign.get(img.campaign_id!) || [];
      imagesByCampaign.set(img.campaign_id!, [...existing, img]);
    });

    // Use campaigns list as base (they have counts and previews even without gallery images)
    return campaigns
      .filter(c => (c.posts_count || 0) > 0 || (c.ads_count || 0) > 0)
      .map(campaign => {
        const images = imagesByCampaign.get(campaign.id) || [];
        const totalCount = (campaign.posts_count || 0) + (campaign.ads_count || 0);
        return {
          id: campaign.id,
          name: campaign.name || 'Campanha sem nome',
          imageCount: images.length > 0 ? images.length : totalCount,
          previewUrl: images[0]?.src || campaign.post_preview_url || campaign.ad_preview_url || null,
          images,
        };
      })
      .sort((a, b) => b.imageCount - a.imageCount);
  }, [deduplicatedImages, galleryFilter, campaigns]);

  const handleSelectImage = (image: GalleryImage) => {
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
      setShowImageSelector(false);
    }
  };

  const handleContentTypeChange = (type: InstagramContentType) => {
    setContentType(type);
    if (type !== 'carousel' && selectedImages.length > 1) {
      // Keep only first image when switching from carousel
      setSelectedImages(selectedImages.slice(0, 1));
    }
  };

  const getSelectionIndex = (image: GalleryImage) => {
    return selectedImages.findIndex(img => img.id === image.id);
  };

  const handleSubmit = () => {
    if (selectedImages.length === 0) {
      alert('Por favor, selecione pelo menos uma imagem antes de agendar.');
      return;
    }

    // Validate that we have a valid image URL
    if (!selectedImage?.src) {
      alert('Erro: imagem selecionada inválida. Por favor, selecione outra imagem.');
      return;
    }

    const hashtagsArray = hashtags
      .split(/[\s,]+/)
      .map(tag => tag.startsWith('#') ? tag : `#${tag}`)
      .filter(tag => tag.length > 1);

    const finalDate = publishNow ? todayStr : scheduledDate;
    const finalTime = publishNow ? getDefaultTime() : scheduledTime;
    const scheduledTimestamp = publishNow ? Date.now() : new Date(`${finalDate}T${finalTime}`).getTime();

    // Don't send temporary IDs (they start with "temp-") - send empty string instead
    const imageId = selectedImage.id || '';
    const validContentId = imageId.startsWith('temp-') ? '' : imageId;

    // Collect all carousel image URLs in order
    const carouselUrls = isCarousel && selectedImages.length > 1
      ? selectedImages.map(img => img.src)
      : undefined;

    onSchedule({
      type: selectedImage.source === 'Post' ? 'campaign_post' :
            selectedImage.source === 'Anúncio' ? 'ad_creative' : 'flyer',
      contentId: validContentId,
      imageUrl: selectedImage.src,
      carouselImageUrls: carouselUrls,
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

    // Close modal after scheduling
    onClose();
  };

  // Calendar functions
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    return { daysInMonth, startingDayOfWeek };
  };

  const handlePreviousMonth = () => {
    setCalendarDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCalendarDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const handleSelectDate = (day: number) => {
    const selected = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), day);
    const dateStr = `${selected.getFullYear()}-${String(selected.getMonth() + 1).padStart(2, '0')}-${String(selected.getDate()).padStart(2, '0')}`;

    // Don't allow past dates
    if (dateStr < todayStr) return;

    setScheduledDate(dateStr);
  };

  const { daysInMonth, startingDayOfWeek } = getDaysInMonth(calendarDate);
  const monthName = calendarDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  if (!isOpen) return null;

  // Image selector modal
  if (showImageSelector) {
    return createPortal(
      <div
        className="fixed inset-0 bg-black/90 backdrop-blur-md z-[300] flex items-center justify-center p-4 md:p-8"
        onClick={onClose}
      >
        <div
          className="w-full max-w-5xl max-h-[90vh] bg-[#0a0a0a]/95 rounded-2xl border border-white/[0.08] shadow-2xl flex flex-col overflow-hidden backdrop-blur-xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-white/[0.08] flex justify-between items-center shrink-0">
            <div>
              <h2 className="text-lg font-semibold text-white">
                Selecionar Imagem
              </h2>
              <p className="text-xs text-white/60 mt-1">
                {isCarousel
                  ? `Selecione até 10 imagens (${selectedImages.length}/10)`
                  : 'Selecione uma imagem da galeria'
                }
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-white/60 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
            >
              <Icon name="x" className="w-5 h-5" />
            </button>
          </div>

          {/* Gallery */}
          <div className="flex-1 overflow-y-auto flex flex-col">
            {/* Gallery Filter */}
            <div className="px-4 pt-3 pb-2 flex gap-2 shrink-0">
              {[
                { id: 'all', label: 'Todos' },
                { id: 'flyers', label: 'Flyers' },
                { id: 'posts', label: 'Campanhas' },
                ...(isReel ? [{ id: 'videos', label: 'Vídeos' }] : []),
              ].map((filter) => (
                <button
                  key={filter.id}
                  onClick={() => setGalleryFilter(filter.id as typeof galleryFilter)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    galleryFilter === filter.id
                      ? 'bg-white text-black'
                      : 'text-white/60 hover:text-white bg-[#0a0a0a]/60 border border-white/[0.08] hover:bg-white/10 backdrop-blur-xl'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-4">
            {/* Campaigns Accordion View */}
            {galleryFilter === 'posts' ? (
              <CampaignAccordion
                campaigns={campaignsWithImages}
                expandedId={expandedCampaignId}
                onExpand={setExpandedCampaignId}
                onSelectImage={handleSelectImage}
                selectedImages={selectedImages}
                isCarousel={isCarousel}
              />
            ) : eligibleImages.length === 0 ? (
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
              <div className="space-y-4">
                {/* Today's Images Section */}
                {todayEligibleImages.length > 0 && (
                  <div className="bg-primary/[0.03] rounded-lg p-3 border border-primary/10">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-1 h-1 rounded-full bg-primary animate-pulse" />
                      <h3 className="text-[9px] font-bold text-primary/70 uppercase tracking-wide">
                        Gerados Hoje
                      </h3>
                      <span className="text-[8px] text-white/30">
                        {todayEligibleImages.length} {todayEligibleImages.length === 1 ? 'item' : 'itens'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {todayEligibleImages.map((image) => {
                        const selectionIndex = getSelectionIndex(image);
                        const isSelected = selectionIndex !== -1;
                        const itemIsVideo = isVideoItem(image);
                        return (
                          <div
                            key={image.id}
                            onClick={() => handleSelectImage(image)}
                            className={`group relative overflow-hidden rounded-xl border-2 bg-[#111111] transition-all cursor-pointer ${
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
                            <div className={`absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent transition-all duration-300 flex flex-col justify-end p-2 pointer-events-none ${
                              isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                            }`}>
                              <p className="text-white text-[9px] font-bold leading-snug line-clamp-2 mb-1">
                                {image.prompt || 'Sem descrição'}
                              </p>
                              <span className="text-[7px] text-white/80 font-bold bg-white/10 backdrop-blur-sm px-1.5 py-0.5 rounded-full uppercase tracking-wide self-start">
                                {image.source}
                              </span>
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
                              <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center shadow-lg">
                                {isCarousel ? (
                                  <span className="text-[9px] font-black text-black">{selectionIndex + 1}</span>
                                ) : (
                                  <Icon name="check" className="w-3 h-3 text-black" />
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Divider - only show if both sections have content */}
                {todayEligibleImages.length > 0 && olderEligibleImages.length > 0 && (
                  <div className="flex items-center gap-3 py-1">
                    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                    <span className="text-[8px] text-white/30 font-bold uppercase tracking-wider">
                      Anteriores
                    </span>
                    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                  </div>
                )}

                {/* Older Images Section */}
                {olderEligibleImages.length > 0 && (
                  <div className="columns-2 sm:columns-3 lg:columns-4 gap-3">
                    {olderEligibleImages.map((image) => {
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
                          <div className={`absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent transition-all duration-300 flex flex-col justify-end p-3 pointer-events-none ${
                            isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                          }`}>
                            <p className="text-white text-[10px] font-bold leading-snug line-clamp-2 mb-2">
                              {image.prompt || 'Sem descrição'}
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
            )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-white/[0.08] flex gap-2 shrink-0">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 text-xs font-medium text-white/60 hover:text-white transition-colors rounded-lg hover:bg-white/5"
            >
              Cancelar
            </button>
            <button
              onClick={() => setShowImageSelector(false)}
              disabled={selectedImages.length === 0}
              className="flex-1 py-2.5 bg-white text-black text-xs font-semibold rounded-lg hover:bg-white/90 active:scale-[0.99] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Continuar
            </button>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  // Main scheduling modal with 3-column layout
  return createPortal(
    <div
      className="fixed inset-0 bg-black/90 backdrop-blur-md z-[300] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl bg-[#0a0a0a]/95 rounded-3xl border border-white/[0.08] shadow-2xl flex overflow-hidden backdrop-blur-xl"
        style={{ height: '600px' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left Column - Image Preview & Info */}
        <div className="w-80 bg-[#070707] border-r border-white/[0.08] flex flex-col">
          {/* Image Preview */}
          <div className="h-64 bg-black flex items-center justify-center relative shrink-0">
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
                  onClick={() => setShowImageSelector(true)}
                  className="absolute bottom-3 right-3 px-3 py-1.5 bg-[#0a0a0a]/90 backdrop-blur-xl border border-white/[0.08] rounded-lg text-xs font-medium text-white hover:bg-white/5 hover:border-white/20 transition-all"
                >
                  Trocar Imagem
                </button>
              </>
            ) : (
              <button
                onClick={() => setShowImageSelector(true)}
                className="flex flex-col items-center gap-3 text-white/40 hover:text-white/60 transition-colors"
              >
                <Icon name="image" className="w-12 h-12" />
                <span className="text-sm font-medium">Selecionar Imagem</span>
              </button>
            )}
          </div>

          {/* Post Details */}
          <div className="flex-1 p-4 space-y-3 overflow-y-auto">
            {/* Caption */}
            <div>
              <label className="text-xs font-semibold text-white/70 mb-1.5 block">
                Legenda
              </label>
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Escreva a legenda..."
                rows={2}
                className="w-full bg-[#0a0a0a]/60 backdrop-blur-xl border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/30 resize-none transition-all"
              />
            </div>

            {/* Hashtags */}
            <div>
              <label className="text-xs font-semibold text-white/70 mb-1.5 block">
                Hashtags
              </label>
              <input
                type="text"
                value={hashtags}
                onChange={(e) => setHashtags(e.target.value)}
                placeholder="#poker #torneio"
                className="w-full bg-[#0a0a0a]/60 backdrop-blur-xl border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/30 transition-all"
              />
            </div>

            {/* Content Type */}
            <div>
              <label className="text-xs font-semibold text-white/70 mb-1.5 block">
                Tipo de Conteúdo
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'photo', label: 'Feed', icon: 'image' },
                  { id: 'carousel', label: 'Carrossel', icon: 'layout' },
                  { id: 'reel', label: 'Reel', icon: 'video' },
                  { id: 'story', label: 'Story', icon: 'circle' },
                ].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => handleContentTypeChange(t.id as InstagramContentType)}
                    className={`px-3 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-2 ${
                      contentType === t.id
                        ? 'bg-white text-black shadow-lg'
                        : 'text-white/60 bg-[#0a0a0a]/60 backdrop-blur-xl border border-white/[0.08] hover:bg-white/5 hover:text-white hover:border-white/20'
                    }`}
                  >
                    <Icon name={t.icon as IconName} className="w-3.5 h-3.5" />
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Middle Column - Calendar */}
        <div className="flex-1 flex flex-col p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-white capitalize">
              {monthName}
            </h2>
            <div className="flex gap-2">
              <button
                onClick={handlePreviousMonth}
                className="w-9 h-9 rounded-lg bg-[#070707] backdrop-blur-xl border border-white/[0.08] text-white/70 hover:text-white hover:bg-white/5 hover:border-white/20 transition-all flex items-center justify-center"
              >
                <Icon name="chevron-left" className="w-4 h-4" />
              </button>
              <button
                onClick={handleNextMonth}
                className="w-9 h-9 rounded-lg bg-[#070707] backdrop-blur-xl border border-white/[0.08] text-white/70 hover:text-white hover:bg-white/5 hover:border-white/20 transition-all flex items-center justify-center"
              >
                <Icon name="chevron-right" className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Calendar Grid */}
          <div className="flex-1 flex flex-col">
            {/* Weekday Headers */}
            <div className="grid grid-cols-7 gap-2 mb-3">
              {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((day) => (
                <div
                  key={day}
                  className="text-center text-xs font-semibold text-white/40 py-2"
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Days Grid */}
            <div className="grid grid-cols-7 gap-2 flex-1">
              {/* Empty cells for days before month starts */}
              {Array.from({ length: startingDayOfWeek }).map((_, i) => (
                <div key={`empty-${i}`} />
              ))}

              {/* Actual days */}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dateStr = `${calendarDate.getFullYear()}-${String(calendarDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const isSelected = dateStr === scheduledDate;
                const isPast = dateStr < todayStr;
                const isCurrentDay = dateStr === todayStr;

                return (
                  <button
                    key={day}
                    onClick={() => !isPast && handleSelectDate(day)}
                    disabled={isPast}
                    className={`aspect-square rounded-xl text-sm font-medium transition-all flex items-center justify-center ${
                      isSelected
                        ? 'bg-white text-black shadow-lg'
                        : isPast
                          ? 'text-white/20 cursor-not-allowed'
                          : isCurrentDay
                            ? 'bg-white/10 text-white border border-white/20 hover:bg-white/20'
                            : 'text-white/70 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Close Button at bottom */}
          <button
            onClick={onClose}
            className="mt-6 w-full py-3 rounded-xl text-sm font-medium text-white/60 hover:text-white hover:bg-white/5 transition-all"
          >
            Cancelar
          </button>
        </div>

        {/* Right Column - Time Slots */}
        <div className="w-72 bg-[#070707] border-l border-white/[0.08] flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-white/[0.08]">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white">Horário</h3>
              <div className="flex gap-1">
                <button
                  className="px-2 py-1 bg-[#0a0a0a]/60 backdrop-blur-xl border border-white/[0.08] rounded text-[10px] font-medium text-white"
                >
                  12h
                </button>
                <button
                  className="px-2 py-1 text-[10px] font-medium text-white/40 hover:text-white/60 transition-colors"
                >
                  24h
                </button>
              </div>
            </div>
            <p className="text-xs text-white/50">
              {new Date(`${scheduledDate}T${scheduledTime}`).toLocaleDateString('pt-BR', {
                weekday: 'short',
                month: 'short',
                day: 'numeric'
              })}
            </p>
          </div>

          {/* Time Slots List */}
          <div ref={timeListRef} className="flex-1 overflow-y-auto p-3 space-y-2">
            {TIME_SLOTS.map((time) => {
              const isSelected = time === scheduledTime;
              const isPast = scheduledDate === todayStr && time <= new Date().toTimeString().slice(0, 5);

              return (
                <button
                  key={time}
                  onClick={() => !isPast && setScheduledTime(time)}
                  disabled={isPast}
                  className={`w-full py-3 rounded-xl text-sm font-medium transition-all ${
                    isSelected
                      ? 'bg-white text-black shadow-lg'
                      : isPast
                        ? 'bg-[#0a0a0a]/30 text-white/20 cursor-not-allowed border border-white/[0.03]'
                        : 'bg-[#0a0a0a]/60 backdrop-blur-xl text-white/70 hover:bg-white/5 hover:text-white border border-white/[0.08] hover:border-white/20'
                  }`}
                >
                  {new Date(`2000-01-01T${time}`).toLocaleTimeString('pt-BR', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                  })}
                </button>
              );
            })}
          </div>

          {/* Continue Button */}
          <div className="p-4 border-t border-white/[0.08]">
            <button
              onClick={handleSubmit}
              disabled={selectedImages.length === 0 || isTimeInPast}
              className="w-full py-3 bg-white text-black text-sm font-semibold rounded-xl hover:bg-white/90 active:scale-[0.98] transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-lg shadow-white/20"
            >
              Agendar Publicação
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
