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
    scheduled: 'bg-white/10 border-border text-white/70',
    publishing: 'bg-amber-500/10 border-amber-500/20 text-amber-400/80',
    published: 'bg-green-500/10 border-green-500/20 text-green-400/80',
    failed: 'bg-red-500/10 border-red-500/20 text-red-400/80',
    cancelled: 'bg-white/5 border-border text-muted-foreground'
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
          className="w-full p-2 rounded-lg bg-black/40 border border-border cursor-pointer transition-all hover:bg-black/60 text-left"
          title={`${post.scheduledTime} - ${post.platforms}${contentTypeLabel ? ` - ${contentTypeLabel}` : ''}`}
        >
          <div className="flex items-start gap-2">
            <Icon
              name={platformIcons[post.platforms] as IconName}
              className="w-3 h-3 flex-shrink-0 text-muted-foreground mt-0.5"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10px] font-medium text-white/80">
                  {post.scheduledTime}
                </span>
                {contentTypeLabel && (
                  <span className="text-[8px] font-medium text-muted-foreground">
                    {contentTypeLabel}
                  </span>
                )}
              </div>
              <p className="text-[9px] text-muted-foreground truncate">
                {post.caption.substring(0, 40)}...
              </p>
            </div>
            {post.status === 'published' && (
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0 mt-1" />
            )}
            {post.status === 'failed' && (
              <div className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0 mt-1" />
            )}
          </div>
        </button>

        {/* Expanded View - Portal-like fixed overlay */}
        {isExpanded && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-xl"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsExpanded(false); }}
            onMouseMove={(e) => e.stopPropagation()}
            onMouseEnter={(e) => e.stopPropagation()}
            onMouseLeave={(e) => e.stopPropagation()}
          >
            <div
              className="bg-black/60 backdrop-blur-2xl border border-border rounded-2xl max-w-sm w-full mx-4 overflow-hidden shadow-[0_25px_90px_rgba(0,0,0,0.7)]"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onMouseMove={(e) => e.stopPropagation()}
            >
              {/* Header - Minimal */}
              <div className="px-4 py-3 flex justify-between items-center border-b border-border">
                <div className="flex items-center gap-2">
                  <div className={`px-2.5 py-1 rounded-lg text-[9px] font-medium ${statusColors[post.status]}`}>
                    {statusLabels[post.status]}
                  </div>
                  <span className="text-[10px] text-muted-foreground font-medium">
                    {post.scheduledTime}
                  </span>
                  {post.instagramContentType && (
                    <span className="text-[9px] text-muted-foreground font-medium">
                      {post.instagramContentType === 'story' ? 'Story' : 'Feed'}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setIsExpanded(false)}
                  className="p-1.5 text-muted-foreground hover:text-white transition-colors rounded-lg hover:bg-white/10"
                >
                  <Icon name="x" className="w-4 h-4" />
                </button>
              </div>

              {/* Image Preview - Larger */}
              {post.imageUrl && (
                <div className="px-4 py-3">
                  <div className="w-full rounded-xl overflow-hidden border border-border">
                    <img src={post.imageUrl} alt="" className="w-full h-auto object-contain" />
                  </div>
                </div>
              )}

              {/* Progress Bar */}
              {isPublishing && publishingState && (
                <div className="px-3 py-2 bg-white/5">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-3 h-3 border-2 border-white/20 border-t-white/60 rounded-full animate-spin flex-shrink-0" />
                    <span className="text-[9px] text-muted-foreground">{publishingState.progress}%</span>
                  </div>
                  <div className="w-full bg-white/10 rounded-full h-1 overflow-hidden">
                    <div
                      className="h-full bg-white/50 transition-all duration-300"
                      style={{ width: `${publishingState.progress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Success Message */}
              {publishingState?.step === 'completed' && (
                <div className="px-3 py-2 bg-green-500/5">
                  <div className="flex items-center gap-2">
                    <Icon name="check" className="w-3 h-3 text-green-400/70" />
                    <span className="text-[9px] text-green-400/70">Publicado</span>
                  </div>
                </div>
              )}

              {/* Error Message */}
              {publishingState?.step === 'failed' && (
                <div className="px-3 py-2 bg-red-500/5">
                  <div className="flex items-center gap-2">
                    <Icon name="alert-circle" className="w-3 h-3 text-red-400/70" />
                    <span className="text-[9px] text-red-400/70">{publishingState.message}</span>
                  </div>
                </div>
              )}

              {/* Edit Date Form */}
              {isEditingDate && post.status === 'scheduled' && (
                <div className="px-3 py-3 bg-white/5 border-t border-border">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon name="calendar" className="w-3 h-3 text-primary" />
                    <span className="text-[9px] font-bold text-white/70 uppercase">Editar Data</span>
                  </div>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="date"
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                      className="flex-1 px-2 py-1.5 bg-black/30 border border-border rounded-lg text-[10px] text-white/80 focus:outline-none focus:border-primary/50"
                    />
                    <input
                      type="time"
                      value={editTime}
                      onChange={(e) => setEditTime(e.target.value)}
                      className="w-24 px-2 py-1.5 bg-black/30 border border-border rounded-lg text-[10px] text-white/80 focus:outline-none focus:border-primary/50"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveDate}
                      className="flex-1 px-3 py-1.5 bg-primary/20 hover:bg-primary/30 text-primary text-[9px] font-bold uppercase rounded-lg transition-colors"
                    >
                      Salvar
                    </button>
                    <button
                      onClick={handleCancelEditDate}
                      className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-muted-foreground text-[9px] font-bold uppercase rounded-lg transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {/* Actions - Compact */}
              <div className="p-4 flex gap-2 border-t border-border">
                {post.status === 'scheduled' && (
                  <>
                    {canPublishToInstagram && onPublishToInstagram && (
                      <button
                        onClick={() => onPublishToInstagram(post)}
                        disabled={isPublishing}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-full text-[10px] font-medium transition-all ${isPublishing
                            ? 'bg-white/10 text-muted-foreground cursor-wait border border-border'
                            : 'bg-black/40 backdrop-blur-2xl border border-border text-white/80'
                          }`}
                      >
                        {isPublishing ? (
                          <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                          <Icon name="send" className="w-3.5 h-3.5" />
                        )}
                        Publicar
                      </button>
                    )}
                    <button
                      onClick={handleCopyCaption}
                      className="p-2 bg-black/40 backdrop-blur-2xl border border-border rounded-full text-muted-foreground transition-all"
                      title="Copiar"
                    >
                      <Icon name="copy" className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setIsEditingDate(!isEditingDate)}
                      className={`p-2 rounded-full transition-all ${isEditingDate ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-black/40 backdrop-blur-2xl border border-border text-muted-foreground'}`}
                      title="Editar data"
                    >
                      <Icon name="calendar" className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleOpenPlatform('instagram')}
                      className="p-2 bg-black/40 backdrop-blur-2xl border border-border rounded-full text-muted-foreground transition-all"
                      title="Abrir Instagram"
                    >
                      <Icon name="external-link" className="w-4 h-4" />
                    </button>
                    <button
                      onClick={handleMarkAsPublished}
                      className="p-2 bg-black/40 backdrop-blur-2xl border border-border rounded-full text-muted-foreground transition-all"
                      title="Marcar como publicado"
                    >
                      <Icon name="check" className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => { onDelete(post.id); setIsExpanded(false); }}
                      className="p-2 bg-black/40 backdrop-blur-2xl border border-border hover:bg-red-500/10 rounded-full text-muted-foreground hover:text-red-400 transition-all"
                      title="Excluir"
                    >
                      <Icon name="trash" className="w-4 h-4" />
                    </button>
                  </>
                )}
                {post.status !== 'scheduled' && (
                  <button
                    onClick={() => { onDelete(post.id); setIsExpanded(false); }}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-black/40 backdrop-blur-2xl border border-border hover:bg-red-500/10 rounded-full text-[10px] font-medium text-muted-foreground hover:text-red-400 transition-all"
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
    <div className={`rounded-xl border ${statusColors[post.status]} bg-background overflow-hidden`}>
      <div className="p-4 flex items-start gap-4">
        {/* Image Thumbnail */}
        {post.imageUrl && (
          <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 border border-border">
            <img src={post.imageUrl} alt="" className="w-full h-full object-cover" />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <div className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${statusColors[post.status]}`}>
              {statusLabels[post.status]}
            </div>
            <Icon name={platformIcons[post.platforms] as IconName} className="w-3 h-3 text-muted-foreground" />
            {post.instagramContentType && post.platforms !== 'facebook' && (
              <span className="text-[7px] font-bold text-muted-foreground uppercase">
                {post.instagramContentType === 'photo' ? 'Feed' :
                  post.instagramContentType === 'reel' ? 'Reel' :
                    post.instagramContentType === 'story' ? 'Story' :
                      'Carousel'}
              </span>
            )}
          </div>

          <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{post.caption}</p>

          <div className="flex items-center gap-3 text-[9px] text-muted-foreground">
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
                className="p-2 text-muted-foreground hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                title="Copiar caption"
              >
                <Icon name="copy" className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsEditingDate(!isEditingDate)}
                className={`p-2 rounded-lg transition-colors ${isEditingDate ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-white hover:bg-white/5'}`}
                title="Editar data"
              >
                <Icon name="calendar" className="w-4 h-4" />
              </button>
              <button
                onClick={handleMarkAsPublished}
                className="p-2 text-muted-foreground hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                title="Marcar como publicado"
              >
                <Icon name="check" className="w-4 h-4" />
              </button>
            </>
          )}
          <button
            onClick={() => onDelete(post.id)}
            className="p-2 text-muted-foreground hover:text-red-400/80 hover:bg-red-500/10 rounded-lg transition-colors"
            title="Excluir"
          >
            <Icon name="trash" className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Edit Date Form - Full Variant */}
      {isEditingDate && post.status === 'scheduled' && (
        <div className="px-4 py-3 bg-white/5 border-t border-border">
          <div className="flex items-center gap-2 mb-2">
            <Icon name="calendar" className="w-3 h-3 text-primary" />
            <span className="text-[9px] font-bold text-white/70 uppercase">Editar Data do Agendamento</span>
          </div>
          <div className="flex gap-2">
            <input
              type="date"
              value={editDate}
              onChange={(e) => setEditDate(e.target.value)}
              className="flex-1 px-3 py-2 bg-black/30 border border-border rounded-lg text-xs text-white/80 focus:outline-none focus:border-primary/50"
            />
            <input
              type="time"
              value={editTime}
              onChange={(e) => setEditTime(e.target.value)}
              className="w-28 px-3 py-2 bg-black/30 border border-border rounded-lg text-xs text-white/80 focus:outline-none focus:border-primary/50"
            />
            <button
              onClick={handleSaveDate}
              className="px-4 py-2 bg-primary/20 hover:bg-primary/30 text-primary text-xs font-bold uppercase rounded-lg transition-colors"
            >
              Salvar
            </button>
            <button
              onClick={handleCancelEditDate}
              className="px-4 py-2 bg-white/5 hover:bg-white/10 text-muted-foreground text-xs font-bold uppercase rounded-lg transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
