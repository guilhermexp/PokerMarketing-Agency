import React, { useState, useMemo } from 'react';
import type { ScheduledPost, GalleryImage, SchedulingPlatform, InstagramContentType } from '../../types';
import { Icon } from '../common/Icon';

interface SchedulePostModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSchedule: (post: Omit<ScheduledPost, 'id' | 'createdAt' | 'updatedAt'>) => void;
  galleryImages: GalleryImage[];
  initialDate?: string | null;
}

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

  const [selectedImage, setSelectedImage] = useState<GalleryImage | null>(null);
  const [showGallery, setShowGallery] = useState(false);
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [scheduledDate, setScheduledDate] = useState(initialDate || todayStr);
  const [scheduledTime, setScheduledTime] = useState(getDefaultTime());
  const [platforms, setPlatforms] = useState<SchedulingPlatform>('instagram');
  const [contentType, setContentType] = useState<InstagramContentType>('photo');
  const [publishNow, setPublishNow] = useState(false);

  const isTimeInPast = useMemo(() => {
    if (publishNow) return false;
    const scheduled = new Date(`${scheduledDate}T${scheduledTime}`);
    return scheduled.getTime() < Date.now();
  }, [scheduledDate, scheduledTime, publishNow]);

  const eligibleImages = useMemo(() => {
    return galleryImages.filter(img =>
      ['Flyer', 'Flyer Diário', 'Post', 'Anúncio'].includes(img.source)
    );
  }, [galleryImages]);

  const handleSelectImage = (image: GalleryImage) => {
    setSelectedImage(image);
    setShowGallery(false);
  };

  const handleSubmit = () => {
    if (!selectedImage) return;

    const hashtagsArray = hashtags
      .split(/[\s,]+/)
      .map(tag => tag.startsWith('#') ? tag : `#${tag}`)
      .filter(tag => tag.length > 1);

    const finalDate = publishNow ? todayStr : scheduledDate;
    const finalTime = publishNow ? getDefaultTime() : scheduledTime;
    const scheduledTimestamp = publishNow ? Date.now() : new Date(`${finalDate}T${finalTime}`).getTime();

    onSchedule({
      type: selectedImage.source === 'Post' ? 'campaign_post' :
            selectedImage.source === 'Anúncio' ? 'ad_creative' : 'flyer',
      contentId: selectedImage.id,
      imageUrl: selectedImage.src,
      caption,
      hashtags: hashtagsArray,
      scheduledDate: finalDate,
      scheduledTime: finalTime,
      scheduledTimestamp,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      platforms,
      status: 'scheduled',
      createdFrom: 'gallery',
      instagramContentType: platforms !== 'facebook' ? contentType : undefined
    });
  };

  if (!isOpen) return null;

  // Gallery Picker Modal
  if (showGallery) {
    return (
      <div className="fixed inset-0 bg-black/95 backdrop-blur-sm z-[300] flex items-center justify-center p-4" onClick={() => setShowGallery(false)}>
        <div
          className="w-full max-w-2xl bg-[#111] rounded-2xl overflow-hidden border border-white/10"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-white/5 flex justify-between items-center">
            <h3 className="text-sm font-bold text-white">Selecionar Imagem</h3>
            <button onClick={() => setShowGallery(false)} className="text-white/30 hover:text-white transition-colors">
              <Icon name="x" className="w-5 h-5" />
            </button>
          </div>

          {/* Gallery Grid */}
          <div className="p-4 max-h-[60vh] overflow-y-auto">
            {eligibleImages.length === 0 ? (
              <div className="text-center py-12 text-white/30 text-xs">
                Nenhuma imagem disponível na galeria
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-3">
                {eligibleImages.map(image => (
                  <button
                    key={image.id}
                    onClick={() => handleSelectImage(image)}
                    className="group aspect-square rounded-xl overflow-hidden border border-white/10 hover:border-white/30 transition-all relative"
                  >
                    <img src={image.src} alt="" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Icon name="check" className="w-8 h-8 text-white" />
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
                      <span className="text-[9px] font-bold text-white/70 uppercase">{image.source}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[300] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-md bg-[#111] rounded-2xl overflow-hidden border border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/5 flex justify-between items-center">
          <h3 className="text-sm font-bold text-white">Agendar Publicação</h3>
          <button onClick={onClose} className="text-white/30 hover:text-white transition-colors">
            <Icon name="x" className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Image Selection */}
          {!selectedImage ? (
            <button
              onClick={() => setShowGallery(true)}
              className="w-full aspect-video rounded-xl border-2 border-dashed border-white/20 hover:border-white/40 transition-colors flex flex-col items-center justify-center gap-3 group"
            >
              <div className="w-12 h-12 rounded-full bg-white/5 group-hover:bg-white/10 transition-colors flex items-center justify-center">
                <Icon name="image" className="w-6 h-6 text-white/40 group-hover:text-white/60" />
              </div>
              <span className="text-xs text-white/40 group-hover:text-white/60 font-medium">
                Selecionar da Galeria
              </span>
            </button>
          ) : (
            <div className="relative">
              <img
                src={selectedImage.src}
                alt=""
                className="w-full aspect-video object-cover rounded-xl"
              />
              <button
                onClick={() => setShowGallery(true)}
                className="absolute top-2 right-2 px-3 py-1.5 bg-black/70 hover:bg-black/90 rounded-lg text-[10px] font-bold text-white transition-colors"
              >
                Trocar
              </button>
              <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/70 rounded-lg">
                <span className="text-[9px] font-bold text-white/70 uppercase">{selectedImage.source}</span>
              </div>
            </div>
          )}

          {selectedImage && (
            <>
              {/* Caption */}
              <div>
                <label className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-2 block">
                  Legenda
                </label>
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Escreva a legenda..."
                  rows={2}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/20 outline-none focus:border-white/20 resize-none"
                />
              </div>

              {/* Hashtags */}
              <div>
                <label className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-2 block">
                  Hashtags
                </label>
                <input
                  type="text"
                  value={hashtags}
                  onChange={(e) => setHashtags(e.target.value)}
                  placeholder="#poker #torneio"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/20 outline-none focus:border-white/20"
                />
              </div>

              {/* When */}
              <div>
                <label className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-2 block">
                  Quando
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPublishNow(true)}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${
                      publishNow ? 'bg-white text-black' : 'bg-white/5 text-white/50 hover:bg-white/10'
                    }`}
                  >
                    Agora
                  </button>
                  <button
                    onClick={() => setPublishNow(false)}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${
                      !publishNow ? 'bg-white text-black' : 'bg-white/5 text-white/50 hover:bg-white/10'
                    }`}
                  >
                    Agendar
                  </button>
                </div>
              </div>

              {/* Date & Time */}
              {!publishNow && (
                <div className="flex gap-3">
                  <div className="flex-1">
                    <input
                      type="date"
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                      min={todayStr}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-white/20"
                    />
                  </div>
                  <div className="flex-1">
                    <input
                      type="time"
                      value={scheduledTime}
                      onChange={(e) => setScheduledTime(e.target.value)}
                      className={`w-full bg-white/5 border rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-white/20 ${
                        isTimeInPast ? 'border-red-500/50' : 'border-white/10'
                      }`}
                    />
                  </div>
                </div>
              )}

              {/* Platform */}
              <div>
                <label className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-2 block">
                  Plataforma
                </label>
                <div className="flex gap-2">
                  {[
                    { id: 'instagram', icon: 'instagram', label: 'Instagram' },
                    { id: 'facebook', icon: 'facebook', label: 'Facebook' },
                    { id: 'both', icon: 'share', label: 'Ambos' },
                  ].map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setPlatforms(p.id as SchedulingPlatform)}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all ${
                        platforms === p.id ? 'bg-white/10 text-white' : 'bg-white/5 text-white/40 hover:bg-white/10'
                      }`}
                    >
                      <Icon name={p.icon as any} className="w-4 h-4" />
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Content Type (Instagram only) */}
              {platforms !== 'facebook' && (
                <div>
                  <label className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-2 block">
                    Tipo
                  </label>
                  <div className="flex gap-2">
                    {[
                      { id: 'photo', label: 'Feed' },
                      { id: 'reel', label: 'Reel' },
                      { id: 'story', label: 'Story' },
                      { id: 'carousel', label: 'Carousel' },
                    ].map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setContentType(t.id as InstagramContentType)}
                        className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase transition-all ${
                          contentType === t.id ? 'bg-white/10 text-white' : 'bg-white/5 text-white/40 hover:bg-white/10'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/5 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 text-sm font-bold text-white/50 hover:text-white transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!selectedImage || isTimeInPast}
            className="flex-1 py-3 bg-white text-black text-sm font-bold rounded-xl hover:bg-white/90 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {publishNow ? 'Publicar' : 'Agendar'}
          </button>
        </div>
      </div>
    </div>
  );
};
