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

  // Filter only images (not audio/video) that can be scheduled
  const eligibleImages = useMemo(() => {
    return galleryImages.filter(img => {
      const isAudio = img.mediaType === 'audio' || img.model === 'tts-generation' || img.src?.endsWith('.mp3');
      const isVideo = img.mediaType === 'video' || img.src?.endsWith('.mp4');
      return !isAudio && !isVideo;
    });
  }, [galleryImages]);

  const handleSelectImage = (image: GalleryImage) => {
    setSelectedImage(image);
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
              Selecione uma imagem da galeria
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
          <div className="flex-1 overflow-y-auto p-4 border-b lg:border-b-0 lg:border-r border-white/5">
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
                {eligibleImages.map((image) => (
                  <div
                    key={image.id}
                    onClick={() => handleSelectImage(image)}
                    className={`group relative overflow-hidden rounded-xl border-2 bg-[#111111] transition-all break-inside-avoid mb-3 cursor-pointer ${
                      selectedImage?.id === image.id
                        ? 'border-primary shadow-lg shadow-primary/20'
                        : 'border-white/5 hover:border-white/20'
                    }`}
                  >
                    <img
                      src={image.src}
                      alt={image.prompt}
                      className="w-full h-auto object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                    />

                    {/* Overlay */}
                    <div className={`absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent transition-all duration-300 flex flex-col justify-end p-3 ${
                      selectedImage?.id === image.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
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

                    {/* Selected indicator */}
                    {selectedImage?.id === image.id && (
                      <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-primary flex items-center justify-center shadow-lg">
                        <Icon name="check" className="w-3.5 h-3.5 text-black" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Instagram Preview Panel */}
          <div className="w-full lg:w-96 shrink-0 overflow-y-auto bg-black flex flex-col">
            {/* Instagram Post Preview */}
            <div className="bg-black border-b border-white/10">
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
                <Icon name="more-horizontal" className="w-5 h-5 text-white" />
              </div>

              {/* Post Image */}
              <div className="aspect-square bg-[#111] flex items-center justify-center">
                {selectedImage ? (
                  <img
                    src={selectedImage.src}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="text-center">
                    <Icon name="image" className="w-12 h-12 text-white/20 mx-auto mb-2" />
                    <p className="text-xs text-white/30">Selecione uma imagem</p>
                  </div>
                )}
              </div>

              {/* Post Actions */}
              <div className="p-3">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-4">
                    <Icon name="heart" className="w-6 h-6 text-white" />
                    <Icon name="message-circle" className="w-6 h-6 text-white" />
                    <Icon name="send" className="w-6 h-6 text-white" />
                  </div>
                  <Icon name="bookmark" className="w-6 h-6 text-white" />
                </div>
                <p className="text-xs font-semibold text-white mb-1">1.234 curtidas</p>

                {/* Caption Preview */}
                <div className="text-xs text-white">
                  <span className="font-semibold">seu_perfil</span>{' '}
                  <span className="text-white/80">
                    {caption || <span className="text-white/30 italic">Sua legenda aparecerá aqui...</span>}
                  </span>
                </div>

                {/* Hashtags Preview */}
                {hashtags && (
                  <p className="text-xs text-[#00a3ff] mt-1">
                    {hashtags.split(/[\s,]+/).map(tag => tag.startsWith('#') ? tag : `#${tag}`).filter(t => t.length > 1).join(' ')}
                  </p>
                )}

                <p className="text-[10px] text-white/40 mt-2 uppercase">
                  {publishNow ? 'Agora' : `${scheduledDate} às ${scheduledTime}`}
                </p>
              </div>
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

              {/* Platform & Type Row */}
              <div className="flex gap-2">
                <div className="flex gap-1">
                  {[
                    { id: 'instagram', icon: 'instagram' },
                    { id: 'facebook', icon: 'facebook' },
                    { id: 'both', icon: 'share' },
                  ].map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setPlatforms(p.id as SchedulingPlatform)}
                      className={`w-10 h-10 flex items-center justify-center rounded-lg transition-all ${
                        platforms === p.id ? 'bg-white/10 text-white' : 'bg-white/5 text-white/40 hover:bg-white/10'
                      }`}
                    >
                      <Icon name={p.icon as any} className="w-4 h-4" />
                    </button>
                  ))}
                </div>
                {platforms !== 'facebook' && (
                  <div className="flex-1 flex gap-1">
                    {[
                      { id: 'photo', label: 'Feed' },
                      { id: 'reel', label: 'Reel' },
                      { id: 'story', label: 'Story' },
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
                )}
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
