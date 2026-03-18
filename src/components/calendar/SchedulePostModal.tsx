import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { ScheduledPost, GalleryImage, SchedulingPlatform, InstagramContentType } from '../../types';
import type { CampaignWithImages } from './CampaignAccordion';
import type { DbCampaign } from '../../services/apiClient';
import { PostPreviewPanel, isVideoItem, isAudioItem } from './PostPreviewPanel';
import { ScheduleConfig, TIME_SLOTS, getDaysInMonth } from './ScheduleConfig';
import { ImageSelectorModal } from './ImageSelectorModal';

interface SchedulePostModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSchedule: (post: Omit<ScheduledPost, 'id' | 'createdAt' | 'updatedAt'>) => void;
  galleryImages: GalleryImage[];
  campaigns?: DbCampaign[];
  initialDate?: string | null;
  initialTime?: string | null;
  initialImage?: GalleryImage | null;
  initialCarouselImages?: GalleryImage[];
  initialCaption?: string;
}

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
  const [galleryFilter] = useState<'all' | 'flyers' | 'posts' | 'videos'>('all');
  const [expandedCampaignId, setExpandedCampaignId] = useState<string | null>(null);
  const [showImageSelector, setShowImageSelector] = useState(false);
  const [olderImagesLimit, setOlderImagesLimit] = useState(12);
  const [timeFormat, setTimeFormat] = useState<'12h' | '24h'>('24h');
  const [calendarDate, setCalendarDate] = useState(new Date(initialDate || todayStr));

  // Set initial image when modal opens
  useEffect(() => {
    if (isOpen) {
      if (initialCarouselImages && initialCarouselImages.length > 0) {
        setSelectedImages(initialCarouselImages);
        setContentType('carousel');
        setCaption(initialCaption || '');
      } else if (initialImage) {
        setSelectedImages([initialImage]);
        setCaption('');
      }
      if (initialCaption && !initialCarouselImages) {
        setCaption(initialCaption);
      }
      const hasInitialImages = initialImage || (initialCarouselImages && initialCarouselImages.length > 0);
      setShowImageSelector(!hasInitialImages);
    } else {
      setSelectedImages([]);
      setCaption('');
      setHashtags('');
      setContentType('photo');
      setShowImageSelector(false);
      setOlderImagesLimit(12);
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

  // Scroll to selected time
  useEffect(() => {
    if (isOpen && timeListRef.current && scheduledTime) {
      const selectedIndex = TIME_SLOTS.indexOf(scheduledTime);
      if (selectedIndex !== -1) {
        const itemHeight = 48;
        const scrollPosition = selectedIndex * itemHeight - 100;
        timeListRef.current.scrollTo({ top: scrollPosition, behavior: 'smooth' });
      }
    }
  }, [isOpen, scheduledTime]);

  const isCarousel = contentType === 'carousel';
  const isReel = contentType === 'reel';
  const selectedImage = selectedImages[0] || null;
  const selectedIsVideo = selectedImage ? isVideoItem(selectedImage) : false;

  const isTimeInPast = useMemo(() => {
    if (publishNow) return false;
    const scheduled = new Date(`${scheduledDate}T${scheduledTime}`);
    return scheduled.getTime() < Date.now();
  }, [scheduledDate, scheduledTime, publishNow]);

  const isFlyer = (img: GalleryImage) =>
    img.source === 'Flyer' || img.source === 'Flyer Diário';

  const isPost = (img: GalleryImage) =>
    img.source === 'Post' || img.source === 'Anúncio';

  // Deduplicate images by src URL
  const deduplicatedImages = useMemo(() => {
    const seen = new Set<string>();
    return galleryImages.filter((img) => {
      const key = img.src;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [galleryImages]);

  // Filter media based on content type and gallery filter
  const eligibleImages = useMemo(() => {
    return deduplicatedImages.filter(img => {
      if (isAudioItem(img)) return false;
      if (!isReel && isVideoItem(img)) return false;
      if (galleryFilter === 'flyers') return isFlyer(img);
      if (galleryFilter === 'posts') return isPost(img);
      if (galleryFilter === 'videos') return isVideoItem(img);
      return true;
    });
  }, [deduplicatedImages, isReel, galleryFilter]);

  const isTodayDate = (dateString?: string) => {
    if (!dateString) return false;
    const imageDate = new Date(dateString);
    const todayDate = new Date();
    return (
      imageDate.getDate() === todayDate.getDate() &&
      imageDate.getMonth() === todayDate.getMonth() &&
      imageDate.getFullYear() === todayDate.getFullYear()
    );
  };

  const todayEligibleImages = eligibleImages.filter((img) => isTodayDate(img.created_at));
  const olderEligibleImages = eligibleImages.filter((img) => !isTodayDate(img.created_at));

  // Group images by campaign
  const campaignsWithImages = useMemo((): CampaignWithImages[] => {
    if (galleryFilter !== 'posts') return [];
    const campaignImages = deduplicatedImages.filter(img => img.campaign_id);
    const imagesByCampaign = new Map<string, GalleryImage[]>();
    campaignImages.forEach(img => {
      const existing = imagesByCampaign.get(img.campaign_id!) || [];
      imagesByCampaign.set(img.campaign_id!, [...existing, img]);
    });
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
      const isSelected = selectedImages.some(img => img.id === image.id);
      if (isSelected) {
        setSelectedImages(prev => prev.filter(img => img.id !== image.id));
      } else if (selectedImages.length < 10) {
        setSelectedImages(prev => [...prev, image]);
      }
    } else {
      setSelectedImages([image]);
      setShowImageSelector(false);
    }
  };

  const handleContentTypeChange = (type: InstagramContentType) => {
    setContentType(type);
    if (type !== 'carousel' && selectedImages.length > 1) {
      setSelectedImages(selectedImages.slice(0, 1));
    }
  };

  const handleSubmit = () => {
    if (selectedImages.length === 0) {
      alert('Por favor, selecione pelo menos uma imagem antes de agendar.');
      return;
    }
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
    const imageId = selectedImage.id || '';
    const validContentId = imageId.startsWith('temp-') ? '' : imageId;
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
    onClose();
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
    if (dateStr < todayStr) return;
    setScheduledDate(dateStr);
  };

  const { daysInMonth, startingDayOfWeek } = getDaysInMonth(calendarDate);
  const monthName = calendarDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  if (!isOpen) return null;

  return (
    <>
      <ImageSelectorModal
        isOpen={showImageSelector}
        isCarousel={isCarousel}
        selectedImages={selectedImages}
        galleryFilter={galleryFilter}
        campaignsWithImages={campaignsWithImages}
        expandedCampaignId={expandedCampaignId}
        eligibleImages={eligibleImages}
        todayEligibleImages={todayEligibleImages}
        olderEligibleImages={olderEligibleImages}
        olderImagesLimit={olderImagesLimit}
        onExpandCampaign={setExpandedCampaignId}
        onSelectImage={handleSelectImage}
        onLoadMore={() => setOlderImagesLimit(prev => prev + 12)}
        onClose={onClose}
        onContinue={() => setShowImageSelector(false)}
      />
      {createPortal(
        <div
          className="fixed inset-0 bg-black/90 backdrop-blur-md z-[300] flex items-center justify-center p-0 sm:p-4"
          onClick={onClose}
        >
          <div
            className="w-full h-screen sm:h-[600px] sm:max-w-5xl bg-background/95 sm:rounded-3xl border-0 sm:border border-border shadow-2xl flex flex-col sm:flex-row overflow-hidden backdrop-blur-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <PostPreviewPanel
              selectedImage={selectedImage}
              selectedIsVideo={selectedIsVideo}
              caption={caption}
              onCaptionChange={setCaption}
              hashtags={hashtags}
              onHashtagsChange={setHashtags}
              contentType={contentType}
              onContentTypeChange={handleContentTypeChange}
              onOpenImageSelector={() => setShowImageSelector(true)}
            />
            <ScheduleConfig
              scheduledDate={scheduledDate}
              scheduledTime={scheduledTime}
              calendarDate={calendarDate}
              todayStr={todayStr}
              monthName={monthName}
              daysInMonth={daysInMonth}
              startingDayOfWeek={startingDayOfWeek}
              timeFormat={timeFormat}
              timeListRef={timeListRef}
              isTimeInPast={isTimeInPast}
              hasSelectedImages={selectedImages.length > 0}
              onSelectDate={handleSelectDate}
              onPreviousMonth={handlePreviousMonth}
              onNextMonth={handleNextMonth}
              onTimeChange={setScheduledTime}
              onTimeFormatChange={setTimeFormat}
              onSubmit={handleSubmit}
              onClose={onClose}
            />
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
