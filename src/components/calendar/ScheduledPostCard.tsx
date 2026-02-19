import React, { useState, useEffect } from 'react';
import type { ScheduledPost, InstagramPublishState } from '../../types';
import { Icon, type IconName } from '../common/Icon';
import { isRubeConfigured } from '../../services/rubeService';

interface ScheduledPostCardProps {
  post: ScheduledPost;
  variant: 'compact' | 'full';
  onUpdate: (postId: string, updates: Partial<ScheduledPost>) => void;
  onDelete: (postId: string) => void;
  onPublishToInstagram?: (post: ScheduledPost) => void;
  publishingState?: InstagramPublishState | null;
}

export const ScheduledPostCard: React.FC<ScheduledPostCardProps> = ({
  post,
  variant,
  onUpdate,
  onDelete,
  onPublishToInstagram,
  publishingState
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditingDate, setIsEditingDate] = useState(false);
  const [editDate, setEditDate] = useState(post.scheduledDate);
  const [editTime, setEditTime] = useState(post.scheduledTime);
  const canPublishToInstagram = isRubeConfigured() && (post.platforms === 'instagram' || post.platforms === 'both');

  // Sync state when post prop changes
  useEffect(() => {
    setEditDate(post.scheduledDate);
    setEditTime(post.scheduledTime);
  }, [post.scheduledDate, post.scheduledTime]);
  const isPublishing = publishingState && publishingState.step !== 'idle' && publishingState.step !== 'completed' && publishingState.step !== 'failed';

  const statusColors = {
    scheduled: 'bg-white/[0.06] border-white/[0.08] text-white/60',
    publishing: 'bg-amber-500/[0.08] border-amber-500/[0.15] text-amber-400/70',
    published: 'bg-emerald-500/[0.08] border-emerald-500/[0.15] text-emerald-400/70',
    failed: 'bg-red-500/[0.08] border-red-500/[0.15] text-red-400/70',
    cancelled: 'bg-white/[0.03] border-white/[0.06] text-white/30'
  };

  const statusLabels = {
    scheduled: 'Agendado',
    publishing: 'Publicando',
    published: 'Publicado',
    failed: 'Falhou',
    cancelled: 'Cancelado'
  };

  const platformIcons: Record<string, string> = {
    instagram: 'instagram',
    facebook: 'facebook',
    both: 'share'
  };

  const handleCopyCaption = () => {
    navigator.clipboard.writeText(post.caption + '\n\n' + post.hashtags.join(' '));
  };

  const handleOpenPlatform = (platform: 'instagram' | 'facebook') => {
    if (platform === 'instagram') {
      window.open('https://www.instagram.com/', '_blank');
    } else {
      window.open('https://www.facebook.com/', '_blank');
    }
  };

  const handleMarkAsPublished = () => {
    onUpdate(post.id, { status: 'published', publishedAt: Date.now() });
  };

  const handleSaveDate = () => {
    onUpdate(post.id, { scheduledDate: editDate, scheduledTime: editTime });
    setIsEditingDate(false);
  };

  const handleCancelEditDate = () => {
    setEditDate(post.scheduledDate);
    setEditTime(post.scheduledTime);
    setIsEditingDate(false);
  };

  // Get content type label
  const getContentTypeLabel = () => {
    if (!post.instagramContentType) return null;
    switch (post.instagramContentType) {
      case 'story': return 'Story';
      case 'carousel': return 'Carousel';
      case 'reel': return 'Reel';
      default: return null;
    }
  };
  const contentTypeLabel = getContentTypeLabel();

  if (variant === 'compact') {
    return (
      <>
        {/* Simple card */}
        <button
          onClick={(e) => { e.stopPropagation(); setIsExpanded(true); }}
          className="w-full p-2 rounded-lg bg-white/[0.03] border border-white/[0.06] cursor-pointer transition-all hover:bg-white/[0.06] text-left"
          title={`${post.scheduledTime} - ${post.platforms}${contentTypeLabel ? ` - ${contentTypeLabel}` : ''}`}
        >
          <div className="flex items-start gap-2">
            <Icon
              name={platformIcons[post.platforms] as IconName}
              className="w-3 h-3 flex-shrink-0 text-white/25 mt-0.5"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10px] font-medium text-white/70">
                  {post.scheduledTime}
                </span>
                {contentTypeLabel && (
                  <span className="text-[8px] font-medium text-white/30">
                    {contentTypeLabel}
                  </span>
                )}
              </div>
              <p className="text-[9px] text-white/30 truncate">
                {post.caption.substring(0, 40)}...
              </p>
            </div>
            {post.status === 'published' && (
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/60 flex-shrink-0 mt-1" />
            )}
            {post.status === 'failed' && (
              <div className="w-1.5 h-1.5 rounded-full bg-red-500/60 flex-shrink-0 mt-1" />
            )}
          </div>
        </button>

        {/* Expanded View */}
        {isExpanded && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-xl"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsExpanded(false); }}
            onMouseMove={(e) => e.stopPropagation()}
            onMouseEnter={(e) => e.stopPropagation()}
            onMouseLeave={(e) => e.stopPropagation()}
          >
            <div
              className="bg-[#0a0a0a] border border-white/[0.08] rounded-2xl max-w-sm w-full mx-4 overflow-hidden shadow-2xl"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onMouseMove={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="px-4 py-3 flex justify-between items-center border-b border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <div className={`px-2.5 py-1 rounded-lg text-[9px] font-medium border ${statusColors[post.status]}`}>
                    {statusLabels[post.status]}
                  </div>
                  <span className="text-[10px] text-white/40 font-medium">
                    {post.scheduledTime}
                  </span>
                  {post.instagramContentType && (
                    <span className="text-[9px] text-white/30 font-medium">
                      {post.instagramContentType === 'story' ? 'Story' : 'Feed'}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setIsExpanded(false)}
                  className="p-1.5 text-white/30 hover:text-white transition-colors rounded-lg hover:bg-white/[0.06]"
                >
                  <Icon name="x" className="w-4 h-4" />
                </button>
              </div>

              {/* Image Preview */}
              {post.imageUrl && (
                <div className="px-4 py-3">
                  <div className="w-full rounded-xl overflow-hidden border border-white/[0.06]">
                    <img src={post.imageUrl} alt="" className="w-full h-auto object-contain" />
                  </div>
                </div>
              )}

              {/* Progress Bar */}
              {isPublishing && publishingState && (
                <div className="px-3 py-2 bg-white/[0.02]">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-3 h-3 border-2 border-white/15 border-t-white/50 rounded-full animate-spin flex-shrink-0" />
                    <span className="text-[9px] text-white/40">{publishingState.progress}%</span>
                  </div>
                  <div className="w-full bg-white/[0.06] rounded-full h-1 overflow-hidden">
                    <div
                      className="h-full bg-white/30 transition-all duration-300"
                      style={{ width: `${publishingState.progress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Success Message */}
              {publishingState?.step === 'completed' && (
                <div className="px-3 py-2 bg-emerald-500/[0.04]">
                  <div className="flex items-center gap-2">
                    <Icon name="check" className="w-3 h-3 text-emerald-400/60" />
                    <span className="text-[9px] text-emerald-400/60">Publicado</span>
                  </div>
                </div>
              )}

              {/* Error Message */}
              {publishingState?.step === 'failed' && (
                <div className="px-3 py-2 bg-red-500/[0.04]">
                  <div className="flex items-center gap-2">
                    <Icon name="alert-circle" className="w-3 h-3 text-red-400/60" />
                    <span className="text-[9px] text-red-400/60">{publishingState.message}</span>
                  </div>
                </div>
              )}

              {/* Edit Date Form */}
              {isEditingDate && post.status === 'scheduled' && (
                <div className="px-3 py-3 bg-white/[0.02] border-t border-white/[0.06]">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon name="calendar" className="w-3 h-3 text-white/40" />
                    <span className="text-[9px] font-medium text-white/50 uppercase tracking-wider">Editar Data</span>
                  </div>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="date"
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                      className="flex-1 px-2 py-1.5 bg-white/[0.04] border border-white/[0.06] rounded-lg text-[10px] text-white/70 focus:outline-none focus:border-white/[0.15]"
                    />
                    <input
                      type="time"
                      value={editTime}
                      onChange={(e) => setEditTime(e.target.value)}
                      className="w-24 px-2 py-1.5 bg-white/[0.04] border border-white/[0.06] rounded-lg text-[10px] text-white/70 focus:outline-none focus:border-white/[0.15]"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveDate}
                      className="flex-1 px-3 py-1.5 bg-white/[0.08] hover:bg-white/[0.12] text-white/70 text-[9px] font-medium uppercase rounded-lg transition-colors"
                    >
                      Salvar
                    </button>
                    <button
                      onClick={handleCancelEditDate}
                      className="px-3 py-1.5 bg-white/[0.03] hover:bg-white/[0.06] text-white/40 text-[9px] font-medium uppercase rounded-lg transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="p-4 flex gap-2 border-t border-white/[0.06]">
                {post.status === 'scheduled' && (
                  <>
                    {canPublishToInstagram && onPublishToInstagram && (
                      <button
                        onClick={() => onPublishToInstagram(post)}
                        disabled={isPublishing}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-[10px] font-medium transition-all ${isPublishing
                            ? 'bg-white/[0.06] text-white/30 cursor-wait border border-white/[0.06]'
                            : 'bg-white/[0.06] border border-white/[0.08] text-white/70 hover:bg-white/[0.1]'
                          }`}
                      >
                        {isPublishing ? (
                          <div className="w-3 h-3 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
                        ) : (
                          <Icon name="send" className="w-3.5 h-3.5" />
                        )}
                        Publicar
                      </button>
                    )}
                    <button
                      onClick={handleCopyCaption}
                      className="p-2 bg-white/[0.04] border border-white/[0.06] rounded-xl text-white/30 hover:text-white/60 transition-all"
                      title="Copiar"
                    >
                      <Icon name="copy" className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setIsEditingDate(!isEditingDate)}
                      className={`p-2 rounded-xl transition-all ${isEditingDate ? 'bg-white/[0.1] text-white/70 border border-white/[0.15]' : 'bg-white/[0.04] border border-white/[0.06] text-white/30 hover:text-white/60'}`}
                      title="Editar data"
                    >
                      <Icon name="calendar" className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleOpenPlatform('instagram')}
                      className="p-2 bg-white/[0.04] border border-white/[0.06] rounded-xl text-white/30 hover:text-white/60 transition-all"
                      title="Abrir Instagram"
                    >
                      <Icon name="external-link" className="w-4 h-4" />
                    </button>
                    <button
                      onClick={handleMarkAsPublished}
                      className="p-2 bg-white/[0.04] border border-white/[0.06] rounded-xl text-white/30 hover:text-white/60 transition-all"
                      title="Marcar como publicado"
                    >
                      <Icon name="check" className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => { onDelete(post.id); setIsExpanded(false); }}
                      className="p-2 bg-white/[0.04] border border-white/[0.06] hover:bg-red-500/[0.08] rounded-xl text-white/30 hover:text-red-400/70 transition-all"
                      title="Excluir"
                    >
                      <Icon name="trash" className="w-4 h-4" />
                    </button>
                  </>
                )}
                {post.status !== 'scheduled' && (
                  <button
                    onClick={() => { onDelete(post.id); setIsExpanded(false); }}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-white/[0.04] border border-white/[0.06] hover:bg-red-500/[0.08] rounded-xl text-[10px] font-medium text-white/40 hover:text-red-400/70 transition-all"
                  >
                    <Icon name="trash" className="w-3.5 h-3.5" />
                    Excluir
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // Full variant (for list views)
  return (
    <div className={`rounded-xl border ${statusColors[post.status]} bg-[#0a0a0a] overflow-hidden`}>
      <div className="p-4 flex items-start gap-4">
        {/* Image Thumbnail */}
        {post.imageUrl && (
          <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 border border-white/[0.06]">
            <img src={post.imageUrl} alt="" className="w-full h-full object-cover" />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <div className={`px-2 py-0.5 rounded-md text-[8px] font-medium uppercase border ${statusColors[post.status]}`}>
              {statusLabels[post.status]}
            </div>
            <Icon name={platformIcons[post.platforms] as IconName} className="w-3 h-3 text-white/25" />
            {post.instagramContentType && post.platforms !== 'facebook' && (
              <span className="text-[7px] font-medium text-white/30 uppercase">
                {post.instagramContentType === 'photo' ? 'Feed' :
                  post.instagramContentType === 'reel' ? 'Reel' :
                    post.instagramContentType === 'story' ? 'Story' :
                      'Carousel'}
              </span>
            )}
          </div>

          <p className="text-xs text-white/40 line-clamp-2 mb-2">{post.caption}</p>

          <div className="flex items-center gap-3 text-[9px] text-white/30">
            <span className="flex items-center gap-1">
              <Icon name="calendar" className="w-3 h-3" />
              {post.scheduledDate}
            </span>
            <span className="flex items-center gap-1">
              <Icon name="clock" className="w-3 h-3" />
              {post.scheduledTime}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {post.status === 'scheduled' && (
            <>
              <button
                onClick={handleCopyCaption}
                className="p-2 text-white/25 hover:text-white/60 hover:bg-white/[0.04] rounded-lg transition-colors"
                title="Copiar caption"
              >
                <Icon name="copy" className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsEditingDate(!isEditingDate)}
                className={`p-2 rounded-lg transition-colors ${isEditingDate ? 'text-white/60 bg-white/[0.06]' : 'text-white/25 hover:text-white/60 hover:bg-white/[0.04]'}`}
                title="Editar data"
              >
                <Icon name="calendar" className="w-4 h-4" />
              </button>
              <button
                onClick={handleMarkAsPublished}
                className="p-2 text-white/25 hover:text-white/60 hover:bg-white/[0.04] rounded-lg transition-colors"
                title="Marcar como publicado"
              >
                <Icon name="check" className="w-4 h-4" />
              </button>
            </>
          )}
          <button
            onClick={() => onDelete(post.id)}
            className="p-2 text-white/25 hover:text-red-400/70 hover:bg-red-500/[0.08] rounded-lg transition-colors"
            title="Excluir"
          >
            <Icon name="trash" className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Edit Date Form - Full Variant */}
      {isEditingDate && post.status === 'scheduled' && (
        <div className="px-4 py-3 bg-white/[0.02] border-t border-white/[0.06]">
          <div className="flex items-center gap-2 mb-2">
            <Icon name="calendar" className="w-3 h-3 text-white/40" />
            <span className="text-[9px] font-medium text-white/50 uppercase tracking-wider">Editar Data do Agendamento</span>
          </div>
          <div className="flex gap-2">
            <input
              type="date"
              value={editDate}
              onChange={(e) => setEditDate(e.target.value)}
              className="flex-1 px-3 py-2 bg-white/[0.04] border border-white/[0.06] rounded-lg text-xs text-white/70 focus:outline-none focus:border-white/[0.15]"
            />
            <input
              type="time"
              value={editTime}
              onChange={(e) => setEditTime(e.target.value)}
              className="w-28 px-3 py-2 bg-white/[0.04] border border-white/[0.06] rounded-lg text-xs text-white/70 focus:outline-none focus:border-white/[0.15]"
            />
            <button
              onClick={handleSaveDate}
              className="px-4 py-2 bg-white/[0.08] hover:bg-white/[0.12] text-white/70 text-xs font-medium uppercase rounded-lg transition-colors"
            >
              Salvar
            </button>
            <button
              onClick={handleCancelEditDate}
              className="px-4 py-2 bg-white/[0.03] hover:bg-white/[0.06] text-white/40 text-xs font-medium uppercase rounded-lg transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
