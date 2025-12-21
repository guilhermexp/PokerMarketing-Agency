import React, { useState, useMemo } from 'react';
import type { ScheduledPost, GalleryImage, SchedulingPlatform, InstagramContentType } from '../../types';
import { Icon } from '../common/Icon';
import { Card } from '../common/Card';
import { isRubeConfigured } from '../../services/rubeService';

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

  // Get current time rounded up to next 5 minutes
  const getDefaultTime = () => {
    const now = new Date();
    const minutes = Math.ceil(now.getMinutes() / 5) * 5 + 5; // Round up + 5 min buffer
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

  const rubeAvailable = useMemo(() => isRubeConfigured(), []);

  // Check if scheduled time is in the past
  const isTimeInPast = useMemo(() => {
    if (publishNow) return false;
    const scheduled = new Date(`${scheduledDate}T${scheduledTime}`);
    return scheduled.getTime() < Date.now();
  }, [scheduledDate, scheduledTime, publishNow]);

  // Get minimum time for today
  const minTime = useMemo(() => {
    if (scheduledDate !== todayStr) return undefined;
    return getDefaultTime();
  }, [scheduledDate, todayStr]);

  // Filter images suitable for scheduling (flyers and posts)
  const eligibleImages = useMemo(() => {
    return galleryImages.filter(img =>
      ['Flyer', 'Flyer Diário', 'Post', 'Anúncio'].includes(img.source)
    );
  }, [galleryImages]);

  const handleSubmit = () => {
    if (!selectedImage) return;

    const hashtagsArray = hashtags
      .split(/[\s,]+/)
      .map(tag => tag.startsWith('#') ? tag : `#${tag}`)
      .filter(tag => tag.length > 1);

    // If "publish now", use current time
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
    <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-[300] flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl border-white/10 bg-[#080808] overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-3 border-b border-white/5 flex justify-between items-center bg-[#0d0d0d] flex-shrink-0">
          <div>
            <h3 className="text-[10px] font-black text-white uppercase tracking-wide">Agendar Publicação</h3>
            <p className="text-[8px] text-white/30 mt-0.5">Selecione uma imagem e configure o agendamento</p>
          </div>
          <button onClick={onClose} className="text-white/20 hover:text-white transition-colors">
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Image Selection */}
          <div className="space-y-3">
            <label className="text-[9px] font-black text-white/30 uppercase tracking-wider">
              Selecionar Imagem
            </label>
            <div className="grid grid-cols-4 gap-3 max-h-[200px] overflow-y-auto p-1">
              {eligibleImages.length === 0 ? (
                <div className="col-span-4 text-center py-8 text-white/30 text-xs">
                  Nenhuma imagem disponível. Gere flyers ou posts primeiro.
                </div>
              ) : (
                eligibleImages.map(image => (
                  <button
                    key={image.id}
                    onClick={() => setSelectedImage(image)}
                    className={`
                      aspect-square rounded-xl overflow-hidden border-2 transition-all
                      ${selectedImage?.id === image.id
                        ? 'border-primary ring-2 ring-primary/30 scale-[1.02]'
                        : 'border-white/10 hover:border-white/30'
                      }
                    `}
                  >
                    <img src={image.src} alt="" className="w-full h-full object-cover" />
                  </button>
                ))
              )}
            </div>
          </div>

          {selectedImage && (
            <>
              {/* Selected Image Preview */}
              <div className="flex gap-4">
                <div className="w-32 h-32 rounded-xl overflow-hidden border border-white/10 flex-shrink-0">
                  <img src={selectedImage.src} alt="" className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-white/30 uppercase tracking-wider">
                      Caption
                    </label>
                    <textarea
                      value={caption}
                      onChange={(e) => setCaption(e.target.value)}
                      placeholder="Escreva a legenda do post..."
                      className="w-full h-20 bg-[#0a0a0a] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-primary/50 resize-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-white/30 uppercase tracking-wider">
                      Hashtags
                    </label>
                    <input
                      type="text"
                      value={hashtags}
                      onChange={(e) => setHashtags(e.target.value)}
                      placeholder="#poker #torneio #evento"
                      className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-primary/50"
                    />
                  </div>
                </div>
              </div>

              {/* Publish Now Toggle */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setPublishNow(true)}
                  className={`
                    flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border transition-all
                    ${publishNow
                      ? 'bg-white/10 border-white/30 text-white'
                      : 'bg-white/5 border-white/10 text-white/40 hover:text-white hover:border-white/20'
                    }
                  `}
                >
                  <Icon name="zap" className="w-4 h-4" />
                  <span className="text-[9px] font-black uppercase tracking-wider">Publicar Agora</span>
                </button>
                <button
                  onClick={() => setPublishNow(false)}
                  className={`
                    flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border transition-all
                    ${!publishNow
                      ? 'bg-white/10 border-white/30 text-white'
                      : 'bg-white/5 border-white/10 text-white/40 hover:text-white hover:border-white/20'
                    }
                  `}
                >
                  <Icon name="calendar" className="w-4 h-4" />
                  <span className="text-[9px] font-black uppercase tracking-wider">Agendar</span>
                </button>
              </div>

              {/* Date & Time - Only show when scheduling for later */}
              {!publishNow && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-white/30 uppercase tracking-wider">
                      Data
                    </label>
                    <input
                      type="date"
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                      min={todayStr}
                      className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-primary/50"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-white/30 uppercase tracking-wider">
                      Horário
                    </label>
                    <input
                      type="time"
                      value={scheduledTime}
                      onChange={(e) => setScheduledTime(e.target.value)}
                      min={minTime}
                      className={`w-full bg-[#0a0a0a] border rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-primary/50 ${
                        isTimeInPast ? 'border-red-500/50' : 'border-white/10'
                      }`}
                    />
                  </div>
                  {isTimeInPast && (
                    <div className="col-span-2 flex items-center gap-2 text-red-400">
                      <Icon name="alert-circle" className="w-3 h-3" />
                      <span className="text-[9px]">Horário no passado. Selecione um horário futuro.</span>
                    </div>
                  )}
                </div>
              )}

              {/* Platform Selection */}
              <div className="space-y-3">
                <label className="text-[9px] font-black text-white/30 uppercase tracking-wider">
                  Plataforma
                </label>
                <div className="grid grid-cols-3 gap-3">
                  <button
                    onClick={() => setPlatforms('instagram')}
                    className={`
                      flex items-center justify-center gap-2 px-4 py-3 rounded-xl border transition-all
                      ${platforms === 'instagram'
                        ? 'bg-white/10 border-white/30 text-white'
                        : 'bg-white/5 border-white/10 text-white/40 hover:text-white hover:border-white/20'
                      }
                    `}
                  >
                    <Icon name="instagram" className="w-4 h-4" />
                    <span className="text-[9px] font-black uppercase tracking-wider">Instagram</span>
                  </button>
                  <button
                    onClick={() => setPlatforms('facebook')}
                    className={`
                      flex items-center justify-center gap-2 px-4 py-3 rounded-xl border transition-all
                      ${platforms === 'facebook'
                        ? 'bg-white/10 border-white/30 text-white'
                        : 'bg-white/5 border-white/10 text-white/40 hover:text-white hover:border-white/20'
                      }
                    `}
                  >
                    <Icon name="facebook" className="w-4 h-4" />
                    <span className="text-[9px] font-black uppercase tracking-wider">Facebook</span>
                  </button>
                  <button
                    onClick={() => setPlatforms('both')}
                    className={`
                      flex items-center justify-center gap-2 px-4 py-3 rounded-xl border transition-all
                      ${platforms === 'both'
                        ? 'bg-white/10 border-white/30 text-white'
                        : 'bg-white/5 border-white/10 text-white/40 hover:text-white hover:border-white/20'
                      }
                    `}
                  >
                    <Icon name="share" className="w-4 h-4" />
                    <span className="text-[9px] font-black uppercase tracking-wider">Ambos</span>
                  </button>
                </div>
              </div>

              {/* Instagram Content Type */}
              {platforms !== 'facebook' && (
                <div className="space-y-3">
                  <label className="text-[9px] font-black text-white/30 uppercase tracking-wider">
                    Tipo de Conteúdo Instagram
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    <button
                      onClick={() => setContentType('photo')}
                      className={`
                        flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-xl border transition-all
                        ${contentType === 'photo'
                          ? 'bg-white/10 border-white/30 text-white'
                          : 'bg-white/5 border-white/10 text-white/40 hover:text-white hover:border-white/20'
                        }
                      `}
                    >
                      <Icon name="image" className="w-4 h-4" />
                      <span className="text-[8px] font-black uppercase tracking-wider">Feed</span>
                    </button>
                    <button
                      onClick={() => setContentType('reel')}
                      className={`
                        flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-xl border transition-all
                        ${contentType === 'reel'
                          ? 'bg-white/10 border-white/30 text-white'
                          : 'bg-white/5 border-white/10 text-white/40 hover:text-white hover:border-white/20'
                        }
                      `}
                    >
                      <Icon name="film" className="w-4 h-4" />
                      <span className="text-[8px] font-black uppercase tracking-wider">Reel</span>
                    </button>
                    <button
                      onClick={() => setContentType('story')}
                      className={`
                        flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-xl border transition-all
                        ${contentType === 'story'
                          ? 'bg-white/10 border-white/30 text-white'
                          : 'bg-white/5 border-white/10 text-white/40 hover:text-white hover:border-white/20'
                        }
                      `}
                    >
                      <Icon name="circle" className="w-4 h-4" />
                      <span className="text-[8px] font-black uppercase tracking-wider">Story</span>
                    </button>
                    <button
                      onClick={() => setContentType('carousel')}
                      className={`
                        flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-xl border transition-all
                        ${contentType === 'carousel'
                          ? 'bg-white/10 border-white/30 text-white'
                          : 'bg-white/5 border-white/10 text-white/40 hover:text-white hover:border-white/20'
                        }
                      `}
                    >
                      <Icon name="layers" className="w-4 h-4" />
                      <span className="text-[8px] font-black uppercase tracking-wider">Carousel</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Info */}
              <div className="p-3 bg-white/5 border border-white/10 rounded-xl">
                <div className="flex items-start gap-2">
                  <Icon name={rubeAvailable ? 'check-circle' : 'info'} className="w-3.5 h-3.5 text-white/40 flex-shrink-0 mt-0.5" />
                  <div className="text-[9px] text-white/50">
                    {rubeAvailable ? (
                      <>
                        <strong className="font-bold text-white/70">Publicação com 1 clique</strong> — Rube MCP configurado.
                      </>
                    ) : (
                      <>
                        <strong className="font-bold text-white/70">Publicação Manual</strong> — Configure o Rube MCP para publicar automaticamente.
                      </>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/5 flex gap-3 flex-shrink-0">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-[10px] font-bold text-white/50 bg-white/5 hover:bg-white/10 rounded-xl transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!selectedImage || isTimeInPast}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-[10px] font-bold text-white bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Icon name={publishNow ? "send" : "calendar"} className="w-3.5 h-3.5" />
            {publishNow ? 'Publicar' : 'Agendar'}
          </button>
        </div>
      </Card>
    </div>
  );
};
